/** School-compound map for Police & Thief, in world units (1 unit ≈ 1 CSS px at zoom 1). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Building extends Rect {
  kind: "classroom" | "staff" | "toilet";
  roof: string;
}

export interface CompoundMap {
  w: number;
  h: number;
  wall: number;
  buildings: Building[];
  lowWalls: Rect[];
  trees: Circle[];
  tank: Circle;
  bushes: Rect[];
  jail: Rect;
  field: Rect;
  path: Rect[];
  thiefSpawns: { x: number; y: number }[];
  policeSpawns: { x: number; y: number }[];
}

export const MAP: CompoundMap = {
  w: 1400,
  h: 1000,
  wall: 24,
  buildings: [
    { kind: "classroom", x: 110, y: 96, w: 420, h: 128, roof: "#8a5a3c" },
    { kind: "classroom", x: 870, y: 96, w: 410, h: 128, roof: "#7d6a58" },
    { kind: "staff", x: 1050, y: 640, w: 230, h: 150, roof: "#6f4a34" },
    { kind: "toilet", x: 96, y: 760, w: 150, h: 110, roof: "#8f7660" },
  ],
  lowWalls: [
    { x: 470, y: 420, w: 20, h: 170 },
    { x: 900, y: 560, w: 170, h: 20 },
    { x: 300, y: 330, w: 140, h: 18 },
  ],
  trees: [
    { x: 360, y: 520, r: 20 },
    { x: 1000, y: 430, r: 20 },
    { x: 420, y: 860, r: 20 },
    { x: 1200, y: 330, r: 18 },
  ],
  tank: { x: 690, y: 150, r: 34 },
  bushes: [
    { x: 250, y: 610, w: 120, h: 72 },
    { x: 760, y: 360, w: 128, h: 70 },
    { x: 880, y: 830, w: 140, h: 74 },
    { x: 1150, y: 450, w: 110, h: 76 },
    { x: 560, y: 250, w: 100, h: 60 },
  ],
  jail: { x: 610, y: 770, w: 170, h: 130 },
  field: { x: 560, y: 380, w: 300, h: 260 },
  path: [
    { x: 110, y: 236, w: 1170, h: 46 },
    { x: 660, y: 282, w: 46, h: 488 },
  ],
  thiefSpawns: [
    { x: 160, y: 330 },
    { x: 220, y: 420 },
    { x: 1260, y: 300 },
    { x: 600, y: 320 },
    { x: 1250, y: 880 },
  ],
  policeSpawns: [
    { x: 700, y: 720 },
    { x: 640, y: 700 },
    { x: 760, y: 700 },
  ],
};

export const ACTOR_RADIUS = 14;

/** What the simulation needs from any map (2D compound or 3D street), in sim units. */
export interface SimMap {
  w: number;
  h: number;
  wall: number;
  solids: Rect[];
  circles: Circle[];
  hides: Rect[];
  jail: Rect;
  thiefSpawns: { x: number; y: number }[];
  policeSpawns: { x: number; y: number }[];
}

export function compoundSimMap(m: CompoundMap): SimMap {
  return {
    w: m.w,
    h: m.h,
    wall: m.wall,
    solids: [...m.buildings, ...m.lowWalls],
    circles: [...m.trees, m.tank],
    hides: m.bushes,
    jail: m.jail,
    thiefSpawns: m.thiefSpawns,
    policeSpawns: m.policeSpawns,
  };
}

export const SIM_MAP = compoundSimMap(MAP);

export function inRect(x: number, y: number, r: Rect, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/** Pushes a circle out of every solid shape and the boundary wall. */
export function resolveCollisions(m: SimMap, p: { x: number; y: number }, radius: number) {
  const min = m.wall + radius;
  p.x = Math.max(min, Math.min(m.w - min, p.x));
  p.y = Math.max(min, Math.min(m.h - min, p.y));
  for (const r of m.solids) {
    const cx = Math.max(r.x, Math.min(p.x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * radius;
        p.y = cy + (dy / d) * radius;
      } else {
        // Centre inside the rect: push out along the shallowest axis.
        const left = p.x - r.x;
        const right = r.x + r.w - p.x;
        const top = p.y - r.y;
        const bottom = r.y + r.h - p.y;
        const m2 = Math.min(left, right, top, bottom);
        if (m2 === left) p.x = r.x - radius;
        else if (m2 === right) p.x = r.x + r.w + radius;
        else if (m2 === top) p.y = r.y - radius;
        else p.y = r.y + r.h + radius;
      }
    }
  }
  for (const c of m.circles) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d = Math.hypot(dx, dy);
    const minD = c.r + radius;
    if (d < minD && d > 1e-6) {
      p.x = c.x + (dx / d) * minD;
      p.y = c.y + (dy / d) * minD;
    }
  }
}

/** Coarse walkability grid + A* for the AI. */
export class NavGrid {
  readonly cell = 20;
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;

  constructor(private m: SimMap, clearance = ACTOR_RADIUS + 2) {
    this.cols = Math.ceil(m.w / this.cell);
    this.rows = Math.ceil(m.h / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = (c + 0.5) * this.cell;
        const y = (r + 0.5) * this.cell;
        let b = x < m.wall + clearance || y < m.wall + clearance || x > m.w - m.wall - clearance || y > m.h - m.wall - clearance;
        if (!b) b = m.solids.some((rect) => inRect(x, y, rect, clearance));
        if (!b) b = m.circles.some((ci) => Math.hypot(x - ci.x, y - ci.y) < ci.r + clearance);
        this.blocked[r * this.cols + c] = b ? 1 : 0;
      }
    }
  }

  isBlockedAt(x: number, y: number): boolean {
    const c = Math.floor(x / this.cell);
    const r = Math.floor(y / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  }

  /** Straight walk check along a segment (sampled every half cell). */
  clearLine(x1: number, y1: number, x2: number, y2: number): boolean {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / (this.cell / 2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.isBlockedAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  }

  nearestOpen(x: number, y: number): { c: number; r: number } | null {
    const c0 = Math.floor(x / this.cell);
    const r0 = Math.floor(y / this.cell);
    for (let rad = 0; rad < 8; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          if (this.blocked[r * this.cols + c] === 0) return { c, r };
        }
      }
    }
    return null;
  }

  randomOpenPoint(rng: () => number): { x: number; y: number } {
    for (let i = 0; i < 200; i++) {
      const c = Math.floor(rng() * this.cols);
      const r = Math.floor(rng() * this.rows);
      if (this.blocked[r * this.cols + c] === 0) return { x: (c + 0.5) * this.cell, y: (r + 0.5) * this.cell };
    }
    return { x: this.m.w / 2, y: this.m.h / 2 };
  }

  /** A* with 8-way moves and no corner cutting. Returns world-space waypoints. */
  findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
    const start = this.nearestOpen(sx, sy);
    const goal = this.nearestOpen(tx, ty);
    if (!start || !goal) return [];
    const { cols, rows, blocked } = this;
    const idx = (c: number, r: number) => r * cols + c;
    const startI = idx(start.c, start.r);
    const goalI = idx(goal.c, goal.r);
    const g = new Float32Array(cols * rows).fill(Infinity);
    const came = new Int32Array(cols * rows).fill(-1);
    const closed = new Uint8Array(cols * rows);
    const open: { i: number; f: number }[] = [{ i: startI, f: 0 }];
    g[startI] = 0;
    const h = (i: number) => {
      const dc = Math.abs((i % cols) - goal.c);
      const dr = Math.abs(Math.floor(i / cols) - goal.r);
      return Math.max(dc, dr) + 0.414 * Math.min(dc, dr);
    };
    let iterations = 0;
    while (open.length > 0 && iterations++ < 4000) {
      // Small open lists: a linear scan is cheaper than maintaining a heap.
      let best = 0;
      for (let k = 1; k < open.length; k++) if ((open[k]?.f ?? Infinity) < (open[best]?.f ?? Infinity)) best = k;
      const cur = open.splice(best, 1)[0];
      if (!cur) break;
      if (cur.i === goalI) break;
      if (closed[cur.i]) continue;
      closed[cur.i] = 1;
      const c = cur.i % cols;
      const r = Math.floor(cur.i / cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const ni = idx(nc, nr);
          if (blocked[ni] || closed[ni]) continue;
          if (dc && dr && (blocked[idx(c + dc, r)] || blocked[idx(c, r + dr)])) continue;
          const cost = (g[cur.i] ?? 0) + (dc && dr ? 1.414 : 1);
          if (cost < (g[ni] ?? Infinity)) {
            g[ni] = cost;
            came[ni] = cur.i;
            open.push({ i: ni, f: cost + h(ni) });
          }
        }
      }
    }
    if (came[goalI] === -1 && goalI !== startI) return [];
    const out: { x: number; y: number }[] = [];
    let i = goalI;
    while (i !== -1 && i !== startI) {
      out.push({ x: ((i % cols) + 0.5) * this.cell, y: (Math.floor(i / cols) + 0.5) * this.cell });
      i = came[i] ?? -1;
    }
    out.reverse();
    if (out.length > 0) out[out.length - 1] = { x: tx, y: ty };
    return out;
  }
}
