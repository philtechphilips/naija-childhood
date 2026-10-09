import { describe, expect, it } from "vitest";
import { CLASSIC, comboMultiplier, EV, generateBoard, hopPlan, judgeHop, judgeThrow, makeBoard, replay, SUWE_LEVELS } from "./rules";
import { createSuweMatch } from "./match";
import { createRng } from "@/games/core/rng";

describe("boards", () => {
  it("numbers boxes left-to-right, bottom-to-top", () => {
    const b = makeBoard(CLASSIC);
    expect(b.boxes.map((x) => x.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(b.boxes.find((x) => x.index === 5)).toMatchObject({ row: 3, col: 1, cols: 2 });
  });

  it("generates deterministic boards from a seed", () => {
    const a = generateBoard(createRng(42), 3);
    const b = generateBoard(createRng(42), 3);
    expect(a).toEqual(b);
    expect(a.rows[0]).toBe(1);
    expect(a.rows.length).toBeGreaterThanOrEqual(6);
  });
});

describe("hopPlan", () => {
  const board = makeBoard(CLASSIC);

  it("skips the stone box on the way up and picks it up on the way back", () => {
    const plan = hopPlan(board, 2);
    const up = plan.slice(0, plan.findIndex((s) => s.home));
    expect(up.some((s) => s.boxes.includes(2))).toBe(false);
    const pick = plan.find((s) => s.pick);
    expect(pick).toMatchObject({ boxes: [2], foot: "hop" });
    expect(plan[plan.length - 1]?.exit).toBe(true);
  });

  it("splits on side-by-side boxes, hops into the free one when the stone is there", () => {
    const clear = hopPlan(board, 1);
    expect(clear.find((s) => s.row === 3)).toMatchObject({ foot: "split", boxes: [4, 5] });
    const withStone = hopPlan(board, 4);
    expect(withStone.find((s) => s.row === 3)).toMatchObject({ foot: "hop", boxes: [5] });
  });
});

describe("judging", () => {
  it("requires the right foot and timing", () => {
    expect(judgeHop(0.02, "hop", "hop")).toBe("perfect");
    expect(judgeHop(0.12, "split", "split")).toBe("good");
    expect(judgeHop(0.0, "hop", "split")).toBe("miss");
    expect(judgeHop(0.3, "hop", "hop")).toBe("miss");
    expect(judgeHop(null, null, "hop")).toBe("miss");
  });

  it("rewards a throw in the middle of the box window", () => {
    expect(judgeThrow(true, 0.5)).toBe("perfect");
    expect(judgeThrow(true, 0.05)).toBe("good");
    expect(judgeThrow(false, 0.5)).toBe("miss");
  });
});

describe("replay", () => {
  it("applies combo multipliers and resets them on a miss", () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(6)).toBe(1.5);
    expect(comboMultiplier(100)).toBe(3);
    const log = [EV.throwPerfect, ...Array(6).fill(EV.hopPerfect), EV.boxCleared, EV.hopMiss, EV.hopGood];
    const r = replay(log);
    // throw 150; hops 50×5 + 50×1.5; box 200; miss; good 25
    expect(r.score).toBe(150 + 250 + 75 + 200 + 25);
    expect(r.livesLost).toBe(1);
    expect(r.bestCombo).toBe(6);
    expect(r.combo).toBe(1);
  });

  it("rejects unknown events", () => {
    expect(() => replay([99])).toThrow();
  });
});

describe("suwe difficulty", () => {
  it("Easy never misses on timing, only on the wrong foot", () => {
    expect(judgeHop(0.9, "hop", "hop", SUWE_LEVELS.easy.window, true)).toBe("good");
    expect(judgeHop(-0.5, "split", "split", SUWE_LEVELS.easy.window, true)).toBe("good");
    expect(judgeHop(0.02, "hop", "hop", SUWE_LEVELS.easy.window, true)).toBe("perfect");
    expect(judgeHop(0.02, "split", "hop", SUWE_LEVELS.easy.window, true)).toBe("miss");
  });

  it("Normal is more forgiving than Hard", () => {
    expect(judgeHop(0.2, "hop", "hop", SUWE_LEVELS.hard.window)).toBe("miss");
    expect(judgeHop(0.2, "hop", "hop", SUWE_LEVELS.normal.window)).toBe("good");
  });

  it("on Easy the beat waits: standing still never costs a life", () => {
    const m = createSuweMatch({ mode: "classic", seed: 7, difficulty: "easy" });
    // Throw straight into box 1 when the sweep is over it.
    for (let i = 0; i < 600 && m.st.phase !== "throw"; i++) m.update(1 / 60);
    for (let i = 0; i < 600 && !(m.st.sweep > 0.3 && m.st.sweep < 0.7); i++) m.update(1 / 60);
    m.press("hop");
    for (let i = 0; i < 60 * 10; i++) m.update(1 / 60);
    expect(m.st.phase).toBe("hop");
    expect(m.st.lives).toBe(3);
  });
});
