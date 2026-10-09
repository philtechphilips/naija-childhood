import { blotches, chalkLine, chalkText, grain, mix } from "@/games/core/draw";
import type { Rng } from "@/games/core/rng";
import type { CompoundMap, Rect } from "./map";

/** Top-down corrugated zinc roof with a ridge, eave shadow and rust. */
function roof(ctx: CanvasRenderingContext2D, rng: Rng, b: Rect & { roof: string }) {
  // Cast shadow (sun from the top-left)
  ctx.fillStyle = "rgba(25,12,5,0.35)";
  ctx.fillRect(b.x + 12, b.y + 14, b.w, b.h);
  const horizontal = b.w >= b.h;
  const halves: [Rect, number][] = horizontal
    ? [
        [{ x: b.x, y: b.y, w: b.w, h: b.h / 2 }, 0.14],
        [{ x: b.x, y: b.y + b.h / 2, w: b.w, h: b.h / 2 }, -0.12],
      ]
    : [
        [{ x: b.x, y: b.y, w: b.w / 2, h: b.h }, 0.14],
        [{ x: b.x + b.w / 2, y: b.y, w: b.w / 2, h: b.h }, -0.12],
      ];
  for (const [r, light] of halves) {
    ctx.fillStyle = light > 0 ? mix(b.roof, "#ffffff", light) : mix(b.roof, "#000000", -light);
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();
  // Corrugations run down the slope (perpendicular to the ridge).
  const step = 7;
  if (horizontal) {
    for (let x = b.x; x < b.x + b.w; x += step) {
      ctx.fillStyle = "rgba(0,0,0,0.13)";
      ctx.fillRect(x, b.y, 2.5, b.h);
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(x + 3, b.y, 1.2, b.h);
    }
  } else {
    for (let y = b.y; y < b.y + b.h; y += step) {
      ctx.fillStyle = "rgba(0,0,0,0.13)";
      ctx.fillRect(b.x, y, b.w, 2.5);
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(b.x, y + 3, b.w, 1.2);
    }
  }
  // Sheet overlaps
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(b.x, b.y + (b.h / 4) * i);
      ctx.lineTo(b.x + b.w, b.y + (b.h / 4) * i);
    } else {
      ctx.moveTo(b.x + (b.w / 4) * i, b.y);
      ctx.lineTo(b.x + (b.w / 4) * i, b.y + b.h);
    }
    ctx.stroke();
  }
  blotches(ctx, rng, b.x, b.y, b.w, b.h, Math.floor((b.w * b.h) / 3000), "#5a2208", [10, 34], [0.12, 0.32]);
  ctx.restore();
  // Ridge cap
  ctx.fillStyle = mix(b.roof, "#ffffff", 0.3);
  if (horizontal) ctx.fillRect(b.x, b.y + b.h / 2 - 3, b.w, 6);
  else ctx.fillRect(b.x + b.w / 2 - 3, b.y, 6, b.h);
  ctx.strokeStyle = "rgba(20,10,4,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
}

function blockWall(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.fillStyle = "rgba(25,12,5,0.3)";
  ctx.fillRect(r.x + 6, r.y + 7, r.w, r.h);
  ctx.fillStyle = "#e6dcc4";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "#f5eedd";
  ctx.fillRect(r.x, r.y, r.w, Math.min(r.h, 4));
  ctx.strokeStyle = "rgba(90,70,40,0.35)";
  ctx.lineWidth = 1;
  const along = r.w > r.h;
  for (let i = 0; i < (along ? r.w : r.h); i += 22) {
    ctx.beginPath();
    if (along) {
      ctx.moveTo(r.x + i, r.y);
      ctx.lineTo(r.x + i, r.y + r.h);
    } else {
      ctx.moveTo(r.x, r.y + i);
      ctx.lineTo(r.x + r.w, r.y + i);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(60,45,25,0.5)";
  ctx.strokeRect(r.x, r.y, r.w, r.h);
}

export function treeCanopy(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, size: number) {
  ctx.fillStyle = "rgba(20,30,10,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + size * 0.25, y + size * 0.3, size, size * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  const greens = ["#1d4f29", "#276536", "#327a40", "#43904c", "#5aa457"];
  greens.forEach((col, layer) => {
    ctx.fillStyle = col;
    const n = 10 - layer;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = size * (0.6 - layer * 0.1) * Math.sqrt(rng());
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r - layer * 2, y + Math.sin(a) * r - layer * 2.5, size * (0.42 - layer * 0.05) * (0.7 + rng() * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.fillStyle = "rgba(190,230,140,0.25)";
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * size * 0.7;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r - 6, y + Math.sin(a) * r - 7, 1.5 + rng() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function bush(ctx: CanvasRenderingContext2D, rng: Rng, r: Rect) {
  ctx.fillStyle = "rgba(15,25,8,0.35)";
  ctx.beginPath();
  ctx.ellipse(r.x + r.w / 2 + 6, r.y + r.h / 2 + 7, r.w / 2 + 4, r.h / 2 + 4, 0, 0, Math.PI * 2);
  ctx.fill();
  const greens = ["#24502a", "#2f6434", "#3c7a3e", "#4d8f47"];
  greens.forEach((col, layer) => {
    ctx.fillStyle = col;
    const count = Math.floor((r.w * r.h) / 260);
    for (let i = 0; i < count; i++) {
      const px = r.x + 8 + rng() * (r.w - 16);
      const py = r.y + 8 + rng() * (r.h - 16);
      ctx.beginPath();
      ctx.arc(px - layer, py - layer * 1.5, 7 - layer + rng() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  // Small leaf highlights and a few red hibiscus flowers
  for (let i = 0; i < (r.w * r.h) / 500; i++) {
    ctx.fillStyle = rng() < 0.15 ? "#d9372b" : "rgba(170,215,120,0.45)";
    ctx.beginPath();
    ctx.arc(r.x + 6 + rng() * (r.w - 12), r.y + 6 + rng() * (r.h - 12), 1.6 + rng() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function waterTank(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = "#b9b2a3";
  ctx.fillRect(x - r - 8, y - r - 8, r * 2 + 16, r * 2 + 16);
  ctx.fillStyle = "rgba(25,12,5,0.35)";
  ctx.beginPath();
  ctx.arc(x + 8, y + 10, r, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 2, x, y, r);
  g.addColorStop(0, "#5a5a5a");
  g.addColorStop(1, "#141414");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x, y, r * (i / 4), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

/** Paints the static compound (ground, buildings, field, jail) in world units. */
export function paintMap(ctx: CanvasRenderingContext2D, rng: Rng, m: CompoundMap, font: string) {
  // Laterite ground
  const g = ctx.createLinearGradient(0, 0, m.w, m.h);
  g.addColorStop(0, "#c27447");
  g.addColorStop(1, "#ad5f36");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, m.w, m.h);
  blotches(ctx, rng, 0, 0, m.w, m.h, 260, "#6e2f12", [20, 70], [0.05, 0.14]);
  blotches(ctx, rng, 0, 0, m.w, m.h, 160, "#efc39a", [20, 60], [0.05, 0.12]);
  grain(ctx, rng, 0, 0, m.w, m.h, 0.09, ["#7a3a1e", "#e6a983", "#5c2c16", "#f2cba8"], [0.8, 2.2]);
  // Worn footpaths
  for (const p of m.path) {
    ctx.fillStyle = "rgba(240,200,160,0.18)";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    grain(ctx, rng, p.x, p.y, p.w, p.h, 0.05, ["#f6d8b8", "#8a4a26"], [0.8, 1.6]);
  }
  // Sandy football field with chalk lines
  const f = m.field;
  ctx.fillStyle = "rgba(235,190,140,0.22)";
  ctx.fillRect(f.x - 10, f.y - 10, f.w + 20, f.h + 20);
  const cr = createChalk(rng);
  cr(f.x, f.y, f.x + f.w, f.y);
  cr(f.x + f.w, f.y, f.x + f.w, f.y + f.h);
  cr(f.x + f.w, f.y + f.h, f.x, f.y + f.h);
  cr(f.x, f.y + f.h, f.x, f.y);
  cr(f.x + f.w / 2, f.y, f.x + f.w / 2, f.y + f.h);
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2;
    const a1 = ((i + 1) / 24) * Math.PI * 2;
    cr(cx + Math.cos(a0) * 46, cy + Math.sin(a0) * 46, cx + Math.cos(a1) * 46, cy + Math.sin(a1) * 46);
  }
  // Stick goalposts
  for (const gx of [f.x - 4, f.x + f.w + 4]) {
    ctx.fillStyle = "#5b3a20";
    ctx.beginPath();
    ctx.arc(gx, cy - 34, 4, 0, Math.PI * 2);
    ctx.arc(gx, cy + 34, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Jail: a chalk square, like the real thing.
  const j = m.jail;
  ctx.fillStyle = "rgba(20,10,5,0.12)";
  ctx.fillRect(j.x, j.y, j.w, j.h);
  cr(j.x, j.y, j.x + j.w, j.y, 4);
  cr(j.x + j.w, j.y, j.x + j.w, j.y + j.h, 4);
  cr(j.x + j.w, j.y + j.h, j.x, j.y + j.h, 4);
  cr(j.x, j.y + j.h, j.x, j.y, 4);
  for (let x = j.x + 18; x < j.x + j.w; x += 22) cr(x, j.y + 6, x, j.y + 22, 2.5);
  chalkText(ctx, rng, "JAIL", j.x + j.w / 2, j.y + j.h - 18, 26, font);

  for (const t of m.trees) {
    ctx.fillStyle = "#4a3220";
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
  }
  waterTank(ctx, m.tank.x, m.tank.y, m.tank.r);
  for (const b of m.bushes) bush(ctx, rng, b);
  for (const w of m.lowWalls) blockWall(ctx, w);
  for (const b of m.buildings) roof(ctx, rng, b);
  for (const t of m.trees) treeCanopy(ctx, rng, t.x, t.y, t.r * 3.1);

  // Boundary fence wall
  const wall = m.wall;
  ctx.fillStyle = "rgba(25,12,5,0.3)";
  ctx.fillRect(wall, wall, m.w - wall * 2, 10);
  ctx.fillRect(wall, wall, 10, m.h - wall * 2);
  ctx.fillStyle = "#ddd2b8";
  ctx.fillRect(0, 0, m.w, wall);
  ctx.fillRect(0, m.h - wall, m.w, wall);
  ctx.fillRect(0, 0, wall, m.h);
  ctx.fillRect(m.w - wall, 0, wall, m.h);
  ctx.fillStyle = "#f2ead8";
  ctx.fillRect(0, 0, m.w, 6);
  ctx.fillRect(0, 0, 6, m.h);
  grain(ctx, rng, 0, 0, m.w, wall, 0.08, ["#8b7a5a", "#5c4d34"]);
  grain(ctx, rng, 0, m.h - wall, m.w, wall, 0.08, ["#8b7a5a", "#5c4d34"]);
  // Black steel gate on the bottom wall
  ctx.fillStyle = "#23272a";
  ctx.fillRect(m.w / 2 - 70, m.h - wall, 140, wall);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let x = m.w / 2 - 66; x < m.w / 2 + 70; x += 8) ctx.fillRect(x, m.h - wall + 3, 2, wall - 6);

  function createChalk(r: Rng) {
    return (x1: number, y1: number, x2: number, y2: number, w = 3) => chalkLine(ctx, r, x1, y1, x2, y2, w);
  }
}

export interface TopLook {
  shirt: string;
  skin: string;
  hair: string;
  police: boolean;
  spiky: boolean;
}

/** Top-down kid: shoulders, swinging arms, head and hair/beret. Facing angle 0 = right. */
export function drawTopKid(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, walk: number, look: TopLook, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(20,8,2,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 5, 14, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(facing);
  const swing = Math.sin(walk) * 6;
  // Arms
  for (const side of [-1, 1]) {
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.ellipse(swing * side, side * 13, 5, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Body (shoulders across the facing direction)
  const body = ctx.createLinearGradient(-6, -12, 6, 12);
  body.addColorStop(0, mix(look.shirt, "#ffffff", 0.22));
  body.addColorStop(1, mix(look.shirt, "#000000", 0.25));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Head
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(1.5, 0, 7.2, 0, Math.PI * 2);
  ctx.fill();
  if (look.police) {
    // Black beret with a gold badge
    ctx.fillStyle = "#15171c";
    ctx.beginPath();
    ctx.ellipse(-0.5, -0.8, 7.6, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8b23a";
    ctx.beginPath();
    ctx.arc(4.2, -3.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(0, 0, 6.6, 0, Math.PI * 2);
    ctx.fill();
    if (look.spiky) {
      ctx.strokeStyle = look.hair;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
        ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(-1.5, -2, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
