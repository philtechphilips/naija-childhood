import { describe, expect, it } from "vitest";
import { canCatch, outcome, scoreMatch } from "./rules";
import { MAP, NavGrid, resolveCollisions, SIM_MAP } from "./map";

describe("catching and outcome", () => {
  it("only catches free, non-immune thieves within reach", () => {
    const cop = { x: 0, y: 0 };
    expect(canCatch(cop, { x: 20, y: 0, jailed: false, immuneFor: 0 })).toBe(true);
    expect(canCatch(cop, { x: 40, y: 0, jailed: false, immuneFor: 0 })).toBe(false);
    expect(canCatch(cop, { x: 10, y: 0, jailed: true, immuneFor: 0 })).toBe(false);
    expect(canCatch(cop, { x: 10, y: 0, jailed: false, immuneFor: 1 })).toBe(false);
  });

  it("police win when everyone is jailed, thieves when time runs out", () => {
    expect(outcome([{ jailed: true, immuneFor: 0 }, { jailed: true, immuneFor: 0 }], 30)).toBe("police");
    expect(outcome([{ jailed: true, immuneFor: 0 }, { jailed: false, immuneFor: 0 }], 0)).toBe("thief");
    expect(outcome([{ jailed: false, immuneFor: 0 }], 12)).toBeNull();
  });

  it("scores each role", () => {
    expect(scoreMatch({ role: "thief", won: true, freeSeconds: 60, rescues: 2, catches: 0, pickups: 1, timeLeft: 0 })).toBe(600 + 600 + 25 + 800);
    expect(scoreMatch({ role: "police", won: true, freeSeconds: 0, rescues: 0, catches: 5, pickups: 0, timeLeft: 20 })).toBe(1250 + 800 + 400);
  });
});

describe("map navigation", () => {
  const nav = new NavGrid(SIM_MAP);

  it("keeps spawns walkable", () => {
    for (const p of [...MAP.thiefSpawns, ...MAP.policeSpawns]) expect(nav.isBlockedAt(p.x, p.y)).toBe(false);
  });

  it("finds a path around a building", () => {
    const path = nav.findPath(150, 300, 600, 60);
    expect(path.length).toBeGreaterThan(5);
    for (const p of path.slice(0, -1)) expect(nav.isBlockedAt(p.x, p.y)).toBe(false);
  });

  it("pushes actors out of solid shapes", () => {
    const b = MAP.buildings[0]!;
    const p = { x: b.x + 5, y: b.y + b.h / 2 };
    resolveCollisions(SIM_MAP, p, 14);
    expect(p.x).toBeLessThanOrEqual(b.x - 14 + 0.001);
  });
});
