import { OBSTACLES, RUN, SNACKS, createTrack, laneX, type Obstacle, type ObstacleKind, type RunStats, type SnackKind } from "./run-rules";

export type RunAction = "left" | "right" | "jump" | "slide";

export type RunEvent =
  | { type: "coin"; lane: number; z: number; y: number }
  | { type: "snack"; kind: SnackKind; lane: number; z: number }
  | { type: "tired" }
  | { type: "rushEnd" }
  | { type: "turbo"; lane: number; z: number }
  | { type: "turboEnd" }
  | { type: "smash"; kind: ObstacleKind }
  | { type: "jump" }
  | { type: "land" }
  | { type: "slide" }
  | { type: "lane"; dir: -1 | 1 }
  | { type: "stumble"; kind: ObstacleKind; side: boolean }
  | { type: "splash" }
  | { type: "caught"; kind: ObstacleKind | null }
  | { type: "go" }
  | { type: "milestone"; metres: number }
  | { type: "near"; kind: ObstacleKind; lane: number };

export interface RunState {
  phase: "intro" | "run" | "caught" | "over";
  clock: number;
  /** Seconds of actual running (excludes intro). */
  runTime: number;
  dist: number;
  speed: number;
  lane: number;
  laneFrom: number;
  /** x where the current lane change started. */
  fromX: number;
  laneT: number;
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
  slide: number;
  coins: number;
  stumbles: number;
  /** 1 = police right behind you, 0 = left far behind. */
  chase: number;
  /** Seconds since the last stumble (for animation/shake). */
  sinceStumble: number;
  /** Temporary speed penalty after a stumble (multiplier, recovers to 1). */
  slow: number;
  caughtAt: number;
  caughtBy: ObstacleKind | null;
  lastMilestone: number;
  /** 0..1, drains while running; snacks top it up. */
  energy: number;
  /** Seconds of energy-drink rush left (faster, can't be tripped). */
  rush: number;
  snacks: number;
  /** Seconds of agbo turbo left (much faster; crashes only make you stagger). */
  turbo: number;
  /** Seconds left of the stagger after crashing through something on turbo. */
  knock: number;
}

const ACTIVATE = 75;

export function createRun(seed: number) {
  const track = createTrack(seed);
  const s: RunState = {
    phase: "intro",
    clock: 0,
    runTime: 0,
    dist: 0,
    speed: 0,
    lane: 1,
    laneFrom: 1,
    fromX: 0,
    laneT: 1,
    x: 0,
    y: 0,
    vy: 0,
    grounded: true,
    slide: 0,
    coins: 0,
    stumbles: 0,
    // They're close as you take off, but not close enough to grab you on a first trip.
    chase: 0.55,
    sinceStumble: 99,
    slow: 1,
    caughtAt: 0,
    caughtBy: null,
    lastMilestone: 0,
    energy: 1,
    rush: 0,
    snacks: 0,
    turbo: 0,
    knock: 0,
  };
  let wasTired = false;
  const queue: RunAction[] = [];
  let jumpBuffer = 0;
  track.fill(220);

  function act(a: RunAction, ev: RunEvent[]) {
    if (a === "left" || a === "right") {
      const dir = a === "left" ? -1 : 1;
      const target = Math.max(0, Math.min(2, s.lane + dir));
      if (target === s.lane) return;
      s.laneFrom = s.lane;
      s.fromX = s.x;
      s.lane = target;
      s.laneT = 0;
      ev.push({ type: "lane", dir });
    } else if (a === "jump") {
      if (s.grounded) {
        s.vy = RUN.jumpVel;
        s.grounded = false;
        s.slide = 0;
        ev.push({ type: "jump" });
      } else jumpBuffer = 0.16;
    } else if (a === "slide") {
      if (!s.grounded) s.vy = Math.min(s.vy, -16); // slam down, then slide on landing
      s.slide = RUN.slideTime;
      if (s.grounded) ev.push({ type: "slide" });
    }
  }

  function stumble(o: Obstacle, side: boolean, ev: RunEvent[]) {
    // Sugar rush: you barrel straight through.
    if (s.rush > 0) return;
    // Police already on your heels: that's it.
    if (s.chase > 0.3) return caught(o.kind, ev, o);
    s.chase = 1;
    s.stumbles++;
    s.sinceStumble = 0;
    s.slow = 0.78;
    ev.push({ type: "stumble", kind: o.kind, side });
  }

  function caught(kind: ObstacleKind | null, ev: RunEvent[], hit?: Obstacle) {
    if (s.phase !== "run") return;
    // Ran into a vehicle: stop dead at its nose instead of sliding into it.
    if (hit && OBSTACLES[hit.kind].clear === "block") {
      s.speed = 0;
      s.dist = Math.min(s.dist, hit.z - RUN.halfD - 0.25);
    }
    s.phase = "caught";
    s.caughtAt = s.clock;
    s.caughtBy = kind;
    s.chase = 1;
    s.slide = 0;
    ev.push({ type: "caught", kind });
  }

  const lateral = (o: Obstacle, x: number) => {
    const spec = OBSTACLES[o.kind];
    return spec.wide || Math.abs(x - (o.x ?? laneX(o.lane))) < spec.halfW + RUN.halfW;
  };

  /** Does the kid's body overlap the obstacle's solid part at this height/pose? */
  const vertical = (o: Obstacle) => {
    const spec = OBSTACLES[o.kind];
    const top = s.y + (s.slide > 0 && s.grounded ? RUN.slideH : RUN.standH);
    switch (spec.clear) {
      case "block":
        return true;
      case "jump":
        return s.y < spec.h - 0.12;
      case "slide":
        return top > spec.h;
      case "hole":
        return s.y < 0.04;
      case "bump":
        return s.y < spec.h;
    }
  };

  function collide(prevX: number, ev: RunEvent[]) {
    const near = s.dist + RUN.halfD;
    const far = s.dist - RUN.halfD;
    for (const o of track.obstacles) {
      if (o.z > near + 1) break;
      const spec = OBSTACLES[o.kind];
      if (o.hit || o.z + spec.len < far) continue;
      if (!lateral(o, s.x) || !vertical(o)) continue;
      o.hit = true;
      // Agbo turbo: knock it aside, stagger, get straight back up and keep running.
      if (s.turbo > 0) {
        if (spec.clear !== "hole") o.knocked = s.clock;
        s.knock = RUN.knockSeconds;
        ev.push({ type: "smash", kind: o.kind });
        continue;
      }
      if (spec.clear === "hole") {
        ev.push({ type: "splash" });
        stumble(o, false, ev);
        continue;
      }
      // Already alongside it when we touched: we clipped its side changing lanes.
      const side = !lateral(o, prevX) && o.z < far;
      if (side) {
        // Bounce back to the lane we came from.
        const back = s.laneFrom;
        s.laneFrom = s.lane;
        s.lane = back;
        s.fromX = s.x;
        s.laneT = 0;
        stumble(o, true, ev);
      } else if (spec.clear === "bump") {
        stumble(o, false, ev);
      } else if (spec.clear === "block") {
        if (s.rush > 0) continue;
        caught(o.kind, ev, o);
      }
      else stumble(o, false, ev);
      if (s.phase !== "run") return;
    }
  }

  return {
    state: s,
    track,
    press(a: RunAction) {
      if (s.phase === "intro" || s.phase === "run") queue.push(a);
    },
    update(dt: number): RunEvent[] {
      const ev: RunEvent[] = [];
      s.clock += dt;
      if (s.phase === "intro") {
        s.speed = Math.min(RUN.startSpeed, s.speed + dt * 9);
        s.dist += s.speed * dt;
        if (s.clock >= RUN.introSeconds) {
          s.phase = "run";
          ev.push({ type: "go" });
        }
      }
      if (s.phase === "caught") {
        s.speed = Math.max(0, s.speed - dt * 22);
        s.dist += s.speed * dt;
        s.y = Math.max(0, s.y + s.vy * dt);
        s.vy -= RUN.gravity * dt;
        if (s.clock - s.caughtAt > RUN.caughtSeconds) s.phase = "over";
        return ev;
      }
      if (s.phase !== "run" && s.phase !== "intro") return ev;

      while (queue.length) act(queue.shift()!, ev);

      if (s.phase === "run") {
        s.runTime += dt;
        s.slow = Math.min(1, s.slow + dt * 0.25);
        s.energy = Math.max(0, s.energy - dt / RUN.energySeconds);
        if (s.rush > 0) {
          s.rush = Math.max(0, s.rush - dt);
          if (s.rush === 0) ev.push({ type: "rushEnd" });
        }
        if (s.turbo > 0) {
          s.turbo = Math.max(0, s.turbo - dt);
          if (s.turbo === 0) ev.push({ type: "turboEnd" });
        }
        s.knock = Math.max(0, s.knock - dt);
        const tired = s.energy < RUN.tired;
        if (tired && !wasTired) ev.push({ type: "tired" });
        wasTired = tired;
        // Tired legs: slower, and the police creep up on you. A rush pushes them back.
        const legs = tired ? 0.82 + 0.18 * (s.energy / RUN.tired) : 1;
        const base = Math.min(RUN.maxSpeed, RUN.startSpeed + RUN.accel * s.runTime);
        // Turbo kicks in fast and eases off at the end; a stagger costs a moment's speed.
        const turbo = s.turbo > 0 ? 1 + (RUN.turboBoost - 1) * Math.min(1, (RUN.turboSeconds - s.turbo) / 0.25, s.turbo / 0.6) : 0;
        const boost = Math.max(turbo, s.rush > 0 ? RUN.rushBoost : 1);
        const stagger = 1 - 0.3 * (s.knock / RUN.knockSeconds);
        s.speed = base * s.slow * legs * boost * stagger;
        s.dist += s.speed * dt;
        if (s.turbo > 0) s.chase = Math.max(0, s.chase - dt * 1.5);
        else if (s.rush > 0) s.chase = Math.max(0, s.chase - dt * 0.8);
        else if (tired) s.chase = Math.min(1, s.chase + dt * (0.08 + (RUN.tired - s.energy) * 0.9));
        else s.chase = Math.max(0, s.chase - dt / RUN.heat);
        s.sinceStumble += dt;
      }

      // Lane change: quick ease between lane centres.
      const prevX = s.x;
      s.laneT = Math.min(1, s.laneT + dt / RUN.laneTime);
      const e = 1 - Math.pow(1 - s.laneT, 3);
      s.x = s.fromX + (laneX(s.lane) - s.fromX) * e;

      // Jump / gravity / slide.
      if (!s.grounded) {
        s.vy -= RUN.gravity * dt;
        s.y += s.vy * dt;
        if (s.y <= 0) {
          s.y = 0;
          s.vy = 0;
          s.grounded = true;
          ev.push({ type: "land" });
          if (s.slide > 0) ev.push({ type: "slide" });
          if (jumpBuffer > 0) act("jump", ev);
        }
      }
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      if (s.grounded) s.slide = Math.max(0, s.slide - dt);

      // Oncoming traffic starts moving once it's in sight.
      for (const o of track.obstacles) {
        if (o.z - s.dist > ACTIVATE) break;
        if (o.speed !== 0 && o.z > s.dist - 10) o.z -= o.speed * dt;
        if (o.vx) {
          // Hawkers cross the road and turn back at the kerb.
          o.x = (o.x ?? 0) + o.vx * dt;
          if (Math.abs(o.x) > laneX(2) + 0.6) o.vx = -o.vx;
        }
      }
      // Keep the list sorted: moving traffic can overtake parked things.
      track.obstacles.sort((p, q) => p.z - q.z);

      if (s.phase === "run") {
        collide(prevX, ev);
        for (const c of track.coins) {
          if (c.z > s.dist + 1) break;
          if (c.taken || c.z < s.dist - 1) continue;
          const bodyY = s.y + (s.slide > 0 && s.grounded ? 0.35 : 0.8);
          if (Math.abs(laneX(c.lane) - s.x) < 0.8 && Math.abs(c.y - bodyY) < 0.95) {
            c.taken = true;
            s.coins++;
            ev.push({ type: "coin", lane: c.lane, z: c.z, y: c.y });
          }
        }
        for (const k of track.snacks) {
          if (k.z > s.dist + 1) break;
          if (k.taken || k.z < s.dist - 1.2) continue;
          if (Math.abs(laneX(k.lane) - s.x) < 0.9 && s.y < 1.6) {
            k.taken = true;
            s.snacks++;
            const snack = SNACKS[k.kind];
            s.energy = Math.min(1, s.energy + snack.energy);
            if (snack.rush) s.rush = RUN.rushSeconds;
            ev.push({ type: "snack", kind: k.kind, lane: k.lane, z: k.z });
          }
        }
        for (const b of track.boosts) {
          if (b.z > s.dist + 1) break;
          if (b.taken || b.z < s.dist - 1.2) continue;
          if (Math.abs(laneX(b.lane) - s.x) < 0.9 && s.y < 2.2) {
            b.taken = true;
            s.turbo = RUN.turboSeconds;
            // Agbo sorts out tired legs too.
            s.energy = Math.min(1, s.energy + 0.25);
            s.slow = 1;
            ev.push({ type: "turbo", lane: b.lane, z: b.z });
          }
        }
        // A heads-up so the renderer can honk/rev as traffic gets close.
        for (const o of track.obstacles) {
          if (o.z - s.dist > 30) break;
          if (!o.honked && (o.kind === "danfo" || o.kind === "okada") && (o.speed > 0 || o.seed % 3 === 0)) {
            o.honked = true;
            ev.push({ type: "near", kind: o.kind, lane: o.lane });
          }
        }
        const m = Math.floor(s.dist / 500) * 500;
        if (m > s.lastMilestone) {
          s.lastMilestone = m;
          ev.push({ type: "milestone", metres: m });
        }
      }

      track.fill(s.dist + 240);
      track.prune(s.dist - 30);
      return ev;
    },
    stats(): RunStats {
      return { distance: s.dist, coins: s.coins, stumbles: s.stumbles, seconds: s.runTime };
    },
  };
}

export type Run = ReturnType<typeof createRun>;
