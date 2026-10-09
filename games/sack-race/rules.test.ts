import { describe, expect, it } from "vitest";
import { HOP, LEVELS, MAX_SPEED, HURDLE_HALF, OBSTACLE_HURDLES, RACE_M, createRace, encodeRace, hurdleAhead, judgeLaunch, makeCourse, scoreRace, validateRace, type RaceEvent } from "./rules";

/** Presses HOP for the player exactly `offset` seconds after each landing. */
function runRace(
  difficulty: "easy" | "normal" | "hard",
  offset: number | ((i: number) => number),
  seed = 4,
  opts: { course?: "race" | "obstacles"; leap?: boolean; events?: RaceEvent[] } = {},
) {
  const race = createRace({ difficulty, seed, player: 1, course: opts.course });
  const log = opts.events ?? [];
  let nextPress = 0;
  let presses = 0;
  for (let i = 0; i < 60 * 90 && !race.over(); i++) {
    const me = race.racers[1]!;
    if (race.clock >= nextPress && me.state !== "done") {
      // Leap when a hurdle is in reach, like a player watching the purple ring.
      const from = me.state === "air" ? me.toX : me.x;
      const leap = !!opts.leap && hurdleAhead(race.course, me, from) !== null;
      log.push(...race.press(1, leap));
      presses++;
      const next = me.queued ? (me.queued.leap ? HOP.leap.air : HOP.air) : 0;
      const landAt = me.state === "air" ? me.t0 + me.air + (me.t0 === race.clock ? 0 : next) : race.clock + HOP.air;
      nextPress = landAt + (typeof offset === "number" ? offset : offset(presses));
    }
    log.push(...race.step(1 / 60));
  }
  return race;
}

describe("sack race", () => {
  it("judges hops by how close to the landing you press", () => {
    expect(judgeLaunch(0.02, 1)).toBe("perfect");
    expect(judgeLaunch(-0.12, 1)).toBe("good");
    expect(judgeLaunch(-0.3, 1)).toBe("wobble");
    expect(judgeLaunch(0.3, 1)).toBe("late");
    expect(judgeLaunch(0.2, LEVELS.easy.window)).toBe("good");
  });

  it("a well-timed racer finishes quickly and usually wins", () => {
    const race = runRace("normal", 0);
    const me = race.racers[1]!;
    expect(me.state).toBe("done");
    expect(me.finishTime!).toBeLessThan(11);
    expect(race.placeOf(1)).toBe(1);
  });

  it("mashing too early makes you fall on Normal but not on Easy", () => {
    expect(runRace("normal", -0.32).racers[1]!.falls).toBeGreaterThan(0);
    expect(runRace("easy", -0.32).racers[1]!.falls).toBe(0);
  });

  it("can't beat the physics", () => {
    const fastest = RACE_M / MAX_SPEED;
    const race = runRace("hard", 0);
    expect(race.racers[1]!.finishTime!).toBeGreaterThanOrEqual(fastest - 0.05);
  });

  it("validates honest races and rejects tampered ones", () => {
    const s = { place: 2, time: 12.34, perfects: 9, falls: 0, hops: 24 };
    const score = scoreRace(s);
    expect(validateRace(encodeRace(s), score, 20)).toBeNull();
    expect(validateRace(encodeRace(s), score + 100, 20)).not.toBeNull();
    expect(validateRace(encodeRace({ ...s, time: 3 }), scoreRace({ ...s, time: 3 }), 20)).not.toBeNull();
    // Logs from before the obstacle course (5 numbers) still validate.
    expect(validateRace(encodeRace(s).slice(0, 5), score, 20)).toBeNull();
    // Hurdles only exist on the obstacle course.
    expect(validateRace(encodeRace({ ...s, cleared: 2 }), scoreRace({ ...s, cleared: 2 }), 20)).not.toBeNull();
    const o = { ...s, time: 14.2, course: "obstacles" as const, cleared: 4, bestStreak: 6 };
    expect(validateRace(encodeRace(o), scoreRace(o), 20)).toBeNull();
    expect(validateRace(encodeRace({ ...o, cleared: 9 }), scoreRace({ ...o, cleared: 9 }), 20)).not.toBeNull();
    expect(validateRace(encodeRace({ ...o, bestStreak: 12 }), scoreRace(o), 20)).not.toBeNull();
  });

  it("perfect streaks give GINGER and a faster race", () => {
    const ev: RaceEvent[] = [];
    const race = runRace("hard", 0, 4, { events: ev });
    const me = race.racers[1]!;
    expect(ev.some((e) => e.type === "ginger" && e.lane === 1)).toBe(true);
    expect(me.bestStreak).toBeGreaterThanOrEqual(HOP.gingerStreak);
    // Faster than the old cap allowed (30 m at 1.35 momentum ≈ 8.6 s).
    expect(me.finishTime!).toBeLessThan((RACE_M * HOP.air) / (HOP.base * HOP.mult.perfect * HOP.momentumMax));
  });

  it("going on the whistle is a rocket start; pressing early is a false start", () => {
    const race = createRace({ difficulty: "normal", seed: 1, player: 1 });
    while (race.clock < 0) race.step(1 / 60);
    expect(race.press(1).some((e) => e.type === "rocket")).toBe(true);

    const early = createRace({ difficulty: "normal", seed: 1, player: 1 });
    while (early.clock < -0.5) early.step(1 / 60);
    expect(early.press(1).some((e) => e.type === "falsestart")).toBe(true);
    while (early.clock < 0.1) early.step(1 / 60);
    expect(early.press(1)).toEqual([]); // still waiting
    while (early.clock < HOP.falseStartWait) early.step(1 / 60);
    expect(early.press(1).some((e) => e.type === "hop")).toBe(true);
  });

  it("a perfect leap always clears whatever the LEAP cue warns about", () => {
    const course = makeCourse("obstacles", 3);
    const r = createRace({ difficulty: "normal", seed: 3, player: 1, course: "obstacles" }).racers[1]!;
    r.momentum = HOP.gingerMax;
    const h = course.hurdles[0]!;
    for (let from = h - 3; from < h; from += 0.01) {
      if (hurdleAhead(course, r, from) === null) continue;
      expect(from + HOP.leap.base * HOP.mult.perfect).toBeGreaterThanOrEqual(h + HURDLE_HALF);
    }
  });

  it("builds the same obstacle course from the same seed", () => {
    const a = makeCourse("obstacles", 99);
    expect(makeCourse("obstacles", 99)).toEqual(a);
    expect(a.hurdles).toHaveLength(OBSTACLE_HURDLES);
    for (const [m0, m1] of a.mud) for (const h of a.hurdles) expect(h < m0 - 1 || h > m1 + 1).toBe(true);
    expect(a.mud.at(-1)![1]).toBeLessThan(a.length);
  });

  it("leaping clears hurdles; hopping into them knocks them down", () => {
    const clean = runRace("normal", 0, 7, { course: "obstacles", leap: true });
    expect(clean.racers[1]!.state).toBe("done");
    expect(clean.racers[1]!.cleared).toBe(OBSTACLE_HURDLES);

    const ev: RaceEvent[] = [];
    const clumsy = runRace("normal", 0, 7, { course: "obstacles", leap: false, events: ev });
    const me = clumsy.racers[1]!;
    expect(me.state).toBe("done");
    expect(me.cleared).toBe(0);
    expect(ev.filter((e) => e.type === "trip" && e.lane === 1)).toHaveLength(OBSTACLE_HURDLES);
    expect(me.finishTime!).toBeGreaterThan(clean.racers[1]!.finishTime! + 3);
  });

  it("mud bogs you down", () => {
    const ev: RaceEvent[] = [];
    runRace("normal", 0, 7, { course: "obstacles", leap: true, events: ev });
    const splashed = ev.some((e) => e.type === "splash" && e.lane === 1);
    const landedInMud = ev.some((e) => e.type === "land" && e.lane === 1 && e.mud);
    expect(splashed).toBe(landedInMud);
  });

  it("CPU racers finish the obstacle course on every difficulty", () => {
    for (const d of ["easy", "normal", "hard"] as const) {
      const race = runRace(d, 0, 11, { course: "obstacles", leap: true });
      expect(race.racers.filter((r) => r.state === "done").length).toBeGreaterThanOrEqual(2);
    }
  });
});
