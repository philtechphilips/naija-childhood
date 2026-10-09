import type { EngineContext, GameEngine } from "@/games/types";
import { fitCanvas, fonts, makeLayer } from "@/games/core/canvas";
import { createLoop } from "@/games/core/loop";
import { createRng, type Rng } from "@/games/core/rng";
import { paintBackdrop } from "@/games/core/scenery";
import { clamp, drawPopups, hudText, lerp, updatePopups, type Popup } from "@/games/core/draw";
import type { Board, Foot } from "./rules";
import { createSuweMatch, type SuweEvent } from "./match";
import { createNaijaMusic } from "@/games/core/naija-music";
import { bindSuweKeys, drawSuweHud } from "./hud";

interface V {
  x: number;
  z: number;
}

interface ChalkSeg {
  a: V;
  b: V;
  jitter: number[];
}

const EYE = 1.55;

export function createSuweEngine(ctx: EngineContext): GameEngine {
  const canvas = ctx.canvas;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas 2D is not supported on this device");
  const daily = ctx.mode === "daily";
  const rng = createRng(ctx.seed);

  let font = fonts();
  let backdrop: HTMLCanvasElement | null = null;
  const { vp, dispose: disposeFit } = fitCanvas(canvas, () => {
    backdrop = null;
  });

  // Ground speckles in world space give the perspective plane real texture.
  const speckles: { x: number; z: number; s: number; c: string }[] = [];
  for (let i = 0; i < 900; i++) {
    speckles.push({
      x: (rng() - 0.5) * 9,
      z: -3 + rng() * 18,
      s: 0.012 + rng() * 0.03,
      c: ["#7a3a1e", "#e0a27a", "#5c2c16", "#f1c9a6", "#9a5432"][Math.floor(rng() * 5)] ?? "#7a3a1e",
    });
  }

  const m = createSuweMatch({ mode: ctx.mode, seed: ctx.seed, difficulty: ctx.options.difficulty });
  const st = m.st;
  let segs: ChalkSeg[] = buildChalk(st.board, rng);
  let camZ = -2.4;
  const popups: Popup[] = [];
  const { rows, boxCenter, boxBounds, stepFeet, currentFeet } = m;
  const music = createNaijaMusic(ctx.sfx, "highlife", { enabled: ctx.music });
  music.start();

  function handle(events: SuweEvent[]) {
    for (const e of events) {
      if (e.type === "sfx") ctx.sfx.play(e.name, e.volume);
      else if (e.type === "haptic") ctx.haptic(e.pattern);
      else if (e.type === "popup") popups.push({ text: e.text, x: vp.w / 2, y: vp.h * e.y, color: e.color, age: 0, life: 1.1, size: e.size });
      else if (e.type === "board") segs = buildChalk(st.board, rng);
      else if (e.type === "finish") ctx.onEnd({ ...e.result, options: ctx.options });
    }
    music.setIntensity(Math.min(1, st.level / 4));
    if (st.phase === "end") music.stop(2);
  }
  const press = (foot: Foot) => handle(m.press(foot));

  function update(dt: number) {
    updatePopups(popups, dt);
    handle(m.update(dt));
    const f = currentFeet();
    const focusZ = (f.l.z + f.r.z) / 2;
    const wantCam = (st.phase === "throw" ? Math.min(focusZ, -0.7) : focusZ) - 1.7;
    camZ += (wantCam - camZ) * Math.min(1, dt * 6);
  }

  // ---------- Rendering ----------
  let W = 1;
  let H = 1;
  let horizon = 0;
  let F = 1;
  const project = (x: number, z: number) => {
    const d = Math.max(0.25, z - camZ);
    const s = F / d;
    return { x: W / 2 + x * s, y: horizon + EYE * s, s, d };
  };

  function buildBackdrop() {
    const layer = makeLayer(W * vp.dpr, H * vp.dpr);
    layer.ctx.scale(vp.dpr, vp.dpr);
    paintBackdrop(layer.ctx, createRng(99), W, H, horizon, "compound", font.display);
    backdrop = layer.canvas;
  }

  function render() {
    if (!g) return;
    W = vp.w;
    H = vp.h;
    horizon = H * 0.27;
    F = Math.min(W * 0.95, H * 0.62) * 0.82;
    if (!backdrop) {
      font = fonts();
      buildBackdrop();
    }
    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    if (backdrop) g.drawImage(backdrop, 0, 0, W, H);

    // Ground plane
    const ground = g.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, "#b98a64");
    ground.addColorStop(0.25, "#b46a42");
    ground.addColorStop(1, "#9b5230");
    g.fillStyle = ground;
    g.fillRect(0, horizon, W, H - horizon);
    for (const sp of speckles) {
      if (sp.z - camZ < 0.4) continue;
      const p = project(sp.x, sp.z);
      if (p.y > H + 4 || p.x < -4 || p.x > W + 4) continue;
      const size = Math.max(0.6, sp.s * p.s);
      g.globalAlpha = clamp(0.25 + 1.5 / p.d, 0.25, 0.75);
      g.fillStyle = sp.c;
      g.fillRect(p.x, p.y, size, size * 0.6);
    }
    g.globalAlpha = 1;
    const haze = g.createLinearGradient(0, horizon, 0, horizon + H * 0.12);
    haze.addColorStop(0, "rgba(240,215,180,0.55)");
    haze.addColorStop(1, "rgba(240,215,180,0)");
    g.fillStyle = haze;
    g.fillRect(0, horizon, W, H * 0.12);

    drawBoardHighlights();
    drawChalk();
    drawNumbers();
    drawStone();
    drawCues();
    drawFeet();
    drawHud();
    drawPopups(g, popups, font.display, ctx.reducedMotion);
  }

  function quad(x0: number, z0: number, x1: number, z1: number, fill: string) {
    if (!g) return;
    const a = project(x0, z0);
    const b = project(x1, z0);
    const c = project(x1, z1);
    const d = project(x0, z1);
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.lineTo(c.x, c.y);
    g.lineTo(d.x, d.y);
    g.closePath();
    g.fill();
  }


  function drawBoardHighlights() {
    if (st.phase === "throw") {
      const t = boxBounds(st.target);
      const pulse = 0.18 + Math.sin(st.clock * 6) * 0.06;
      quad(t.x0, t.z0, t.x1, t.z1, `rgba(255,209,102,${pulse})`);
      const n = st.board.boxes.length;
      const cur = Math.floor(clamp(st.sweep, 0, n - 0.0001)) + 1;
      const c = boxBounds(cur);
      quad(c.x0 + 0.04, c.z0 + 0.04, c.x1 - 0.04, c.z1 - 0.04, cur === st.target ? "rgba(126,224,138,0.55)" : "rgba(255,255,255,0.35)");
    }
    if (st.phase === "hop" || st.phase === "flight") {
      const s = st.stoneBox ? boxBounds(st.stoneBox) : null;
      if (s && st.stepIndex < st.plan.length / 2) quad(s.x0 + 0.05, s.z0 + 0.05, s.x1 - 0.05, s.z1 - 0.05, "rgba(255,80,60,0.18)");
    }
  }

  function drawChalk() {
    if (!g) return;
    g.lineCap = "round";
    g.strokeStyle = "#f6f2e8";
    for (const seg of segs) {
      const pa = project(seg.a.x, seg.a.z);
      const pb = project(seg.b.x, seg.b.z);
      if (pa.d < 0.3 && pb.d < 0.3) continue;
      const width = Math.max(1, 0.05 * (pa.s + pb.s) * 0.5);
      for (let pass = 0; pass < 2; pass++) {
        g.globalAlpha = pass === 0 ? 0.55 : 0.35;
        g.lineWidth = width * (pass === 0 ? 1 : 0.55);
        const j = (seg.jitter[pass] ?? 0) * width * 0.5;
        g.beginPath();
        g.moveTo(pa.x + j, pa.y + j * 0.5);
        g.lineTo(pb.x - j, pb.y - j * 0.5);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  function drawNumbers() {
    if (!g) return;
    for (const b of st.board.boxes) {
      const c = boxCenter(b.index);
      const p = project(c.x, c.z + 0.08);
      if (p.d < 0.6) continue;
      const size = 0.42 * p.s;
      g.save();
      g.translate(p.x, p.y);
      g.scale(1, clamp(EYE / p.d, 0.15, 1));
      g.font = `800 ${size}px ${font.display}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#f6f2e8";
      g.globalAlpha = b.index === st.stoneBox && !st.holdingStone ? 0.25 : 0.62;
      g.fillText(String(b.index), 0, 0);
      g.restore();
    }
    const home = project(0, rows() + 0.45);
    if (home.d > 0.6) {
      g.save();
      g.translate(home.x, home.y);
      g.scale(1, clamp(EYE / home.d, 0.15, 1));
      g.font = `800 ${0.26 * home.s}px ${font.display}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#f6f2e8";
      g.globalAlpha = 0.6;
      g.fillText("HOME", 0, 0);
      g.restore();
    }
  }

  function drawStoneAt(p: { x: number; y: number; s: number }, lift: number) {
    if (!g) return;
    const r = 0.13 * p.s;
    g.fillStyle = "rgba(30,15,8,0.35)";
    g.beginPath();
    g.ellipse(p.x + r * 0.15, p.y + r * 0.2, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    const gy = p.y - lift;
    const grad = g.createRadialGradient(p.x - r * 0.35, gy - r * 0.35, r * 0.1, p.x, gy, r);
    grad.addColorStop(0, "#d9d4cb");
    grad.addColorStop(0.6, "#8e877c");
    grad.addColorStop(1, "#4f4a43");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(p.x, gy - r * 0.15, r, r * 0.55, -0.15, 0, Math.PI * 2);
    g.fill();
  }

  function drawStone() {
    if (st.phase === "flight") {
      const t = clamp((st.clock - st.phaseAt) / 0.5, 0, 1);
      const to = boxCenter(st.thrownBox);
      const x = lerp(st.stoneFrom.x, to.x, t);
      const z = lerp(st.stoneFrom.z, to.z, t);
      const p = project(x, z);
      drawStoneAt(p, Math.sin(t * Math.PI) * 0.9 * p.s);
      return;
    }
    if (!st.holdingStone && st.stoneBox) drawStoneAt(project(boxCenter(st.stoneBox).x, boxCenter(st.stoneBox).z), 0);
    else if (st.phase === "throw" || st.phase === "intro") drawStoneAt(project(0.32, -0.45), 0);
  }

  function drawRing(c: V, t: number, color: string) {
    if (!g) return;
    const p = project(c.x, c.z);
    const r = lerp(0.36, 1.0, clamp(t, 0, 1)) * p.s * 0.5;
    const ry = r * clamp(EYE / p.d, 0.2, 1);
    g.strokeStyle = color;
    g.lineWidth = Math.max(2, p.s * 0.035);
    g.globalAlpha = clamp(1.2 - t, 0.35, 1);
    g.beginPath();
    g.ellipse(p.x, p.y, r, ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.9;
    g.lineWidth = 1.5;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.ellipse(p.x, p.y, 0.18 * p.s, 0.18 * p.s * clamp(EYE / p.d, 0.2, 1), 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }

  function drawCues() {
    if (!g || st.phase !== "hop") return;
    const s = st.plan[st.stepIndex];
    if (!s) return;
    const t = (st.nextAt - st.clock) / st.beat;
    const color = s.foot === "split" ? "#7ec8ff" : "#ffd166";
    const landing = stepFeet(s);
    if (s.foot === "split") {
      drawRing(landing.l, t, color);
      drawRing(landing.r, t, color);
    } else drawRing(landing.r, t, color);
    // On the first st.board, label which move the row needs.
    if (st.level === 0 || daily || m.relaxed) {
      const mid = { x: (landing.l.x + landing.r.x) / 2, z: (landing.l.z + landing.r.z) / 2 };
      const p = project(mid.x, mid.z + 0.3);
      hudText(g, s.foot === "split" ? "SPLIT" : s.pick ? "HOP + PICK" : "HOP", p.x, p.y - 0.25 * p.s, {
        size: clamp(0.2 * p.s, 12, 22),
        font: font.display,
        color,
        stroke: "rgba(0,0,0,0.55)",
        strokeWidth: 4,
      });
    }
  }

  function drawShoe(pos: V, lifted: number, side: -1 | 1) {
    if (!g) return;
    const p = project(pos.x, pos.z);
    if (p.d < 0.3) return;
    const w = 0.15 * p.s;
    const squash = clamp(EYE / p.d, 0.3, 1);
    const len = 0.3 * p.s * squash;
    const y = p.y - lifted * 0.35 * p.s;
    // Shadow on the ground
    g.fillStyle = `rgba(30,15,8,${0.38 - lifted * 0.2})`;
    g.beginPath();
    g.ellipse(p.x, p.y, w * 0.95, len * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    // Leg: comes from the viewer (bottom of screen) to the ankle, widening toward the camera.
    const ankleY = y + len * 0.05;
    const baseHalf = Math.max(w * 1.6, W * 0.11);
    const baseX = W / 2 + side * W * 0.2 + (p.x - W / 2) * 0.55;
    const legGrad = g.createLinearGradient(baseX - baseHalf, 0, baseX + baseHalf, 0);
    legGrad.addColorStop(0, "#3e2314");
    legGrad.addColorStop(0.45, "#70432a");
    legGrad.addColorStop(1, "#3a2012");
    g.fillStyle = legGrad;
    g.beginPath();
    g.moveTo(p.x - w * 0.36, ankleY);
    g.quadraticCurveTo(p.x - w * 0.5, (ankleY + H) / 2, baseX - baseHalf, H + 2);
    g.lineTo(baseX + baseHalf, H + 2);
    g.quadraticCurveTo(p.x + w * 0.55, (ankleY + H) / 2, p.x + w * 0.36, ankleY);
    g.closePath();
    g.fill();
    // Ankle sock (between the leg and the sandal)
    const sockH = w * 0.75;
    g.fillStyle = "#f4f1ea";
    g.beginPath();
    g.moveTo(p.x - w * 0.42, ankleY - w * 0.1);
    g.lineTo(p.x + w * 0.42, ankleY - w * 0.1);
    g.lineTo(p.x + w * 0.46, ankleY + sockH);
    g.lineTo(p.x - w * 0.46, ankleY + sockH);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.08)";
    g.fillRect(p.x - w * 0.46, ankleY + sockH * 0.65, w * 0.92, sockH * 0.35);
    // Black school sandal, toe pointing away from the camera
    const shoe = g.createLinearGradient(0, y - len, 0, y + len * 0.2);
    shoe.addColorStop(0, "#2e2926");
    shoe.addColorStop(1, "#0d0b0a");
    g.fillStyle = shoe;
    g.beginPath();
    g.ellipse(p.x, y - len * 0.32, w * 0.58, len * 0.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.2)";
    g.beginPath();
    g.ellipse(p.x - w * 0.18, y - len * 0.62, w * 0.15, len * 0.14, 0, 0, Math.PI * 2);
    g.fill();
    // Buckle strap
    g.strokeStyle = "#1c1816";
    g.lineWidth = Math.max(1, w * 0.14);
    g.beginPath();
    g.moveTo(p.x - w * 0.52, y - len * 0.12);
    g.lineTo(p.x + w * 0.52, y - len * 0.12);
    g.stroke();
    g.fillStyle = "#c9a227";
    g.fillRect(p.x + w * 0.3, y - len * 0.12 - w * 0.07, w * 0.12, w * 0.14);
  }

  function drawFeet() {
    const f = currentFeet();
    const hopLift = ctx.reducedMotion ? 0 : f.lift;
    // Draw the further foot first.
    const order: ["l" | "r", -1 | 1][] = f.l.z > f.r.z ? [["l", -1], ["r", 1]] : [["r", 1], ["l", -1]];
    for (const [k, side] of order) {
      const lifted = f.oneFoot && k === "l" ? 0.55 : hopLift * 0.6;
      drawShoe(f[k], lifted, side);
    }
  }

  function drawHud() {
    if (g) drawSuweHud(g, W, H, m, font);
  }

  const loop = createLoop(update, render);
  const unbind = bindSuweKeys(() => st.phase, press);


  return {
    start() {
      loop.start();
    },
    setPaused(p) {
      loop.setPaused(p);
      music.setVolume(p ? 0 : 1);
    },
    setMusic(on) {
      music.setEnabled(on);
    },
    input(id, down) {
      if (!down) return;
      if (id === "hop") press("hop");
      else if (id === "split") press("split");
    },
    destroy() {
      loop.stop();
      music.dispose();
      disposeFit();
      unbind();
    },
  };
}

/** Chalk line segments for the board, subdivided so perspective stays correct. */
function buildChalk(board: Board, rng: Rng): ChalkSeg[] {
  const segs: ChalkSeg[] = [];
  const line = (a: V, b: V) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 0.12));
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      segs.push({
        a: { x: lerp(a.x, b.x, t0) + (rng() - 0.5) * 0.012, z: lerp(a.z, b.z, t0) + (rng() - 0.5) * 0.012 },
        b: { x: lerp(a.x, b.x, t1) + (rng() - 0.5) * 0.012, z: lerp(a.z, b.z, t1) + (rng() - 0.5) * 0.012 },
        jitter: [rng() - 0.5, rng() - 0.5],
      });
    }
  };
  board.rows.forEach((cols, r) => {
    const x0 = cols === 1 ? -0.5 : -1;
    const x1 = -x0;
    line({ x: x0, z: r }, { x: x1, z: r });
    line({ x: x0, z: r }, { x: x0, z: r + 1 });
    line({ x: x1, z: r }, { x: x1, z: r + 1 });
    if (cols === 2) line({ x: 0, z: r }, { x: 0, z: r + 1 });
    const next = board.rows[r + 1];
    const nx = next === 2 ? 1 : 0.5;
    // Top edge spans the wider of this row and the next.
    line({ x: -Math.max(x1, nx), z: r + 1 }, { x: Math.max(x1, nx), z: r + 1 });
  });
  // Home: a semicircle at the top
  const top = board.rows.length;
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const a0 = Math.PI - (i / steps) * Math.PI;
    const a1 = Math.PI - ((i + 1) / steps) * Math.PI;
    line({ x: Math.cos(a0) * 0.75, z: top + Math.sin(a0) * 0.9 }, { x: Math.cos(a1) * 0.75, z: top + Math.sin(a1) * 0.9 });
  }
  // Start line
  line({ x: -0.9, z: -0.25 }, { x: 0.9, z: -0.25 });
  return segs;
}
