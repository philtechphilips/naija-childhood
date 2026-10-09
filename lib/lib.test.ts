import { describe, expect, it } from "vitest";
import type { GameResult } from "@/games/types";
import { validateResult } from "./validation";
import { levelInfo, xpForLevel } from "./progression";
import { isValidName, sanitizeName } from "./names";
import { dailyChallenge, meetsChallenge, shiftDay } from "./daily";
import { encodeLog, summarize, type Throw } from "@/games/ten-ten/rules";
import { EV, replay } from "@/games/suwe/rules";
import { encodeStats, scoreMatch } from "@/games/police-thief/rules";

const base = (over: Partial<GameResult>): GameResult => ({
  game: "ten-ten",
  mode: "cpu",
  options: {},
  score: 0,
  won: true,
  durationMs: 60_000,
  headline: "",
  detail: "",
  stats: {},
  seed: 1,
  log: [],
  ...over,
});

describe("validateResult", () => {
  const throws: Throw[] = Array.from({ length: 10 }, () => ({ leader: 0, sides: ["L", "L"], judgements: ["good", "good"] }));
  const tenTen = base({ score: summarize(throws).score, log: encodeLog(throws), durationMs: 30_000 });

  it("accepts a genuine Ten-Ten match", () => {
    expect(validateResult(tenTen)).toEqual({ ok: true });
  });

  it("rejects a tampered Ten-Ten score", () => {
    expect(validateResult({ ...tenTen, score: tenTen.score + 1000 }).ok).toBe(false);
  });

  it("rejects an impossibly fast match", () => {
    expect(validateResult({ ...tenTen, durationMs: 3000 }).ok).toBe(false);
  });

  it("checks Suwe and Police & Thief logs", () => {
    const log = [EV.throwGood, EV.hopGood, EV.hopGood, EV.boxCleared];
    const suwe = base({ game: "suwe", mode: "classic", won: null, log, score: replay(log).score, durationMs: 5000 });
    expect(validateResult(suwe).ok).toBe(true);
    expect(validateResult({ ...suwe, score: 99999 }).ok).toBe(false);

    const stats = { role: "thief" as const, won: true, freeSeconds: 80, rescues: 1, catches: 0, pickups: 2, timeLeft: 0 };
    const pt = base({ game: "police-thief", mode: "classic", log: encodeStats(stats), score: scoreMatch(stats), durationMs: 93_000 });
    expect(validateResult(pt).ok).toBe(true);
    expect(validateResult({ ...pt, score: pt.score + 500 }).ok).toBe(false);
  });

  it("accepts Police & Thief times that sit on a rounding boundary", () => {
    const tenths = (v: number) => Math.round(v * 10) / 10;
    const stats = { role: "police" as const, won: true, freeSeconds: 0, rescues: 0, catches: 0, pickups: 1, timeLeft: tenths(38.46) };
    const pt = base({ game: "police-thief", mode: "classic", log: encodeStats(stats), score: scoreMatch(stats), durationMs: 57_000 });
    expect(validateResult(pt)).toEqual({ ok: true });
  });

  it("rejects negative or fractional scores", () => {
    expect(validateResult(base({ score: -5 })).ok).toBe(false);
    expect(validateResult(base({ score: 1.5 })).ok).toBe(false);
  });
});

describe("progression", () => {
  it("levels up on the XP curve", () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(xpForLevel(2)).level).toBe(2);
    expect(levelInfo(xpForLevel(5) - 1).level).toBe(4);
    const mid = levelInfo(xpForLevel(3) + 10);
    expect(mid.into).toBe(10);
    expect(mid.progress).toBeGreaterThan(0);
  });
});

describe("names", () => {
  it("sanitizes public display names", () => {
    expect(sanitizeName("  Ada   <script>  ")).toBe("Ada script");
    expect(sanitizeName("a".repeat(40))).toHaveLength(18);
    expect(isValidName("Dickson")).toBe(true);
    expect(isValidName("x")).toBe(false);
    expect(isValidName("big shit")).toBe(false);
  });
});

describe("daily challenge", () => {
  it("is deterministic and rotates games", () => {
    expect(dailyChallenge("2026-10-08")).toEqual(dailyChallenge("2026-10-08"));
    const games = new Set([0, 1, 2].map((i) => dailyChallenge(shiftDay("2026-10-08", i)).game));
    expect(games.size).toBe(3);
  });

  it("matches qualifying results only", () => {
    let key = "2026-10-08";
    while (dailyChallenge(key).game !== "suwe") key = shiftDay(key, 1);
    const c = dailyChallenge(key);
    expect(meetsChallenge(c, base({ game: "suwe", mode: "daily", score: c.target }))).toBe(true);
    expect(meetsChallenge(c, base({ game: "suwe", mode: "classic", score: c.target }))).toBe(false);
    expect(meetsChallenge(c, base({ game: "suwe", mode: "daily", score: c.target - 1 }))).toBe(false);
  });

  it("handles month boundaries", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});
