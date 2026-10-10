import { describe, expect, it } from "vitest";
import { BASE, SPOTS, canSee, collide, dist, walkToward, encodeHide, encodeSeek, scoreHide, scoreSeek, validateHideSeek } from "./rules";
import { createHideSeek, type HideSeekEvent } from "./sim";

const still = { move: { x: 0, z: 0 }, run: false };
const towards = (from: { x: number; z: number }, to: { x: number; z: number }, run = true) => {
  const d = dist(from, to);
  return d < 0.05 ? still : { move: { x: (to.x - from.x) / d, z: (to.z - from.z) / d }, run };
};

describe("hide & seek rules", () => {
  it("keeps people in the yard and out of the car", () => {
    const p = collide({ x: -3.1, z: -5.2 });
    expect(dist(p, { x: -3.2, z: -5.3 })).toBeGreaterThan(1.2);
    expect(collide({ x: 99, z: 0 }).x).toBeLessThan(6.1);
  });

  it("walking into the car sidesteps round it instead of stalling", () => {
    let p = { x: -3.2, z: -2.6 };
    const to = { x: -4.75, z: -5.3 };
    const memo = { side: 0 };
    for (let i = 0; i < 400 && dist(p, to) > 0.2; i++) p = walkToward(p, to, 0.05, memo);
    expect(dist(p, to)).toBeLessThan(0.3);
  });

  it("every hiding spot is clear and reachable from the gate", () => {
    for (const spot of SPOTS) {
      expect(dist(collide(spot), spot), spot.id).toBeLessThan(0.05);
      let p = { x: 0, z: -5.5 };
      const memo = { side: 0 };
      for (let i = 0; i < 2000 && dist(p, spot) > 0.1; i++) p = walkToward(p, spot, 0.05, memo);
      expect(dist(p, spot), spot.id).toBeLessThan(0.3);
      for (const other of SPOTS) if (other !== spot) expect(dist(other, spot), `${spot.id}/${other.id}`).toBeGreaterThan(2 * 0.85 - 0.3);
    }
  });

  it("walkers get from anywhere to any spot without getting stuck", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 300; n++) {
      let p = collide({ x: -6 + rnd() * 12, z: -7.5 + rnd() * 17 });
      const spot = SPOTS[Math.floor(rnd() * SPOTS.length)]!;
      const memo = { side: 0 };
      for (let i = 0; i < 60 * 20 && dist(p, spot) > 0.1; i++) p = walkToward(p, spot, 2.4 / 60, memo);
      expect(dist(p, spot), `${n} -> ${spot.id}`).toBeLessThan(0.3);
    }
  });

  it("solid things block the seeker's view", () => {
    // Looking from the gate straight at someone hiding behind the car.
    expect(canSee({ x: -3.2, z: -7.8 }, 0, { x: -3.2, z: -2.4 }, "hard")).toBe(false);
    expect(canSee({ x: 0, z: -7 }, 0, { x: 0, z: -2 }, "hard")).toBe(true);
    // Behind the seeker's back: not seen.
    expect(canSee({ x: 0, z: 0 }, 0, { x: 0, z: -3 }, "hard")).toBe(false);
  });
});

describe("hide mode", () => {
  it("standing in the open gets you spotted and caught", () => {
    const m = createHideSeek({ mode: "hide", difficulty: "normal", seed: 3 });
    const ev: HideSeekEvent[] = [];
    for (let i = 0; i < 60 * 120 && m.st.phase !== "end"; i++) ev.push(...m.update(1 / 60, still));
    expect(ev.some((e) => e.type === "spotted" && e.kid.human)).toBe(true);
    expect(m.me.state).toBe("caught");
    expect(m.result().won).toBe(false);
  });

  it("hiding well, the game always ends (found and raced, or time up)", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const m = createHideSeek({ mode: "hide", difficulty: "easy", seed });
      const spot = SPOTS.find((s) => s.id === "doorL")!;
      for (let i = 0; i < 60 * 200 && m.st.phase !== "end"; i++) {
        if (m.me.state === "free" && m.st.phase === "count") {
          if (dist(m.me.pos, spot) > 0.3) m.update(1 / 60, towards(m.me.pos, spot));
          else {
            m.press("hide");
            m.update(1 / 60, still);
          }
        } else m.update(1 / 60, still);
      }
      expect(m.st.phase).toBe("end");
    }
  });

  it("touching base while the seeker is away is home free", () => {
    const m = createHideSeek({ mode: "hide", difficulty: "easy", seed: 5 });
    for (let i = 0; i < 60 * 30 && m.st.phase === "count"; i++) m.update(1 / 60, still);
    m.seeker.pos = { x: 4.5, z: 7.5 };
    m.seeker.heading = 0; // facing the back wall
    m.st.ai.mode = "check";
    m.st.ai.checkUntil = Infinity;
    for (let i = 0; i < 60 * 10 && m.st.phase !== "end"; i++) m.update(1 / 60, towards(m.me.pos, BASE));
    expect(m.me.state).toBe("home");
    expect(m.result().score).toBeGreaterThanOrEqual(800);
  });
});

describe("seek mode", () => {
  it("checking every spot accounts for every hider", () => {
    const m = createHideSeek({ mode: "seek", difficulty: "normal", seed: 9 });
    const route = [...SPOTS];
    for (let i = 0; i < 60 * 120 && m.st.phase !== "end"; i++) {
      const target = route[0];
      if (!target) {
        m.update(1 / 60, still);
        continue;
      }
      if (dist(m.me.pos, target) > 1.1) m.update(1 / 60, towards(m.me.pos, target));
      else {
        m.press("look");
        route.shift();
        m.update(1 / 60, still);
      }
      // Chase anyone running for base.
      const runner = m.hiders.find((h) => h.state === "bolting");
      if (runner) m.update(1 / 60, towards(m.me.pos, runner.pos));
    }
    const s = m.stats() as { found: number; escaped: number; total: number };
    expect(s.found + s.escaped).toBe(s.total);
    expect(s.found).toBeGreaterThan(0);
  });
});

describe("validation", () => {
  it("accepts honest logs and rejects tampered ones", () => {
    const h = { hiddenSeconds: 42.3, homeFree: true, caught: false, closeCalls: 2 };
    expect(validateHideSeek(encodeHide(h), scoreHide(h), 60)).toBeNull();
    expect(validateHideSeek(encodeHide(h), scoreHide(h) + 100, 60)).not.toBeNull();
    expect(validateHideSeek(encodeHide({ ...h, caught: true }), scoreHide({ ...h, caught: true }), 60)).not.toBeNull();
    const s = { found: 3, total: 3, escaped: 0, timeLeft: 31.4 };
    expect(validateHideSeek(encodeSeek(s), scoreSeek(s), 70)).toBeNull();
    expect(validateHideSeek(encodeSeek({ ...s, found: 5 }), scoreSeek({ ...s, found: 5 }), 70)).not.toBeNull();
  });
});
