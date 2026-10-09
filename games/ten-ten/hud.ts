import { clamp, easeOutCubic, hudText, lerp, roundRect } from "@/games/core/draw";
import { CUE_WORDS, type TenTenMatch } from "./match";
import { WINDOWS, type Player } from "./rules";
import { chantWord } from "./chant";

/** Scoreboard, role banner, beat track and cue words — shared by the 2D and 3D renderers. */
export function drawTenTenHud(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  m: TenTenMatch,
  font: { display: string; body: string },
  opts: { reducedMotion: boolean; cueY: number; coachY: number },
) {
  const s = m.state;
  const top = 12;
  // Leave room in the middle for the pause + sound buttons.
  const plateW = Math.min(W * 0.36, 220);
  const plateH = 54;
  const colorFor = (p: Player) => (p === 0 ? "#ffd166" : m.local ? "#7ec8ff" : "#ff9f7a");
  const drawPlate = (player: Player, x: number, align: "left" | "right") => {
    const isLeader = s.leader === player && s.phase !== "intro";
    roundRect(g, x, top, plateW, plateH, 14);
    g.fillStyle = "rgba(12,16,14,0.72)";
    g.fill();
    if (isLeader) {
      g.strokeStyle = "#ffd166";
      g.lineWidth = 2;
      g.stroke();
    }
    const pad = 12;
    hudText(g, m.names[player], align === "left" ? x + pad : x + plateW - pad, top + 17, { size: 14, font: font.body, weight: 700, color: "#f4f1ea", align, shadow: false });
    hudText(g, String(s.points[player]), align === "left" ? x + plateW - pad : x + pad, top + plateH / 2, {
      size: 30,
      font: font.display,
      color: colorFor(player),
      align: align === "left" ? "right" : "left",
      shadow: false,
    });
    const pipW = Math.min(9, (plateW - 70) / m.target - 3);
    for (let i = 0; i < m.target; i++) {
      const px = align === "left" ? x + pad + i * (pipW + 3) : x + plateW - pad - pipW - i * (pipW + 3);
      g.fillStyle = i < s.points[player] ? colorFor(player) : "rgba(255,255,255,0.16)";
      roundRect(g, px, top + 34, pipW, 8, 3);
      g.fill();
    }
    if (isLeader) hudText(g, "LEADS", align === "left" ? x + pad : x + plateW - pad, top + plateH + 12, { size: 11, font: font.body, weight: 800, color: "#ffd166", align });
  };
  drawPlate(0, 10, "left");
  drawPlate(1, W - 10 - plateW, "right");

  if (s.phase === "intro") {
    const n = 3 - Math.floor(s.clock / 0.7);
    const t = (s.clock % 0.7) / 0.7;
    hudText(g, n > 0 ? String(n) : "TEN-TEN!", W / 2, H * 0.42, {
      size: n > 0 ? 96 : 54,
      font: font.display,
      color: n > 0 ? "#fff" : "#ffd166",
      stroke: "rgba(0,0,0,0.5)",
      alpha: opts.reducedMotion ? 1 : 1 - t * 0.4,
    });
    hudText(g, m.local ? "Player 1: A / D   ·   Player 2: ← / →" : "Throw your foot LEFT or RIGHT on the beat", W / 2, H * 0.42 + 70, {
      size: 15,
      font: font.body,
      weight: 700,
      color: "#fff",
      stroke: "rgba(0,0,0,0.55)",
      strokeWidth: 4,
    });
    return;
  }
  if (s.phase !== "play") return;

  const youLead = s.leader === 0;
  const banner = m.local ? `${m.names[s.leader]} leads: same side scores` : youLead ? "You lead: land on the SAME side" : `${m.oppName} leads: land on the OTHER side`;
  hudText(g, banner, W / 2, top + plateH + 32, {
    size: Math.min(17, W / 24),
    font: font.display,
    weight: 800,
    color: youLead || m.local ? "#ffd166" : "#ff9f7a",
    stroke: "rgba(0,0,0,0.45)",
    strokeWidth: 4,
  });

  // Beat track: playhead sweeps CLAP, CLAP, JUMP to THROW.
  const trackW = Math.min(W * 0.84, 420);
  const tx = (W - trackW) / 2;
  const ty = top + plateH + 66;
  const u = clamp(m.barPos(), 0, 4);
  const posFor = (b: number) => tx + (b / 3.6) * trackW;
  roundRect(g, tx - 10, ty - 16, trackW + 20, 44, 14);
  g.fillStyle = "rgba(12,16,14,0.78)";
  g.fill();
  const wOpen = 3 - (m.throwTime() - m.windowOpen()) / s.beat;
  const wClose = 3 + WINDOWS.ok / s.beat;
  g.fillStyle = "rgba(255,209,102,0.22)";
  roundRect(g, posFor(wOpen), ty - 9, posFor(wClose) - posFor(wOpen), 18, 9);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(tx, ty - 1, trackW, 2);
  for (let b = 0; b < 4; b++) {
    const x = posFor(b);
    const active = Math.floor(u) === b;
    const isThrow = b === 3;
    g.beginPath();
    g.arc(x, ty, isThrow ? 9 : 6, 0, Math.PI * 2);
    g.fillStyle = active ? (isThrow ? "#ffd166" : "#f4f1ea") : "rgba(255,255,255,0.3)";
    g.fill();
    hudText(g, CUE_WORDS[b] ?? "", x, ty + 18, { size: 10, font: font.body, weight: 800, color: active ? "#fff" : "rgba(255,255,255,0.55)", shadow: false });
  }
  const headX = posFor(Math.min(u, 3.6));
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(headX, ty - 13);
  g.lineTo(headX - 6, ty - 21);
  g.lineTo(headX + 6, ty - 21);
  g.closePath();
  g.fill();
  g.fillRect(headX - 1, ty - 13, 2, 26);

  const b = Math.floor(u);
  if (b >= 0 && b <= 3) {
    const frac = u - b;
    const isThrow = b === 3;
    const scale = opts.reducedMotion ? 1 : lerp(1.25, 1, easeOutCubic(frac * 3));
    g.save();
    g.translate(W / 2, opts.cueY);
    g.scale(scale, scale);
    // Sing-along: the chant word big, the move it goes with underneath.
    hudText(g, `${chantWord(s.barIndex, b).toUpperCase()}!`, 0, 0, {
      size: isThrow ? 38 : 30,
      font: font.display,
      color: isThrow ? "#ffd166" : "#fff",
      stroke: "rgba(0,0,0,0.55)",
      alpha: isThrow ? 1 : 1 - frac * 0.5,
    });
    hudText(g, isThrow ? "THROW" : CUE_WORDS[b] ?? "", 0, isThrow ? 30 : 26, {
      size: 13,
      font: font.body,
      weight: 800,
      color: isThrow ? "#ffd166" : "rgba(255,255,255,0.8)",
      stroke: "rgba(0,0,0,0.5)",
      strokeWidth: 3,
      alpha: 1 - frac * 0.5,
    });
    g.restore();
  }

  const coaching = m.practice || s.barIndex < 2;
  if (coaching && !s.pending.resolved && u < 3.2 && !s.earlyWarned) {
    hudText(g, m.local ? "Both players tap on THROW" : "Tap LEFT or RIGHT exactly on THROW", W / 2, opts.coachY, {
      size: 15,
      font: font.body,
      weight: 700,
      color: "#fff",
      stroke: "rgba(0,0,0,0.55)",
      strokeWidth: 4,
    });
  }
}

export const JUDGE_STYLE = {
  perfect: { text: "PERFECT!", color: "#ffd166" },
  good: { text: "GOOD", color: "#7ee08a" },
  ok: { text: "OK", color: "#f4f1ea" },
  miss: { text: "FOUL!", color: "#ff6b5a" },
} as const;

export function judgeLabel(j: keyof typeof JUDGE_STYLE, side: string | null, offset: number | null) {
  if (j !== "miss") return JUDGE_STYLE[j].text;
  if (side === null) return "TOO SLOW!";
  return (offset ?? 0) > 0 ? "LATE!" : "EARLY!";
}
