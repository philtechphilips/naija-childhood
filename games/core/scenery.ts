import { blotches, grain, mix } from "./draw";
import type { Rng } from "./rng";

export type Arena = "school" | "compound" | "rainy";

export const ARENAS: { value: Arena; label: string }[] = [
  { value: "school", label: "School yard" },
  { value: "compound", label: "Street compound" },
  { value: "rainy", label: "Rainy day" },
];

interface Palette {
  skyTop: string;
  skyBottom: string;
  ground: string;
  groundFar: string;
  grainColors: string[];
  haze: string;
}

const PALETTES: Record<Arena, Palette> = {
  school: {
    skyTop: "#5fa8dc",
    skyBottom: "#f4dfb6",
    ground: "#b8623a",
    groundFar: "#c98758",
    grainColors: ["#7a3a1e", "#e0a27a", "#5c2c16", "#f1c9a6"],
    haze: "rgba(255,226,180,0.35)",
  },
  compound: {
    skyTop: "#73b2df",
    skyBottom: "#f1e2c6",
    ground: "#8f887c",
    groundFar: "#a39d90",
    grainColors: ["#5f5a52", "#c7c0b3", "#47433d", "#dcd6ca"],
    haze: "rgba(250,236,210,0.3)",
  },
  rainy: {
    skyTop: "#4b5866",
    skyBottom: "#a7adaa",
    ground: "#6e3a24",
    groundFar: "#80513a",
    grainColors: ["#3f1e10", "#a0674a", "#2c150b", "#b98466"],
    haze: "rgba(190,200,205,0.35)",
  },
};

export function paintSky(ctx: CanvasRenderingContext2D, w: number, horizon: number, arena: Arena) {
  const p = PALETTES[arena];
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, p.skyTop);
  g.addColorStop(1, p.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, horizon + 2);
  if (arena !== "rainy") {
    const sun = ctx.createRadialGradient(w * 0.82, horizon * 0.18, 0, w * 0.82, horizon * 0.18, w * 0.45);
    sun.addColorStop(0, "rgba(255,248,220,0.85)");
    sun.addColorStop(0.15, "rgba(255,240,200,0.35)");
    sun.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, horizon);
  } else {
    // Heavy cloud bands
    for (let i = 0; i < 7; i++) {
      const cy = horizon * (0.1 + i * 0.12);
      const g2 = ctx.createLinearGradient(0, cy - 20, 0, cy + 30);
      g2.addColorStop(0, "rgba(60,70,80,0)");
      g2.addColorStop(0.5, `rgba(60,70,80,${0.18 + (i % 2) * 0.1})`);
      g2.addColorStop(1, "rgba(60,70,80,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, cy - 20, w, 50);
    }
  }
}

function palmTree(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, h * 0.035);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + h * 0.12, base - h * 0.5, x + h * 0.05, base - h);
  ctx.stroke();
  const tx = x + h * 0.05;
  const ty = base - h;
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI + (i / 7) * Math.PI + (i % 2 ? 0.15 : -0.1);
    const len = h * (0.32 + (i % 3) * 0.05);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - h * 0.05, tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.4 + h * 0.08);
    ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.5, ty + Math.sin(a) * len * 0.3, tx, ty + 2);
    ctx.fill();
  }
}

/** A rounded, layered canopy (mango / neem tree). */
export function canopyTree(ctx: CanvasRenderingContext2D, rng: Rng, x: number, base: number, size: number, dark = false) {
  const trunk = ctx.createLinearGradient(x - size * 0.06, 0, x + size * 0.06, 0);
  trunk.addColorStop(0, "#3d2a1c");
  trunk.addColorStop(1, "#5e4330");
  ctx.fillStyle = trunk;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.07, base);
  ctx.lineTo(x - size * 0.035, base - size * 0.55);
  ctx.lineTo(x + size * 0.035, base - size * 0.55);
  ctx.lineTo(x + size * 0.08, base);
  ctx.closePath();
  ctx.fill();
  const greens = dark ? ["#163b22", "#1e4a2b", "#265a33"] : ["#1f5a2e", "#2b7039", "#3a8645", "#4f9a50"];
  const cx = x;
  const cy = base - size * 0.72;
  for (let layer = 0; layer < greens.length; layer++) {
    ctx.fillStyle = greens[layer] ?? "#2b7039";
    const n = 9 - layer;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = size * (0.22 - layer * 0.03) * rng();
      const bx = cx + Math.cos(a) * r * 1.5 - layer * size * 0.03;
      const by = cy + Math.sin(a) * r * 0.8 - layer * size * 0.04;
      ctx.beginPath();
      ctx.arc(bx, by, size * (0.2 - layer * 0.025) * (0.7 + rng() * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Leaf speckle highlights
  ctx.fillStyle = "rgba(170,210,120,0.22)";
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * size * 0.32;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 1.3 - size * 0.06, cy + Math.sin(a) * r * 0.7 - size * 0.08, size * 0.012 + rng() * size * 0.01, 0, Math.PI * 2);
    ctx.fill();
  }
}

function distantTreeline(ctx: CanvasRenderingContext2D, rng: Rng, w: number, horizon: number, arena: Arena) {
  const col = arena === "rainy" ? "#4a5a50" : "#5b7f5a";
  const far = mix(col, PALETTES[arena].skyBottom, 0.45);
  ctx.fillStyle = far;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 12) {
    ctx.lineTo(x, horizon - 10 - Math.sin(x * 0.013) * 6 - rng() * 8);
  }
  ctx.lineTo(w, horizon);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    palmTree(ctx, rng() * w, horizon - 4, 34 + rng() * 26, mix(col, PALETTES[arena].skyBottom, 0.35));
  }
}

function corrugatedRoof(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, rng: Rng) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, mix(base, "#ffffff", 0.15));
  g.addColorStop(1, mix(base, "#000000", 0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x + h * 0.6, y);
  ctx.lineTo(x + w - h * 0.6, y);
  ctx.lineTo(x + w + 6, y + h);
  ctx.lineTo(x - 6, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  const step = Math.max(3, w / 140);
  for (let sx = x - 6; sx < x + w + 6; sx += step) {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(sx, y, step * 0.45, h);
  }
  // Rust streaks
  blotches(ctx, rng, x, y, w, h, Math.floor(w / 25), "#6b2e12", [h * 0.3, h * 0.9], [0.12, 0.3]);
  ctx.restore();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x - 6, y + h, w + 12, Math.max(2, h * 0.12));
}

function schoolBlock(ctx: CanvasRenderingContext2D, rng: Rng, x: number, base: number, w: number, h: number, font: string) {
  const roofH = h * 0.24;
  const wallTop = base - h + roofH;
  const wallH = base - wallTop;
  // Wall
  const wall = ctx.createLinearGradient(0, wallTop, 0, base);
  wall.addColorStop(0, "#f1e6c8");
  wall.addColorStop(1, "#e2d1a8");
  ctx.fillStyle = wall;
  ctx.fillRect(x, wallTop, w, wallH);
  // Painted lower band (two-tone school paint)
  const bandH = wallH * 0.32;
  ctx.fillStyle = "#2f6e48";
  ctx.fillRect(x, base - bandH, w, bandH);
  grain(ctx, rng, x, wallTop, w, wallH, 0.02, ["#8b7a5a", "#ffffff", "#5a4c34"]);
  blotches(ctx, rng, x, base - bandH * 1.6, w, bandH * 1.6, Math.floor(w / 20), "#5b3a20", [8, 22], [0.05, 0.15]);
  // Verandah shade and pillars
  const verandahH = wallH * 0.08;
  ctx.fillStyle = "rgba(40,25,15,0.28)";
  ctx.fillRect(x, wallTop, w, verandahH);
  const bays = Math.max(3, Math.round(w / 70));
  const bayW = w / bays;
  for (let i = 0; i < bays; i++) {
    const bx = x + i * bayW;
    const isDoor = i % 3 === 1;
    if (isDoor) {
      const dw = bayW * 0.38;
      const dx = bx + (bayW - dw) / 2;
      const dTop = wallTop + wallH * 0.22;
      ctx.fillStyle = "#24557a";
      ctx.fillRect(dx, dTop, dw, base - dTop);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(dx + dw * 0.48, dTop, dw * 0.04, base - dTop);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 2, dTop + 2, dw - 4, (base - dTop) * 0.4);
    } else {
      // Louvre window: grey frame, slanted glass blades
      const ww = bayW * 0.6;
      const wx = bx + (bayW - ww) / 2;
      const wy = wallTop + wallH * 0.24;
      const wh = wallH * 0.36;
      ctx.fillStyle = "#3a4a52";
      ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      const glass = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      glass.addColorStop(0, "#9cc3d3");
      glass.addColorStop(1, "#4f7787");
      ctx.fillStyle = glass;
      ctx.fillRect(wx, wy, ww, wh);
      const blades = 7;
      for (let b = 0; b < blades; b++) {
        const by = wy + (b / blades) * wh;
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.fillRect(wx, by, ww, 1);
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(wx, by + wh / blades - 1.5, ww, 1.5);
      }
      ctx.fillStyle = "#3a4a52";
      ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
    }
    // Pillar
    ctx.fillStyle = "#e9dcb8";
    ctx.fillRect(bx - 3, wallTop, 6, wallH);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(bx + 1, wallTop, 2, wallH);
    ctx.fillStyle = "#2f6e48";
    ctx.fillRect(bx - 3, base - bandH, 6, bandH);
  }
  corrugatedRoof(ctx, x - 4, base - h, w + 8, roofH, "#8a5a3c", rng);
  // Painted sign board
  const sw = Math.min(w * 0.42, 220);
  const sh = roofH * 0.62;
  const sx = x + w / 2 - sw / 2;
  const sy = wallTop + 3;
  ctx.fillStyle = "#f5f0e1";
  ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = "#1f4d34";
  ctx.lineWidth = 2;
  ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
  ctx.fillStyle = "#1f4d34";
  ctx.font = `800 ${Math.round(sh * 0.48)}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("L.G.E.A. PRIMARY SCHOOL", sx + sw / 2, sy + sh / 2 + 1, sw - 10);
}

function flagpole(ctx: CanvasRenderingContext2D, x: number, base: number, h: number) {
  ctx.fillStyle = "#c8ccd0";
  ctx.fillRect(x - 1.5, base - h, 3, h);
  ctx.fillStyle = "#9da3a8";
  ctx.fillRect(x + 0.5, base - h, 1, h);
  const fw = h * 0.36;
  const fh = h * 0.2;
  const fy = base - h + 3;
  // Nigerian flag: green-white-green vertical bands, with a gentle wave.
  const bands = ["#008751", "#ffffff", "#008751"];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = bands[i] ?? "#fff";
    ctx.beginPath();
    const x0 = x + 1.5 + (fw / 3) * i;
    const x1 = x0 + fw / 3 + 0.5;
    const wave = (t: number) => Math.sin(t * 0.09) * 2.5;
    ctx.moveTo(x0, fy + wave(x0 - x));
    ctx.lineTo(x1, fy + wave(x1 - x));
    ctx.lineTo(x1, fy + fh + wave(x1 - x));
    ctx.lineTo(x0, fy + fh + wave(x0 - x));
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(x + 1.5 + fw * 0.6, fy, fw * 0.15, fh + 2);
}

function compoundWall(ctx: CanvasRenderingContext2D, rng: Rng, w: number, base: number, h: number) {
  // House roof and water tank peeking over the fence
  corrugatedRoof(ctx, w * 0.05, base - h * 1.9, w * 0.42, h * 0.5, "#7d5a42", rng);
  ctx.fillStyle = "#eadfc7";
  ctx.fillRect(w * 0.07, base - h * 1.4, w * 0.38, h * 0.5);
  // Water tank on a steel stand
  const tx = w * 0.72;
  const tw = Math.min(70, w * 0.12);
  const ty = base - h * 2.15;
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx + 4, ty + tw * 1.05);
  ctx.lineTo(tx + 2, base - h);
  ctx.moveTo(tx + tw - 4, ty + tw * 1.05);
  ctx.lineTo(tx + tw - 2, base - h);
  ctx.stroke();
  const tank = ctx.createLinearGradient(tx, 0, tx + tw, 0);
  tank.addColorStop(0, "#2a2a2a");
  tank.addColorStop(0.35, "#4a4a4a");
  tank.addColorStop(1, "#151515");
  ctx.fillStyle = tank;
  ctx.beginPath();
  ctx.moveTo(tx, ty + tw * 0.2);
  ctx.quadraticCurveTo(tx + tw / 2, ty - tw * 0.08, tx + tw, ty + tw * 0.2);
  ctx.lineTo(tx + tw, ty + tw * 1.05);
  ctx.quadraticCurveTo(tx + tw / 2, ty + tw * 1.15, tx, ty + tw * 1.05);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(tx, ty + tw * 0.2 + i * tw * 0.17);
    ctx.quadraticCurveTo(tx + tw / 2, ty + tw * 0.28 + i * tw * 0.17, tx + tw, ty + tw * 0.2 + i * tw * 0.17);
    ctx.stroke();
  }
  // Fence wall
  const wallTop = base - h;
  const wall = ctx.createLinearGradient(0, wallTop, 0, base);
  wall.addColorStop(0, "#e8dcc2");
  wall.addColorStop(0.7, "#d8c7a2");
  wall.addColorStop(1, "#a8916a");
  ctx.fillStyle = wall;
  ctx.fillRect(0, wallTop, w, h);
  grain(ctx, rng, 0, wallTop, w, h, 0.03, ["#7b6a4c", "#fff6e0", "#5c4d34"]);
  blotches(ctx, rng, 0, base - h * 0.5, w, h * 0.5, Math.floor(w / 18), "#4a3520", [10, 26], [0.06, 0.16]);
  // Block lines
  ctx.strokeStyle = "rgba(90,70,40,0.12)";
  ctx.lineWidth = 1;
  const rowH = h / 6;
  for (let r = 1; r < 6; r++) {
    ctx.beginPath();
    ctx.moveTo(0, wallTop + r * rowH);
    ctx.lineTo(w, wallTop + r * rowH);
    ctx.stroke();
    for (let c = (r % 2) * 22; c < w; c += 44) {
      ctx.beginPath();
      ctx.moveTo(c, wallTop + r * rowH);
      ctx.lineTo(c, wallTop + (r - 1) * rowH);
      ctx.stroke();
    }
  }
  // Coping
  ctx.fillStyle = "#f3ead6";
  ctx.fillRect(0, wallTop - 5, w, 6);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, wallTop + 1, w, 2);
  // Black steel gate
  const gw = Math.min(150, w * 0.28);
  const gx = w * 0.5 - gw / 2;
  const gTop = wallTop - h * 0.12;
  ctx.fillStyle = "#1c1f22";
  ctx.fillRect(gx - 6, gTop - 6, 8, base - gTop + 6);
  ctx.fillRect(gx + gw - 2, gTop - 6, 8, base - gTop + 6);
  const gate = ctx.createLinearGradient(gx, 0, gx + gw, 0);
  gate.addColorStop(0, "#2a2f33");
  gate.addColorStop(0.5, "#3a4045");
  gate.addColorStop(1, "#22272a");
  ctx.fillStyle = gate;
  ctx.fillRect(gx, gTop, gw, base - gTop);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let bx = gx + 6; bx < gx + gw; bx += 9) ctx.fillRect(bx, gTop + 4, 1.5, base - gTop - 8);
  ctx.fillStyle = "#15181a";
  ctx.fillRect(gx + gw / 2 - 1.5, gTop, 3, base - gTop);
  ctx.fillRect(gx, gTop + (base - gTop) * 0.45, gw, 3);
  // Clothesline with ankara wrappers
  ctx.strokeStyle = "rgba(40,40,40,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.04, wallTop - h * 0.55);
  ctx.quadraticCurveTo(w * 0.2, wallTop - h * 0.42, w * 0.36, wallTop - h * 0.55);
  ctx.stroke();
  const prints = [
    ["#d9472b", "#f2b631"],
    ["#1f6fb2", "#f6efe0"],
    ["#7a2f8f", "#f2b631"],
  ];
  prints.forEach(([a, b], i) => {
    const cx = w * (0.08 + i * 0.1);
    const cy = wallTop - h * 0.5 + Math.sin(i) * 2;
    const cw = w * 0.07;
    const ch = h * 0.42;
    ctx.fillStyle = a ?? "#d9472b";
    ctx.fillRect(cx, cy, cw, ch);
    ctx.fillStyle = b ?? "#f2b631";
    for (let py = cy + 4; py < cy + ch; py += 9) {
      for (let px = cx + 4 + ((py / 9) % 2) * 4; px < cx + cw - 2; px += 9) {
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

export function paintGround(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, horizon: number, arena: Arena) {
  const p = PALETTES[arena];
  const g = ctx.createLinearGradient(0, horizon, 0, h);
  g.addColorStop(0, p.groundFar);
  g.addColorStop(1, p.ground);
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon, w, h - horizon);
  blotches(ctx, rng, 0, horizon, w, h - horizon, Math.floor((w * (h - horizon)) / 2500), mix(p.ground, "#000000", 0.4), [20, 60], [0.05, 0.14]);
  blotches(ctx, rng, 0, horizon, w, h - horizon, Math.floor((w * (h - horizon)) / 4000), mix(p.ground, "#ffffff", 0.35), [20, 50], [0.04, 0.1]);
  // Grain gets coarser toward the camera for depth.
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = horizon + ((h - horizon) * i) / bands;
    const bh = (h - horizon) / bands;
    const s = 0.5 + i * 0.35;
    grain(ctx, rng, 0, y0, w, bh, 0.05, p.grainColors, [s, s * 2.2]);
  }
  // Pebbles
  for (let i = 0; i < (w * (h - horizon)) / 3000; i++) {
    const py = horizon + Math.pow(rng(), 0.7) * (h - horizon);
    const depth = (py - horizon) / (h - horizon);
    const px = rng() * w;
    const r = 0.8 + depth * 2.8 * rng();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(px + r * 0.4, py + r * 0.4, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mix(p.groundFar, "#ffffff", 0.3 + rng() * 0.3);
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (arena === "compound") {
    // Cement cracks
    ctx.strokeStyle = "rgba(40,36,30,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      let cx = rng() * w;
      let cy = horizon + rng() * (h - horizon);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let s = 0; s < 8; s++) {
        cx += (rng() - 0.5) * 40;
        cy += (rng() - 0.3) * 20;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
  }
  if (arena === "rainy") {
    // Puddles reflecting the sky
    for (let i = 0; i < 6; i++) {
      const py = horizon + (0.2 + rng() * 0.75) * (h - horizon);
      const depth = (py - horizon) / (h - horizon);
      const px = rng() * w;
      const rx = (30 + rng() * 60) * (0.4 + depth);
      const ry = rx * (0.12 + depth * 0.12);
      const pg = ctx.createLinearGradient(0, py - ry, 0, py + ry);
      pg.addColorStop(0, "rgba(160,172,178,0.75)");
      pg.addColorStop(1, "rgba(90,100,108,0.75)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // Atmospheric haze at the horizon
  const haze = ctx.createLinearGradient(0, horizon - 10, 0, horizon + (h - horizon) * 0.25);
  haze.addColorStop(0, p.haze);
  haze.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - 10, w, (h - horizon) * 0.25 + 10);
}

/** Paints the whole static backdrop (sky, buildings, trees, ground) into a cached layer. */
export function paintBackdrop(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, horizon: number, arena: Arena, font: string) {
  paintSky(ctx, w, horizon, arena);
  distantTreeline(ctx, rng, w, horizon, arena);
  const unit = Math.min(w, h * 1.2);
  if (arena === "compound") {
    compoundWall(ctx, rng, w, horizon + 2, unit * 0.13);
  } else {
    const bw = Math.min(w * 0.82, 760);
    schoolBlock(ctx, rng, w * 0.06, horizon + 2, bw, unit * 0.2, font);
    flagpole(ctx, w * 0.06 + bw + Math.min(40, w * 0.05), horizon + 2, unit * 0.26);
  }
  paintGround(ctx, rng, w, h, horizon, arena);
  canopyTree(ctx, rng, w * (arena === "compound" ? 0.94 : 0.02), horizon + unit * 0.06, unit * 0.42, arena === "rainy");
}

export function rainOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, intensity = 1) {
  ctx.strokeStyle = "rgba(210,225,235,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const count = Math.floor(90 * intensity);
  for (let i = 0; i < count; i++) {
    const seed = i * 97.13;
    const x = ((seed * 13.7 + t * 90) % (w + 40)) - 20;
    const y = ((seed * 7.3 + t * 900) % (h + 40)) - 20;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + 16);
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(40,50,60,0.12)";
  ctx.fillRect(0, 0, w, h);
}
