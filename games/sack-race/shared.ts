import type { EngineContext, GameResult } from "@/games/types";
import { HOUSES } from "@/games/core3d/sportsday";
import { OBSTACLE_HURDLES, encodeRace, scoreRace, type CourseKind, type Race, type RaceEvent } from "./rules";

/** Lane line-up: the player runs for Blue House in lane 1. */
export const PLAYER_LANE = 1;
export const RACERS = [
  { avatar: "emeka", name: "Emeka", female: false },
  { avatar: "tunde", name: "You", female: false },
  { avatar: "ada", name: "Ada", female: true },
  { avatar: "aisha", name: "Aisha", female: true },
] as const;

export const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

export const courseOf = (mode: string): CourseKind => (mode === "obstacles" ? "obstacles" : "race");

/**
 * Space / ↑ / W / F hop. With a LEAP handler, J / K / Shift / → leap;
 * without one, J hops too. Returns an unbind function.
 */
export function bindHopKeys(hop: () => void, leap?: () => void) {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    let fn: (() => void) | null = null;
    if (k === " " || k === "arrowup" || k === "f" || k === "w") fn = hop;
    else if (k === "j") fn = leap ?? hop;
    else if (leap && (k === "k" || k === "shift" || k === "arrowright")) fn = leap;
    if (!fn) return;
    e.preventDefault();
    fn();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

export function raceResult(ctx: EngineContext, race: Race): GameResult {
  const me = race.racers[PLAYER_LANE]!;
  const place = race.placeOf(PLAYER_LANE);
  const time = Math.round((me.finishTime ?? race.clock) * 100) / 100;
  const course = race.course.kind;
  const s = { place, time, perfects: me.perfects, falls: me.falls, hops: me.hops, course, cleared: me.cleared, bestStreak: me.bestStreak };
  const house = HOUSES[PLAYER_LANE]!.name;
  const bits = [`${time.toFixed(2)}s`, `${me.perfects} perfect hops`];
  if (course === "obstacles") bits.push(`${me.cleared}/${OBSTACLE_HURDLES} hurdles`);
  if (me.bestStreak >= 4) bits.push(`best streak ${me.bestStreak}`);
  if (me.falls) bits.push(`fell ${me.falls}×`);
  return {
    game: "sack-race",
    mode: ctx.mode,
    options: ctx.options,
    score: scoreRace(s),
    won: place === 1,
    durationMs: Math.round((race.clock + 3) * 1000),
    headline: place === 1 ? `${house} House wins the ${course === "obstacles" ? "obstacle race" : "sack race"}!` : `${ordinal(place)} place for ${house} House`,
    detail: bits.join(" · "),
    stats: { place, time100: Math.round(time * 100), perfects: me.perfects, falls: me.falls, cleared: me.cleared, bestStreak: me.bestStreak },
    seed: ctx.seed,
    log: encodeRace(s),
  };
}

const CLEAR_LINES = ["Clean jump!", "See leg! Over the hurdle!", "Na so! Blue House fly am!", "Smooth like Okocha!"];

/**
 * The PA announcer on the school field. Feed it every batch of race events and
 * call `update` each frame; draw `text` while `alpha` > 0.
 */
export function createCommentary(race: Race) {
  let text = "";
  let age = 99;
  let lastClock = race.clock;
  let leader = -1;
  let leadCalled = -9;
  let closeCalled = false;
  let clears = 0;
  const house = (lane: number) => `${HOUSES[lane]!.name} House`;
  const isMe = (lane: number) => lane === PLAYER_LANE;
  /** Important lines always cut in; chatter waits for the last line to be read. */
  const say = (line: string, force = false) => {
    if (!force && age < 1.8) return;
    text = line;
    age = 0;
  };

  return {
    feed(ev: RaceEvent[]) {
      for (const e of ev) {
        const lane = e.lane;
        switch (e.type) {
          case "rocket":
            if (isMe(lane)) say("Rocket start from Blue House!", true);
            break;
          case "falsestart":
            if (isMe(lane)) say("False start! Blue House, wait for whistle now!", true);
            break;
          case "ginger":
            say(isMe(lane) ? "Blue House don get ginger! Who go catch am?" : `${house(lane)} dey fly o!`, isMe(lane));
            break;
          case "trip":
            say(isMe(lane) ? "Ah! Blue House knock the hurdle! Get up!" : `${RACERS[lane]!.name} knock hurdle! ${house(lane)} don fall!`, isMe(lane));
            break;
          case "fall":
            if (!ev.some((o) => o.type === "trip" && o.lane === lane)) say(isMe(lane) ? "Blue House don fall for sack! Get up, get up!" : `${house(lane)} don fall! Sorry o, ${RACERS[lane]!.name}!`, isMe(lane));
            break;
          case "splash":
            if (isMe(lane)) say("Splash! Blue House enter mud! Hop am comot!", true);
            break;
          case "clear":
            if (isMe(lane)) say(CLEAR_LINES[clears++ % CLEAR_LINES.length]!);
            break;
          case "finish":
            if (e.place === 1) say(isMe(lane) ? "BLUE HOUSE! Champion! Na una get am!" : `${house(lane)} wins it! ${RACERS[lane]!.name} take first!`, true);
            else if (isMe(lane)) say(`Blue House finish ${ordinal(e.place)}. Next time!`, true);
            break;
        }
      }
    },
    update(dt: number) {
      age += dt;
      const clock = race.clock;
      if (lastClock < 0 && clock >= 0) say("Dem don go! Oya hop am!", true);
      lastClock = clock;
      if (clock < 1.5 || race.racers.some((r) => r.state === "done")) return;
      // Lead changes, called no more than every few seconds.
      const lead = race.racers.reduce((a, r) => (r.x > a.x ? r : a));
      if (lead.lane !== leader && clock - leadCalled > 2.5) {
        leader = lead.lane;
        leadCalled = clock;
        say(isMe(leader) ? "Blue House dey lead! Hold am tight!" : `${house(leader)} dey lead now!`);
      }
      // A close one at the end.
      const len = race.course.length;
      const me = race.racers[PLAYER_LANE]!;
      if (!closeCalled && lead.x > len - 5 && race.racers.some((r) => r !== me && Math.abs(r.x - me.x) < 0.9 && Math.abs(lead.x - me.x) < 0.9)) {
        closeCalled = true;
        say("E close o! This one na photo finish!", true);
      }
    },
    get text() {
      return text;
    },
    /** 1 while fresh, fading out after a few seconds. */
    get alpha() {
      return age < 3 ? 1 : Math.max(0, 1 - (age - 3) / 0.6);
    },
  };
}
