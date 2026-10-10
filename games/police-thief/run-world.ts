import * as THREE from "three";
import { createRng, pick } from "@/games/core/rng";
import { pbrMaterial, instantiateProp } from "@/games/core3d/assets";
import { addMesh, building } from "@/games/core3d/street";
import { Character } from "@/games/core3d/character";
import { MAT, billboard, boxWorldUV, cable, danfo, electricPole, headTray, keke, litter, planeWorldUV, produceHeap, stallTable, umbrella } from "@/games/core3d/procedural";
import { OBSTACLES, laneX, type ObstacleKind } from "./run-rules";
import { mergeStatic } from "@/games/core3d/merge";

/**
 * The endless Lagos road for the street run: identical-length segments of
 * road, gutters, sidewalks and shophouses that leapfrog ahead of the runner,
 * plus the obstacle models (danfos, kekes, okadas, police barriers, hawker
 * tables, fallen NEPA poles, owambe banners, potholes...).
 *
 * World axes: the runner heads towards -z; track metre `z` sits at world -z.
 */
export const SEG = 32;
const ROAD_HALF = 3.6;
const GUTTER_W = 0.7;
const WALK_W = 4.2;
const FACADE_X = ROAD_HALF + GUTTER_W + WALK_W;
const PAINTS = ["#e2d6bd", "#c9d6dc", "#e8c9a0", "#d3dcc5", "#e9e4da", "#d9b9ad", "#f0dca8", "#bcd3c2", "#e7c3b5"];

export interface Walker {
  c: Character;
  /** m/s along the sidewalk, signed (+ = towards the runner's camera). */
  v: number;
}

export interface Segment {
  root: THREE.Group;
  people: Character[];
  walkers: Walker[];
  /** Sidewalk hawkers who call out their goods. */
  hawkers: Character[];
  index: number;
}

/** What the sidewalk hawkers shout. */
export const HAWKER_CALLS = [
  "Pure water! Pure water!",
  "Agege bread dey!",
  "Fine orange, sweet orange!",
  "Plantain chips!",
  "Buy gala! Buy gala!",
  "Recharge card dey!",
  "Groundnut! Groundnut!",
  "Cold minerals!",
  "Puff-puff hot hot!",
];

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  return {
    road: pbrMaterial("road_damaged", { normalScale: 1 }),
    paving: pbrMaterial("patterned_paving_02", { tint: "#d9cfc2" }),
    concrete: pbrMaterial("dirty_concrete"),
    dash: new THREE.MeshStandardMaterial({ color: 0xe9e4d4, roughness: 0.9, transparent: true, opacity: 0.55 }),
    trench: new THREE.MeshStandardMaterial({ color: 0x1d1b16, roughness: 1 }),
  };
}

/** Which Lagos landmark (if any) a slice of road shows. */
type Landmark = "theatre" | "lagoon" | "linkBridge" | "gantry" | "footbridge" | null;
const LANDMARKS: Landmark[] = [null, "gantry", "theatre", "lagoon", "footbridge", "linkBridge", null];

function lagoonView(root: THREE.Group, side: 1 | -1) {
  // Low wall and railing, then the lagoon all the way out.
  const wall = new THREE.Mesh(boxWorldUV(0.3, 0.9, SEG, 1.5), mats!.concrete);
  wall.position.set(side * FACADE_X, 0.45, -SEG / 2);
  root.add(wall);
  for (let z = 1; z < SEG; z += 2) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6), MAT.ironBlack);
    post.position.set(side * FACADE_X, 1.2, -z);
    root.add(post);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, SEG), MAT.ironBlack);
  rail.position.set(side * FACADE_X, 1.5, -SEG / 2);
  root.add(rail);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, SEG + 0.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3d5a5e, roughness: 0.12, metalness: 0.4, envMapIntensity: 1.2 }));
  water.position.set(side * (FACADE_X + 200.5), -0.9, -SEG / 2);
  root.add(water);
}

/** National Theatre, Iganmu: the drum with the pleated "military cap" roof. */
function nationalTheatre() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.8 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(26, 27, 9, 48), white);
  drum.position.y = 4.5;
  g.add(drum);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(26.2, 26.2, 2.2, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.3, metalness: 0.4 }));
  band.position.y = 6.5;
  g.add(band);
  // Pleated roof: a squat cone with alternating ridge heights, flat-shaded.
  const cap = new THREE.ConeGeometry(31, 10, 32, 1, false);
  const pos = cap.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = Math.round(((a + Math.PI) / (Math.PI * 2)) * 32) % 2;
      pos.setY(i, y + (k ? 1.6 : -0.6));
    }
  }
  cap.computeVertexNormals();
  const roof = new THREE.Mesh(cap, new THREE.MeshStandardMaterial({ color: 0xe8e5de, roughness: 0.7, flatShading: true }));
  roof.position.y = 9 + 5;
  g.add(roof);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 2.5, 24), white);
  crown.position.y = 19.5;
  g.add(crown);
  return g;
}

/** Lekki-Ikoyi Link Bridge: one tall pylon, a fan of stay cables, a long deck over the lagoon. */
function linkBridge() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 340), white);
  deck.position.y = 9;
  g.add(deck);
  for (let z = -160; z <= 160; z += 40) {
    if (Math.abs(z) < 10) continue;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 3), white);
    pier.position.set(0, 4.5, z);
    g.add(pier);
  }
  // Inverted-Y pylon
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2, 50, 2), white);
    leg.position.set(s * 4, 25, 0);
    leg.rotation.z = -s * 0.08;
    g.add(leg);
  }
  const mast = new THREE.Mesh(new THREE.BoxGeometry(2.2, 34, 2.2), white);
  mast.position.y = 66;
  g.add(mast);
  const cableMat = new THREE.LineBasicMaterial({ color: 0xf4f4f0 });
  const pts: THREE.Vector3[] = [];
  for (let k = 1; k <= 12; k++) {
    for (const dir of [-1, 1]) {
      pts.push(new THREE.Vector3(0, 52 + k * 2.4, 0), new THREE.Vector3(0, 9.8, dir * k * 12));
    }
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
  return g;
}

/** Green overhead direction sign spanning the road. */
function gantry(index: number) {
  const g = new THREE.Group();
  const posts = new THREE.MeshStandardMaterial({ color: 0x8c9094, roughness: 0.4, metalness: 0.7 });
  for (const x of [-(ROAD_HALF + 0.45), ROAD_HALF + 0.45]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6.6), posts);
    p.position.set(x, 3.3, 0);
    p.castShadow = true;
    g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 1.4, 0.3, 0.3), posts);
  beam.position.y = 6.4;
  g.add(beam);
  const sets = [
    ["OSHODI ↑", "IKEJA ↗", "APAPA →"],
    ["CMS ↑", "OBALENDE ↗", "V/ISLAND →"],
    ["LEKKI ↑", "AJAH ↑", "IKOYI ←"],
  ];
  const lines = sets[index % sets.length]!;
  lines.forEach((t, i) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.3), signMat([t, ["Expressway", "Under bridge", "Bus stop"][i]!], "#0d6b3a", "#fff", 512, 290));
    panel.position.set(-2.4 + i * 2.4, 5.6, 0.18);
    g.add(panel);
  });
  return g;
}

/** Steel pedestrian bridge over the road, wearing the Lagos slogan. */
function footbridge() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x6f7a80, roughness: 0.5, metalness: 0.6 });
  const span = FACADE_X * 2 - 1;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 0.35, 2.4), steel);
  deck.position.y = 5.6;
  deck.castShadow = true;
  g.add(deck);
  for (const z of [-1.15, 1.15]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(span, 1.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.6, metalness: 0.5, transparent: true, opacity: 0.85 }));
    rail.position.set(0, 6.3, z);
    g.add(rail);
  }
  for (const x of [-(ROAD_HALF + 0.5), ROAD_HALF + 0.5]) {
    for (const z of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.6, 0.3), steel);
      col.position.set(x, 2.8, z);
      g.add(col);
    }
  }
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.0), signMat(["EKO O NI BAJE!", "Welcome to Lagos · Centre of Excellence"], "#0d47a1", "#fff"));
  banner.position.set(0, 6.25, 1.2);
  g.add(banner);
  return g;
}

/** One 32 m slice of street. `index` seeds its look so neighbours differ. */
export async function buildSegment(index: number, opts: { detailed: boolean; people: number; walkers: number; hawkers: number }): Promise<Segment> {
  mats ??= makeMats();
  const M = mats;
  const rng = createRng(1000 + index * 37);
  const root = new THREE.Group();

  // Road, lane dashes, gutters, kerbs, sidewalks.
  const road = new THREE.Mesh(planeWorldUV(ROAD_HALF * 2, SEG, 7), M.road);
  road.position.set(0, 0, -SEG / 2);
  road.receiveShadow = true;
  root.add(road);
  for (const x of [-laneX(2) / 2, laneX(2) / 2]) {
    for (let z = 1.5; z < SEG; z += 6) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 3).rotateX(-Math.PI / 2), M.dash);
      d.position.set(x, 0.008, -z - 1.5);
      root.add(d);
    }
  }
  for (const side of [-1, 1]) {
    const gx = side * (ROAD_HALF + GUTTER_W / 2);
    addMesh(root, new THREE.PlaneGeometry(GUTTER_W - 0.2, SEG).rotateX(-Math.PI / 2), M.trench, gx, -0.28, -SEG / 2, false);
    for (const e of [-1, 1]) addMesh(root, boxWorldUV(0.1, 0.42, SEG, 1.5), M.concrete, gx + e * (GUTTER_W / 2 - 0.05), -0.08, -SEG / 2);
    const walk = new THREE.Mesh(planeWorldUV(WALK_W, SEG, 1.6), M.paving);
    walk.position.set(side * (ROAD_HALF + GUTTER_W + WALK_W / 2), 0.13, -SEG / 2);
    walk.receiveShadow = true;
    root.add(walk);
    addMesh(root, boxWorldUV(WALK_W, 0.14, SEG, 1.5), M.concrete, side * (ROAD_HALF + GUTTER_W + WALK_W / 2), 0.05, -SEG / 2, false);
  }
  root.add(litter({ x: -ROAD_HALF, z: -SEG, w: ROAD_HALF * 2, d: SEG }, opts.detailed ? 40 : 15, index * 13 + 1));

  const landmark = LANDMARKS[index % LANDMARKS.length] ?? null;
  const lagoonSide = landmark === "theatre" || landmark === "linkBridge" || landmark === "lagoon" ? 1 : 0;
  if (lagoonSide) lagoonView(root, 1);
  if (landmark === "theatre") {
    // Across the water, ahead and to the right as you come down the road.
    const lm = nationalTheatre();
    lm.position.set(62, -0.5, -SEG * 2 - 40);
    root.add(lm);
  } else if (landmark === "linkBridge") {
    const lm = linkBridge();
    lm.position.set(80, -0.9, -SEG - 60);
    lm.rotation.y = 0.45;
    root.add(lm);
  } else if (landmark === "gantry") {
    const gt = gantry(index);
    gt.position.z = -SEG / 2;
    root.add(gt);
  } else if (landmark === "footbridge") {
    const fb = footbridge();
    fb.position.z = -SEG / 2;
    root.add(fb);
  }

  // Shophouses facing the road on both sides.
  const builds: Promise<void>[] = [];
  for (const side of [-1, 1] as const) {
    if (side === lagoonSide) continue;
    let z = 0;
    let i = 0;
    while (z < SEG - 2) {
      const w = Math.min(SEG - z, 8 + rng() * 7);
      const spec = {
        x: 0,
        z: 0,
        w,
        d: 9,
        floors: 1 + Math.floor(rng() * 3.2),
        facing: 1 as const,
        paint: pick(rng, PAINTS),
        shops: Math.max(1, Math.round(w / 3.6)),
        roof: rng() < 0.45 ? ("zinc" as const) : ("parapet" as const),
        seed: index * 11 + i * 3 + (side > 0 ? 500 : 0),
      };
      const zc = -(z + w / 2);
      builds.push(
        building(spec, index * 5 + i, opts.detailed).then((b) => {
          // Built facing +z; turn it to face the road.
          b.position.set(side * FACADE_X, 0.12, zc);
          b.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
          root.add(b);
        }),
      );
      z += w + 0.3 + rng() * 0.8;
      i++;
    }
  }
  await Promise.all(builds);

  // NEPA pole and the tangle of cables, every segment, alternating sides.
  const ps = index % 2 ? 1 : -1;
  const pole = electricPole(8.5);
  pole.position.set(ps * (ROAD_HALF + GUTTER_W + 0.4), 0.12, -4);
  root.add(pole);
  for (const dx of [-0.8, -0.3, 0.3, 0.8]) root.add(cable(new THREE.Vector3(ps * (ROAD_HALF + 1.1) + dx, 8.1, -4), new THREE.Vector3(ps * (ROAD_HALF + 1.1) + dx, 8.1, -4 - SEG), 0.7));
  if (index % 3 === 0) root.add(cable(new THREE.Vector3(ps * (ROAD_HALF + 1.1), 7.9, -4), new THREE.Vector3(-ps * (FACADE_X - 0.3), 6.2, -9), 0.9));

  // Sidewalk life: umbrellas and hawker tables, parked vehicles, clutter.
  for (const side of [-1, 1]) {
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const z = -(4 + rng() * (SEG - 8));
      const u = umbrella(index * 7 + k + side * 3, 1.25);
      u.position.set(side * (ROAD_HALF + GUTTER_W + 1.6), 0.12, z);
      root.add(u);
      const t = stallTable(1.5, 0.9);
      t.position.set(side * (ROAD_HALF + GUTTER_W + 1.6), 0.12, z);
      t.rotation.y = Math.PI / 2;
      const heap = produceHeap(pick(rng, [0xd2381f, 0xe98b16, 0x3e8a2c, 0xd4b21a]), 26, 0.045, index + k);
      heap.position.y = 0.86;
      t.add(heap);
      root.add(t);
    }
    // Kekes and danfos parked half on the walkway, loading and offloading.
    const parked = rng() < 0.75 ? 1 + Math.floor(rng() * 2) : 0;
    for (let k = 0; k < parked; k++) {
      const v = rng() < 0.6 ? keke(index * 3 + side + k) : danfo(index * 5 + side + k);
      v.position.set(side * (ROAD_HALF + GUTTER_W + 1.3), 0.12, -(4 + k * 13 + rng() * 8));
      v.rotation.y = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      root.add(v);
    }
  }
  if (opts.detailed) {
    const propIds = ["plastic_jerrycan", "wooden_crate_01", "plastic_crate_01", "portable_generator", "barrel_03", "plastic_monobloc_chair_01"];
    const jobs: Promise<void>[] = [];
    for (let k = 0; k < 4; k++) {
      const side = rng() < 0.5 ? -1 : 1;
      const id = pick(rng, propIds);
      const x = side * (FACADE_X - 0.8 - rng() * 1.2);
      const z = -(2 + rng() * (SEG - 4));
      const r = rng() * Math.PI * 2;
      jobs.push(
        instantiateProp(id).then((p) => {
          p.position.set(x, 0.12, z);
          p.rotation.y = r;
          root.add(p);
        }),
      );
    }
    await Promise.all(jobs);
  }
  if (index % 4 === 1) {
    const b = billboard(index);
    const side = index % 8 === 1 ? 1 : -1;
    b.position.set(side * (FACADE_X + 3), 6.6, -SEG / 2);
    b.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    root.add(b);
  }

  // Everything so far is static: merge it into a few big meshes (hundreds of draw calls -> dozens).
  mergeStatic(root);

  // A few people standing outside the shops: chatting, on the phone, a hawker.
  const people: Character[] = [];
  const who: [string, string][] = [
    ["woman1", "talk_f"],
    ["man2", "phone_m"],
    ["woman2", "idle_f"],
    ["man1", "talk_m"],
    ["man3", "look_m"],
    ["emeka", "cheer_m"],
    ["woman1", "idle_f"],
  ];
  await Promise.all(
    Array.from({ length: opts.people }, async (_, k) => {
      const [id, clip] = who[(index + k * 2) % who.length]!;
      const c = await Character.create(id, [clip]);
      const side = (index + k) % 2 ? 1 : -1;
      c.root.position.set(side * (ROAD_HALF + GUTTER_W + 0.9 + rng() * 2.4), 0.12, -(3 + rng() * (SEG - 6)));
      c.root.rotation.y = side > 0 ? -Math.PI / 2 + (rng() - 0.5) : Math.PI / 2 + (rng() - 0.5);
      c.play(clip, { offset: rng() });
      if (id.startsWith("woman") && rng() < 0.5) c.attach("Head", headTray(index + k), new THREE.Vector3(0, 0.2, 0));
      root.add(c.root);
      people.push(c);
    }),
  );

  // Pedestrians walking up and down the sidewalk (they loop within the slice).
  const walkers: Walker[] = [];
  const strollers: [string, string][] = [
    ["man1", "walk_m"],
    ["woman2", "walk_f"],
    ["man2", "walk_m"],
    ["woman1", "walk_f"],
  ];
  await Promise.all(
    Array.from({ length: opts.walkers }, async (_, k) => {
      const [id, clip] = strollers[(index + k) % strollers.length]!;
      const c = await Character.create(id, [clip]);
      const side = (index + k) % 2 ? -1 : 1;
      const v = (rng() < 0.5 ? -1 : 1) * (1.1 + rng() * 0.4);
      c.root.position.set(side * (ROAD_HALF + GUTTER_W + 2.6 + rng() * 0.8), 0.12, -(2 + rng() * (SEG - 4)));
      c.root.rotation.y = v > 0 ? 0 : Math.PI;
      c.play(clip, { offset: rng() });
      if (id.startsWith("woman") && rng() < 0.6) c.attach("Head", headTray(index * 3 + k), new THREE.Vector3(0, 0.2, 0));
      root.add(c.root);
      walkers.push({ c, v });
    }),
  );

  // Hawkers at the kerb with goods on their heads, facing the traffic.
  const hawkers: Character[] = [];
  const sellers: [string, string][] = [
    ["woman2", "talk_f"],
    ["woman1", "idle_f"],
    ["man1", "talk_m"],
  ];
  await Promise.all(
    Array.from({ length: opts.hawkers }, async (_, k) => {
      const [id, clip] = sellers[(index + k) % sellers.length]!;
      const c = await Character.create(id, [clip]);
      const side = (index + k) % 2 ? 1 : -1;
      c.root.position.set(side * (ROAD_HALF + GUTTER_W + 0.55), 0.12, -(4 + k * 13 + rng() * 9));
      c.root.rotation.y = side > 0 ? -0.6 : 0.6; // half towards the road, half towards oncoming traffic
      c.play(clip, { offset: rng() });
      c.attach("Head", headTray(index * 5 + k + 77), new THREE.Vector3(0, 0.2, 0));
      root.add(c.root);
      hawkers.push(c);
    }),
  );

  return { root, people, walkers, hawkers, index };
}

// ------------------------------------------------------------------ obstacles

function striped(w: number, h: number, a: string, b: string, text?: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = Math.max(32, Math.round((512 * h) / w));
  const g = c.getContext("2d")!;
  const stripe = c.height * 1.1;
  for (let x = -c.height; x < c.width + c.height; x += stripe) {
    g.fillStyle = Math.round(x / stripe) % 2 ? a : b;
    g.beginPath();
    g.moveTo(x, c.height);
    g.lineTo(x + stripe / 2, c.height);
    g.lineTo(x + stripe / 2 + c.height, 0);
    g.lineTo(x + c.height, 0);
    g.fill();
  }
  if (text) {
    g.fillStyle = "#fff";
    g.fillRect(c.width * 0.26, 4, c.width * 0.48, c.height - 8);
    g.fillStyle = "#14213d";
    g.font = `900 ${Math.round(c.height * 0.62)}px Arial Black, Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, c.width / 2, c.height / 2 + 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
}

function signMat(lines: string[], bg: string, fg: string, w = 1024, h = 256) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((l, i) => {
    let size = i === 0 ? h * 0.42 : h * 0.2;
    g.font = `900 ${size}px Arial Black, Arial, sans-serif`;
    while (g.measureText(l).width > w * 0.92) g.font = `900 ${(size *= 0.92)}px Arial Black, Arial, sans-serif`;
    g.fillText(l, w / 2, h * (lines.length === 1 ? 0.5 : i === 0 ? 0.38 : 0.78));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, side: THREE.DoubleSide });
}

/** Police road barrier: A-frame legs, red-and-white plank, "POLICE" plate. */
function barrier(width: number, label: string) {
  const g = new THREE.Group();
  const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.28, 0.06), striped(width, 0.28, "#d62828", "#f4f1ea", label));
  plank.position.y = 0.82;
  plank.castShadow = true;
  g.add(plank);
  const low = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, 0.05), striped(width, 0.16, "#d62828", "#f4f1ea"));
  low.position.y = 0.38;
  g.add(low);
  for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), MAT.ironBlack);
      leg.position.set(x, 0.5, s * 0.18);
      leg.rotation.x = s * 0.33;
      leg.castShadow = true;
      g.add(leg);
    }
  }
  return g;
}

function okada(seed: number) {
  const rng = createRng(seed);
  const g = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color: pick(rng, [0xb3121b, 0x1b1b1b, 0x1d4fa3]), roughness: 0.35, clearcoat: 0.6 });
  for (const z of [-0.68, 0.68]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 10, 24), MAT.rubber);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, 0.32, z);
    wheel.castShadow = true;
    g.add(wheel);
  }
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.55), body);
  tank.position.set(0, 0.82, 0.18);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.8), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 }));
  seat.position.set(0, 0.86, -0.38);
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.4), MAT.chrome);
  engine.position.set(0, 0.5, 0.05);
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85), MAT.chrome);
  fork.position.set(0, 0.7, 0.62);
  fork.rotation.x = -0.35;
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7), MAT.ironBlack);
  bars.rotation.z = Math.PI / 2;
  bars.position.set(0, 1.08, 0.5);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0xfff5d0, emissive: 0xfff0b0, emissiveIntensity: 1.2 }));
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, 0.98, 0.72);
  for (const m of [tank, seat, engine, fork, bars, lamp]) m.castShadow = true;
  g.add(tank, seat, engine, fork, bars, lamp);
  return g;
}

/** Omolanke push-cart loaded with jerrycans and sacks. */
async function cart(seed: number) {
  const rng = createRng(seed);
  const g = new THREE.Group();
  const bed = new THREE.Mesh(boxWorldUV(1.0, 0.08, 1.5, 0.5), MAT.wood);
  bed.position.y = 0.55;
  bed.castShadow = true;
  g.add(bed);
  for (const x of [-0.56, 0.56]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 20), MAT.rubber);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(x, 0.33, 0);
    g.add(wheel);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.9), MAT.woodDark);
    handle.position.set(x * 0.8, 0.6, 1.05);
    handle.rotation.x = 0.15;
    g.add(handle);
  }
  const cans = await Promise.all([0, 1, 2, 3].map(() => instantiateProp("plastic_jerrycan")));
  cans.forEach((c, i) => {
    c.position.set(-0.25 + (i % 2) * 0.5, 0.6, -0.35 + Math.floor(i / 2) * 0.55);
    c.rotation.y = rng() * 0.6;
    g.add(c);
  });
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshStandardMaterial({ color: 0xcdbb94, roughness: 1 }));
  sack.scale.set(1.2, 0.6, 0.9);
  sack.position.set(0, 0.92, 0.1);
  g.add(sack);
  return g;
}

const BANNERS: [string[], string, string][] = [
  [["OWAMBE TODAY!", "Chief & Mrs Adebayo · 60th Birthday · All are welcome"], "#7b1fa2", "#ffd54f"],
  [["MAMA PUT", "Rice · Beans · Dodo · Swallow · Pepper soup"], "#1b5e20", "#fff"],
  [["CRUSADE NIGHT", "Come and receive your miracle · Friday 7pm"], "#0d47a1", "#fff"],
  [["BIG SALE!", "Iya Basira Fabrics · Ankara · Lace · Aso-oke"], "#e65100", "#fff"],
];

export async function buildObstacle(kind: ObstacleKind, seed: number): Promise<THREE.Object3D> {
  const rng = createRng(seed);
  const spec = OBSTACLES[kind];
  const g = new THREE.Group();
  switch (kind) {
    case "danfo": {
      const v = danfo(seed);
      v.rotation.y = -Math.PI / 2; // nose towards the runner
      g.add(v);
      break;
    }
    case "brt": {
      g.add(brtBus(seed));
      break;
    }
    case "hawker":
      // The walking hawker (a Character) is attached by the engine.
      break;
    case "keke": {
      const v = keke(seed);
      v.rotation.y = -Math.PI / 2; // nose towards the runner; the engine turns it round for traffic going your way
      g.add(v);
      break;
    }
    case "okada": {
      g.add(okada(seed));
      break;
    }
    case "barrier":
      g.add(barrier(1.7, "POLICE"));
      break;
    case "checkpoint": {
      g.add(barrier(6.8, "POLICE CHECKPOINT"));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), signMat(["STOP!", "POLICE CHECK"], "#c62828", "#fff", 512, 256));
      sign.position.set(-ROAD_HALF - 0.35, 1.5, 0);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6), MAT.ironBlack);
      post.position.set(-ROAD_HALF - 0.35, 0.8, -0.03);
      g.add(sign, post);
      for (const x of [-ROAD_HALF - 0.4, ROAD_HALF + 0.4]) {
        const drum = await instantiateProp("barrel_03");
        drum.position.set(x, 0, 0.6);
        g.add(drum);
      }
      break;
    }
    case "table": {
      const t = stallTable(1.6, 1.0);
      for (let k = 0; k < 2; k++) {
        const heap = produceHeap(pick(rng, [0xd2381f, 0xe98b16, 0x3e8a2c, 0xd4b21a, 0x8d2b0b]), 28, 0.05, seed + k);
        heap.position.set(-0.4 + k * 0.8, 0.86, 0);
        t.add(heap);
      }
      g.add(t);
      break;
    }
    case "generator": {
      const gen = await instantiateProp("portable_generator");
      const box = new THREE.Box3().setFromObject(gen);
      gen.scale.setScalar(0.72 / Math.max(0.1, box.max.y - box.min.y));
      gen.rotation.y = rng() * Math.PI;
      g.add(gen);
      const can = await instantiateProp("plastic_jerrycan");
      can.position.set(0.55, 0, 0.2);
      g.add(can);
      break;
    }
    case "cart":
      g.add(await cart(seed));
      break;
    case "pole": {
      // A fallen NEPA pole propped across the lane: slide under it.
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 3.2, 10), MAT.concrete);
      p.rotation.z = Math.PI / 2 + 0.06;
      p.position.y = spec.h + 0.2;
      p.castShadow = true;
      g.add(p);
      for (const x of [-1.1, 1.1]) {
        const trestle = new THREE.Group();
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.4, 0.07), MAT.woodDark);
          leg.position.set(0, 0.62, s * 0.25);
          leg.rotation.x = s * 0.38;
          trestle.add(leg);
        }
        trestle.position.x = x;
        g.add(trestle);
      }
      const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.4), new THREE.MeshStandardMaterial({ color: 0xd62828, side: THREE.DoubleSide, roughness: 1 }));
      rag.position.set(0.2, spec.h - 0.05, 0.05);
      g.add(rag);
      break;
    }
    case "banner": {
      const [lines, bg, fg] = BANNERS[seed % BANNERS.length]!;
      const w = ROAD_HALF * 2 + 0.6;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.95, 12, 1), signMat(lines, bg, fg));
      cloth.position.y = spec.h + 0.12 + 0.475;
      cloth.castShadow = true;
      g.add(cloth);
      for (const x of [-w / 2, w / 2]) {
        const bamboo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3), new THREE.MeshStandardMaterial({ color: 0xb59a5a, roughness: 0.8 }));
        bamboo.position.set(x, 1.5, 0);
        g.add(bamboo);
      }
      break;
    }
    case "pothole": {
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24).rotateX(-Math.PI / 2), MAT.water);
      water.scale.set(1, 1, 1.05);
      water.position.y = 0.012;
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.95, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 1 }));
      rim.position.y = 0.011;
      water.receiveShadow = true;
      g.add(rim, water);
      break;
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = kind !== "pothole";
      o.receiveShadow = true;
    }
  });
  // Static model: one mesh per material instead of dozens of parts.
  mergeStatic(g);
  return g;
}

/** Lagos BRT bus: long blue body, red stripe, dark window band. Length runs along z, nose at +z. */
function brtBus(seed: number) {
  const g = new THREE.Group();
  const L = 11;
  const W = 2.5;
  const H = 3.0;
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x1f4fa3, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H - 0.45, L), blue);
  body.position.y = 0.45 + (H - 0.45) / 2;
  body.castShadow = true;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.28, L + 0.02), new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.5 }));
  stripe.position.y = 1.15;
  g.add(stripe);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.95, L - 0.6), MAT.darkGlass);
  glass.position.y = 2.15;
  g.add(glass);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 1.3, 0.04), MAT.darkGlass);
  wind.position.set(0, 2.0, L / 2 + 0.01);
  g.add(wind);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.32), signMat([["CMS", "OSHODI", "IKORODU", "TBS"][seed % 4]!], "#111", "#ffb300", 512, 96));
  sign.position.set(0, 2.83, L / 2 + 0.03);
  g.add(sign);
  const brt = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), signMat(["BRT"], "#1f4fa3", "#fff", 256, 80));
  for (const sx of [-1, 1]) {
    const b = brt.clone();
    b.position.set(sx * (W / 2 + 0.015), 1.6, 1.5);
    b.rotation.y = sx * (Math.PI / 2);
    g.add(b);
  }
  for (const z of [-L / 2 + 2, L / 2 - 2.2]) {
    for (const sx of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 18), MAT.rubber);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * (W / 2 - 0.12), 0.5, z);
      g.add(wheel);
    }
  }
  for (const sx of [-0.85, 0.85]) {
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.13, 14), new THREE.MeshStandardMaterial({ color: 0xfff5d0, emissive: 0xfff0b0, emissiveIntensity: 1 }));
    lamp.position.set(sx, 0.85, L / 2 + 0.02);
    g.add(lamp);
  }
  return g;
}

/** A street hawker walking with a loaded head tray. */
export async function hawkerPerson(seed: number) {
  const female = seed % 3 !== 0;
  const c = await Character.create(female ? (seed % 2 ? "woman1" : "woman2") : "man2", [female ? "walk_f" : "walk_m"]);
  c.play(female ? "walk_f" : "walk_m", { offset: (seed % 10) / 10 });
  c.attach("Head", headTray(seed), new THREE.Vector3(0, 0.2, 0));
  return c;
}

/** Okada riders are real people on the bikes (they sit, as on a chair). */
export async function okadaRider(seed: number) {
  const c = await Character.create(seed % 2 ? "man1" : "man3", ["sit_m"]);
  c.play("sit_m");
  // Characters face +z by default, same as the bike's headlamp: towards the runner.
  c.root.position.set(0, 0.3, -0.35);
  return c;
}

// ------------------------------------------------------------------ snacks

function wrapperMat(bg: string, stripe: string, text: string, fg: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = stripe;
  g.fillRect(0, 0, 256, 18);
  g.fillRect(0, 110, 256, 18);
  g.fillStyle = fg;
  g.font = "900 34px Arial Black, Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.1 });
}

/** A single snack: a sausage roll in its wrapper, or an energy drink can. */
export function snackModel(kind: "roll" | "energy"): THREE.Group {
  const g = new THREE.Group();
  const item = new THREE.Group();
  if (kind === "roll") {
    // Sausage roll in a crimped plastic wrapper (generic: no brand on it).
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 6, 16), wrapperMat("#d4161c", "#ffcf2e", "SAUSAGE", "#fff"));
    body.rotation.z = Math.PI / 2;
    body.scale.set(1, 1, 0.75);
    item.add(body);
    for (const x of [-0.27, 0.27]) {
      const crimp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.05), new THREE.MeshStandardMaterial({ color: 0xc8121a, roughness: 0.4 }));
      crimp.position.x = x;
      item.add(crimp);
    }
  } else {
    // Energy drink can: silver lid, blue-and-orange wrap with a lightning bolt.
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.24, 24, 1, true), wrapperMat("#123a8c", "#ff8a00", "⚡ ENERGY", "#fff"));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.066, 0.02, 24), MAT.chrome);
    lid.position.y = 0.13;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.058, 0.02, 24), MAT.chrome);
    base.position.y = -0.13;
    item.add(wrap, lid, base);
  }
  item.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  item.name = "item";
  g.add(item);
  return g;
}

/** Agbo bottle: dark green glass, cork, herbs inside, glowing so it reads from down the road. */
export function agboModel(): THREE.Group {
  const g = new THREE.Group();
  const item = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f7a2e, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85, emissive: 0x0b3d12 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.36, 20), glass);
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  shoulder.position.y = 0.18;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 14), glass);
  neck.position.y = 0.33;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.07, 12), new THREE.MeshStandardMaterial({ color: 0x9a6b3a, roughness: 0.9 }));
  cork.position.y = 0.43;
  // Bark and leaves steeping inside.
  const herbs = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.22, 14), new THREE.MeshStandardMaterial({ color: 0x5a3a12, roughness: 0.8 }));
  herbs.position.y = -0.06;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.131, 0.131, 0.15, 20, 1, true), wrapperMat("#f4e3b0", "#c0392b", "AGBO ⚡", "#1f4d1a"));
  label.position.y = 0.02;
  item.add(herbs, body, shoulder, neck, cork, label);
  item.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  item.name = "item";
  g.add(item);
  const glow = glowSprite("rgba(120,255,140,0.95)");
  glow.scale.setScalar(1.3);
  glow.position.y = 0.1;
  g.add(glow);
  return g;
}

export function glowSprite(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const grad = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
}

export interface HawkerStand {
  root: THREE.Group;
  person: Character;
  /** The snack held out over the lane: the thief snatches this one. */
  offer: THREE.Group;
  kind: "roll" | "energy";
  idleClip: string;
  angryClip: string;
  /** Puts the tray/cooler on the lane side: 1 = lane is to the hawker's +x, -1 = to the -x. */
  setSide(dir: 1 | -1): void;
}

/**
 * A hawker standing at the edge of a lane: a woman with a tray of sausage rolls,
 * or a man with a cooler of energy drinks, holding one out to passing traffic.
 * Built facing +x (the lane is on its +x side); the engine mirrors it per side.
 */
export async function hawkerStand(kind: "roll" | "energy", seed: number): Promise<HawkerStand> {
  const root = new THREE.Group();
  const female = kind === "roll";
  const id = female ? (seed % 2 ? "woman1" : "woman2") : seed % 2 ? "man2" : "man1";
  const idleClip = female ? "idle_f" : "idle_m";
  const angryClip = female ? "talk_f" : "talk_m";
  const person = await Character.create(id, [idleClip, angryClip]);
  person.play(idleClip, { offset: (seed % 10) / 10 });
  person.root.rotation.y = 0; // facing the oncoming runner (+z)
  root.add(person.root);
  if (kind === "roll") {
    // Wooden tray at waist height, held out towards the lane, stacked with rolls.
    const tray = new THREE.Mesh(boxWorldUV(0.62, 0.05, 0.42, 0.5), MAT.wood);
    tray.position.set(0.42, 0.95, 0.12);
    tray.castShadow = true;
    root.add(tray);
    for (let i = 0; i < 6; i++) {
      const r = snackModel("roll");
      r.scale.setScalar(0.75);
      r.position.set(0.24 + (i % 3) * 0.17, 1.01 + Math.floor(i / 3) * 0.06, 0.04 + Math.floor(i / 3) * 0.14);
      r.rotation.y = 0.2 * (i % 2);
      root.add(r);
    }
  } else {
    // Blue cooler on a stool, cans on the lid.
    const cooler = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.42), new THREE.MeshStandardMaterial({ color: 0x1e5fbf, roughness: 0.45 }));
    cooler.position.set(0.5, 0.62, 0.05);
    cooler.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.44), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4 }));
    lid.position.set(0.5, 0.86, 0.05);
    const stool = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.36), MAT.woodDark);
    stool.position.set(0.5, 0.2, 0.05);
    root.add(cooler, lid, stool);
    for (let i = 0; i < 4; i++) {
      const c = snackModel("energy");
      c.scale.setScalar(0.85);
      c.position.set(0.32 + i * 0.12, 1.0, 0.05 + (i % 2) * 0.08);
      root.add(c);
    }
  }
  // The one held out to you, glowing so you can spot it from down the road.
  const offer = snackModel(kind);
  offer.scale.setScalar(1.5);
  offer.position.set(0.95, 1.05, 0.15);
  const glow = glowSprite(kind === "roll" ? "rgba(255,210,80,0.9)" : "rgba(120,190,255,0.9)");
  glow.scale.setScalar(0.9);
  offer.add(glow);
  root.add(offer);
  for (const ch of root.children) if (ch !== person.root) ch.userData.baseX = ch.position.x;
  const setSide = (dir: 1 | -1) => {
    for (const ch of root.children) if (ch !== person.root) ch.position.x = (ch.userData.baseX as number) * dir;
  };
  return { root, person, offer, kind, idleClip, angryClip, setSide };
}

/** Police "kondo": black rubber baton with a taped grip. */
export function kondo(): THREE.Group {
  const g = new THREE.Group();
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.55 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.024, 0.6, 12), rubber);
  shaft.position.y = -0.26;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 }));
  grip.position.y = 0.02;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), rubber);
  cap.position.y = -0.56;
  for (const m of [shaft, grip, cap]) m.castShadow = true;
  g.add(shaft, grip, cap);
  return g;
}
