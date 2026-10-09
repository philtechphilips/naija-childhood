import { describe, expect, it } from "vitest";
import { decodeLog, encodeLog, judge, summarize, throwWinner, type Throw } from "./rules";
import { cpuChooseSide, SidePredictor } from "./ai";
import { createRng } from "@/games/core/rng";

const t = (leader: 0 | 1, s0: "L" | "R" | null, s1: "L" | "R" | null, j0 = "perfect", j1 = "perfect"): Throw => ({
  leader,
  sides: [s0, s1],
  judgements: [j0 as Throw["judgements"][0], j1 as Throw["judgements"][1]],
});

describe("judge", () => {
  it("grades timing windows", () => {
    expect(judge(0)).toBe("perfect");
    expect(judge(-0.07)).toBe("perfect");
    expect(judge(0.1)).toBe("good");
    expect(judge(-0.2)).toBe("ok");
    expect(judge(0.25)).toBe("miss");
    expect(judge(null)).toBe("miss");
  });
});

describe("throwWinner", () => {
  it("leader scores on a match, follower on a mismatch", () => {
    expect(throwWinner(t(0, "L", "L"))).toBe(0);
    expect(throwWinner(t(0, "L", "R"))).toBe(1);
    expect(throwWinner(t(1, "R", "R"))).toBe(1);
    expect(throwWinner(t(1, "R", "L"))).toBe(0);
  });

  it("a foul gives the point away, a double foul scores nobody", () => {
    expect(throwWinner(t(0, null, "L"))).toBe(1);
    expect(throwWinner(t(0, "L", "L", "miss"))).toBe(1);
    expect(throwWinner(t(1, "L", null))).toBe(0);
    expect(throwWinner(t(0, null, null))).toBeNull();
  });
});

describe("summarize", () => {
  it("plays to ten and scores timing, points, streaks and the win", () => {
    const throws: Throw[] = Array.from({ length: 10 }, () => t(0, "L", "L"));
    const s = summarize(throws);
    expect(s.points).toEqual([10, 0]);
    expect(s.winner).toBe(0);
    expect(s.perfects).toBe(10);
    expect(s.longestStreak).toBe(10);
    // 10×30 timing + 10×100 points + streak bonus (0+20+40+60+80+100×5) + 500 win
    expect(s.score).toBe(300 + 1000 + (20 + 40 + 60 + 80 + 100 * 5) + 500);
  });

  it("rejects a log where the leader doesn't follow the winner", () => {
    expect(() => summarize([t(0, "L", "R"), t(0, "L", "L")])).toThrow();
  });

  it("stops counting after the match is decided", () => {
    const throws = Array.from({ length: 12 }, () => t(0, "R", "R"));
    expect(summarize(throws).throws).toBe(10);
  });
});

describe("log encoding", () => {
  it("round-trips", () => {
    const throws = [t(0, "L", "R", "good", "perfect"), t(1, null, "L", "miss", "ok"), t(1, "R", null, "perfect", "miss")];
    expect(decodeLog(encodeLog(throws))).toEqual(throws);
  });
});

describe("CPU", () => {
  it("learns a predictable player", () => {
    const p = new SidePredictor();
    for (let i = 0; i < 12; i++) p.record("L");
    expect(p.probLeft()).toBeGreaterThan(0.85);
    const rng = createRng(1);
    // A hard CPU leading should mostly match "L"; following should mostly dodge to "R".
    const leading = Array.from({ length: 50 }, () => cpuChooseSide(true, p, "hard", rng)).filter((s) => s === "L").length;
    const following = Array.from({ length: 50 }, () => cpuChooseSide(false, p, "hard", rng)).filter((s) => s === "R").length;
    expect(leading).toBeGreaterThan(35);
    expect(following).toBeGreaterThan(35);
  });
});
