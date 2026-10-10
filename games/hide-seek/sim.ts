import { createRng, type Rng } from "@/games/core/rng";
import {
  BASE,
  LEVELS,
  SPEED,
  SPOT_R,
  SPOTS,
  TAG_R,
  canSee,
  dist,
  encodeHide,
  encodeSeek,
  scoreHide,
  scoreSeek,
  spotAt,
  walkToward,
  type Difficulty,
  type Mode,
  type Spot,
  type Vec,
} from "./rules";

export type KidState = "free" | "toSpot" | "hidden" | "bolting" | "found" | "home" | "caught";

export interface Kid {
  id: string;
  name: string;
  avatar: string;
  human: boolean;
  seeker: boolean;
  pos: Vec;
  heading: number;
  state: KidState;
  spot: Spot | null;
  moving: boolean;
  /** Seek mode: has this hider already decided whether to bolt? */
  boltRolled?: boolean;
  /** Hide mode: close-call latch so one pass-by counts once. */
  near?: boolean;
  /** Which way round obstacles this kid is going (see walkToward). */
  memo: { side: number };
}

export type HideSeekEvent =
  | { type: "count"; n: number }
  | { type: "go" }
  | { type: "hid"; spot: string }
  | { type: "unhid" }
  | { type: "found"; kid: Kid }
  | { type: "spotted"; kid: Kid }
  | { type: "caught"; kid: Kid }
  | { type: "home"; kid: Kid }
  | { type: "closeCall" }
  | { type: "rustle"; spot: Spot }
  | { type: "bolt"; kid: Kid }
  | { type: "empty"; spot: Spot }
  | { type: "end"; won: boolean };

const KIDS = [
  { avatar: "ada", name: "Ada" },
  { avatar: "emeka", name: "Emeka" },
  { avatar: "tunde", name: "Tunde" },
  { avatar: "aisha", name: "Aisha" },
];

/**
 * Hide & Seek match. `move` is a ground-plane direction (length ≤ 1); `run`
 * is sprint. In hide mode the human hides; in seek mode the human is the seeker.
 */
export function createHideSeek(opts: { mode: Mode; difficulty: Difficulty; seed: number }) {
  const rng: Rng = createRng(opts.seed);
  const L = LEVELS[opts.difficulty];
  const hideMode = opts.mode === "hide";

  // Line-up: hide mode = you (Ada) + 2 CPU hiders + CPU seeker (Emeka). Seek mode = you seek, 3 hide.
  const kids: Kid[] = [];
  const start = (i: number): Vec => ({ x: -1.5 + i * 1.0, z: -4.8 });
  if (hideMode) {
    kids.push({ id: "you", name: "You", avatar: "ada", human: true, seeker: false, pos: start(1), heading: 0, state: "free", spot: null, moving: false, memo: { side: 0 } });
    kids.push({ id: "tunde", name: "Tunde", avatar: "tunde", human: false, seeker: false, pos: start(2), heading: 0, state: "toSpot", spot: null, moving: true, memo: { side: 0 } });
    kids.push({ id: "aisha", name: "Aisha", avatar: "aisha", human: false, seeker: false, pos: start(3), heading: 0, state: "toSpot", spot: null, moving: true, memo: { side: 0 } });
    kids.push({ id: "emeka", name: "Emeka", avatar: "emeka", human: false, seeker: true, pos: { x: BASE.x, z: BASE.z + 0.2 }, heading: Math.PI, state: "free", spot: null, moving: false, memo: { side: 0 } });
  } else {
    kids.push({ id: "you", name: "You", avatar: "emeka", human: true, seeker: true, pos: { x: BASE.x, z: BASE.z + 0.3 }, heading: Math.PI, state: "free", spot: null, moving: false, memo: { side: 0 } });
    for (const k of KIDS.filter((k) => k.avatar !== "emeka")) {
      kids.push({ id: k.avatar, name: k.name, avatar: k.avatar, human: false, seeker: false, pos: start(kids.length), heading: 0, state: "toSpot", spot: null, moving: true, memo: { side: 0 } });
    }
  }
  const me = kids[0]!;
  const seeker = kids.find((k) => k.seeker)!;
  const hiders = kids.filter((k) => !k.seeker);

  // CPU hiders each take a different spot.
  const freeSpots = [...SPOTS].sort(() => rng() - 0.5);
  for (const h of hiders) if (!h.human) h.spot = freeSpots.pop()!;

  const st = {
    phase: "count" as "count" | "seek" | "end",
    clock: 0,
    phaseAt: 0,
    countLeft: hideMode ? L.count : 4,
    timeLeft: hideMode ? L.hideSeconds : L.seekSeconds,
    lastCount: -1,
    hiddenSeconds: 0,
    closeCalls: 0,
    won: false,
    // Seeker AI
    ai: { mode: "walk" as "walk" | "check" | "chase", target: null as Spot | null, chase: null as Kid | null, checkUntil: 0, checked: new Set<string>(), sweep: 0, waitUntil: 0 },
  };

  const step = (k: Kid, to: Vec, speed: number, dt: number) => {
    const d = dist(k.pos, to);
    if (d < 0.05) {
      k.moving = false;
      return true;
    }
    const s = Math.min(d, speed * dt);
    const next = walkToward(k.pos, to, s, k.memo);
    if (dist(next, k.pos) > 1e-4) k.heading = Math.atan2(next.x - k.pos.x, next.z - k.pos.z);
    k.pos = next;
    k.moving = true;
    return d - s < 0.05;
  };

  const atBase = (k: Kid) => dist(k.pos, BASE) <= BASE.r;

  function pickTarget(): Spot | null {
    const left = SPOTS.filter((s) => !st.ai.checked.has(s.id));
    if (!left.length) {
      st.ai.checked.clear();
      return pickTarget();
    }
    // Obvious, nearby spots first, with a little randomness.
    const scored = left.map((s) => ({ s, v: dist(seeker.pos, s) * 0.6 + s.sneaky * 6 + rng() * 3 }));
    scored.sort((a, b) => a.v - b.v);
    return scored[0]!.s;
  }

  function hiderIn(spot: Spot): Kid | undefined {
    return hiders.find((h) => h.state === "hidden" && h.spot?.id === spot.id);
  }

  function update(dt: number, input: { move: Vec; run: boolean }): HideSeekEvent[] {
    const ev: HideSeekEvent[] = [];
    if (st.phase === "end") return ev;
    st.clock += dt;

    // ---------------- the human
    const len = Math.hypot(input.move.x, input.move.z);
    const humanCanMove = !(hideMode ? me.state === "caught" || me.state === "home" : st.phase === "count");
    if (len > 0.05 && humanCanMove) {
      if (hideMode && me.state === "hidden") {
        me.state = "free"; // moving breaks cover
        ev.push({ type: "unhid" });
      }
      const speed = input.run ? SPEED.run : SPEED.walk;
      const n = Math.min(1, len);
      // Slide round things you bump into rather than sticking to them.
      me.pos = walkToward(me.pos, { x: me.pos.x + (input.move.x / len) * 10, z: me.pos.z + (input.move.z / len) * 10 }, n * speed * dt, me.memo);
      me.heading = Math.atan2(input.move.x, input.move.z);
      me.moving = true;
    } else me.moving = false;

    // ---------------- counting phase
    if (st.phase === "count") {
      st.countLeft -= dt;
      const n = Math.ceil(st.countLeft);
      if (n !== st.lastCount && n >= 0) {
        st.lastCount = n;
        ev.push({ type: "count", n });
      }
      for (const h of hiders) {
        if (h.human || h.state !== "toSpot" || !h.spot) continue;
        if (step(h, h.spot, SPEED.run * 0.8, dt)) {
          h.state = "hidden";
          h.moving = false;
        }
      }
      if (st.countLeft <= 0) {
        st.phase = "seek";
        st.phaseAt = st.clock;
        // Anyone still walking ducks into their spot.
        for (const h of hiders) if (!h.human && h.state === "toSpot" && h.spot) {
          h.pos = { x: h.spot.x, z: h.spot.z };
          h.state = "hidden";
        }
        ev.push({ type: "go" });
      }
      return ev;
    }

    // ---------------- seeking phase
    st.timeLeft = Math.max(0, st.timeLeft - dt);

    // Kids who are out of the game go and wait by the gate.
    for (const h of hiders) {
      if (h.human || !(h.state === "caught" || h.state === "home" || h.state === "found")) continue;
      step(h, { x: BASE.x + (hiders.indexOf(h) - 1.5) * 0.9, z: BASE.z + 0.9 }, SPEED.walk, dt);
    }

    if (hideMode) {
      runSeekerAI(dt, ev);
      if (me.state === "hidden" || me.state === "free" || me.state === "bolting") st.hiddenSeconds += dt;
      // Being out in the open near base: touch it to be home free.
      if ((me.state === "free" || me.state === "bolting") && atBase(me)) {
        me.state = "home";
        ev.push({ type: "home", kid: me });
        return finish(true, ev);
      }
      // Close call: the seeker walks right past your hiding spot.
      if (me.state === "hidden") {
        const close = dist(seeker.pos, me.pos) < 2.2;
        if (close && !me.near && st.ai.mode !== "chase") {
          me.near = true;
          st.closeCalls++;
          ev.push({ type: "closeCall" });
        } else if (!close) me.near = false;
      }
      if (st.timeLeft <= 0) return finish(me.state !== "caught", ev);
    } else {
      // You're the seeker: hints from hiders near you, and some make a run for it.
      for (const h of hiders) {
        if (h.state === "hidden" && h.spot) {
          const d = dist(me.pos, h.spot);
          if (d < 3.2 && rng() < dt * 0.6) ev.push({ type: "rustle", spot: h.spot });
          if (d < 2.6 && !h.boltRolled) {
            h.boltRolled = true;
            if (rng() < L.bolt) {
              h.state = "bolting";
              ev.push({ type: "bolt", kid: h });
            }
          }
        }
        if (h.state === "bolting") {
          if (dist(me.pos, h.pos) < TAG_R) {
            h.state = "found";
            ev.push({ type: "found", kid: h });
          } else if (step(h, BASE, SPEED.hiderBolt * (0.85 + 0.15 * (opts.difficulty === "hard" ? 1 : 0)), dt) || atBase(h)) {
            h.state = "home";
            ev.push({ type: "home", kid: h });
          }
        }
      }
      const done = hiders.every((h) => h.state === "found" || h.state === "home");
      if (done || st.timeLeft <= 0) return finish(hiders.some((h) => h.state === "found"), ev);
    }
    return ev;
  }

  function runSeekerAI(dt: number, ev: HideSeekEvent[]) {
    const ai = st.ai;
    // Anyone out in the open in view gets chased.
    if (ai.mode !== "chase") {
      for (const h of hiders) {
        if ((h.state === "free" || h.state === "bolting") && canSee(seeker.pos, seeker.heading, h.pos, opts.difficulty)) {
          ai.mode = "chase";
          ai.chase = h;
          ai.waitUntil = st.clock + L.headStart * 0.6;
          if (h.state === "free") ev.push({ type: "spotted", kid: h });
          h.state = "bolting";
          break;
        }
      }
    }
    if (ai.mode === "chase" && ai.chase) {
      const t = ai.chase;
      if (!t.human) step(t, BASE, SPEED.hiderBolt, dt);
      // "I see you!": the seeker shouts before giving chase, so there's a race.
      if (st.clock >= ai.waitUntil) step(seeker, t.pos, L.chase, dt);
      else {
        seeker.moving = false;
        seeker.heading = Math.atan2(t.pos.x - seeker.pos.x, t.pos.z - seeker.pos.z);
      }
      if (dist(seeker.pos, t.pos) < TAG_R) {
        t.state = "caught";
        ev.push({ type: "caught", kid: t });
        ai.mode = "walk";
        ai.chase = null;
        if (t.human) finish(false, ev);
        return;
      }
      if (atBase(t)) {
        t.state = "home";
        ev.push({ type: "home", kid: t });
        ai.mode = "walk";
        ai.chase = null;
      }
      return;
    }
    if (ai.mode === "check") {
      // Look around behind the spot for a moment.
      ai.sweep += dt * 3;
      seeker.heading += Math.sin(ai.sweep) * dt * 2.5;
      seeker.moving = false;
      if (st.clock >= ai.checkUntil && ai.target) {
        const found = hiderIn(ai.target);
        ai.checked.add(ai.target.id);
        if (found) {
          // Found! Race to base: the hider bolts, the seeker gives chase.
          found.state = "bolting";
          ev.push({ type: "found", kid: found });
          ai.mode = "chase";
          ai.chase = found;
          ai.target = null;
          ai.waitUntil = st.clock + L.headStart;
        } else {
          ev.push({ type: "empty", spot: ai.target });
          ai.mode = "walk";
          ai.target = null;
        }
      }
      return;
    }
    // Walk to the next spot to check.
    if (!ai.target) ai.target = pickTarget();
    const t = ai.target!;
    // Stand just in front of the spot (gate side) to look behind it.
    if (step(seeker, { x: t.x, z: t.z - 0.9 }, SPEED.seekerWalk, dt) || dist(seeker.pos, t) < SPOT_R + 0.6) {
      ai.mode = "check";
      ai.checkUntil = st.clock + L.checkTime;
      ai.sweep = 0;
      seeker.heading = Math.atan2(t.x - seeker.pos.x, t.z - seeker.pos.z);
    }
  }

  function finish(won: boolean, ev: HideSeekEvent[]) {
    if (st.phase === "end") return ev;
    st.phase = "end";
    st.phaseAt = st.clock;
    st.won = won;
    ev.push({ type: "end", won });
    return ev;
  }

  /** HIDE (hide mode): duck into the spot you're standing in, or come out. LOOK (seek mode): check the nearest spot. */
  function press(action: "hide" | "look"): HideSeekEvent[] {
    const ev: HideSeekEvent[] = [];
    if (st.phase === "end") return ev;
    if (hideMode && action === "hide") {
      if (me.state === "hidden") {
        me.state = "free";
        ev.push({ type: "unhid" });
      } else if (me.state === "free") {
        const s = spotAt(me.pos);
        if (s) {
          me.state = "hidden";
          me.spot = s;
          me.pos = { x: s.x, z: s.z };
          ev.push({ type: "hid", spot: s.name });
        }
      }
    }
    if (!hideMode && action === "look" && st.phase === "seek") {
      const s = SPOTS.filter((x) => dist(x, me.pos) < 1.5).sort((a, b) => dist(a, me.pos) - dist(b, me.pos))[0];
      if (!s) return ev;
      const h = hiderIn(s);
      if (h) {
        h.state = "found";
        ev.push({ type: "found", kid: h });
      } else ev.push({ type: "empty", spot: s });
    }
    return ev;
  }

  function stats() {
    if (hideMode) return { hiddenSeconds: st.hiddenSeconds, homeFree: me.state === "home", caught: me.state === "caught", closeCalls: st.closeCalls };
    return { found: hiders.filter((h) => h.state === "found").length, total: hiders.length, escaped: hiders.filter((h) => h.state === "home").length, timeLeft: st.timeLeft };
  }

  function result() {
    if (hideMode) {
      const s = stats() as ReturnType<typeof stats> & { hiddenSeconds: number; homeFree: boolean; caught: boolean; closeCalls: number };
      const r = { hiddenSeconds: Math.round(s.hiddenSeconds * 10) / 10, homeFree: s.homeFree, caught: s.caught, closeCalls: s.closeCalls };
      const out: Record<string, number> = { hidden10: Math.round(r.hiddenSeconds * 10), homeFree: r.homeFree ? 1 : 0, caught: r.caught ? 1 : 0, closeCalls: r.closeCalls };
      return { score: scoreHide(r), log: encodeHide(r), won: !r.caught, stats: out };
    }
    const s = stats() as { found: number; total: number; escaped: number; timeLeft: number };
    const r = { ...s, timeLeft: Math.round(s.timeLeft * 10) / 10 };
    const out: Record<string, number> = { found: r.found, total: r.total, escaped: r.escaped };
    return { score: scoreSeek(r), log: encodeSeek(r), won: r.found === r.total, stats: out };
  }

  return { kids, me, seeker, hiders, st, level: L, update, press, stats, result };
}

export type HideSeekMatch = ReturnType<typeof createHideSeek>;
