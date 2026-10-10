import type { EngineContext, GameResult } from "@/games/types";
import { OUTCOME, type Difficulty } from "./rules";
import { createSlapMatch, type SlapEvent, type SlapMatch } from "./match";

export const OPPONENT = { avatar: "emeka", name: "Emeka" } as const;

export function startSlapMatch(ctx: EngineContext): { m: SlapMatch; difficulty: Difficulty } {
  const difficulty = (["easy", "normal", "hard"].includes(ctx.options.difficulty ?? "") ? ctx.options.difficulty : "normal") as Difficulty;
  return { m: createSlapMatch({ difficulty, seed: ctx.seed }), difficulty };
}

/** Space / Enter / ↑ = SLAP or PULL, F / Shift = FAKE. Returns an unbind function. */
export function bindSlapKeys(act: () => void, fake: () => void) {
  const onDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "enter" || k === "arrowup") {
      e.preventDefault();
      act();
    } else if (k === "f" || k === "shift") {
      e.preventDefault();
      fake();
    }
  };
  window.addEventListener("keydown", onDown);
  return () => window.removeEventListener("keydown", onDown);
}

/** Big centre text for an event, if any. */
export function slapText(e: SlapEvent): { text: string; color: string; sub?: string } | null {
  switch (e.type) {
    case "go":
      return { text: "GO!", color: "#7ee08a" };
    case "slap":
      if (e.by === 0) return e.free ? { text: "FREE SLAP!", color: "#ffd166", sub: `${OPPONENT.name} flinched at your fake` } : { text: "SLAP! 👋", color: "#ffd166" };
      return e.free ? { text: "FLINCHED!", color: "#ff8a6b", sub: "Free slap for Emeka" } : { text: "OUCH! 🔥", color: "#ff8a6b" };
    case "dodge":
      return e.by === 0 ? { text: "DODGED!", color: "#7ee08a", sub: `${e.reactMs} ms${e.reactMs < 200 ? " ⚡" : ""} · your turn to slap` } : { text: "MISSED!", color: "#ffb36b", sub: `${OPPONENT.name} pulled away · his turn` };
    case "timeout":
      return { text: "TOO SLOW!", color: "#ffb36b", sub: "You waited too long · his turn" };
    case "early":
      return { text: "Wait for GO!", color: "#fff" };
    default:
      return null;
  }
}

export function roleLine(m: SlapMatch): string {
  const { st } = m;
  if (st.phase === "end") return "";
  if (st.attacker === 0) return st.phase === "count" ? "You slap. Get ready…" : "SLAP his hands! Or FAKE him out";
  return st.phase === "count" ? "Emeka slaps. Don't flinch…" : "PULL AWAY when he strikes!";
}

export function buildSlapResult(ctx: EngineContext, m: SlapMatch): GameResult {
  const r = m.result();
  const [you, cpu] = r.summary.points;
  const fast = r.stats.fastDodges ? ` · ${r.stats.fastDodges} lightning dodge${r.stats.fastDodges > 1 ? "s" : ""}` : "";
  return {
    game: "hand-slap",
    mode: ctx.mode,
    options: ctx.options,
    score: r.score,
    won: r.won,
    durationMs: Math.round(m.st.clock * 1000),
    headline: r.won ? (cpu === 0 ? "Untouchable!" : "Your hands are faster!") : "Your hands are red!",
    detail: `${you}–${cpu} against ${OPPONENT.name} · ${r.stats.dodges} dodge${r.stats.dodges === 1 ? "" : "s"}${fast}`,
    stats: r.stats,
    seed: ctx.seed,
    log: r.log,
  };
}

/** True while the last outcome was a slap on your hands (for red flashes). */
export const youGotHit = (m: SlapMatch) => m.st.outcome?.code === OUTCOME.youGotSlapped || m.st.outcome?.code === OUTCOME.youFlinched;
