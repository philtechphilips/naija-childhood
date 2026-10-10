import * as THREE from "three";
import { createRng, pick, type Rng } from "@/games/core/rng";
import { instantiateProp, pbrMaterial } from "./assets";
import {
  ankaraTexture,
  billboard,
  boxWorldUV,
  cable,
  danfo,
  electricPole,
  keke,
  litter,
  MAT,
  planeWorldUV,
  posterTexture,
  produceHeap,
  signTexture,
  stallTable,
  umbrella,
  waterTank,
} from "./procedural";
import {
  BUILDINGS,
  GUTTER,
  JAIL,
  KIOSKS,
  OUTER_BUILDINGS,
  POLES,
  ROAD,
  SIDE_STREET,
  STALLS,
  VEHICLES,
  WORLD,
  type BuildingSpec,
} from "./street-layout";

const GROUND_H = 3.5;
// Packaging colours you see on Nigerian shop shelves: noodle cartons, milk tins, detergent, malt, soap.
const PRODUCT_COLORS = [0xd8261c, 0xf2b705, 0x1d4fa0, 0xf4f1ea, 0x1f7a3b, 0xe86a12, 0x5a2a12, 0x111111, 0xc8c8c8, 0x7a1e5a];
const FLOOR_H = 3.1;

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function wallMat(paint: string, peeling: boolean) {
  const key = `${paint}|${peeling}`;
  let m = matCache.get(key);
  if (!m) {
    m = pbrMaterial(peeling ? "peeling_painted_wall" : "painted_plaster_wall", { tint: paint, normalScale: 0.8 });
    matCache.set(key, m);
  }
  return m;
}

/**
 * Shared materials: identical-looking parts reuse one material, so they can be
 * merged and drawn together instead of one draw call each.
 */
const shared = new Map<string, THREE.Material>();
function sharedMat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = shared.get(key);
  if (!m) {
    m = make();
    shared.set(key, m);
  }
  return m as T;
}
const GOODS_MAT = new THREE.MeshStandardMaterial({ roughness: 0.45 });

let grimeTex: THREE.CanvasTexture | null = null;
/** Rain-splash grime at the foot of walls: a vertical gradient decal. */
export function grime() {
  if (grimeTex) return grimeTex;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const rng = createRng(4);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(60,38,22,0)");
  g.addColorStop(0.55, "rgba(60,38,22,0.28)");
  g.addColorStop(1, "rgba(50,30,18,0.7)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(70,40,20,${0.08 + rng() * 0.15})`;
    const x = rng() * 256;
    ctx.fillRect(x, 40 + rng() * 60, 1 + rng() * 3, 30 + rng() * 60);
  }
  grimeTex = new THREE.CanvasTexture(c);
  grimeTex.colorSpace = THREE.SRGBColorSpace;
  grimeTex.wrapS = THREE.RepeatWrapping;
  return grimeTex;
}

export function addMesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A Lagos shophouse: shops on the ground floor, flats above, water tank on the roof. */
export async function building(spec: BuildingSpec, signOffset: number, detailed: boolean): Promise<THREE.Group> {
  const rng = createRng(spec.seed * 97);
  const g = new THREE.Group();
  const { w, d, floors } = spec;
  const upperH = (floors - 1) * FLOOR_H;
  const totalH = GROUND_H + upperH;
  const wall = wallMat(spec.paint, rng() < 0.35);
  const shopDepth = 2.2;

  // Upper storeys (full footprint) and the ground-floor back block.
  if (upperH > 0) addMesh(g, boxWorldUV(w, upperH, d, 2.5), wall, 0, GROUND_H + upperH / 2, -d / 2);
  addMesh(g, boxWorldUV(w, GROUND_H, d - shopDepth, 2.5), wall, 0, GROUND_H / 2, -shopDepth - (d - shopDepth) / 2);
  // Floor slab band between storeys
  const band = sharedMat(`band|${spec.paint}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.paint).multiplyScalar(0.82), roughness: 0.9 }));
  addMesh(g, new THREE.BoxGeometry(w + 0.1, 0.22, 0.12), band, 0, GROUND_H, 0.03);

  // Shopfronts
  const shops = spec.shops;
  const pillarW = 0.45;
  const bay = (w - pillarW) / shops;
  const openW = bay - pillarW;
  for (let i = 0; i <= shops; i++) {
    const x = -w / 2 + pillarW / 2 + i * bay;
    addMesh(g, boxWorldUV(pillarW, GROUND_H, shopDepth, 2.5), wall, x, GROUND_H / 2, -shopDepth / 2);
  }
  const shutter = detailed ? await instantiateProp("rollershutter_door") : null;
  // Every shelf item in the building goes into one instanced mesh (one draw call).
  const goodsAt: THREE.Matrix4[] = [];
  const goodsColor: THREE.Color[] = [];
  for (let i = 0; i < shops; i++) {
    const cx = -w / 2 + pillarW + openW / 2 + i * bay;
    // Dim interior: floor, back wall, shelves stocked with goods.
    addMesh(g, new THREE.PlaneGeometry(openW, shopDepth).rotateX(-Math.PI / 2), MAT.interior, cx, 0.01, -shopDepth / 2, false);
    addMesh(g, new THREE.BoxGeometry(openW, GROUND_H, 0.05), MAT.interior, cx, GROUND_H / 2, -shopDepth + 0.03, false);
    const closed = rng() < 0.22;
    if (!closed) {
      const shelfMat = MAT.woodDark;
      for (let s = 0; s < 3; s++) {
        addMesh(g, new THREE.BoxGeometry(openW - 0.3, 0.04, 0.45), shelfMat, cx, 0.6 + s * 0.6, -shopDepth + 0.3, false);
        for (let k = 0; k < 10; k++) {
          goodsAt.push(new THREE.Matrix4().makeTranslation(cx - openW / 2 + 0.35 + (k / 10) * (openW - 0.6), 0.74 + s * 0.6, -shopDepth + 0.3));
          goodsColor.push(new THREE.Color(pick(rng, PRODUCT_COLORS)).multiplyScalar(0.75 + rng() * 0.35));
        }
      }
    }
    if (shutter) {
      const sh = shutter.clone(true);
      const box = new THREE.Box3().setFromObject(sh);
      const sz = box.getSize(new THREE.Vector3());
      sh.scale.set(openW / sz.x, (closed ? 2.65 : 0.55) / sz.y, 1);
      sh.position.set(cx, closed ? 0 : 2.65, -0.05);
      g.add(sh);
    }
    // Hand-painted signboard
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(openW + pillarW * 0.6, 0.85), new THREE.MeshStandardMaterial({ map: signTexture(signOffset + i), roughness: 0.65 }));
    sign.position.set(cx, GROUND_H - 0.5, 0.06);
    sign.receiveShadow = true;
    g.add(sign);
  }

  if (goodsAt.length) {
    const goods = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.24, 0.14), GOODS_MAT, goodsAt.length);
    goodsAt.forEach((m, k) => {
      goods.setMatrixAt(k, m);
      goods.setColorAt(k, goodsColor[k]!);
    });
    g.add(goods);
  }

  // Corrugated canopy over the sidewalk, on thin steel posts.
  if (detailed) {
    const canopyMat = sharedMat("canopy", () => pbrMaterial("rusty_corrugated_iron", { roughness: 1 }));
    const canopy = new THREE.Mesh(boxWorldUV(w, 0.04, 1.9, 1.2), canopyMat);
    canopy.position.set(0, GROUND_H + 0.02, 0.95);
    canopy.rotation.x = 0.12;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    g.add(canopy);
    for (const x of [-w / 2 + 0.2, w / 2 - 0.2, ...(w > 14 ? [0] : [])]) {
      addMesh(g, new THREE.CylinderGeometry(0.035, 0.035, GROUND_H - 0.1, 6), MAT.frame, x, (GROUND_H - 0.1) / 2, 1.82);
    }
  }

  // Upper-floor windows with burglar-proof bars, the odd balcony and laundry.
  for (let f = 1; f < floors; f++) {
    const y = GROUND_H + (f - 1) * FLOOR_H + 1.55;
    const nWin = Math.max(2, Math.round(w / 3.2));
    const balcony = detailed && rng() < 0.45;
    for (let i = 0; i < nWin; i++) {
      const x = -w / 2 + (i + 0.5) * (w / nWin);
      addMesh(g, new THREE.BoxGeometry(1.35, 1.3, 0.06), MAT.darkGlass, x, y, 0.01, false);
      addMesh(g, new THREE.BoxGeometry(1.5, 0.08, 0.16), MAT.concrete, x, y - 0.7, 0.06);
      if (detailed) {
        const bars = new THREE.Group();
        for (let b = 0; b < 9; b++) addMesh(bars, new THREE.BoxGeometry(0.018, 1.3, 0.018), MAT.ironBlack, -0.62 + b * 0.155, 0, 0, false);
        for (const by of [-0.35, 0.35]) addMesh(bars, new THREE.BoxGeometry(1.32, 0.018, 0.018), MAT.ironBlack, 0, by, 0, false);
        bars.position.set(x, y, 0.07);
        g.add(bars);
        // AC unit or a curtain behind the glass
        if (rng() < 0.18) addMesh(g, new THREE.BoxGeometry(0.8, 0.5, 0.35), sharedMat("ac", () => new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.5 })), x + 0.9, y - 0.4, 0.2);
        else if (rng() < 0.5) {
          const hue = Math.floor(rng() * 8) / 8;
          const cur = sharedMat(`curtain|${hue}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.4, 0.45), roughness: 0.9 }));
          addMesh(g, new THREE.PlaneGeometry(0.6, 1.15), cur, x - 0.3, y, 0.045, false);
        }
      }
    }
    if (balcony) {
      const bw = Math.min(w * 0.45, 5.5);
      const bx = (rng() - 0.5) * (w - bw);
      const by = GROUND_H + (f - 1) * FLOOR_H + 0.15;
      addMesh(g, new THREE.BoxGeometry(bw, 0.16, 1.1), MAT.concrete, bx, by, 0.55);
      const rail = new THREE.Group();
      addMesh(rail, new THREE.BoxGeometry(bw, 0.05, 0.05), MAT.ironBlack, 0, 0.95, 0, false);
      for (let r = 0; r <= bw / 0.14; r++) addMesh(rail, new THREE.BoxGeometry(0.02, 0.95, 0.02), MAT.ironBlack, -bw / 2 + r * 0.14, 0.47, 0, false);
      rail.position.set(bx, by + 0.08, 1.08);
      g.add(rail);
      // Laundry on the rail: wrappers and shirts drying in the sun.
      for (let k = 0; k < 4; k++) {
        if (rng() < 0.3) continue;
        const pattern = Math.floor(rng() * 10);
        const cloth = sharedMat(`cloth|${pattern}`, () => new THREE.MeshStandardMaterial({ map: ankaraTexture(pattern), roughness: 0.95, side: THREE.DoubleSide }));
        addMesh(g, new THREE.PlaneGeometry(0.55, 0.7 + rng() * 0.3), cloth, bx - bw / 2 + 0.5 + k * (bw / 4), by + 0.7, 1.12, false);
      }
    }
  }

  // Roof
  if (spec.roof === "parapet") {
    const ph = 0.8;
    addMesh(g, boxWorldUV(w, ph, 0.2, 2.5), wall, 0, totalH + ph / 2, -0.1);
    addMesh(g, boxWorldUV(w, ph, 0.2, 2.5), wall, 0, totalH + ph / 2, -d + 0.1);
    addMesh(g, boxWorldUV(0.2, ph, d, 2.5), wall, -w / 2 + 0.1, totalH + ph / 2, -d / 2);
    addMesh(g, boxWorldUV(0.2, ph, d, 2.5), wall, w / 2 - 0.1, totalH + ph / 2, -d / 2);
    if (detailed) {
      const tanks = 1 + Math.floor(rng() * 2);
      for (let t = 0; t < tanks; t++) {
        const tank = waterTank();
        tank.position.set(-w / 4 + t * (w / 2.5), totalH, -d * 0.55);
        g.add(tank);
      }
    }
  } else {
    const ironName = rng() < 0.6 ? "rusty_corrugated_iron" : "corrugated_iron_02";
    const iron = sharedMat(`roof|${ironName}`, () => pbrMaterial(ironName, { roughness: 1 }));
    const rise = 1.5;
    const half = d / 2 + 0.35;
    const slope = Math.atan2(rise, half);
    const len = Math.hypot(rise, half);
    for (const side of [1, -1]) {
      // side 1 = front slope (z from +0.35 up to the ridge at -d/2), side -1 = back slope
      const r = new THREE.Mesh(boxWorldUV(w + 0.5, 0.04, len, 1.2), iron);
      r.position.set(0, totalH + rise / 2, -d / 2 + side * (half / 2));
      r.rotation.x = side * slope;
      r.castShadow = true;
      r.receiveShadow = true;
      g.add(r);
    }
    // Gable ends
    const gableMat = sharedMat(`gable|${spec.paint}`, () => new THREE.MeshStandardMaterial({ color: spec.paint, roughness: 0.95, side: THREE.DoubleSide }));
    const tri = new THREE.Shape();
    tri.moveTo(-d / 2, 0);
    tri.lineTo(d / 2, 0);
    tri.lineTo(0, rise);
    tri.closePath();
    for (const sx of [-w / 2 + 0.01, w / 2 - 0.01]) {
      const gable = new THREE.Mesh(new THREE.ShapeGeometry(tri), gableMat);
      gable.rotation.y = Math.PI / 2;
      gable.position.set(sx, totalH, -d / 2);
      g.add(gable);
    }
  }

  // Rain grime along the base of the facade.
  const grimeMat = sharedMat("grime", () => new THREE.MeshBasicMaterial({ map: grime(), transparent: true, depthWrite: false }));
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.9), grimeMat);
  gm.position.set(0, 0.45, 0.07);
  g.add(gm);

  // Posters on the pillars
  if (detailed && rng() < 0.7) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), new THREE.MeshStandardMaterial({ map: posterTexture(spec.seed), roughness: 0.8 }));
    p.position.set(-w / 2 + pillarW / 2, 1.5, 0.01);
    p.rotation.y = 0;
    p.position.z = 0.005;
    g.add(p);
  }

  // Place in the world: front of the building faces the road.
  if (spec.facing === 1) {
    g.position.set(spec.x + w / 2, 0, spec.z + d);
  } else {
    g.position.set(spec.x + w / 2, 0, spec.z);
    g.rotation.y = Math.PI;
  }
  return g;
}

function ground(scene: THREE.Scene, withJail: boolean) {
  const laterite = pbrMaterial("red_laterite_soil_stones", { normalScale: 1.1 });
  const road = pbrMaterial("road_damaged", { normalScale: 1 });
  const paving = pbrMaterial("patterned_paving_02", { tint: "#d9cfc2" });
  const concrete = pbrMaterial("dirty_concrete");

  const big = new THREE.Mesh(planeWorldUV(400, 300, 3), laterite);
  big.position.set(WORLD.w / 2, -0.02, WORLD.d / 2);
  big.receiveShadow = true;
  scene.add(big);

  const roadLen = 160;
  const r = new THREE.Mesh(planeWorldUV(roadLen, ROAD.z1 - ROAD.z0, 7), road);
  r.position.set(WORLD.w / 2, 0.005, (ROAD.z0 + ROAD.z1) / 2);
  r.receiveShadow = true;
  scene.add(r);

  // Sidewalks with interlocking paving stones.
  for (const [z0, z1] of [
    [ROAD.z1 + GUTTER, 33.5],
    [16, ROAD.z0 - GUTTER],
  ] as const) {
    const s = new THREE.Mesh(planeWorldUV(roadLen, z1 - z0, 1.6), paving);
    s.position.set(WORLD.w / 2, 0.012, (z0 + z1) / 2);
    s.receiveShadow = true;
    scene.add(s);
  }

  // Open drainage gutters along both sides of the road.
  for (const z0 of [ROAD.z0 - GUTTER, ROAD.z1]) {
    const trench = new THREE.Group();
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, GUTTER).rotateX(-Math.PI / 2), MAT.water);
    bottom.position.set(0, -0.42, GUTTER / 2);
    trench.add(bottom);
    const curb = new THREE.MeshStandardMaterial({ color: 0xa8a39a, roughness: 0.9 });
    const inner = new THREE.MeshStandardMaterial({ color: 0x3b3630, roughness: 1 });
    for (const zz of [0, GUTTER]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(roadLen, 0.5, 0.06), inner);
      w.position.set(0, -0.22, zz + (zz === 0 ? 0.03 : -0.03));
      trench.add(w);
      const c = new THREE.Mesh(boxWorldUV(roadLen, 0.1, 0.16, 1.5), curb);
      c.position.set(0, 0.04, zz + (zz === 0 ? -0.08 : 0.08));
      c.castShadow = true;
      c.receiveShadow = true;
      trench.add(c);
    }
    // Slab crossings every few metres
    for (let x = -roadLen / 2 + 4; x < roadLen / 2; x += 9.5) {
      const slab = new THREE.Mesh(boxWorldUV(1.2, 0.08, GUTTER + 0.2, 1.5), concrete);
      slab.position.set(x, 0.01, GUTTER / 2);
      slab.castShadow = true;
      slab.receiveShadow = true;
      trench.add(slab);
    }
    trench.position.set(WORLD.w / 2, 0, z0);
    scene.add(trench);
  }

  // Side street and back yards: bare laterite (already the base ground).
  if (!withJail) return;
  // Chalk jail square
  const jc = document.createElement("canvas");
  jc.width = 512;
  jc.height = 512;
  const ctx = jc.getContext("2d")!;
  const rng = createRng(31);
  ctx.strokeStyle = "rgba(245,240,230,0.85)";
  ctx.lineCap = "round";
  for (let pass = 0; pass < 3; pass++) {
    ctx.lineWidth = 9 + rng() * 6;
    ctx.globalAlpha = 0.45 + rng() * 0.3;
    ctx.beginPath();
    const j = () => (rng() - 0.5) * 8;
    ctx.moveTo(24 + j(), 24 + j());
    ctx.lineTo(488 + j(), 24 + j());
    ctx.lineTo(488 + j(), 488 + j());
    ctx.lineTo(24 + j(), 488 + j());
    ctx.closePath();
    ctx.stroke();
  }
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "rgba(245,240,230,0.85)";
  ctx.font = "900 110px Arial Black, Arial";
  ctx.textAlign = "center";
  ctx.fillText("JAIL", 256, 300);
  const jt = new THREE.CanvasTexture(jc);
  jt.colorSpace = THREE.SRGBColorSpace;
  const jail = new THREE.Mesh(new THREE.PlaneGeometry(JAIL.w, JAIL.d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: jt, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  jail.position.set(JAIL.x + JAIL.w / 2, 0.02, JAIL.z + JAIL.d / 2);
  jail.receiveShadow = true;
  scene.add(jail);
}

async function compoundWall(scene: THREE.Object3D) {
  const block = pbrMaterial("concrete_block_wall", { tint: "#e8e0d0" });
  const z = WORLD.d + 0.15;
  const h = 2.4;
  for (const [x0, x1] of [
    [-45, SIDE_STREET.x0 + 1.2],
    [SIDE_STREET.x1 - 1.2, 115],
  ] as const) {
    addMesh(scene, boxWorldUV(x1 - x0, h, 0.3, 1.2), block, (x0 + x1) / 2, h / 2, z);
  }
  const gate = await instantiateProp("large_iron_gate");
  const box = new THREE.Box3().setFromObject(gate);
  const size = box.getSize(new THREE.Vector3());
  const sx = 5.6 / Math.max(size.x, size.z);
  gate.scale.setScalar(sx);
  gate.position.set((SIDE_STREET.x0 + SIDE_STREET.x1) / 2, 0, z);
  if (size.z > size.x) gate.rotation.y = Math.PI / 2;
  scene.add(gate);
}

export async function placeProp(scene: THREE.Object3D, id: string, x: number, z: number, rot = 0, scale = 1, y = 0) {
  const p = await instantiateProp(id);
  p.position.set(x, y, z);
  p.rotation.y = rot;
  p.scale.setScalar(scale);
  scene.add(p);
  return p;
}

async function market(scene: THREE.Object3D, detailed: boolean) {
  const goodsColor: Record<string, number> = { tomato: 0xc8261c, pepper: 0xd8401c, orange: 0xe8901c };
  for (const s of STALLS) {
    const g = new THREE.Group();
    g.add(stallTable());
    const u = umbrella(s.seed);
    u.position.set(0.2, 0, -0.1);
    g.add(u);
    if (s.goods in goodsColor) {
      for (const x of [-0.6, 0, 0.6]) {
        const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0xc9c2b3, roughness: 0.4, metalness: 0.6 }));
        tray.position.set(x, 0.87, 0);
        g.add(tray);
        const heap = produceHeap(goodsColor[s.goods]!, s.goods === "pepper" ? 40 : 26, s.goods === "orange" ? 0.06 : s.goods === "pepper" ? 0.03 : 0.045, s.seed * 10 + x * 10);
        heap.position.set(x, 0.9, 0);
        g.add(heap);
      }
    } else if (detailed) {
      const id = s.goods === "banana" ? "bananas" : s.goods === "pots" ? "pot_enamel_01" : s.goods === "basket" ? "wicker_basket_01" : "plastic_crate_01";
      for (const x of [-0.6, 0.1, 0.7]) await placeProp(g, id, x, 0, (x * 3) % 1, id === "bananas" ? 1.6 : 1, 0.85);
    }
    if (detailed) await placeProp(g, Math.round(s.seed) % 2 ? "wooden_stool_01" : "plastic_monobloc_chair_01", 0.3, -1.0, Math.PI, 1);
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rot;
    scene.add(g);
  }

  // Provision kiosks
  const kioskMat = pbrMaterial("rusted_shutter", { tint: "#3b6ea8" });
  for (const k of KIOSKS) {
    const g = new THREE.Group();
    addMesh(g, boxWorldUV(k.w, 2.3, k.d, 1.5), kioskMat, 0, 1.15, 0);
    addMesh(g, new THREE.BoxGeometry(k.w - 0.3, 1.3, 0.05), MAT.interior, 0, 1.45, k.d / 2 + 0.01, false);
    addMesh(g, new THREE.BoxGeometry(k.w + 0.6, 0.05, 0.9), kioskMat, 0, 2.25, k.d / 2 + 0.3);
    // Sachet strips (seasoning, detergent, beverage) hanging across the window.
    for (let i = 0; i < 9; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((i * 0.13) % 1, 0.75, 0.5), roughness: 0.4, side: THREE.DoubleSide }));
      strip.position.set(-k.w / 2 + 0.3 + i * ((k.w - 0.6) / 8), 1.7, k.d / 2 + 0.06);
      g.add(strip);
    }
    g.position.set(k.x + k.w / 2, 0, k.z + k.d / 2);
    scene.add(g);
  }
}

async function vehicles(scene: THREE.Object3D) {
  for (const v of VEHICLES) {
    let obj: THREE.Object3D;
    if (v.kind === "danfo") obj = danfo(v.seed);
    else if (v.kind === "keke") obj = keke(v.seed);
    else {
      obj = await instantiateProp("covered_car");
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      obj.scale.setScalar(4.4 / Math.max(size.x, size.z));
      if (size.z > size.x) obj.rotation.y = Math.PI / 2;
      const wrap = new THREE.Group();
      wrap.add(obj);
      obj = wrap;
    }
    obj.position.set(v.x, 0, v.z);
    obj.rotation.y += v.rot;
    scene.add(obj);
  }
}

function utilities(scene: THREE.Object3D, rng: Rng) {
  const tops: THREE.Vector3[] = [];
  for (const p of POLES) {
    const pole = electricPole(8.5 + rng() * 1.2);
    pole.position.set(p.x, 0, p.z);
    pole.rotation.y = (rng() - 0.5) * 0.2;
    if (rng() < 0.3) pole.getObjectByName("transformer")!.visible = true;
    scene.add(pole);
    tops.push(new THREE.Vector3(p.x, 8.2, p.z));
  }
  // Main lines along each side of the road, plus the tangle of service drops to buildings.
  const north = tops.filter((t) => t.z > 25).sort((a, b) => a.x - b.x);
  const south = tops.filter((t) => t.z < 25 && t.z > 10).sort((a, b) => a.x - b.x);
  for (const row of [north, south]) {
    for (let i = 0; i < row.length - 1; i++) {
      for (const dz of [-0.8, -0.3, 0.3, 0.8]) {
        const a = row[i]!.clone().add(new THREE.Vector3(0, 0, dz * 0.4));
        const b = row[i + 1]!.clone().add(new THREE.Vector3(0, 0, dz * 0.4));
        a.x += dz;
        b.x += dz;
        scene.add(cable(a, b, 0.5 + rng() * 0.4));
      }
    }
    for (const t of row) {
      for (let k = 0; k < 3; k++) {
        const target = new THREE.Vector3(t.x + (rng() - 0.5) * 10, GROUND_H + 1.2 + rng() * 2.5, t.z > 25 ? 33.5 : 4.5);
        scene.add(cable(t.clone(), target, 0.8 + rng() * 0.6, 0.008));
      }
    }
  }
}

async function clutter(scene: THREE.Object3D) {
  // Generators ("I better pass my neighbour") with jerrycans, gas cylinders, tyres, crates.
  const spots: [string, number, number, number, number?][] = [
    ["portable_generator", 6.5, 32.6, 0.4],
    ["plastic_jerrycan", 7.4, 32.9, 1.2],
    ["portable_generator", 45, 32.7, -0.3],
    ["plastic_jerrycan", 45.8, 32.9, 0.2],
    ["plastic_jerrycan", 46.2, 33.0, 2.2],
    ["small_lpg_tank", 22.3, 32.9, 0],
    ["small_lpg_tank", 22.9, 33.0, 1],
    ["old_tyre", 57.5, 32.8, 0],
    ["old_tyre", 58.2, 32.9, 0.5, 1],
    ["barrel_03", 62, 33.0, 0],
    ["plastic_crate_01", 26.5, 33.0, 0.2],
    ["plastic_crate_01", 26.5, 33.0, 0.2, 0.42],
    ["portable_generator", 18, 17.0, 2.9],
    ["plastic_jerrycan", 17.1, 16.7, 0.4],
    ["plastic_crate_01", 52, 16.6, 0],
    ["plastic_crate_01", 52.6, 16.7, 0.4],
    ["utility_box_01", 20.6, 30.6, 0],
    ["wooden_crate_01", 36.2, 47.5, 0.3],
    ["barrel_03", 31, 47.6, 0],
    ["shrub_01", 4, 49, 0],
    ["shrub_01", 26, 49, 1.2],
    ["shrub_01", 44, 49.2, 2.1],
    ["plastic_monobloc_chair_01", 24.2, 32.4, 2.6],
    ["plastic_monobloc_chair_01", 25.0, 32.2, 3.4],
    ["street_lamp_01", 41.4, 30.6, Math.PI],
  ];
  await Promise.all(spots.map(([id, x, z, rot, y]) => placeProp(scene, id, x, z, rot, 1, y ?? 0)));
  scene.add(litter({ x: -10, z: 16, w: 90, d: 3.3 }, 140, 3));
  scene.add(litter({ x: -10, z: 29.7, w: 90, d: 3.8 }, 140, 4));
  scene.add(litter({ x: 0, z: 5, w: 70, d: 11 }, 160, 5));
  scene.add(litter({ x: SIDE_STREET.x0, z: 33.5, w: 8, d: 16 }, 40, 6));
}

export interface StreetScene {
  root: THREE.Group;
}

/** Builds the full street. Lower quality skips the fine detail (bars, laundry, props). */
export async function buildStreet(scene: THREE.Scene, { detailed = true, seed = 7, jail = true }: { detailed?: boolean; seed?: number; jail?: boolean } = {}): Promise<StreetScene> {
  const root = new THREE.Group();
  scene.add(root);
  const rng = createRng(seed);
  ground(scene, jail);
  let signs = 0;
  const builds = [...BUILDINGS, ...OUTER_BUILDINGS].map((b) => {
    const p = building(b, signs, detailed);
    signs += b.shops;
    return p;
  });
  // Back rows: rooftops visible behind the street, receding into the haze.
  const back: BuildingSpec[] = [];
  const paints = ["#e2d6bd", "#c9d6dc", "#e8c9a0", "#d3dcc5", "#e9e4da", "#d9b9ad"];
  for (const [z, facing] of [
    [52, -1],
    [-19, 1],
  ] as const) {
    for (let x = -40, i = 0; x < 110; i++) {
      const w = 10 + rng() * 8;
      back.push({ x, z, w, d: 10, floors: 2 + Math.floor(rng() * 3), facing, paint: paints[i % paints.length]!, shops: 2, roof: rng() < 0.5 ? "zinc" : "parapet", seed: 40 + i + (z > 0 ? 0 : 100) });
      x += w + 0.6 + rng() * 2;
    }
  }
  builds.push(...back.map((b) => building(b, 0, false)));
  for (const b of await Promise.all(builds)) root.add(b);
  await Promise.all([compoundWall(root), market(root, detailed), vehicles(root)]);
  // Rooftop billboards facing the road.
  const boards: [number, number, number, number][] = [
    [21.5, 33.5 + 5.5, 3.5 + 3.1 * 2 + 0.8, Math.PI],
    [60, 33.5 + 5, 3.5 + 3.1 + 0.8, Math.PI],
    [25, -6 + 5, 3.5 + 3.1 * 2 + 0.8, 0],
  ];
  boards.forEach(([x, z, y, rot], i) => {
    const b = billboard(i);
    b.position.set(x, y, z);
    b.rotation.y = rot;
    root.add(b);
  });
  utilities(root, rng);
  if (detailed) await clutter(root);
  return { root };
}
