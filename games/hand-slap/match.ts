import { createRng } from "@/games/core/rng";
import { COUNT_BEAT, FEINT, LEVELS, OUTCOME, TARGET, WINDOW, YOU_SLAP, summarizeSlap, type Difficulty, type OutcomeCode } from "./rules";

export type Side = 0 | 1; // 0 = you, 1 = CPU

export type SlapEvent =
  | { type: "count"; n: number }
  | { type: "go" }
  | { type: "feint"; by: Side }
  | { type: "windup"; by: Side }
  | { type: "slap"; by: Side; free: boolean }
  | { type: "dodge"; by: Side; reactMs: number }
  | { type: "flinch"; by: Side }
  | { type: "timeout"; by: Side }
  | { type: "early" }
  | { type: "turn"; attacker: Side }
  | { type: "end"; won: boolean };

/** Seconds the outcome is shown before the next count starts. */
const AFTER = 1.3;

/**
 * One backhand-slap match against the CPU. Call update(dt) every frame and
 * press("act") for SLAP (attacking) or PULL (defending), press("fake") to fake.
 */
export function createSlapMatch(opts: { difficulty: Difficulty; seed: number }) {
  const L = LEVELS[opts.difficulty];
  const rng = createRng(opts.seed);
  const gauss = () => (rng() + rng() + rng() - 1.5) * 1.41;

  const st = {
    clock: 0,
    phase: "count" as "count" | "open" | "after" | "end",
    attacker: (rng() < 0.5 ? 0 : 1) as Side,
    points: [0, 0] as [number, number],
    /** Seconds into the count / the strike window. */
    phaseAt: 0,
    lastCount: 0,
    /** A strike in progress: started at `at`; contact at at + windup + travel. */
    strike: null as { at: number; windup: number; travel: number; free: boolean } | null,
    /** A fake in progress (visual twitch). */
    feint: null as { at: number; by: Side } | null,
    lastFeint: -9,
    /** Defender pulled their hands back at this time (for the animation). */
    pulledAt: null as number | null,
    /** The last outcome, for the HUD and animations. */
    outcome: null as { code: OutcomeCode; at: number; reactMs: number } | null,
    // CPU plans for this turn
    cpuStrikeAt: 0,
    cpuNextFeint: 0,
    cpuReact: 0,
    feintsThisTurn: 0,
    /** Turns started as slapper: [you, CPU]. */
    turnsAs: [0, 0] as [number, number],
    /** Extra seconds before "3, 2, 1" (the first turn each way, to read the tip). */
    intro: 0,
    log: [] as number[],
    won: false,
  };

  const contactAt = () => (st.strike ? st.strike.at + st.strike.windup + st.strike.travel : Infinity);
  const sinceGo = () => st.clock - st.phaseAt;

  function startTurn(ev: SlapEvent[]) {
    st.phase = "count";
    st.phaseAt = st.clock;
    st.lastCount = 0;
    st.strike = null;
    st.feint = null;
    st.pulledAt = null;
    st.feintsThisTurn = 0;
    st.turnsAs[st.attacker]++;
    st.intro = st.turnsAs[st.attacker] === 1 ? 3.5 : 0;
    ev.push({ type: "turn", attacker: st.attacker });
  }

  function planCpuAttack() {
    st.cpuStrikeAt = 0.35 + rng() * (WINDOW - 1.1);
    st.cpuNextFeint = nextFeintGap();
  }
  const nextFeintGap = () => -Math.log(1 - rng() * 0.999) / L.feintRate;

  function settle(code: OutcomeCode, ev: SlapEvent[], reactMs = 0) {
    st.log.push(code, code === OUTCOME.youDodged ? reactMs : 0);
    st.outcome = { code, at: st.clock, reactMs };
    if (code === OUTCOME.youSlapped || code === OUTCOME.cpuFlinched) st.points[0]++;
    if (code === OUTCOME.youGotSlapped || code === OUTCOME.youFlinched) st.points[1]++;
    if (code === OUTCOME.cpuDodged || code === OUTCOME.youTimedOut) st.attacker = 1;
    if (code === OUTCOME.youDodged) st.attacker = 0;
    st.phase = "after";
    st.phaseAt = st.clock;
    if (st.points[0] >= TARGET || st.points[1] >= TARGET) {
      st.phase = "end";
      st.won = st.points[0] >= TARGET;
      ev.push({ type: "end", won: st.won });
    }
  }

  /** A free slap: the attacker gets to slap the hands that flinched. */
  function freeSlap(by: Side, ev: SlapEvent[]) {
    st.strike = { at: st.clock, windup: 0.05, travel: 0.15, free: true };
    ev.push({ type: "flinch", by: by === 0 ? 1 : 0 });
    ev.push({ type: "slap", by, free: true });
    settle(by === 0 ? OUTCOME.cpuFlinched : OUTCOME.youFlinched, ev);
  }

  function update(dt: number): SlapEvent[] {
    const ev: SlapEvent[] = [];
    if (st.phase === "end") return ev;
    st.clock += dt;
    if (st.feint && st.clock - st.feint.at > FEINT.dur) st.feint = null;

    if (st.phase === "count") {
      const into = st.clock - st.phaseAt - st.intro;
      if (into < 0) return ev;
      const beat = Math.floor(into / COUNT_BEAT);
      if (beat >= 3) {
        st.phase = "open";
        st.phaseAt = st.clock;
        if (st.attacker === 1) planCpuAttack();
        ev.push({ type: "go" });
      } else if (beat + 1 > st.lastCount) {
        st.lastCount = beat + 1;
        ev.push({ type: "count", n: 3 - beat });
      }
      return ev;
    }

    if (st.phase === "after") {
      if (st.clock - st.phaseAt > AFTER) startTurn(ev);
      return ev;
    }

    // phase "open": the attacker may strike any time
    if (st.strike) {
      if (st.attacker === 0 && st.clock >= st.strike.at + st.cpuReact && st.cpuReact < st.strike.windup + st.strike.travel) {
        st.pulledAt = st.strike.at + st.cpuReact;
        ev.push({ type: "dodge", by: 1, reactMs: Math.round(st.cpuReact * 1000) });
        settle(OUTCOME.cpuDodged, ev);
        return ev;
      }
      if (st.clock >= contactAt()) {
        ev.push({ type: "slap", by: st.attacker, free: false });
        settle(st.attacker === 0 ? OUTCOME.youSlapped : OUTCOME.youGotSlapped, ev);
      }
      return ev;
    }
    if (st.attacker === 1) {
      if (sinceGo() >= st.cpuStrikeAt) {
        st.strike = { at: st.clock, windup: L.windup, travel: L.travel, free: false };
        ev.push({ type: "windup", by: 1 });
      } else if (sinceGo() >= st.cpuNextFeint) {
        st.feint = { at: st.clock, by: 1 };
        st.cpuNextFeint = sinceGo() + Math.max(FEINT.cooldown, nextFeintGap());
        ev.push({ type: "feint", by: 1 });
      }
    } else if (sinceGo() >= WINDOW) {
      ev.push({ type: "timeout", by: 0 });
      settle(OUTCOME.youTimedOut, ev);
    }
    return ev;
  }

  function press(action: "act" | "fake"): SlapEvent[] {
    const ev: SlapEvent[] = [];
    if (st.phase === "end" || st.phase === "after") return ev;
    // Still reading the tip before the count: presses don't count yet.
    if (st.phase === "count" && st.clock - st.phaseAt < st.intro) return ev;
    if (st.attacker === 0) {
      if (st.phase === "count") {
        if (action === "act") ev.push({ type: "early" });
        return ev;
      }
      if (st.strike) return ev;
      if (action === "act") {
        st.strike = { at: st.clock, windup: YOU_SLAP.windup, travel: YOU_SLAP.travel, free: false };
        st.cpuReact = Math.max(0.12, L.react + gauss() * L.reactSpread);
        ev.push({ type: "windup", by: 0 });
      } else if (st.clock - st.lastFeint >= FEINT.cooldown) {
        st.lastFeint = st.clock;
        st.feint = { at: st.clock, by: 0 };
        ev.push({ type: "feint", by: 0 });
        // Each fake in a turn is less convincing than the last.
        const chance = L.flinch * Math.pow(0.7, st.feintsThisTurn++);
        if (rng() < chance) {
          st.pulledAt = st.clock + 0.1;
          freeSlap(0, ev);
        }
      }
      return ev;
    }
    // Defending: PULL
    if (action !== "act") return ev;
    if (st.strike && st.clock < contactAt()) {
      const react = st.clock - st.strike.at;
      st.pulledAt = st.clock;
      ev.push({ type: "dodge", by: 0, reactMs: Math.round(react * 1000) });
      settle(OUTCOME.youDodged, ev, Math.round(react * 1000));
      return ev;
    }
    // Pulled at nothing (a fake, or jumped the gun): free slap.
    st.pulledAt = st.clock;
    freeSlap(1, ev);
    return ev;
  }

  function result() {
    const s = summarizeSlap(st.log);
    return {
      score: s.score,
      log: [...st.log],
      won: s.winner === 0,
      stats: { slaps: s.slaps, slapped: s.points[1], dodges: s.dodges, fastDodges: s.fastDodges, flinches: s.flinches, turns: s.turns },
      summary: s,
    };
  }

  const ev0: SlapEvent[] = [];
  startTurn(ev0);
  return { st, level: L, update, press, result, contactAt, pending: ev0 };
}

export type SlapMatch = ReturnType<typeof createSlapMatch>;
