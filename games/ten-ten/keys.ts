import type { Player, Side } from "./rules";

/** Keyboard: A/D (or ←/→) for player 1; in pass & play, player 2 uses ←/→. */
export function bindTenTenKeys(local: boolean, press: (player: Player, side: Side) => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (local) {
      if (k === "a") press(0, "L");
      else if (k === "d") press(0, "R");
      else if (k === "arrowleft") press(1, "L");
      else if (k === "arrowright") press(1, "R");
      else return;
    } else if (k === "a" || k === "arrowleft") press(0, "L");
    else if (k === "d" || k === "arrowright") press(0, "R");
    else return;
    e.preventDefault();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
