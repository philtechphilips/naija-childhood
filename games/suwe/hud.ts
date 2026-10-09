import { hudText, roundRect } from "@/games/core/draw";
import type { SuweMatch } from "./match";
import { LIVES, type Foot } from "./rules";

/** Lives, score, progress and prompts — shared by the 2D and 3D renderers. */
export function drawSuweHud(g: CanvasRenderingContext2D, W: number, H: number, m: SuweMatch, font: { display: string; body: string }) {
  const st = m.st;
  roundRect(g, 12, 12, 96, 40, 12);
  g.fillStyle = "rgba(12,16,14,0.75)";
  g.fill();
  for (let i = 0; i < LIVES; i++) {
    g.fillStyle = i < st.lives ? "#ffd166" : "rgba(255,255,255,0.18)";
    g.beginPath();
    g.ellipse(32 + i * 28, 32, 9, 7, -0.2, 0, Math.PI * 2);
    g.fill();
  }
  const sw = 128;
  roundRect(g, W - sw - 12, 12, sw, 40, 12);
  g.fillStyle = "rgba(12,16,14,0.75)";
  g.fill();
  hudText(g, st.totals.score.toLocaleString(), W - 24, 33, { size: 22, font: font.display, color: "#fff", align: "right", shadow: false });
  hudText(g, `Box ${Math.min(st.target, st.board.boxes.length)} of ${st.board.boxes.length}${m.daily ? " · Daily" : ` · Board ${st.level + 1}`}`, W / 2, 76, {
    size: 15,
    font: font.display,
    color: "#fff",
    stroke: "rgba(0,0,0,0.5)",
    strokeWidth: 4,
  });
  if (st.totals.combo >= 3) hudText(g, `Combo ${st.totals.combo}`, W / 2, 98, { size: 13, font: font.body, weight: 800, color: "#ffd166", stroke: "rgba(0,0,0,0.5)", strokeWidth: 3 });

  const prompt = (text: string, color = "#fff") => hudText(g, text, W / 2, H * 0.88, { size: Math.min(17, W / 24), font: font.display, color, stroke: "rgba(0,0,0,0.6)", strokeWidth: 5 });
  if (st.phase === "intro") prompt("Get ready…");
  if (st.phase === "throw") prompt(`Tap when the glow is on box ${st.target}`, "#ffd166");
  if (st.phase === "fail") {
    g.fillStyle = "rgba(60,10,5,0.25)";
    g.fillRect(0, 0, W, H);
    prompt(st.failText, st.lives > 0 && st.failText.startsWith("Board") ? "#7ee08a" : "#ff8a6b");
  }
  if (st.phase === "end") {
    g.fillStyle = "rgba(10,14,12,0.45)";
    g.fillRect(0, 0, W, H);
    const cleared = m.daily && st.target > st.board.boxes.length;
    hudText(g, cleared ? "BOARD CLEARED!" : "NO MORE LIVES", W / 2, H * 0.42, { size: Math.min(46, W / 9), font: font.display, color: cleared ? "#ffd166" : "#ff8a6b", stroke: "rgba(0,0,0,0.5)" });
    if (st.failText && !cleared) prompt(st.failText, "#fff");
  }
}

/** F/← = hop, J/→ = split, Space throws the stone. */
export function bindSuweKeys(phase: () => string, press: (f: Foot) => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === "f" || k === "arrowleft") press("hop");
    else if (k === "j" || k === "arrowright") press("split");
    else if (k === " ") {
      if (phase() === "throw") press("hop");
    } else return;
    e.preventDefault();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
