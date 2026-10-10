import * as THREE from "three";
import { createRng } from "@/games/core/rng";
import { pbrMaterial } from "./assets";
import { ankaraTexture, boxWorldUV, cable, MAT, planeWorldUV, waterTank } from "./procedural";
import { addMesh, building, buildStreet, grime, placeProp, wallMat } from "./street";
import { createCrowd } from "./crowd";
import { createTyreRollers, updateTyreRollers, type TyreRoller } from "./kids";
import type { BuildingSpec } from "./street-layout";

/**
 * Playable places for the 3D games. Each builds its own scene around a "spot"
 * where the match happens, and brings its own background life.
 */
export type PlaceId = "street" | "school" | "compound";

export const PLACES: { value: PlaceId; label: string }[] = [
  { value: "street", label: "Market street" },
  { value: "school", label: "School yard" },
  { value: "compound", label: "Compound" },
];

export interface Place {
  id: PlaceId;
  /** Where the two Ten-Ten players stand (between them). Players line up along +z. */
  spot: THREE.Vector3;
  /** Extra watchers specific to this place: [avatar, clip, x, z]. They face the spot. */
  watchers: [string, string, number, number][];
  update(dt: number, camera: THREE.Vector3): void;
  dispose(): void;
}

// ------------------------------------------------------------------ shared pieces

/** Big mango tree: thick trunk, spreading branches and a dense layered canopy. */
export function mangoTree(seed = 1, scale = 1): THREE.Group {
  const rng = createRng(seed);
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.95 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 3.2, 10), bark);
  trunk.position.y = 1.6;
  trunk.castShadow = trunk.receiveShadow = true;
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 2.4, 7), bark);
    br.position.set(Math.cos(a) * 0.7, 3.4, Math.sin(a) * 0.7);
    br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    br.castShadow = true;
    g.add(br);
  }
  const greens = [0x1e4d22, 0x275f2b, 0x316f33, 0x3f7f3a];
  for (let i = 0; i < 26; i++) {
    const r = 1.1 + rng() * 0.9;
    const geo = new THREE.IcosahedronGeometry(r, 2);
    // Lumpy leaf mass
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const k = 1 + (rng() - 0.5) * 0.28;
      pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) * k * 0.8, pos.getZ(v) * k);
    }
    geo.computeVertexNormals();
    const leaf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: greens[i % greens.length], roughness: 0.85, flatShading: true }));
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * 3.2;
    leaf.position.set(Math.cos(a) * d, 4.6 + rng() * 1.8 - d * 0.25, Math.sin(a) * d);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return g;
}

/** Flagpole with a gently waving Nigerian flag (green-white-green). */
export function flagpole(): { obj: THREE.Group; update(t: number): void } {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 8, 8), MAT.chrome);
  pole.position.y = 4;
  pole.castShadow = true;
  g.add(pole);
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ["#008751", "#ffffff", "#008751"].forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(i * 64, 0, 64, 96);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1.8, 0.9, 16, 4);
  geo.translate(0.9, 0, 0);
  const base = (geo.getAttribute("position") as THREE.BufferAttribute).clone();
  const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(0.05, 7.4, 0);
  flag.castShadow = true;
  g.add(flag);
  return {
    obj: g,
    update(t) {
      const pos = geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = base.getX(i);
        pos.setZ(i, Math.sin(x * 3 - t * 5) * 0.12 * (x / 1.8));
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}

function signBoard(lines: [string, string, string], w = 4.2, h = 1.6): THREE.Group {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 400;
  const g2 = c.getContext("2d")!;
  g2.fillStyle = "#f2efe4";
  g2.fillRect(0, 0, 1024, 400);
  g2.strokeStyle = "#0b6b3a";
  g2.lineWidth = 16;
  g2.strokeRect(10, 10, 1004, 380);
  g2.fillStyle = "#0b6b3a";
  g2.textAlign = "center";
  g2.font = "900 64px Arial Black, Arial";
  g2.fillText(lines[0], 512, 120, 960);
  g2.fillStyle = "#b8141c";
  g2.font = "900 84px Arial Black, Arial";
  g2.fillText(lines[1], 512, 235, 960);
  g2.fillStyle = "#1a1a1a";
  g2.font = "italic 700 44px Arial";
  g2.fillText(lines[2], 512, 330, 960);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  board.position.y = 2.2;
  g.add(board);
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), MAT.frame);
    post.position.set(x, 1.5, -0.03);
    post.castShadow = true;
    g.add(post);
  }
  return g;
}

/**
 * A long single-storey block: painted walls with a darker lower band, a verandah
 * with pillars, doors and windows along the front, and a corrugated roof.
 * Built facing -z with the front at z = 0.
 */
function rowBlock(opts: {
  w: number;
  d: number;
  h: number;
  paint: string;
  band: string;
  bays: number;
  verandah: number;
  roof: "gable" | "lean";
  window: "louvre" | "bars";
  doorEvery: number;
  curtains?: boolean;
  seed: number;
}): THREE.Group {
  const { w, d, h, paint, band, bays, verandah, seed } = opts;
  const rng = createRng(seed);
  const g = new THREE.Group();
  const wall = wallMat(paint, rng() < 0.5);
  addMesh(g, boxWorldUV(w, h, d, 2.5), wall, 0, h / 2, d / 2);
  const bandMat = new THREE.MeshStandardMaterial({ color: band, roughness: 0.85 });
  addMesh(g, new THREE.BoxGeometry(w + 0.02, 1.0, 0.03), bandMat, 0, 0.5, -0.01, false);
  // Verandah slab, pillars and front beam
  const concrete = pbrMaterial("dirty_concrete");
  addMesh(g, boxWorldUV(w + 0.6, 0.18, verandah, 1.5), concrete, 0, 0.09, -verandah / 2);
  const bay = w / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + i * bay;
    addMesh(g, boxWorldUV(0.3, h, 0.3, 2.5), wall, x, h / 2, -verandah + 0.15);
    addMesh(g, new THREE.BoxGeometry(0.31, 1.0, 0.31), bandMat, x, 0.5, -verandah + 0.15, false);
  }
  addMesh(g, boxWorldUV(w + 0.3, 0.35, 0.3, 2.5), wall, 0, h - 0.17, -verandah + 0.15);
  // Openings
  for (let i = 0; i < bays; i++) {
    const cx = -w / 2 + (i + 0.5) * bay;
    if (i % opts.doorEvery === 0) {
      addMesh(g, new THREE.BoxGeometry(0.95, 2.1, 0.06), new THREE.MeshStandardMaterial({ color: [0x24557a, 0x5a3b22, 0x2f6b3e][Math.floor(rng() * 3)], roughness: 0.75 }), cx - 0.7, 1.05, -0.02);
      if (opts.curtains) {
        const cur = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), new THREE.MeshStandardMaterial({ map: ankaraTexture(Math.floor(rng() * 10)), roughness: 0.95, side: THREE.DoubleSide }));
        cur.position.set(cx - 0.7, 1.15, -0.08);
        g.add(cur);
      }
    }
    const wx = i % opts.doorEvery === 0 ? cx + 0.55 : cx;
    addMesh(g, new THREE.BoxGeometry(1.2, 1.1, 0.05), MAT.darkGlass, wx, 1.55, -0.01, false);
    if (opts.window === "louvre") {
      for (let b = 0; b < 6; b++) addMesh(g, new THREE.BoxGeometry(1.18, 0.02, 0.06), new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.2, metalness: 0.3 }), wx, 1.08 + b * 0.18, -0.04, false);
    } else {
      for (let b = 0; b < 8; b++) addMesh(g, new THREE.BoxGeometry(0.018, 1.1, 0.018), MAT.ironBlack, wx - 0.53 + b * 0.15, 1.55, -0.05, false);
    }
    addMesh(g, new THREE.BoxGeometry(1.35, 0.07, 0.14), MAT.concrete, wx, 0.97, -0.06);
  }
  // Roof
  const iron = pbrMaterial(rng() < 0.6 ? "rusty_corrugated_iron" : "corrugated_iron_02", { roughness: 1 });
  if (opts.roof === "gable") {
    const span = d + verandah + 0.6;
    const rise = 1.3;
    const half = span / 2;
    const slope = Math.atan2(rise, half);
    const len = Math.hypot(rise, half);
    const cz = d / 2 - verandah / 2;
    for (const side of [1, -1]) {
      const r = new THREE.Mesh(boxWorldUV(w + 0.8, 0.04, len, 1.2), iron);
      r.position.set(0, h + rise / 2, cz - side * (half / 2));
      r.rotation.x = -side * slope;
      r.castShadow = r.receiveShadow = true;
      g.add(r);
    }
    const tri = new THREE.Shape();
    tri.moveTo(-half, 0);
    tri.lineTo(half, 0);
    tri.lineTo(0, rise);
    tri.closePath();
    const gm = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.95, side: THREE.DoubleSide });
    for (const sx of [-w / 2, w / 2]) {
      const gable = new THREE.Mesh(new THREE.ShapeGeometry(tri), gm);
      gable.rotation.y = Math.PI / 2;
      gable.position.set(sx, h, cz);
      g.add(gable);
    }
  } else {
    const span = d + verandah + 0.4;
    const r = new THREE.Mesh(boxWorldUV(w + 0.6, 0.04, span, 1.2), iron);
    r.position.set(0, h + 0.35, d / 2 - verandah / 2);
    r.rotation.x = -0.12;
    r.castShadow = r.receiveShadow = true;
    g.add(r);
  }
  const gm2 = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.9), new THREE.MeshBasicMaterial({ map: grime(), transparent: true, depthWrite: false }));
  gm2.position.set(0, 0.45, -0.02);
  gm2.rotation.y = Math.PI;
  g.add(gm2);
  return g;
}

function blockFence(scene: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, h = 2.2) {
  const block = pbrMaterial("concrete_block_wall", { tint: "#e6ddca" });
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(boxWorldUV(len, h, 0.25, 1.2), block);
  m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
  m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}

/** Rows of distant rooftops and palms beyond the walls. */
async function skyline(scene: THREE.Object3D, z: number, x0: number, x1: number, seed: number) {
  const rng = createRng(seed);
  const paints = ["#e2d6bd", "#c9d6dc", "#e8c9a0", "#d3dcc5", "#e9e4da", "#d9b9ad"];
  const jobs: Promise<THREE.Group>[] = [];
  for (let x = x0, i = 0; x < x1; i++) {
    const w = 9 + rng() * 7;
    const spec: BuildingSpec = { x, z, w, d: 9, floors: 1 + Math.floor(rng() * 3), facing: -1, paint: paints[i % paints.length]!, shops: 2, roof: rng() < 0.6 ? "zinc" : "parapet", seed: seed * 10 + i };
    jobs.push(building(spec, i, false));
    x += w + 1 + rng() * 3;
  }
  for (const b of await Promise.all(jobs)) scene.add(b);
}

// ------------------------------------------------------------------ places

async function schoolYard(scene: THREE.Scene, detailed: boolean, withRollers = true): Promise<Place> {
  const laterite = pbrMaterial("red_laterite_soil_stones", { normalScale: 1.1 });
  const ground = new THREE.Mesh(planeWorldUV(300, 300, 3), laterite);
  ground.receiveShadow = true;
  scene.add(ground);
  const concrete = pbrMaterial("dirty_concrete");
  const walk = new THREE.Mesh(planeWorldUV(44, 2.2, 1.5), concrete);
  walk.position.set(0, 0.01, 11.6);
  walk.receiveShadow = true;
  scene.add(walk);

  // Classroom blocks: cream walls, green band, louvre windows, gable zinc roofs.
  const blockA = rowBlock({ w: 36, d: 7, h: 3.4, paint: "#efe3c2", band: "#2f6e48", bays: 9, verandah: 2, roof: "gable", window: "louvre", doorEvery: 3, seed: 3 });
  blockA.position.set(0, 0, 14);
  scene.add(blockA);
  const blockB = rowBlock({ w: 22, d: 7, h: 3.4, paint: "#efe3c2", band: "#2f6e48", bays: 6, verandah: 2, roof: "gable", window: "louvre", doorEvery: 3, seed: 4 });
  blockB.position.set(24, 0, 0);
  blockB.rotation.y = Math.PI / 2;
  scene.add(blockB);
  const sign = signBoard(["L.G.E.A. PRIMARY SCHOOL", "ADEOLA ODEKU", "Knowledge is Power"]);
  sign.position.set(-14, 0, 9.5);
  sign.rotation.y = 0.35;
  scene.add(sign);

  const tree = mangoTree(5, 1.1);
  tree.position.set(-10, 0, 4.5);
  scene.add(tree);
  const flag = flagpole();
  flag.obj.position.set(9, 0, 9);
  scene.add(flag.obj);
  // Goalposts made from planks
  for (const z of [-3.5, 3.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), MAT.wood);
    post.position.set(-17, 1.1, z - 6);
    post.castShadow = true;
    scene.add(post);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 7.1), MAT.wood);
  bar.position.set(-17, 2.2, -6);
  bar.castShadow = true;
  scene.add(bar);
  blockFence(scene, -30, 22, 30, 22);
  blockFence(scene, -30, -22, 30, -22);
  blockFence(scene, -30, -22, -30, 22);
  blockFence(scene, 30, -22, 30, 22);
  await skyline(scene, 25, -60, 60, 7);
  if (detailed) {
    await Promise.all([
      placeProp(scene, "plastic_monobloc_chair_01", 5.6, 11.2, Math.PI),
      placeProp(scene, "plastic_monobloc_chair_01", 6.4, 11.3, Math.PI + 0.2),
      placeProp(scene, "wooden_stool_01", -3, 11.4, 0),
      placeProp(scene, "shrub_01", 14, 11.3, 0),
      placeProp(scene, "shrub_01", -18, 11.3, 1),
    ]);
  }

  const rollers: TyreRoller[] = !withRollers
    ? []
    : await createTyreRollers(scene, [
    [new THREE.Vector3(-14, 0, -4), new THREE.Vector3(-4, 0, -7), new THREE.Vector3(10, 0, -5), new THREE.Vector3(14, 0, 3), new THREE.Vector3(6, 0, 8), new THREE.Vector3(-8, 0, 8.5), new THREE.Vector3(-16, 0, 3)],
    [new THREE.Vector3(12, 0, -12), new THREE.Vector3(20, 0, -8), new THREE.Vector3(18, 0, -16)],
  ]);
  let t = 0;
  return {
    id: "school",
    spot: new THREE.Vector3(0, 0, 4),
    watchers: [
      ["emeka", "clap_m", -1.9, 4.2],
      ["tunde", "cheer_m", 1.9, 4.6],
      ["tunde", "clap_m", -2.3, 6.6],
      ["emeka", "cheer_m", 2.4, 6.9],
      ["woman2", "clap_f", 0.6, 7.6],
      ["man1", "idle_m", 4.8, 10.8],
    ],
    update(dt) {
      t += dt;
      flag.update(t);
      updateTyreRollers(rollers, dt);
    },
    dispose() {
      for (const r of rollers) r.kid.dispose();
    },
  };
}

async function compound(scene: THREE.Scene, detailed: boolean, withRollers: boolean, props: boolean): Promise<Place> {
  const laterite = pbrMaterial("red_laterite_soil_stones", { normalScale: 1.1 });
  const ground = new THREE.Mesh(planeWorldUV(300, 300, 3), laterite);
  ground.receiveShadow = true;
  scene.add(ground);
  const yard = new THREE.Mesh(planeWorldUV(13, 18, 2), pbrMaterial("dirty_concrete", { tint: "#d8d0c4" }));
  yard.position.set(0, 0.01, 1);
  yard.receiveShadow = true;
  scene.add(yard);

  // Face-me-I-face-you: two rows of rooms facing each other, and a back row.
  const rowL = rowBlock({ w: 18, d: 4.5, h: 3.1, paint: "#d9c3a0", band: "#7a5232", bays: 6, verandah: 1.4, roof: "lean", window: "bars", doorEvery: 1, curtains: true, seed: 11 });
  rowL.position.set(-6.5, 0, 1);
  rowL.rotation.y = -Math.PI / 2;
  scene.add(rowL);
  const rowR = rowBlock({ w: 18, d: 4.5, h: 3.1, paint: "#c4d6d8", band: "#3d5f6e", bays: 6, verandah: 1.4, roof: "lean", window: "bars", doorEvery: 1, curtains: true, seed: 12 });
  rowR.position.set(6.5, 0, 1);
  rowR.rotation.y = Math.PI / 2;
  scene.add(rowR);
  const back = rowBlock({ w: 13, d: 4.5, h: 3.1, paint: "#e6d6b8", band: "#6b3f2a", bays: 4, verandah: 1.4, roof: "lean", window: "bars", doorEvery: 1, curtains: true, seed: 13 });
  back.position.set(0, 0, 10.2);
  scene.add(back);
  blockFence(scene, -9, -8.5, -2.6, -8.5);
  blockFence(scene, 2.6, -8.5, 9, -8.5);
  const gate = await placeProp(scene, "large_iron_gate", 0, -8.5, 0);
  const box = new THREE.Box3().setFromObject(gate);
  const size = box.getSize(new THREE.Vector3());
  gate.scale.setScalar(5.1 / Math.max(size.x, size.z));
  if (size.z > size.x) gate.rotation.y = Math.PI / 2;

  // Clothesline of wrappers across the yard (they sway in the breeze)
  const cloths: THREE.Mesh[] = [];
  const poleMat = MAT.frame;
  for (const x of [-4.5, 4.5]) addMesh(scene, new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6), poleMat, x, 1.2, 7.4);
  scene.add(cable(new THREE.Vector3(-4.5, 2.25, 7.4), new THREE.Vector3(4.5, 2.25, 7.4), 0.25, 0.01));
  for (let i = 0; i < 6; i++) {
    const x = -3.6 + i * 1.45;
    const sag = Math.sin(((x + 4.5) / 9) * Math.PI) * 0.25;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.1 + (i % 2) * 0.3), new THREE.MeshStandardMaterial({ map: ankaraTexture(i * 3 + 1), roughness: 0.95, side: THREE.DoubleSide }));
    cloth.position.set(x, 2.25 - sag - 0.6 - (i % 2) * 0.15, 7.4);
    cloth.castShadow = true;
    // Pivot at the line so the sway hinges from the top.
    cloth.geometry.translate(0, -0.55, 0);
    cloth.position.y += 0.55;
    scene.add(cloth);
    cloths.push(cloth);
  }
  const tank = waterTank();
  tank.position.set(5.2, 0, 8.8);
  scene.add(tank);
  await skyline(scene, 16, -40, 40, 21);
  if (detailed && props) {
    await Promise.all([
      placeProp(scene, "portable_generator", -4.6, 8.6, 0.6),
      placeProp(scene, "plastic_jerrycan", -3.9, 9.0, 0.2),
      placeProp(scene, "plastic_monobloc_chair_01", 3.8, -2.5, -Math.PI / 2 - 0.3),
      placeProp(scene, "plastic_monobloc_chair_01", 4.1, -1.4, -Math.PI / 2),
      placeProp(scene, "small_lpg_tank", -4.3, -1.6, 0),
      placeProp(scene, "pot_enamel_01", -3.9, -2.2, 0, 1, 0.42),
      placeProp(scene, "wooden_stool_01", -3.5, -3.0, 0),
      placeProp(scene, "wicker_basket_01", 4.6, 4.5, 0.4),
      placeProp(scene, "barrel_03", -4.8, 5.2, 0),
    ]);
    // Small gas stove under the pot
    const stove = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.5 }));
    stove.position.set(-3.9, 0.2, -2.2);
    stove.castShadow = true;
    scene.add(stove);
  }
  const rollers = !withRollers ? [] : await createTyreRollers(scene, [
    [new THREE.Vector3(-2.8, 0, -6.5), new THREE.Vector3(2.8, 0, -6.5), new THREE.Vector3(3.6, 0, -4.2), new THREE.Vector3(0, 0, -3.4), new THREE.Vector3(-3.6, 0, -4.2)],
  ]);
  let t = 0;
  return {
    id: "compound",
    spot: new THREE.Vector3(0, 0, 2),
    watchers: [
      ["emeka", "clap_m", -1.9, 2.3],
      ["tunde", "cheer_m", 1.9, 2.6],
      ["woman2", "clap_f", -1.4, 4.6],
      ["woman1", "sit_f", 4.1, -1.4],
      ["man2", "talk_m", 3.6, 5.5],
      ["woman2", "sit_f", -3.5, -3.0],
    ],
    update(dt) {
      t += dt;
      cloths.forEach((c, i) => (c.rotation.x = Math.sin(t * 1.4 + i * 1.7) * 0.1));
      updateTyreRollers(rollers, dt);
    },
    dispose() {
      for (const r of rollers) r.kid.dispose();
    },
  };
}

async function street(scene: THREE.Scene, detailed: boolean, walkers: number, traffic: number): Promise<Place> {
  await buildStreet(scene, { detailed, jail: false });
  const crowd = await createCrowd(scene, { walkers, traffic, rollers: true });
  return {
    id: "street",
    spot: new THREE.Vector3(36.5, 0, 11.3),
    watchers: [
      ["emeka", "clap_m", 34.6, 11.4],
      ["tunde", "cheer_m", 38.1, 12.7],
      ["woman1", "clap_f", 35.3, 13.7],
      ["man2", "idle_m", 38.5, 13.9],
      ["tunde", "clap_m", 38.5, 10.2],
    ],
    update(dt, cam) {
      crowd.update(dt, cam);
    },
    dispose() {
      crowd.dispose();
    },
  };
}

/** `props: false` leaves the compound yard bare so a game can lay out its own things. */
export async function buildPlace(scene: THREE.Scene, id: PlaceId, opts: { detailed: boolean; walkers: number; traffic: number; rollers?: boolean; props?: boolean }): Promise<Place> {
  if (id === "school") return schoolYard(scene, opts.detailed, opts.rollers ?? true);
  if (id === "compound") return compound(scene, opts.detailed, opts.rollers ?? true, opts.props ?? true);
  return street(scene, opts.detailed, opts.walkers, opts.traffic);
}
