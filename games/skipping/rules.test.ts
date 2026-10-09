import { describe, expect, it } from "vitest";
import { AIR, EV, judgePass, LEVELS, replay, validateSkipping } from "./rules";
import { createSkipMatch } from "./match";

/** Jumps so the rope passes `offset` seconds after the top of each jump. */
function play(difficulty: string, offset: number, seconds = 60) {
  const m = createSkipMatch({ difficulty, seed: 1, mode: "classic" });
  let jumped = -1;
  for (let i = 0; i < seconds * 60 && m.st.phase !== "end"; i++) {
    const pressAt = m.st.nextPass - AIR / 2 - offset;
    if (m.st.clock >= pressAt && jumped !== m.st.nextPass) {
      m.press();
      jumped = m.st.nextPass;
    }
    m.update(1 / 60);
  }
  return m;
}

describe("skipping rope", () => {
  it("judges a pass by how close to the top of the jump it comes", () => {
    expect(judgePass(0.01, 1)).toBe("perfect");
    expect(judgePass(0.12, 1)).toBe("good");
    expect(judgePass(0.3, 1)).toBe("trip");
    expect(judgePass(null, 1)).toBe("trip");
    expect(judgePass(0.17, LEVELS.easy.window)).toBe("good");
  });

  it("a well-timed jumper keeps going through pepper rounds", () => {
    const m = play("normal", 0, 40);
    expect(m.st.lives).toBe(3);
    expect(m.st.totals.jumps).toBeGreaterThan(30);
    expect(m.st.totals.peppers).toBeGreaterThan(0);
  });

  it("standing still trips you three times and ends the game", () => {
    const m = createSkipMatch({ difficulty: "easy", seed: 1, mode: "classic" });
    for (let i = 0; i < 60 * 30 && m.st.phase !== "end"; i++) m.update(1 / 60);
    expect(m.st.phase).toBe("end");
    expect(m.st.totals.trips).toBe(3);
  });

  it("replays and validates the log", () => {
    const log = [EV.perfect, EV.good, EV.good, EV.pepperPerfect, EV.trip];
    const t = replay(log);
    expect(t.jumps).toBe(4);
    expect(validateSkipping(log, t.score, 10)).toBeNull();
    expect(validateSkipping(log, t.score + 5, 10)).not.toBeNull();
    expect(validateSkipping(log, t.score, 1)).not.toBeNull();
  });
});
