import { describe, expect, it } from "vitest";
import { OUTCOME, SCORE, TARGET, summarizeSlap, validateSlap } from "./rules";
import { createSlapMatch, type SlapMatch } from "./match";

const DT = 1 / 60;
const run = (m: SlapMatch, seconds: number, each?: () => void) => {
  for (let i = 0; i < seconds * 60 && m.st.phase !== "end"; i++) {
    each?.();
    m.update(DT);
  }
};

describe("backhand slap", () => {
  it("a player who never presses loses (slapped or timed out every turn)", () => {
    const m = createSlapMatch({ difficulty: "normal", seed: 4 });
    run(m, 300);
    expect(m.st.phase).toBe("end");
    expect(m.st.won).toBe(false);
    expect(m.st.points[1]).toBe(TARGET);
  });

  it("perfect reflexes and slapping straight away beat Easy", () => {
    const m = createSlapMatch({ difficulty: "easy", seed: 7 });
    run(m, 400, () => {
      const { st } = m;
      if (st.phase !== "open") return;
      if (st.attacker === 0 && !st.strike) m.press("act");
      // Pull 180 ms after a real wind-up starts (never at fakes).
      if (st.attacker === 1 && st.strike && st.clock - st.strike.at >= 0.18) m.press("act");
    });
    expect(m.st.phase).toBe("end");
    expect(m.st.won).toBe(true);
    const r = m.result();
    expect(validateSlap(r.log, r.score, m.st.clock)).toBeNull();
    expect(r.stats.dodges + r.stats.slapped).toBeGreaterThan(0);
  });

  it("pulling at a fake gives the CPU a free slap", () => {
    for (let seed = 1; seed < 40; seed++) {
      const m = createSlapMatch({ difficulty: "hard", seed });
      if (m.st.attacker !== 1) continue;
      let flinched = false;
      run(m, 10, () => {
        if (!flinched && m.st.feint && m.st.feint.by === 1) {
          m.press("act");
          flinched = true;
        }
      });
      if (!flinched) continue;
      expect(m.st.log.slice(0, 2)).toEqual([OUTCOME.youFlinched, 0]);
      return;
    }
    throw new Error("no CPU fake seen");
  });

  it("scores and validates honest logs, rejects forged ones", () => {
    const log = [6, 150, 1, 0, 1, 0, 3, 0, 1, 0, 1, 0];
    const s = summarizeSlap(log);
    expect(s.winner).toBe(0);
    expect(s.score).toBe(SCORE.dodge + SCORE.fastDodge + 4 * SCORE.slap + SCORE.freeSlap + SCORE.win);
    expect(validateSlap(log, s.score, 30)).toBeNull();
    expect(validateSlap(log, s.score + 1, 30)).not.toBeNull();
    expect(validateSlap(log, s.score, 2)).not.toBeNull();
    // A dodge while attacking is out of turn.
    expect(validateSlap([1, 0, 6, 120, 1, 0, 1, 0, 1, 0, 1, 0], 0, 30)).not.toBeNull();
    // Not finished.
    expect(validateSlap([1, 0], 100, 30)).not.toBeNull();
  });
});
