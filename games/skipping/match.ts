import type { GameResult } from "@/games/types";
import { AIR, EV, LEVELS, LIVES, PEPPER_EVERY, PEPPER_TURNS, judgePass, replay, turnTime, type Difficulty, type PassJudgement } from "./rules";

export type SkipEvent =
  | { type: "pass"; judgement: PassJudgement; pepper: boolean; count: number }
  | { type: "jump" }
  | { type: "pepper" }
  | { type: "pepperEnd" }
  | { type: "go" }
  | { type: "finish"; result: Omit<GameResult, "options"> };

/**
 * Skipping-rope state machine. The rope angle is 0 when it passes under your
 * feet and π when it's overhead; it turns towards you over the top.
 */
export function createSkipMatch(opts: { difficulty: string; seed: number; mode: string }) {
  const level: Difficulty = opts.difficulty === "normal" || opts.difficulty === "hard" ? opts.difficulty : "easy";
  const L = LEVELS[level];
  const log: number[] = [];
  const st = {
    phase: "intro" as "intro" | "turn" | "trip" | "end",
    clock: 0,
    phaseAt: 0,
    turnDur: L.start,
    nextPass: L.start * 1.5,
    jumpAt: -10,
    lives: LIVES,
    pepperLeft: 0,
    totals: replay([]),
    lastJudgement: null as PassJudgement | null,
  };
  let ended = false;

  const airborne = () => st.clock - st.jumpAt < AIR;

  function restart() {
    st.phase = "intro";
    st.phaseAt = st.clock;
    st.pepperLeft = 0;
    st.turnDur = turnTime(level, st.totals.jumps);
    st.nextPass = st.clock + st.turnDur * 1.5;
  }

  function result(): Omit<GameResult, "options"> {
    const t = st.totals;
    return {
      game: "skipping",
      mode: opts.mode,
      score: t.score,
      won: null,
      durationMs: Math.round(st.clock * 1000),
      headline: t.jumps === 0 ? "The rope caught you!" : `${t.jumps} jump${t.jumps === 1 ? "" : "s"}!`,
      detail: `Best streak ${t.bestCombo} · ${t.perfects} perfect · ${t.peppers} pepper jumps`,
      stats: { jumps: t.jumps, bestCombo: t.bestCombo, perfects: t.perfects, peppers: t.peppers },
      seed: opts.seed,
      log: [...log],
    };
  }

  return {
    st,
    level,
    /** Rope angle in radians: 0 = under your feet. */
    ropeAngle() {
      if (st.phase === "trip" || st.phase === "end") return 0.25;
      const p = 1 - (st.nextPass - st.clock) / st.turnDur;
      return Math.PI * 2 * Math.max(0, p);
    },
    /** Jumper's height off the ground (m). */
    jumpHeight() {
      const u = (st.clock - st.jumpAt) / AIR;
      return u >= 0 && u <= 1 ? 4 * 0.42 * u * (1 - u) : 0;
    },
    press(): SkipEvent[] {
      if ((st.phase !== "turn" && st.phase !== "intro") || airborne()) return [];
      st.jumpAt = st.clock;
      return [{ type: "jump" }];
    },
    update(dt: number): SkipEvent[] {
      const ev: SkipEvent[] = [];
      st.clock += dt;
      if (st.phase === "intro" && st.clock - st.phaseAt > 0.6) {
        st.phase = "turn";
        ev.push({ type: "go" });
      }
      if ((st.phase === "turn" || st.phase === "intro") && st.clock >= st.nextPass) {
        const pepper = st.pepperLeft > 0;
        // Were you in the air when the rope came round? Judge against the top of your jump.
        const inAir = st.nextPass - st.jumpAt >= 0 && st.nextPass - st.jumpAt <= AIR;
        const j = judgePass(inAir ? st.nextPass - (st.jumpAt + AIR / 2) : null, L.window);
        log.push(pepper ? (j === "perfect" ? EV.pepperPerfect : j === "good" ? EV.pepperGood : EV.pepperTrip) : j === "perfect" ? EV.perfect : j === "good" ? EV.good : EV.trip);
        st.totals = replay(log);
        st.lastJudgement = j;
        ev.push({ type: "pass", judgement: j, pepper, count: st.totals.jumps });
        if (j === "trip") {
          st.lives--;
          st.phase = st.lives <= 0 ? "end" : "trip";
          st.phaseAt = st.clock;
          st.pepperLeft = 0;
          return ev;
        }
        if (pepper) {
          st.pepperLeft--;
          if (st.pepperLeft === 0) ev.push({ type: "pepperEnd" });
        } else if (st.totals.jumps % PEPPER_EVERY === PEPPER_EVERY - 1) {
          // The turners shout "PEPPER!" and the next few turns are fast.
          st.pepperLeft = PEPPER_TURNS;
          ev.push({ type: "pepper" });
        }
        st.turnDur = st.pepperLeft > 0 ? L.pepper : turnTime(level, st.totals.jumps);
        st.nextPass += st.turnDur;
      }
      if (st.phase === "trip" && st.clock - st.phaseAt > 1.6) restart();
      if (st.phase === "end" && !ended && st.clock - st.phaseAt > 1.8) {
        ended = true;
        ev.push({ type: "finish", result: result() });
      }
      return ev;
    },
  };
}

export type SkipMatch = ReturnType<typeof createSkipMatch>;
