/**
 * The playable Lagos street block, in metres (x east, z south->north).
 * One layout drives both the 3D scene and the gameplay collision map.
 */
export interface MRect {
  x: number;
  z: number;
  w: number;
  d: number;
}
export interface MCircle {
  x: number;
  z: number;
  r: number;
}

export const WORLD = { w: 70, d: 50 };
export const ROAD = { z0: 20, z1: 29 };
export const GUTTER = 0.7;
export const SIDE_STREET = { x0: 30, x1: 38 };

export interface BuildingSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  /** Which side faces the road: +1 = faces +z (south row), -1 = faces -z (north row). */
  facing: 1 | -1;
  paint: string;
  shops: number;
  roof: "parapet" | "zinc";
  seed: number;
}

export const BUILDINGS: BuildingSpec[] = [
  // North row (faces the road, south-facing)
  { x: 0, z: 33.5, w: 13, d: 11, floors: 2, facing: -1, paint: "#e9dcc0", shops: 3, roof: "parapet", seed: 1 },
  { x: 13.5, z: 33.5, w: 16, d: 11, floors: 3, facing: -1, paint: "#9fc3d6", shops: 4, roof: "parapet", seed: 2 },
  { x: 38.5, z: 33.5, w: 14, d: 11, floors: 2, facing: -1, paint: "#e7c27a", shops: 3, roof: "zinc", seed: 3 },
  { x: 53, z: 33.5, w: 17, d: 11, floors: 2, facing: -1, paint: "#cfe0c2", shops: 4, roof: "parapet", seed: 4 },
  // South row (faces the road across the market)
  { x: 0, z: -6, w: 15, d: 10.5, floors: 2, facing: 1, paint: "#eab7ae", shops: 3, roof: "parapet", seed: 5 },
  { x: 15.5, z: -6, w: 18, d: 10.5, floors: 3, facing: 1, paint: "#e9e2d0", shops: 4, roof: "parapet", seed: 6 },
  { x: 34, z: -6, w: 16, d: 10.5, floors: 2, facing: 1, paint: "#b9d1e3", shops: 3, roof: "zinc", seed: 7 },
  { x: 50.5, z: -6, w: 19.5, d: 10.5, floors: 2, facing: 1, paint: "#f0d58a", shops: 4, roof: "parapet", seed: 8 },
];

/** Decorative buildings beyond the play area so the street keeps going into the haze. */
export const OUTER_BUILDINGS: BuildingSpec[] = [
  { x: -30, z: 33.5, w: 14, d: 11, floors: 2, facing: -1, paint: "#d8c8a6", shops: 3, roof: "zinc", seed: 11 },
  { x: -15.5, z: 33.5, w: 15, d: 11, floors: 3, facing: -1, paint: "#c9dbe0", shops: 3, roof: "parapet", seed: 12 },
  { x: 70.5, z: 33.5, w: 15, d: 11, floors: 2, facing: -1, paint: "#e6d0b3", shops: 3, roof: "parapet", seed: 13 },
  { x: 86, z: 33.5, w: 16, d: 11, floors: 3, facing: -1, paint: "#dfe6cf", shops: 4, roof: "zinc", seed: 14 },
  { x: -30, z: -6, w: 14, d: 10.5, floors: 3, facing: 1, paint: "#e2c1b8", shops: 3, roof: "parapet", seed: 15 },
  { x: -15.5, z: -6, w: 15, d: 10.5, floors: 2, facing: 1, paint: "#d1e0d0", shops: 3, roof: "zinc", seed: 16 },
  { x: 70.5, z: -6, w: 15, d: 10.5, floors: 2, facing: 1, paint: "#ecd9a8", shops: 3, roof: "parapet", seed: 17 },
  { x: 86, z: -6, w: 16, d: 10.5, floors: 2, facing: 1, paint: "#c8d6e6", shops: 3, roof: "parapet", seed: 18 },
];

export interface StallSpec {
  x: number;
  z: number;
  rot: number;
  goods: "tomato" | "pepper" | "orange" | "banana" | "pots" | "basket" | "crates";
  seed: number;
}

export const STALLS: StallSpec[] = [
  { x: 6, z: 9, rot: 0, goods: "tomato", seed: 1 },
  { x: 9, z: 12.5, rot: 0.1, goods: "banana", seed: 2 },
  { x: 14.5, z: 8.5, rot: -0.05, goods: "pepper", seed: 3 },
  { x: 21, z: 12, rot: 0.08, goods: "pots", seed: 4 },
  { x: 25, z: 8, rot: 0, goods: "orange", seed: 5 },
  { x: 42, z: 11.5, rot: -0.1, goods: "basket", seed: 6 },
  { x: 47, z: 8, rot: 0.05, goods: "tomato", seed: 7 },
  { x: 53, z: 12, rot: 0, goods: "crates", seed: 8 },
  { x: 60, z: 9, rot: 0.12, goods: "banana", seed: 9 },
];

export const KIOSKS: MRect[] = [
  { x: 31, z: 6, w: 2.6, d: 2.2 },
  { x: 64.5, z: 6.5, w: 2.6, d: 2.2 },
];

export const VEHICLES: { kind: "danfo" | "keke" | "car"; x: number; z: number; rot: number; seed: number }[] = [
  { kind: "danfo", x: 12, z: 21.4, rot: 0, seed: 1 },
  { kind: "danfo", x: 49, z: 27.6, rot: Math.PI, seed: 2 },
  { kind: "keke", x: 24, z: 21.2, rot: 0.15, seed: 3 },
  { kind: "keke", x: 58.5, z: 27.8, rot: Math.PI - 0.1, seed: 4 },
  { kind: "car", x: 3.5, z: 27.4, rot: Math.PI / 2, seed: 5 },
  { kind: "danfo", x: 64.5, z: 21.3, rot: 0.04, seed: 6 },
];

export const POLES: { x: number; z: number }[] = [
  { x: 2, z: 30.3 },
  { x: 20, z: 30.3 },
  { x: 41, z: 30.3 },
  { x: 60, z: 30.3 },
  { x: 10, z: 18.7 },
  { x: 30, z: 18.7 },
  { x: 50, z: 18.7 },
  { x: 68, z: 18.7 },
  { x: 30.4, z: 47.5 },
];

/** Chalk "jail" square in the side street. */
export const JAIL: MRect = { x: 31.4, z: 39.5, w: 5.2, d: 4.6 };

/** Places to hide: among the market stalls and behind the kiosks. */
export const HIDES: MRect[] = [
  { x: 4.5, z: 9.8, w: 3.4, d: 2 },
  { x: 19.5, z: 12.8, w: 3.4, d: 2 },
  { x: 40.5, z: 12.3, w: 3.4, d: 2 },
  { x: 58.5, z: 9.8, w: 3.4, d: 2 },
  { x: 31, z: 8.3, w: 2.6, d: 1.4 },
];

export const THIEF_SPAWNS = [
  { x: 12, z: 15.2 },
  { x: 4, z: 31.6 },
  { x: 57, z: 15 },
  { x: 64, z: 31.6 },
  { x: 27, z: 15.5 },
];
export const POLICE_SPAWNS = [
  { x: 34, z: 37 },
  { x: 32.5, z: 36 },
  { x: 35.5, z: 36 },
];

/** Gameplay solids (metres). */
export function solidRects(): MRect[] {
  const out: MRect[] = [];
  for (const b of BUILDINGS) out.push({ x: b.x, z: b.z, w: b.w, d: b.d });
  // Side street is closed off by a compound wall at the north edge.
  for (const s of STALLS) out.push({ x: s.x - 1.15, z: s.z - 0.6, w: 2.3, d: 1.2 });
  out.push(...KIOSKS);
  for (const v of VEHICLES) {
    const along = Math.abs(Math.cos(v.rot)) > 0.7;
    const L = v.kind === "danfo" ? 4.8 : v.kind === "car" ? 4.4 : 2.4;
    const W = v.kind === "danfo" ? 2 : v.kind === "car" ? 1.85 : 1.3;
    out.push(along ? { x: v.x - L / 2, z: v.z - W / 2, w: L, d: W } : { x: v.x - W / 2, z: v.z - L / 2, w: W, d: L });
  }
  return out;
}

export function solidCircles(): MCircle[] {
  return POLES.map((p) => ({ x: p.x, z: p.z, r: 0.3 }));
}

/** Sidewalk lanes pedestrians stroll along (x range at fixed z). */
export const WALK_LANES = [
  { z: 31.6, x0: -25, x1: 95 },
  { z: 32.6, x0: -25, x1: 95 },
  { z: 17.4, x0: -25, x1: 95 },
  { z: 18.4, x0: -25, x1: 95 },
];

/** Units per metre for the chase simulation (matches the 2D compound's tuning). */
export const SIM_UNITS = 20;

/** The street as a Police & Thief simulation map, in sim units. */
export function streetSimMap() {
  const U = SIM_UNITS;
  const r = (m: MRect) => ({ x: m.x * U, y: m.z * U, w: m.w * U, h: m.d * U });
  return {
    w: WORLD.w * U,
    h: WORLD.d * U,
    wall: 10,
    solids: solidRects().map(r),
    circles: solidCircles().map((c) => ({ x: c.x * U, y: c.z * U, r: c.r * U })),
    hides: HIDES.map(r),
    jail: r(JAIL),
    thiefSpawns: THIEF_SPAWNS.map((p) => ({ x: p.x * U, y: p.z * U })),
    policeSpawns: POLICE_SPAWNS.map((p) => ({ x: p.x * U, y: p.z * U })),
  };
}
