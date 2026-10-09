import { describe, expect, it } from "vitest";
import { OBSTACLES, createTrack, encodeRun, laneX, scoreRun, validateRun } from "./run-rules";
import { createRun, type Run } from "./run-sim";

/** A look-ahead bot: changes lane around vehicles, jumps low stuff, slides under poles. */
function botStep(run: Run) {
  const s = run.state;
  const look = s.speed * 0.9 + 8;
  const ahead = run.track.obstacles.filter((o) => o.z + OBSTACLES[o.kind].len > s.dist - 0.5 && o.z < s.dist + look + 12);
  // Distance to the next vehicle in a lane (Infinity if clear).
  const nextBlock = (lane: number) =>
    Math.min(
      Infinity,
      ...ahead
        .filter((o) => (OBSTACLES[o.kind].clear === "block" || OBSTACLES[o.kind].clear === "bump") && Math.abs((o.x ?? laneX(o.lane)) - laneX(lane)) < OBSTACLES[o.kind].halfW + 0.3)
        .map((o) => o.z - s.dist),
    );
  const here = nextBlock(s.lane);
  if (s.laneT >= 1 && here < look) {
    const best = [s.lane - 1, s.lane + 1].filter((l) => l >= 0 && l <= 2).sort((p, q) => nextBlock(q) - nextBlock(p))[0]!;
    if (nextBlock(best) > here) run.press(best < s.lane ? "left" : "right");
  }
  const reach = s.speed * 0.22 + 0.8;
  for (const o of ahead) {
    const spec = OBSTACLES[o.kind];
    const inLane = spec.wide || Math.abs((o.x ?? laneX(o.lane)) - s.x) < spec.halfW + 0.3;
    if (!inLane || o.z - s.dist > reach || o.z - s.dist < 0) continue;
    if ((spec.clear === "jump" || spec.clear === "hole") && s.grounded) run.press("jump");
    if (spec.clear === "slide" && s.slide <= 0.1) run.press("slide");
  }
}

describe("street run", () => {
  it("generates the same street for the same seed", () => {
    const a = createTrack(42);
    const b = createTrack(42);
    a.fill(2000);
    b.fill(2000);
    expect(a.obstacles.map((o) => [o.kind, o.lane, o.z])).toEqual(b.obstacles.map((o) => [o.kind, o.lane, o.z]));
  });

  it("never blocks all three lanes with vehicles at once", () => {
    for (let seed = 1; seed < 40; seed++) {
      const t = createTrack(seed);
      t.fill(4000);
      const blocks = t.obstacles.filter((o) => OBSTACLES[o.kind].clear === "block" && o.speed === 0);
      for (const o of blocks) {
        const lanes = new Set(blocks.filter((p) => p.z < o.z + OBSTACLES[o.kind].len && p.z + OBSTACLES[p.kind].len > o.z).map((p) => p.lane));
        expect(lanes.size).toBeLessThan(3);
      }
    }
  });

  it("can be survived by a careful runner", () => {
    let total = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const run = createRun(seed);
      for (let i = 0; i < 60 * 150 && run.state.phase !== "over" && run.state.phase !== "caught"; i++) {
        botStep(run);
        run.update(1 / 60);
      }
      total += run.state.dist;
    }
    // Average well over a kilometre across seeds: the street is passable.
    expect(total / 12).toBeGreaterThan(1200);
  });

  it("police catch you on the second stumble while they're close", () => {
    const run = createRun(3);
    for (let i = 0; i < 120; i++) run.update(1 / 60);
    const s = run.state;
    s.chase = 0;
    const kinds = ["barrier", "barrier"] as const;
    kinds.forEach((kind, i) => {
      run.track.obstacles.unshift({ id: 900 + i, kind, lane: s.lane, z: s.dist + 0.1, speed: 0, seed: 0 });
      run.update(1 / 60);
    });
    expect(s.stumbles).toBe(1);
    expect(s.phase).toBe("caught");
  });

  it("validates honest runs and rejects tampered ones", () => {
    const stats = { distance: 812.4, coins: 37, stumbles: 1, seconds: 58 };
    const log = encodeRun(stats);
    const score = scoreRun(stats);
    expect(validateRun(log, score, 62)).toBeNull();
    expect(validateRun(log, score + 50, 62)).not.toBeNull();
    expect(validateRun([5000, 10, 0, 100], scoreRun({ distance: 5000, coins: 10 }), 12)).not.toBeNull();
    expect(validateRun([400, 900, 0, 300], scoreRun({ distance: 400, coins: 900 }), 32)).not.toBeNull();
  });
});
