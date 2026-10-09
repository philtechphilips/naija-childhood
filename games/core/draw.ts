import type { Rng } from "./rng";

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = (t: number) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
export const easeOutBack = (t: number) => {
  const x = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Mixes two #rrggbb colours. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Fills a rect with fine grain so flat colours read as a real surface
 * (laterite soil, cement, painted wall). Draw once into a cached layer.
 */
export function grain(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  density: number,
  colors: string[],
  size: [number, number] = [0.6, 1.8],
) {
  const count = Math.floor(w * h * density);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)] ?? "#000";
    const s = lerp(size[0], size[1], rng());
    ctx.globalAlpha = 0.15 + rng() * 0.35;
    ctx.fillRect(x + rng() * w, y + rng() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

/** Soft blotches for uneven ground, stains and weathering. */
export function blotches(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  color: string,
  radius: [number, number],
  alpha: [number, number] = [0.04, 0.12],
) {
  for (let i = 0; i < count; i++) {
    const cx = x + rng() * w;
    const cy = y + rng() * h;
    const r = lerp(radius[0], radius[1], rng());
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = lerp(alpha[0], alpha[1], rng());
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

/**
 * A hand-drawn chalk stroke: several jittered passes with broken coverage,
 * so lines look dusty rather than vector-perfect.
 */
export function chalkLine(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color = "#f4f1ea",
) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const segs = Math.max(2, Math.floor(len / 6));
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  for (let pass = 0; pass < 3; pass++) {
    ctx.lineWidth = width * (0.55 + rng() * 0.5);
    ctx.globalAlpha = 0.28 + rng() * 0.3;
    ctx.beginPath();
    const jitter = width * 0.35;
    ctx.moveTo(x1 + (rng() - 0.5) * jitter, y1 + (rng() - 0.5) * jitter);
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const px = lerp(x1, x2, t) + (rng() - 0.5) * jitter;
      const py = lerp(y1, y2, t) + (rng() - 0.5) * jitter;
      if (rng() < 0.08) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // Dust specks along the line.
  ctx.fillStyle = color;
  for (let i = 0; i < len / 3; i++) {
    const t = rng();
    ctx.globalAlpha = 0.15 + rng() * 0.25;
    const s = 0.6 + rng() * 1.2;
    ctx.fillRect(lerp(x1, x2, t) + (rng() - 0.5) * width * 1.6, lerp(y1, y2, t) + (rng() - 0.5) * width * 1.6, s, s);
  }
  ctx.globalAlpha = 1;
}

export function chalkText(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  text: string,
  x: number,
  y: number,
  size: number,
  font: string,
  color = "#f4f1ea",
) {
  ctx.font = `700 ${size}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.3 + rng() * 0.25;
    ctx.fillText(text, x + (rng() - 0.5) * 1.5, y + (rng() - 0.5) * 1.5);
  }
  ctx.globalAlpha = 1;
}

export function shadowEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = 0.32) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(20,10,5,${alpha})`);
  g.addColorStop(1, "rgba(20,10,5,0)");
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Bold text with a soft drop shadow and optional outline, for HUD and popups. */
export function hudText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    size: number;
    font: string;
    weight?: number;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    stroke?: string;
    strokeWidth?: number;
    shadow?: boolean;
    alpha?: number;
  },
) {
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.font = `${opts.weight ?? 800} ${opts.size}px ${opts.font}`;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = opts.baseline ?? "middle";
  if (opts.shadow !== false) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = opts.size * 0.25;
    ctx.shadowOffsetY = opts.size * 0.06;
  }
  if (opts.stroke) {
    ctx.lineJoin = "round";
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = opts.strokeWidth ?? opts.size * 0.14;
    ctx.strokeText(text, x, y);
    ctx.shadowColor = "transparent";
  }
  ctx.fillStyle = opts.color ?? "#fff";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A floating text popup that rises and fades. */
export interface Popup {
  text: string;
  x: number;
  y: number;
  color: string;
  age: number;
  life: number;
  size: number;
}

export function updatePopups(popups: Popup[], dt: number) {
  for (const p of popups) p.age += dt;
  for (let i = popups.length - 1; i >= 0; i--) if ((popups[i]?.age ?? 0) >= (popups[i]?.life ?? 0)) popups.splice(i, 1);
}

export function drawPopups(ctx: CanvasRenderingContext2D, popups: Popup[], font: string, reducedMotion: boolean) {
  for (const p of popups) {
    const t = p.age / p.life;
    const scale = reducedMotion ? 1 : easeOutBack(Math.min(1, t * 4));
    const rise = reducedMotion ? 0 : t * 34;
    const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    ctx.save();
    ctx.translate(p.x, p.y - rise);
    ctx.scale(scale, scale);
    hudText(ctx, p.text, 0, 0, { size: p.size, font, color: p.color, stroke: "rgba(0,0,0,0.55)", alpha });
    ctx.restore();
  }
}

/** Light particles (dust puffs, chalk dust, rain splashes). */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  color: string;
  gravity: number;
}

export function updateParticles(ps: Particle[], dt: number) {
  for (const p of ps) {
    p.age += dt;
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = ps.length - 1; i >= 0; i--) if ((ps[i]?.age ?? 0) >= (ps[i]?.life ?? 0)) ps.splice(i, 1);
}

export function drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[]) {
  for (const p of ps) {
    const t = p.age / p.life;
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 + t * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function dustPuff(ps: Particle[], x: number, y: number, scale: number, color = "#c9a27a", count = 10) {
  for (let i = 0; i < count; i++) {
    const a = Math.PI + Math.random() * Math.PI;
    const sp = (20 + Math.random() * 50) * scale;
    ps.push({
      x: x + (Math.random() - 0.5) * 16 * scale,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 0.4,
      life: 0.45 + Math.random() * 0.35,
      age: 0,
      size: (2 + Math.random() * 3) * scale,
      color,
      gravity: 20 * scale,
    });
  }
}
