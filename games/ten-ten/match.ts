import { createRng, pick } from "@/games/core/rng";
import type { GameResult } from "@/games/types";
import { AI_PROFILES, cpuChooseSide, cpuTiming, SidePredictor, type Difficulty } from "./ai";
import {
  bpmFor,
  encodeLog,
  judge,
  nextLeader,
  summarize,
  TARGET_POINTS,
  throwWinner,
  WINDOWS,
  type Judgement,
  type Player,
  type Side,
  type Throw,
} from "./rules";

/**
 * Ten-Ten match timeline (renderer independent): intro countdown, then 4-beat
 * bars of CLAP, CLAP, JUMP, THROW. Renderers react to the events it returns.
 */
export const OPPONENTS = ["Aisha", "Bisi", "Ngozi", "Amina", "Funke", "Chioma", "Zainab", "Tolu", "Kemi", "Halima", "Ebere", "Ronke"];
export const CUE_WORDS = ["CLAP", "CLAP", "JUMP", "THROW"];

export interface PendingThrow {
  sides: [Side | null, Side | null];
  offsets: [number | null, number | null];
  cpu: { side: Side; judgement: Judgement; offset: number } | null;
  revealed: [boolean, boolean];
  resolved: boolean;
}

export type TenTenEvent =
  | { type: "countdown" }
  | { type: "go" }
  | { type: "beat"; beat: number }
  | { type: "stomp"; player: Player; side: Side }
  | { type: "early" }
  | {
      type: "resolve";
      winner: Player | null;
      judgements: [Judgement, Judgement];
      sides: [Side | null, Side | null];
      offsets: [number | null, number | null];
      switched: boolean;
    }
  | { type: "end"; winner: Player }
  | { type: "finish"; result: Omit<GameResult, "options"> };

export interface MatchOptions {
  mode: string;
  difficulty: Difficulty;
  seed: number;
  playerName: string;
  /** Opponent name override (3D uses the avatar's name). */
  opponent?: string;
}

export type TenTenMatch = ReturnType<typeof createTenTenMatch>;

export function createTenTenMatch(opts: MatchOptions) {
  const local = opts.mode === "local";
  const practice = opts.mode === "practice";
  const difficulty: Difficulty = practice ? "easy" : opts.difficulty;
  const target = practice ? 5 : TARGET_POINTS;
  const rng = createRng(opts.seed);
  const cpuRng = createRng(opts.seed ^ 0x9e3779b9);
  const oppName = local ? "Player 2" : opts.opponent ?? pick(rng, OPPONENTS);
  const names: [string, string] = [local ? "Player 1" : opts.playerName || "You", oppName];
  const startBpm = AI_PROFILES[difficulty].startBpm;
  const predictor = new SidePredictor();

  const s = {
    clock: 0,
    phase: "intro" as "intro" | "play" | "end",
    endAt: 0,
    leader: 0 as Player,
    points: [0, 0] as [number, number],
    beat: 60 / startBpm,
    barStart: 0,
    barIndex: 0,
    pending: newPending(),
    lastOutcome: null as { winner: Player | null; at: number; match: boolean } | null,
    earlyWarned: false,
  };
  const throws: Throw[] = [];
  let lastBeat = -1;
  let introBeat = -1;
  let finished = false;

  function newPending(): PendingThrow {
    return { sides: [null, null], offsets: [null, null], cpu: null, revealed: [false, false], resolved: false };
  }
  const throwTime = () => s.barStart + 3 * s.beat;
  const windowOpen = () => throwTime() - Math.min(s.beat * 0.75, 0.45);
  const windowClose = () => throwTime() + WINDOWS.ok;
  /** Position in the current bar, in beats (0..4). */
  const barPos = () => (s.clock - s.barStart) / s.beat;

  function startBar() {
    s.pending = newPending();
    s.earlyWarned = false;
    if (!local) {
      const side = cpuChooseSide(s.leader === 1, predictor, difficulty, cpuRng);
      const timing = cpuTiming(difficulty, cpuRng);
      s.pending.cpu = { side, judgement: timing.judgement, offset: timing.offset };
    }
  }

  function press(player: Player, side: Side): TenTenEvent[] {
    const p = s.pending;
    if (s.phase !== "play" || p.resolved) return [];
    if (!local && player === 1) return [];
    // From the JUMP beat on, every press counts immediately (judged early/late by timing).
    // During the claps a press just gets a nudge, so nothing ever feels ignored.
    if (s.clock < s.barStart + 2 * s.beat) {
      s.earlyWarned = true;
      return [{ type: "early" }];
    }
    if (s.clock > windowClose() || p.sides[player] !== null) return [];
    p.sides[player] = side;
    p.offsets[player] = s.clock - throwTime();
    p.revealed[player] = true;
    return [{ type: "stomp", player, side }];
  }

  function resolve(): TenTenEvent[] {
    const p = s.pending;
    p.resolved = true;
    const sides: [Side | null, Side | null] = [p.sides[0], local ? p.sides[1] : p.cpu?.judgement === "miss" ? null : p.cpu?.side ?? null];
    const j0: Judgement = p.sides[0] ? judge(p.offsets[0]) : "miss";
    const j1: Judgement = local ? (p.sides[1] ? judge(p.offsets[1]) : "miss") : p.cpu?.judgement ?? "miss";
    const t: Throw = { leader: s.leader, sides, judgements: [j0, j1] };
    throws.push(t);
    if (p.sides[0]) predictor.record(p.sides[0]);
    const w = throwWinner(t);
    s.lastOutcome = { winner: w, at: s.clock, match: sides[0] !== null && sides[0] === sides[1] };
    if (w !== null) s.points[w]++;
    const prev = s.leader;
    s.leader = nextLeader(s.leader, w);
    s.beat = 60 / bpmFor(startBpm, throws.length);
    const over = s.points[0] >= target || s.points[1] >= target;
    const events: TenTenEvent[] = [
      { type: "resolve", winner: w, judgements: [j0, j1], sides, offsets: [p.offsets[0], local ? p.offsets[1] : p.cpu?.offset ?? null], switched: s.leader !== prev && !over },
    ];
    if (over) {
      s.phase = "end";
      s.endAt = s.clock;
      events.push({ type: "end", winner: s.points[0] >= target ? 0 : 1 });
    }
    return events;
  }

  function result(): Omit<GameResult, "options"> {
    const sum = summarize(throws, target);
    const youWon = sum.winner === 0;
    const line = `${sum.points[0]}–${sum.points[1]}`;
    return {
      game: "ten-ten",
      mode: opts.mode,
      score: local ? 0 : sum.score,
      won: local ? null : youWon,
      durationMs: Math.round(s.clock * 1000),
      headline: local
        ? `${names[sum.winner ?? 0]} wins ${sum.winner === 1 ? `${sum.points[1]}–${sum.points[0]}` : line}!`
        : youWon
          ? `You beat ${oppName} ${line}!`
          : `${oppName} won ${sum.points[1]}–${sum.points[0]}`,
      detail: local ? "Pass-and-play matches aren't ranked." : `${sum.perfects} perfect throws · best streak ${sum.longestStreak}`,
      stats: {
        perfects: sum.perfects,
        goods: sum.goods,
        fouls: sum.fouls,
        longestStreak: sum.longestStreak,
        pointsFor: sum.points[0],
        pointsAgainst: sum.points[1],
        throws: sum.throws,
        difficulty: difficulty === "easy" ? 0 : difficulty === "normal" ? 1 : 2,
      },
      seed: opts.seed,
      log: encodeLog(throws),
    };
  }

  function update(dt: number): TenTenEvent[] {
    const events: TenTenEvent[] = [];
    s.clock += dt;
    if (s.phase === "intro") {
      const b = Math.floor(s.clock / 0.7);
      if (b !== introBeat && b < 3) {
        introBeat = b;
        events.push({ type: "countdown" });
      }
      if (s.clock >= 2.1) {
        events.push({ type: "go" });
        s.phase = "play";
        s.barStart = s.clock + 0.3;
        lastBeat = -1;
        startBar();
      }
      return events;
    }
    if (s.phase === "end") {
      if (!finished && s.clock - s.endAt > 2.6) {
        finished = true;
        events.push({ type: "finish", result: result() });
      }
      return events;
    }
    const b = Math.floor(barPos());
    if (b !== lastBeat && b >= 0 && b <= 3) {
      lastBeat = b;
      events.push({ type: "beat", beat: b });
    }
    const p = s.pending;
    if (!local && p.cpu && !p.revealed[1] && s.clock >= throwTime() + p.cpu.offset) {
      p.revealed[1] = true;
      if (p.cpu.judgement !== "miss") {
        p.sides[1] = p.cpu.side;
        events.push({ type: "stomp", player: 1, side: p.cpu.side });
      }
    }
    if (!p.resolved && s.clock >= windowClose()) events.push(...resolve());
    if (s.phase === "play" && s.clock >= s.barStart + 4 * s.beat) {
      s.barStart += 4 * s.beat;
      s.barIndex++;
      lastBeat = -1;
      startBar();
    }
    return events;
  }

  /** When (in match time) a player's foot came out this bar, if it did. */
  function pressedAt(player: Player): number | null {
    const p = s.pending;
    if (!p.revealed[player] || !p.sides[player]) return null;
    if (player === 0 || local) return throwTime() + (p.offsets[player] ?? 0);
    return throwTime() + (p.cpu?.offset ?? 0);
  }

  return { state: s, names, oppName, local, practice, target, difficulty, throwTime, windowOpen, windowClose, barPos, press, update, pressedAt };
}
