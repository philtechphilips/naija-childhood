import type { EngineContext, GameResult } from "@/games/types";
import type { Difficulty, Mode } from "./rules";
import { createHideSeek, type HideSeekEvent, type HideSeekMatch } from "./sim";

/** Reads the mode/difficulty from the engine context and starts a match. */
export function startMatch(ctx: EngineContext): { m: HideSeekMatch; mode: Mode; difficulty: Difficulty } {
  const mode: Mode = ctx.mode === "seek" ? "seek" : "hide";
  const difficulty = (["easy", "normal", "hard"].includes(ctx.options.difficulty ?? "") ? ctx.options.difficulty : "normal") as Difficulty;
  return { m: createHideSeek({ mode, difficulty, seed: ctx.seed }), mode, difficulty };
}

/** Space / E = HIDE or LOOK (the button for the mode). Returns an unbind function. */
export function bindActionKey(action: () => void) {
  const onDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key === " " || e.key.toLowerCase() === "e" || e.key === "Enter") {
      e.preventDefault();
      action();
    }
  };
  window.addEventListener("keydown", onDown);
  return () => window.removeEventListener("keydown", onDown);
}

/** The seeker counts up out loud: "1, 2, 3…" as the countdown runs down. */
export function spokenCount(total: number, left: number): number | null {
  return left >= 1 ? Math.round(total) - left + 1 : null;
}

/** What to tell the player, and where, for each event. `who` is the kid's display name. */
export function eventText(e: HideSeekEvent, mode: Mode): { text: string; color: string; big?: boolean } | null {
  switch (e.type) {
    case "go":
      return mode === "hide" ? { text: "Ready or not, here I come!", color: "#ffd166", big: true } : { text: "GO! Find them!", color: "#7ee08a", big: true };
    case "hid":
      return { text: `Hidden ${e.spot}`, color: "#7ee08a" };
    case "unhid":
      return mode === "hide" ? { text: "Out of hiding!", color: "#ffb36b" } : null;
    case "spotted":
      return e.kid.human ? { text: "Emeka sees you! RUN to base!", color: "#ff8a6b", big: true } : { text: `I see ${e.kid.name}!`, color: "#ffd166" };
    case "found":
      if (mode === "seek") return { text: `Found ${e.kid.name}!`, color: "#7ee08a", big: true };
      return e.kid.human ? { text: "Found you! Race him to base!", color: "#ff8a6b", big: true } : { text: `Found ${e.kid.name}!`, color: "#ffd166" };
    case "caught":
      return e.kid.human ? { text: "Caught!", color: "#ff8a6b", big: true } : { text: `${e.kid.name} is caught`, color: "#ffb36b" };
    case "home":
      if (e.kid.human) return { text: "HOME FREE!", color: "#7ee08a", big: true };
      return mode === "seek" ? { text: `${e.kid.name} got home free!`, color: "#ff8a6b" } : { text: `${e.kid.name} is home free!`, color: "#7ee08a" };
    case "closeCall":
      return { text: "Close one! Don't move…", color: "#ffd166" };
    case "bolt":
      return { text: `${e.kid.name} is running for base! Tag them!`, color: "#ffd166", big: true };
    case "empty":
      return mode === "seek" ? { text: "Nobody here…", color: "rgba(255,255,255,0.85)" } : null;
    default:
      return null;
  }
}

/** One line under the timer telling you what to do right now. */
export function hint(m: HideSeekMatch, mode: Mode): string {
  const { st, me } = m;
  if (st.phase === "end") return "";
  if (mode === "seek") {
    if (st.phase === "count") return "Eyes closed! Counting…";
    if (m.hiders.some((h) => h.state === "bolting")) return "Someone's running for base. Tag them!";
    return "Walk up to a spot and press LOOK";
  }
  if (me.state === "hidden") return "Stay still… or sneak to the gate";
  if (me.state === "bolting") return "RUN to the gate!";
  return st.phase === "count" ? "Run to a glowing spot, press HIDE" : "You're in the open! Hide or run home";
}

/** Hint font size that fits the line on a narrow phone. */
export const tipSize = (text: string, width: number) => Math.max(11, Math.min(15, (width * 0.9) / (text.length * 0.56)));

export function buildResult(ctx: EngineContext, m: HideSeekMatch, mode: Mode): GameResult {
  const r = m.result();
  let headline: string;
  let detail: string;
  if (mode === "hide") {
    const s = r.stats as { hidden10: number; homeFree: number; caught: number; closeCalls: number };
    headline = s.homeFree ? "Home free!" : s.caught ? "Caught!" : "Never found!";
    detail = `Hid for ${(s.hidden10 / 10).toFixed(0)}s${s.closeCalls ? ` · ${s.closeCalls} close call${s.closeCalls > 1 ? "s" : ""}` : ""}`;
  } else {
    const s = r.stats as { found: number; total: number; escaped: number };
    headline = s.found === s.total ? "Found everybody!" : `Found ${s.found} of ${s.total}`;
    detail = s.escaped ? `${s.escaped} got home free` : s.found === s.total ? `${Math.round(m.st.timeLeft)}s to spare` : "Time up";
  }
  return {
    game: "hide-seek",
    mode,
    options: ctx.options,
    score: r.score,
    won: r.won,
    durationMs: Math.round(m.st.clock * 1000),
    headline,
    detail,
    stats: r.stats,
    seed: ctx.seed,
    log: r.log,
  };
}
