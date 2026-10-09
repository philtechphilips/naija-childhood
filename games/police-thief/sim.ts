import { createRng, pick, type Rng } from "@/games/core/rng";
import { ACTOR_RADIUS, inRect, NavGrid, resolveCollisions, type SimMap } from "./map";
import { canCatch, encodeStats, HEAD_START, MATCH_SECONDS, outcome, RESCUE_IMMUNITY, scoreMatch, type MatchStats, type Team } from "./rules";

/**
 * Police & Thief match simulation, independent of rendering. Distances are
 * in sim units (the 2D compound uses ~1 unit/px; the 3D street uses 20 units/metre).
 */
export type Difficulty = "easy" | "normal" | "hard";

export interface Pt {
  x: number;
  y: number;
}

export interface Actor {
  id: number;
  team: Team;
  human: boolean;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  walk: number;
  stamina: number;
  exhausted: boolean;
  sprinting: boolean;
  boostFor: number;
  jailed: boolean;
  immuneFor: number;
  hidden: boolean;
  path: Pt[];
  thinkIn: number;
  goal: Pt | null;
  targetId: number | null;
  lastSeen: Pt | null;
  guard: boolean;
  /** Stable per-actor random value for cosmetic choices (shirt colour, avatar). */
  variant: number;
}

export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: "puff" | "water";
  age: number;
}

export type SimEvent =
  | { type: "countdown"; n: number }
  | { type: "start" }
  | { type: "tick"; seconds: number }
  | { type: "caught"; thief: Actor; by: Actor }
  | { type: "rescue"; rescuer: Actor; freed: Actor[] }
  | { type: "pickup"; pickup: Pickup }
  | { type: "end"; winner: Team };

export interface SimInput {
  dir: Pt;
  sprint: boolean;
}

export interface MatchOptions {
  role: Team;
  difficulty: Difficulty;
  jailbreak: boolean;
  seed: number;
  playerName: string;
  /** Multiplier applied to all speeds/distances tuned for the 2D map (1 unit ≈ 1px). */
  scale?: number;
  /** Extra speed for thieves on tighter maps (the 3D street has narrow sidewalks and crowds). */
  thiefBoost?: number;
}

const POLICE_SPEED: Record<Difficulty, number> = { easy: 124, normal: 142, hard: 156 };
const THINK: Record<Difficulty, number> = { easy: 0.5, normal: 0.3, hard: 0.2 };
const THIEF_SPEED = 150;
const SPRINT = 1.5;
const THIEF_NAMES = ["Emeka", "Sani", "Bisi", "Uche", "Femi", "Halima", "Tunde", "Amaka"];
const POLICE_NAMES = ["Musa", "Kemi", "Obi", "Yemi"];

export type Match = ReturnType<typeof createMatch>;

export function createMatch(map: SimMap, opts: MatchOptions) {
  const { role, difficulty, jailbreak } = opts;
  const S = opts.scale ?? 1;
  const rng: Rng = createRng(opts.seed);
  const nav = new NavGrid(map, ACTOR_RADIUS * S + 2 * S);
  const radius = ACTOR_RADIUS * S;

  const actors: Actor[] = [];
  let nextId = 1;
  const mkActor = (team: Team, human: boolean, pos: Pt, name: string): Actor => {
    const a: Actor = {
      id: nextId++,
      team,
      human,
      name,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      facing: team === "police" ? -Math.PI / 2 : 0,
      walk: 0,
      stamina: 100,
      exhausted: false,
      sprinting: false,
      boostFor: 0,
      jailed: false,
      immuneFor: 0,
      hidden: false,
      path: [],
      thinkIn: rng() * 0.3,
      goal: null,
      targetId: null,
      lastSeen: null,
      guard: false,
      variant: rng(),
    };
    actors.push(a);
    return a;
  };

  const names = [...THIEF_NAMES];
  const takeName = () => names.splice(Math.floor(rng() * names.length), 1)[0] ?? "Thief";
  let human: Actor;
  if (role === "thief") {
    human = mkActor("thief", true, map.thiefSpawns[0]!, opts.playerName || "You");
    for (let i = 0; i < (jailbreak ? 3 : 2); i++) mkActor("thief", false, map.thiefSpawns[i + 1]!, takeName());
    for (let i = 0; i < (difficulty === "easy" ? 2 : 3); i++) mkActor("police", false, map.policeSpawns[i]!, POLICE_NAMES[i]!);
  } else {
    human = mkActor("police", true, map.policeSpawns[0]!, opts.playerName || "You");
    for (let i = 1; i < 3; i++) mkActor("police", false, map.policeSpawns[i]!, POLICE_NAMES[i]!);
    for (let i = 0; i < 5; i++) mkActor("thief", false, map.thiefSpawns[i]!, takeName());
  }
  const thieves = () => actors.filter((a) => a.team === "thief");
  const police = () => actors.filter((a) => a.team === "police");
  if (difficulty !== "easy") {
    const guard = police().find((p) => !p.human && p !== police()[0]) ?? police().find((p) => !p.human);
    if (guard) guard.guard = true;
  }

  const jailCenter: Pt = { x: map.jail.x + map.jail.w / 2, y: map.jail.y + map.jail.h / 2 };
  const jailSlot = (i: number): Pt => {
    const cols = 3;
    return {
      x: map.jail.x + map.jail.w * ((i % cols) + 0.5) / cols,
      y: map.jail.y + map.jail.h * (Math.floor(i / cols) + 0.5) / 2,
    };
  };
  const sendToJail = (t: Actor) => {
    const slot = jailSlot(thieves().filter((x) => x.jailed).length);
    t.jailed = true;
    t.x = slot.x;
    t.y = slot.y;
    t.vx = t.vy = 0;
    t.path = [];
  };
  if (jailbreak) thieves().filter((t) => !t.human).slice(0, 2).forEach(sendToJail);

  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const inHide = (p: Pt) => map.hides.some((b) => inRect(p.x, p.y, b, -4 * S));
  const hideSpots = () => map.hides.map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }));

  const state = {
    clock: 0,
    timeLeft: MATCH_SECONDS,
    phase: "intro" as "intro" | "play" | "end",
    winner: null as Team | null,
    endAt: 0,
  };
  const stats = { freeSeconds: 0, rescues: 0, catches: 0, pickups: 0 };
  const pickups: Pickup[] = [];
  let pickupIn = 6;
  let pickupId = 1;
  let countBeat = -1;
  let lastTick = -1;

  function setPath(a: Actor, target: Pt) {
    if (nav.clearLine(a.x, a.y, target.x, target.y)) a.path = [target];
    else a.path = nav.findPath(a.x, a.y, target.x, target.y);
  }

  function thinkPolice(a: Actor) {
    const visible = thieves().filter((t) => !t.jailed && t.immuneFor <= 0 && (!t.hidden || dist(a, t) < 70 * S));
    const jailed = thieves().filter((t) => t.jailed).length;
    let target: Actor | null = null;
    if (a.guard && jailed > 0) {
      target = visible.filter((t) => dist(t, jailCenter) < 230 * S).sort((p, q) => dist(p, a) - dist(q, a))[0] ?? null;
      if (!target) {
        const ang = state.clock * 0.6 + a.id;
        setPath(a, { x: jailCenter.x + Math.cos(ang) * 125 * S, y: jailCenter.y + Math.sin(ang) * 100 * S });
        a.sprinting = false;
        return;
      }
    } else if (visible.length > 0) {
      const others = police().filter((p) => p !== a && !p.human);
      let best = Infinity;
      for (const t of visible) {
        const claimed = others.some((o) => o.targetId === t.id) && visible.length > 1 ? 170 * S : 0;
        const cost = dist(a, t) + claimed + (t.human ? -30 * S : 0);
        if (cost < best) {
          best = cost;
          target = t;
        }
      }
    }
    a.targetId = target?.id ?? null;
    if (target) {
      a.lastSeen = { x: target.x, y: target.y };
      const lead = difficulty === "easy" ? 0.1 : 0.35;
      setPath(a, { x: target.x + target.vx * lead, y: target.y + target.vy * lead });
      a.sprinting = dist(a, target) < 150 * S && a.stamina > 30;
      return;
    }
    a.sprinting = false;
    if (a.lastSeen && dist(a, a.lastSeen) > 30 * S) {
      setPath(a, a.lastSeen);
      return;
    }
    a.lastSeen = null;
    if (!a.goal || dist(a, a.goal) < 30 * S || a.path.length === 0) {
      a.goal = rng() < 0.5 && map.hides.length ? pick(rng, hideSpots()) : nav.randomOpenPoint(rng);
      setPath(a, a.goal);
    }
  }

  function thinkThief(a: Actor) {
    const cops = police();
    let nearest: Actor | null = null;
    let nd = Infinity;
    for (const c of cops) {
      const d = dist(a, c);
      if (d < nd) {
        nd = d;
        nearest = c;
      }
    }
    const fleeRadius = (difficulty === "easy" ? 200 : 260) * S;
    if (nearest && nd < fleeRadius && (!a.hidden || nd < 110 * S)) {
      let best: Pt | null = null;
      let bestScore = -Infinity;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const p = { x: a.x + Math.cos(ang) * 90 * S, y: a.y + Math.sin(ang) * 90 * S };
        if (nav.isBlockedAt(p.x, p.y) || !nav.clearLine(a.x, a.y, p.x, p.y)) continue;
        const minCop = Math.min(...cops.map((c) => dist(p, c)));
        let score = minCop + (inHide(p) ? 70 * S : 0) + rng() * 18 * S;
        if (dist(p, jailCenter) < 140 * S) score -= 80 * S;
        let walls = 0;
        for (const [dx, dy] of [[40, 0], [-40, 0], [0, 40], [0, -40]] as const) if (nav.isBlockedAt(p.x + dx * S, p.y + dy * S)) walls++;
        score -= walls * 22 * S;
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      if (best) a.path = [best];
      a.sprinting = nd < 150 * S && a.stamina > 15;
      a.goal = null;
      return;
    }
    a.sprinting = false;
    const jailedMates = thieves().filter((t) => t.jailed).length;
    const copsNearJail = Math.min(...cops.map((c) => dist(c, jailCenter)));
    if (jailedMates > 0 && copsNearJail > (difficulty === "hard" ? 200 : 170) * S) {
      setPath(a, jailCenter);
      a.sprinting = a.stamina > 50;
      return;
    }
    if (a.hidden && rng() < 0.7) {
      a.path = [];
      return;
    }
    if (!a.goal || dist(a, a.goal) < 30 * S || a.path.length === 0) {
      a.goal = rng() < 0.6 && map.hides.length ? pick(rng, hideSpots()) : nav.randomOpenPoint(rng);
      setPath(a, a.goal);
    }
  }

  function moveActor(a: Actor, dt: number, dir: Pt, wantSprint: boolean, walkFactor = 1) {
    let base = a.team === "police" ? (a.human ? 158 : POLICE_SPEED[difficulty]) : a.human ? 156 : THIEF_SPEED;
    base *= walkFactor * S * (a.team === "thief" ? (opts.thiefBoost ?? 1) : 1);
    const moving = Math.hypot(dir.x, dir.y) > 0.05;
    const sprint = wantSprint && moving && !a.exhausted && a.stamina > 0;
    if (sprint) {
      a.stamina = Math.max(0, a.stamina - 38 * dt);
      if (a.stamina <= 0) a.exhausted = true;
    } else {
      a.stamina = Math.min(100, a.stamina + 16 * dt);
      if (a.exhausted && a.stamina > 30) a.exhausted = false;
    }
    a.sprinting = sprint;
    let speed = base * (sprint ? SPRINT : 1);
    if (a.boostFor > 0) speed *= 1.3;
    const k = 1 - Math.exp(-14 * dt);
    a.vx += (dir.x * speed - a.vx) * k;
    a.vy += (dir.y * speed - a.vy) * k;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    resolveCollisions(map, a, radius);
    const sp = Math.hypot(a.vx, a.vy);
    if (sp > 10 * S) {
      const target = Math.atan2(a.vy, a.vx);
      let d = target - a.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      a.facing += d * Math.min(1, dt * 14);
      a.walk += (dt * sp * 0.09) / S;
    }
  }

  function pathDir(a: Actor): Pt {
    while (a.path.length > 0 && dist(a, a.path[0]!) < 14 * S) a.path.shift();
    if (a.path.length > 1 && nav.clearLine(a.x, a.y, a.path[1]!.x, a.path[1]!.y)) a.path.shift();
    const t = a.path[0];
    if (!t) return { x: 0, y: 0 };
    const dx = t.x - a.x;
    const dy = t.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  function update(dt: number, input: SimInput): SimEvent[] {
    const events: SimEvent[] = [];
    state.clock += dt;
    if (state.phase === "intro") {
      const b = Math.floor(state.clock);
      if (b !== countBeat && b < HEAD_START) {
        countBeat = b;
        events.push({ type: "countdown", n: HEAD_START - b });
      }
      if (state.clock >= HEAD_START) {
        state.phase = "play";
        events.push({ type: "start" });
      }
    } else if (state.phase === "play") {
      state.timeLeft = Math.max(0, state.timeLeft - dt);
      const sec = Math.ceil(state.timeLeft);
      if (sec <= 10 && sec !== lastTick) {
        lastTick = sec;
        events.push({ type: "tick", seconds: sec });
      }
    }

    const frozenPolice = state.phase === "intro";
    for (const a of actors) {
      a.immuneFor = Math.max(0, a.immuneFor - dt);
      a.boostFor = Math.max(0, a.boostFor - dt);
      if (a.jailed || state.phase === "end") {
        a.vx *= 0.8;
        a.vy *= 0.8;
        continue;
      }
      if (a.team === "police" && frozenPolice) continue;
      if (a.human) moveActor(a, dt, input.dir, input.sprint);
      else {
        a.thinkIn -= dt;
        if (a.thinkIn <= 0) {
          a.thinkIn = THINK[difficulty] * (0.8 + rng() * 0.4);
          if (a.team === "police") thinkPolice(a);
          else thinkThief(a);
        }
        const relaxed = a.team === "thief" && !a.sprinting && a.path.length > 0 ? 0.78 : 1;
        moveActor(a, dt, pathDir(a), a.sprinting, relaxed);
      }
      a.hidden = a.team === "thief" && inHide(a);
    }

    if (state.phase !== "play") return events;

    for (const p of police()) {
      for (const t of thieves()) {
        // canCatch uses 2D-tuned distances; scale positions into that space.
        if (!canCatch({ x: p.x / S, y: p.y / S }, { x: t.x / S, y: t.y / S, jailed: t.jailed, immuneFor: t.immuneFor })) continue;
        sendToJail(t);
        if (p.human) stats.catches++;
        events.push({ type: "caught", thief: t, by: p });
      }
    }

    const jailed = thieves().filter((t) => t.jailed);
    if (jailed.length > 0) {
      const rescuer = thieves().find((t) => !t.jailed && t.immuneFor <= 0 && inRect(t.x, t.y, map.jail, 6 * S));
      if (rescuer) {
        jailed.forEach((t, i) => {
          t.jailed = false;
          t.immuneFor = RESCUE_IMMUNITY;
          const ang = (i / jailed.length) * Math.PI - Math.PI;
          t.vx = Math.cos(ang) * 200 * S;
          t.vy = Math.sin(ang) * 200 * S;
          t.path = [];
          t.goal = null;
        });
        rescuer.immuneFor = RESCUE_IMMUNITY * 0.6;
        if (rescuer.human) stats.rescues++;
        events.push({ type: "rescue", rescuer, freed: jailed });
      }
    }

    pickupIn -= dt;
    if (pickupIn <= 0 && pickups.length < 2) {
      pickupIn = 9 + rng() * 6;
      const p = nav.randomOpenPoint(rng);
      pickups.push({ id: pickupId++, ...p, kind: rng() < 0.55 ? "puff" : "water", age: 0 });
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i]!;
      p.age += dt;
      if (!human.jailed && dist(p, human) < 26 * S) {
        pickups.splice(i, 1);
        stats.pickups++;
        if (p.kind === "puff") human.boostFor = 4;
        else {
          human.stamina = 100;
          human.exhausted = false;
        }
        events.push({ type: "pickup", pickup: p });
      } else if (p.age > 14) pickups.splice(i, 1);
    }

    if (role === "thief" && !human.jailed) stats.freeSeconds += dt;

    const result = outcome(thieves(), state.timeLeft);
    if (result) {
      state.winner = result;
      state.phase = "end";
      state.endAt = state.clock;
      events.push({ type: "end", winner: result });
    }
    return events;
  }

  /** Final stats, quantised to log precision so a server replay scores identically. */
  function summary() {
    const tenths = (v: number) => Math.round(v * 10) / 10;
    const s: MatchStats = {
      role,
      won: state.winner === role,
      freeSeconds: tenths(stats.freeSeconds),
      rescues: stats.rescues,
      catches: stats.catches,
      pickups: stats.pickups,
      timeLeft: tenths(state.timeLeft),
    };
    const jailedCount = thieves().filter((t) => t.jailed).length;
    const total = thieves().length;
    return {
      score: scoreMatch(s),
      won: s.won,
      log: encodeStats(s),
      headline:
        role === "thief"
          ? s.won
            ? "You escaped! Thieves win."
            : "Police caught everybody!"
          : s.won
            ? `All ${total} thieves in jail!`
            : `Time up — ${total - jailedCount} thie${total - jailedCount === 1 ? "f" : "ves"} got away`,
      detail:
        role === "thief"
          ? `${Math.round(stats.freeSeconds)}s free · ${stats.rescues} rescue${stats.rescues === 1 ? "" : "s"}`
          : `${stats.catches} catch${stats.catches === 1 ? "" : "es"} · ${Math.round(state.timeLeft)}s left`,
      stats: {
        rescues: stats.rescues,
        catches: stats.catches,
        pickups: stats.pickups,
        freeSeconds: Math.round(stats.freeSeconds),
        timeLeft: Math.round(state.timeLeft),
      },
    };
  }

  return { actors, human, pickups, state, stats, role, jailCenter, thieves, police, update, summary, map };
}
