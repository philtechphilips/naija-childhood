import type { EngineContext, GameResult } from "@/games/types";
import { encodeRun, scoreRun, type ObstacleKind } from "./run-rules";
import type { Run, RunAction } from "./run-sim";

export const KIND_NAMES: Record<ObstacleKind, string> = {
  danfo: "danfo",
  brt: "BRT bus",
  hawker: "hawker",
  keke: "keke",
  okada: "okada",
  barrier: "police barrier",
  checkpoint: "checkpoint",
  table: "hawker's table",
  generator: "generator",
  cart: "omolanke cart",
  pole: "fallen NEPA pole",
  banner: "owambe banner",
  pothole: "pothole",
};

/** Arrows / WASD / Space / Shift. Returns an unbind function. */
export function bindRunKeys(press: (a: RunAction) => void) {
  const map: Record<string, RunAction> = {
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right",
    arrowup: "jump",
    w: "jump",
    " ": "jump",
    arrowdown: "slide",
    s: "slide",
    shift: "slide",
  };
  const onKey = (e: KeyboardEvent) => {
    const a = map[e.key.toLowerCase()];
    if (!a || e.repeat) return;
    e.preventDefault();
    press(a);
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

export function runResult(ctx: EngineContext, run: Run): GameResult {
  const st = run.stats();
  const s = run.state;
  const metres = Math.floor(st.distance);
  return {
    game: "police-thief",
    mode: "run",
    options: ctx.options,
    score: scoreRun(st),
    won: null,
    durationMs: Math.round(s.clock * 1000),
    headline: `${metres.toLocaleString()} m before they caught you`,
    detail: `${st.coins} coins · ${s.snacks} snack${s.snacks === 1 ? "" : "s"} snatched${s.caughtBy ? ` · ran into the ${KIND_NAMES[s.caughtBy]}` : ""}`,
    stats: { distance: metres, coins: st.coins, stumbles: st.stumbles, snacks: s.snacks },
    seed: ctx.seed,
    log: encodeRun(st),
  };
}
