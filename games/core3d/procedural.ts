import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng, type Rng } from "@/games/core/rng";

/** BoxGeometry whose UVs are in world metres / tile, so textures keep real-world scale. */
export function boxWorldUV(w: number, h: number, d: number, tile = 1): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z (4 vertices each)
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f]!;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * du) / tile, (uv.getY(i) * dv) / tile);
    }
  }
  uv.needsUpdate = true;
  return g;
}

export function planeWorldUV(w: number, d: number, tile = 1): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  return g;
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true) => {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = receive;
  return o;
};

// ------------------------------------------------------------------ materials

export const MAT = {
  darkGlass: new THREE.MeshStandardMaterial({ color: 0x1b2326, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x5b5f61, roughness: 0.6, metalness: 0.6 }),
  ironBlack: new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.55, metalness: 0.7 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.22, metalness: 1 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8a857b, roughness: 0.95 }),
  interior: new THREE.MeshStandardMaterial({ color: 0x18130f, roughness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.85 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x4e3523, roughness: 0.9 }),
  tankBlack: new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.55 }),
  cable: new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.6 }),
  water: new THREE.MeshStandardMaterial({ color: 0x2c2a1c, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.2 }),
};

/** Car paint with clearcoat: reflects the sky like real bodywork. */
export function paint(color: THREE.ColorRepresentation, dirt = 0.1) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.35 + dirt, metalness: 0.1, clearcoat: 0.7 - dirt, clearcoatRoughness: 0.25 + dirt });
}

// ------------------------------------------------------------------ signboards

export const SHOP_SIGNS: { title: string; lines: string[]; bg: string; fg: string; accent: string }[] = [
  { title: "MAMA NKECHI PROVISIONS", lines: ["Beverages • Detergent • Toiletries", "Wholesale & Retail"], bg: "#1f6f43", fg: "#ffffff", accent: "#ffd23f" },
  { title: "GOD'S TIME BARBING SALON", lines: ["Gentle cut • Low cut • Dyeing", "Unisex"], bg: "#f4f0e6", fg: "#b3121b", accent: "#1c3d7a" },
  { title: "IYA BASIRA BUKA", lines: ["Amala • Ewedu • Gbegiri • Pounded Yam", "Food is ready!"], bg: "#c8321f", fg: "#fff6dc", accent: "#ffd23f" },
  { title: "BLESSED CHILD PHARMACY", lines: ["Drugs • Baby products • Cosmetics", "Pharmacist on duty"], bg: "#ffffff", fg: "#0a7a3b", accent: "#d61f26" },
  { title: "ADEX PHONES & ACCESSORIES", lines: ["Sales • Repairs • Charging", "Recharge card sold here"], bg: "#162a52", fg: "#ffffff", accent: "#ffb703" },
  { title: "JESUS IS LORD BUSINESS CENTRE", lines: ["Photocopy • Typing • Lamination • Printing", "We also do passport photograph"], bg: "#fff3a8", fg: "#1b1b1b", accent: "#c0181f" },
  { title: "ALHAJI MUSA & SONS", lines: ["Building materials • Cement • Iron rod", "Plumbing & electrical"], bg: "#2e5e8c", fg: "#ffffff", accent: "#f2c230" },
  { title: "ODOGWU FASHION HOUSE", lines: ["Native • Ankara • Aso-ebi", "Male & female tailoring"], bg: "#5b1f6e", fg: "#fff2c2", accent: "#f2a93b" },
  { title: "UNCLE B SPARE PARTS", lines: ["Keke • Okada • Danfo parts", "Vulcanizer available"], bg: "#2b2b2b", fg: "#ffcf26", accent: "#e23b2a" },
  { title: "FAVOUR HAIR & BEAUTY", lines: ["Braiding • Weaving • Pedicure", "Wedding make-up"], bg: "#f7c6d9", fg: "#7a1440", accent: "#1d1d1d" },
  { title: "OLUWASEUN CHEMIST", lines: ["Patent medicine store", "Open 24 hours"], bg: "#e8f4ee", fg: "#0b5d36", accent: "#b81d24" },
  { title: "MAMA PUT KITCHEN", lines: ["Jollof rice • Fried rice • Beans & plantain", "Take-away available"], bg: "#f29a1e", fg: "#2a1203", accent: "#ffffff" },
];

const POSTERS = [
  { t: "ROOM & PARLOUR TO LET", s: "Self-contain also available", bg: "#ffffff", fg: "#c0181f" },
  { t: "MEGA CRUSADE", s: "Come and receive your miracle", bg: "#13235b", fg: "#ffd23f" },
  { t: "LESSON TEACHER", s: "WAEC • NECO • JAMB coaching", bg: "#fff4b0", fg: "#1a1a1a" },
  { t: "POST NO BILL", s: "By order", bg: "#f2f2f2", fg: "#b00000" },
];

function weather(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, amount = 1) {
  // Grime, sun-fade and rust streaks so signs look like they've survived Lagos rainy seasons.
  for (let i = 0; i < 40 * amount; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 10 + rng() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rng() < 0.5 ? "70,45,25" : "255,250,235"},${0.05 + rng() * 0.12})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 14 * amount; i++) {
    const x = rng() * w;
    const len = h * (0.2 + rng() * 0.6);
    const grad = ctx.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, "rgba(120,60,25,0.35)");
    grad.addColorStop(1, "rgba(120,60,25,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, rng() < 0.5 ? 0 : h * 0.1, 2 + rng() * 4, len);
  }
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * 18 * amount;
    img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, font: string) {
  let s = size;
  do {
    ctx.font = `900 ${s}px ${font}`;
    if (ctx.measureText(text).width <= maxW) break;
    s -= 2;
  } while (s > 10);
  return s;
}

const SIGN_FONT = `"Arial Black", "Helvetica Neue", Impact, Arial, sans-serif`;
const signCache = new Map<number, THREE.CanvasTexture>();

export function signTexture(index: number): THREE.CanvasTexture {
  const cached = signCache.get(index);
  if (cached) return cached;
  const s = SHOP_SIGNS[index % SHOP_SIGNS.length]!;
  const W = 1024;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const rng = createRng(1000 + index);
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = s.accent;
  ctx.fillRect(0, 0, W, 14);
  ctx.fillRect(0, H - 14, W, 14);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = s.fg;
  fitText(ctx, s.title, W - 70, 96, SIGN_FONT);
  ctx.fillText(s.title, W / 2, 92);
  ctx.font = `700 34px Arial, sans-serif`;
  ctx.fillStyle = s.fg;
  s.lines.forEach((l, i) => {
    fitText(ctx, l, W - 120, 36, "Arial, sans-serif");
    ctx.globalAlpha = 0.92;
    ctx.fillText(l, W / 2, 168 + i * 42);
  });
  ctx.globalAlpha = 1;
  weather(ctx, rng, W, H, 1.1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  signCache.set(index, t);
  return t;
}

export function posterTexture(index: number): THREE.CanvasTexture {
  const p = POSTERS[index % POSTERS.length]!;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 340;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, 256, 340);
  ctx.fillStyle = p.fg;
  ctx.textAlign = "center";
  const words = p.t.split(" ");
  words.forEach((w, i) => {
    fitText(ctx, w, 230, 64, SIGN_FONT);
    ctx.fillText(w, 128, 80 + i * 66);
  });
  ctx.font = "700 20px Arial";
  ctx.fillText(p.s, 128, 300, 236);
  weather(ctx, createRng(77 + index), 256, 340, 1.4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ vehicles

let grimeTex: THREE.CanvasTexture | null = null;
/** Tileable road grime: dust, mud splash and scratches, multiplied over paintwork. */
export function vehicleGrime(): THREE.CanvasTexture {
  if (grimeTex) return grimeTex;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const rng = createRng(17);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 512, 512);
  // Fine dust speckle plus a few soft mud smudges: subtle, so paint still reads as paint.
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${120 + rng() * 40},${95 + rng() * 25},${60 + rng() * 20},${0.04 + rng() * 0.08})`;
    const r = 0.6 + rng() * 2.2;
    g.fillRect(rng() * 512, rng() * 512, r, r);
  }
  for (let i = 0; i < 26; i++) {
    const x = rng() * 512;
    const y = rng() * 512;
    const r = 10 + rng() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(120,92,60,${0.04 + rng() * 0.06})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = "rgba(60,50,40,0.18)";
  for (let i = 0; i < 18; i++) {
    g.lineWidth = 0.5 + rng();
    g.beginPath();
    const x = rng() * 512;
    const y = rng() * 512;
    g.moveTo(x, y);
    g.lineTo(x + (rng() - 0.5) * 60, y + (rng() - 0.5) * 12);
    g.stroke();
  }
  grimeTex = new THREE.CanvasTexture(c);
  grimeTex.colorSpace = THREE.SRGBColorSpace;
  grimeTex.wrapS = grimeTex.wrapT = THREE.RepeatWrapping;
  grimeTex.repeat.set(0.45, 0.45);
  return grimeTex;
}

function plateTexture(seed: number): THREE.CanvasTexture {
  const rng = createRng(seed * 13 + 1);
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 80;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f3ee";
  g.fillRect(0, 0, 256, 80);
  g.strokeStyle = "#1c3d7a";
  g.lineWidth = 4;
  g.strokeRect(3, 3, 250, 74);
  g.fillStyle = "#1c3d7a";
  g.font = "700 14px Arial";
  g.textAlign = "center";
  g.fillText("LAGOS", 128, 20);
  const L = () => String.fromCharCode(65 + Math.floor(rng() * 26));
  g.fillStyle = "#151515";
  g.font = "900 34px Arial";
  g.fillText(`${L()}${L()}${L()} ${100 + Math.floor(rng() * 899)} ${L()}${L()}`, 128, 58);
  g.fillStyle = "#1a7a3c";
  g.font = "700 10px Arial";
  g.fillText("CENTRE OF EXCELLENCE", 128, 73);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wheel(radius: number, width: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "wheel";
  const tyre = new THREE.CylinderGeometry(radius, radius, width, 22);
  tyre.rotateX(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.01, 14);
  rim.rotateX(Math.PI / 2);
  const t = mesh(tyre, MAT.rubber);
  const r = mesh(rim, new THREE.MeshStandardMaterial({ color: 0x9a9da0, roughness: 0.45, metalness: 0.8 }), false);
  // Lug nuts / spokes so the rotation reads
  for (let i = 0; i < 5; i++) {
    const nut = mesh(new THREE.BoxGeometry(0.04, 0.04, width + 0.02), MAT.ironBlack, false);
    const a = (i / 5) * Math.PI * 2;
    nut.position.set(Math.cos(a) * radius * 0.32, Math.sin(a) * radius * 0.32, 0);
    g.add(nut);
  }
  g.add(t, r);
  return g;
}

/** Yellow Lagos danfo (VW-style minibus) with the black stripes, grime and a Lagos plate. */
export function danfo(seed = 1): THREE.Group {
  const rng = createRng(seed);
  const g = new THREE.Group();
  const yellow = new THREE.MeshPhysicalMaterial({
    color: rng() < 0.5 ? 0xf0b000 : 0xe6a400,
    map: vehicleGrime(),
    roughness: 0.48,
    metalness: 0.15,
    clearcoat: 0.45,
    clearcoatRoughness: 0.4,
  });
  const L = 4.7;
  const W = 1.9;
  const H = 1.97;
  const side = new THREE.Shape();
  side.moveTo(-2.35, 0.34);
  side.lineTo(-2.35, 1.82);
  side.quadraticCurveTo(-2.35, H, -2.18, H);
  side.lineTo(1.72, H);
  side.quadraticCurveTo(2.02, H, 2.12, 1.62);
  side.lineTo(2.33, 1.06);
  side.lineTo(2.37, 0.52);
  side.lineTo(2.3, 0.34);
  side.lineTo(1.93, 0.34);
  side.absarc(1.5, 0.34, 0.43, 0, Math.PI, false);
  side.lineTo(-1.07, 0.34);
  side.absarc(-1.5, 0.34, 0.43, 0, Math.PI, false);
  side.lineTo(-2.35, 0.34);
  const bodyGeo = new THREE.ExtrudeGeometry(side, { depth: W - 0.08, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3, curveSegments: 10 });
  bodyGeo.translate(0, 0, -(W - 0.08) / 2);
  g.add(mesh(bodyGeo, yellow));
  // Chassis shadow underneath
  const chassis = mesh(new THREE.BoxGeometry(L - 0.4, 0.18, W - 0.3), MAT.ironBlack, false);
  chassis.position.y = 0.34;
  g.add(chassis);
  // Flush side windows with yellow pillars
  const glassZ = W / 2 + 0.005;
  for (const sz of [1, -1]) {
    const band = mesh(new THREE.BoxGeometry(3.75, 0.58, 0.02), MAT.darkGlass, false);
    band.position.set(-0.3, 1.58, sz * glassZ);
    g.add(band);
    for (const x of [-2.12, -1.15, -0.2, 0.75, 1.55]) {
      const pillar = mesh(new THREE.BoxGeometry(0.09, 0.6, 0.03), yellow, false);
      pillar.position.set(x, 1.58, sz * (glassZ + 0.005));
      g.add(pillar);
    }
    // Black stripes along the body
    for (const y of [1.18, 1.06]) {
      const stripe = mesh(new THREE.BoxGeometry(4.3, 0.055, 0.02), new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.55 }), false);
      stripe.position.set(-0.05, y, sz * (glassZ + 0.006));
      g.add(stripe);
    }
  }
  // Sliding door seams (kerb side, +z)
  for (const x of [0.15, 1.12]) {
    const seam = mesh(new THREE.BoxGeometry(0.012, 1.15, 0.01), MAT.ironBlack, false);
    seam.position.set(x, 0.95, glassZ + 0.01);
    g.add(seam);
  }
  // Sloped windscreen and rear window
  const wind = mesh(new THREE.BoxGeometry(0.03, 0.62, W - 0.3), MAT.darkGlass, false);
  wind.position.set(2.1, 1.66, 0);
  wind.rotation.z = -0.36;
  g.add(wind);
  const rearWin = mesh(new THREE.BoxGeometry(0.02, 0.5, W - 0.4), MAT.darkGlass, false);
  rearWin.position.set(-2.375, 1.55, 0);
  g.add(rearWin);
  // Bumpers, lamps, plates
  const bumper = mesh(new THREE.BoxGeometry(0.14, 0.17, W + 0.04), MAT.ironBlack);
  bumper.position.set(2.4, 0.5, 0);
  const rear = bumper.clone();
  rear.position.x = -2.42;
  g.add(bumper, rear);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0x2a2000, roughness: 0.15 });
  for (const z of [-0.62, 0.62]) {
    const l = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 18), headMat, false);
    l.rotation.z = Math.PI / 2;
    l.position.set(2.37, 0.86, z);
    const tail = mesh(new THREE.BoxGeometry(0.04, 0.22, 0.12), new THREE.MeshStandardMaterial({ color: 0x9a1010, emissive: 0x200000, roughness: 0.3 }), false);
    tail.position.set(-2.39, 1.0, z * 1.15);
    g.add(l, tail);
  }
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture(seed), roughness: 0.5 });
  for (const [x, rot] of [
    [2.48, Math.PI / 2],
    [-2.5, -Math.PI / 2],
  ] as const) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), plateMat);
    p.position.set(x, 0.62, 0);
    p.rotation.y = rot;
    g.add(p);
  }
  for (const x of [1.5, -1.5]) {
    for (const z of [W / 2 - 0.16, -W / 2 + 0.16]) {
      const w = wheel(0.38, 0.24);
      w.position.set(x, 0.38, z);
      g.add(w);
    }
  }
  if (rng() < 0.6) {
    const rack = mesh(new THREE.BoxGeometry(L - 1.3, 0.05, W - 0.35), MAT.ironBlack);
    rack.position.set(-0.2, H + 0.06, 0);
    g.add(rack);
    const bagMat = new THREE.MeshStandardMaterial({ color: [0x2a4d8f, 0x8a2c2c, 0x3e6b35, 0x7a6a50][Math.floor(rng() * 4)], roughness: 0.95 });
    for (let i = 0; i < 3; i++) {
      const bag = mesh(new RoundedBoxGeometry(0.7 + rng() * 0.3, 0.32, 0.6, 2, 0.1), bagMat);
      bag.position.set(-1.2 + i * 0.9, H + 0.24, (rng() - 0.5) * 0.4);
      g.add(bag);
    }
  }
  for (const z of [W / 2 + 0.14, -W / 2 - 0.14]) {
    const m = mesh(new THREE.BoxGeometry(0.05, 0.2, 0.12), MAT.ironBlack, false);
    m.position.set(1.85, 1.42, z);
    g.add(m);
  }
  return g;
}

/** Keke NAPEP tricycle (Bajaj-style): yellow tub body, black vinyl canopy, single front wheel. */
export function keke(seed = 2): THREE.Group {
  const rng = createRng(seed);
  const g = new THREE.Group();
  const yellow = new THREE.MeshPhysicalMaterial({ color: rng() < 0.85 ? 0xf0b400 : 0x1e7b45, map: vehicleGrime(), roughness: 0.5, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.75 });
  const vinyl = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, side: THREE.DoubleSide });
  // Rear passenger tub: lower body panel with a wheel-arch shaped side.
  const side = new THREE.Shape();
  side.moveTo(-1.25, 0.32);
  side.lineTo(-1.25, 0.95);
  side.quadraticCurveTo(-1.2, 1.05, -1.0, 1.05);
  side.lineTo(0.35, 1.05);
  side.lineTo(0.55, 0.62);
  side.lineTo(0.55, 0.32);
  side.lineTo(-0.45, 0.32);
  side.absarc(-0.75, 0.32, 0.3, 0, Math.PI, false);
  side.lineTo(-1.25, 0.32);
  const tub = new THREE.Mesh(new THREE.ExtrudeGeometry(side, { depth: 1.22, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), yellow);
  tub.position.z = -0.61;
  tub.castShadow = tub.receiveShadow = true;
  g.add(tub);
  // Front cowl around the driver
  const cowl = new THREE.Shape();
  cowl.moveTo(0.55, 0.32);
  cowl.lineTo(0.55, 1.1);
  cowl.quadraticCurveTo(1.05, 1.15, 1.25, 0.75);
  cowl.lineTo(1.3, 0.45);
  cowl.lineTo(1.1, 0.32);
  cowl.lineTo(0.55, 0.32);
  const front = new THREE.Mesh(new THREE.ExtrudeGeometry(cowl, { depth: 0.9, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }), yellow);
  front.position.z = -0.45;
  front.castShadow = front.receiveShadow = true;
  g.add(front);
  // Bench seat inside the tub
  const seat = mesh(new RoundedBoxGeometry(0.55, 0.14, 1.1, 2, 0.05), black);
  seat.position.set(-0.8, 1.0, 0);
  g.add(seat);
  // Canopy frame + vinyl roof and rolled side curtains
  const roof = mesh(new RoundedBoxGeometry(2.35, 0.06, 1.34, 2, 0.03), vinyl);
  roof.position.set(-0.05, 1.92, 0);
  g.add(roof);
  for (const [x, z] of [
    [1.05, 0.58],
    [1.05, -0.58],
    [-1.18, 0.62],
    [-1.18, -0.62],
    [0.35, 0.62],
    [0.35, -0.62],
  ] as const) {
    const post = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.92, 6), MAT.chrome, false);
    post.position.set(x, 1.46, z);
    g.add(post);
  }
  const back = mesh(new THREE.BoxGeometry(0.03, 0.85, 1.28), vinyl);
  back.position.set(-1.2, 1.5, 0);
  g.add(back);
  for (const z of [0.64, -0.64]) {
    const roll = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), vinyl, false);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(-0.4, 1.86, z);
    g.add(roll);
  }
  const wind = mesh(new THREE.BoxGeometry(0.02, 0.6, 1.0), MAT.darkGlass, false);
  wind.position.set(1.0, 1.55, 0);
  wind.rotation.z = -0.25;
  g.add(wind);
  // Handlebar and headlamp
  const bar = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 6), MAT.chrome, false);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0.85, 1.18, 0);
  g.add(bar);
  const lamp = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0xfff4c8, emissive: 0x221a00, roughness: 0.2 }), false);
  lamp.rotation.z = Math.PI / 2;
  lamp.position.set(1.32, 0.7, 0);
  g.add(lamp);
  const plate = mesh(new THREE.BoxGeometry(0.02, 0.14, 0.32), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }), false);
  plate.position.set(-1.29, 0.6, 0);
  g.add(plate);
  // Wheels with rims
  const tyre = new THREE.TorusGeometry(0.21, 0.07, 10, 20);
  const rim = new THREE.CylinderGeometry(0.15, 0.15, 0.08, 14);
  rim.rotateX(Math.PI / 2);
  for (const [x, z] of [
    [1.12, 0],
    [-0.75, 0.62],
    [-0.75, -0.62],
  ] as const) {
    const w = new THREE.Group();
    w.name = "wheel";
    w.position.set(x, 0.28, z);
    w.add(mesh(tyre, MAT.rubber), mesh(rim, MAT.chrome, false));
    g.add(w);
  }
  const fork = mesh(new THREE.BoxGeometry(0.06, 0.45, 0.2), black);
  fork.position.set(1.12, 0.5, 0);
  g.add(fork);
  return g;
}

// ------------------------------------------------------------------ market

const UMBRELLA_COLORS = [
  [0xf2c230, 0x1d5fa8],
  [0xd8312b, 0xf4f0e6],
  [0x2a8a4a, 0xf2c230],
  [0x1d5fa8, 0xf4f0e6],
  [0xe36d1b, 0x2b2b2b],
];

/** Big market umbrella with alternating panels. */
export function umbrella(seed = 3, radius = 1.6): THREE.Group {
  const rng = createRng(seed);
  const [a, b] = UMBRELLA_COLORS[Math.floor(rng() * UMBRELLA_COLORS.length)]!;
  const g = new THREE.Group();
  const panels = 8;
  const geoms: THREE.BufferGeometry[] = [];
  const colors: number[] = [];
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  for (let i = 0; i < panels; i++) {
    const a0 = (i / panels) * Math.PI * 2;
    const a1 = ((i + 1) / panels) * Math.PI * 2;
    const tri = new THREE.BufferGeometry();
    const p = new Float32Array([0, 0.55, 0, Math.cos(a0) * radius, 0, Math.sin(a0) * radius, Math.cos(a1) * radius, 0, Math.sin(a1) * radius]);
    tri.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const c = i % 2 ? ca : cb;
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
    tri.computeVertexNormals();
    geoms.push(tri);
  }
  const canopyGeo = mergeGeometries(geoms)!;
  canopyGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  canopyGeo.computeVertexNormals();
  const canopy = mesh(canopyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  canopy.position.y = 2.15;
  g.add(canopy);
  const pole = mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.7, 8), MAT.frame);
  pole.position.y = 1.35;
  g.add(pole);
  return g;
}

/** Wooden market table. Goods are added by the caller (props). */
export function stallTable(w = 2.2, d = 1.1): THREE.Group {
  const g = new THREE.Group();
  const top = mesh(boxWorldUV(w, 0.06, d, 1), MAT.wood);
  top.position.y = 0.82;
  g.add(top);
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) {
    for (const z of [-d / 2 + 0.08, d / 2 - 0.08]) {
      const leg = mesh(new THREE.BoxGeometry(0.06, 0.82, 0.06), MAT.woodDark);
      leg.position.set(x, 0.41, z);
      g.add(leg);
    }
  }
  return g;
}

/** Instanced produce: tomatoes, peppers, oranges heaped on a tray. */
export function produceHeap(color: THREE.ColorRepresentation, count = 30, radius = 0.045, seed = 5): THREE.InstancedMesh {
  const rng = createRng(seed);
  const geo = new THREE.SphereGeometry(radius, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
  const im = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.22;
    const layer = Math.floor(i / 12);
    m.makeTranslation(Math.cos(a) * r * (1 - layer * 0.3), radius + layer * radius * 1.4, Math.sin(a) * r * (1 - layer * 0.3));
    im.setMatrixAt(i, m);
  }
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

/** Black plastic rooftop water tank on a stand. */
export function waterTank(): THREE.Group {
  const g = new THREE.Group();
  const tank = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.5, 24), MAT.tankBlack);
  tank.position.y = 1.55;
  const lid = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), MAT.tankBlack);
  lid.position.y = 2.34;
  g.add(tank, lid);
  for (let i = 0; i < 5; i++) {
    const rib = mesh(new THREE.TorusGeometry(0.705, 0.02, 6, 32), MAT.tankBlack, false);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = 0.95 + i * 0.3;
    g.add(rib);
  }
  for (const [x, z] of [
    [0.55, 0.55],
    [-0.55, 0.55],
    [0.55, -0.55],
    [-0.55, -0.55],
  ] as const) {
    const leg = mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), MAT.frame);
    leg.position.set(x, 0.4, z);
    g.add(leg);
  }
  return g;
}

// ------------------------------------------------------------------ utilities

/** Concrete electricity pole with a cross-arm and insulators. */
export function electricPole(height = 9): THREE.Group {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.11, 0.17, height, 10), MAT.concrete);
  pole.position.y = height / 2;
  g.add(pole);
  const arm = mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), MAT.ironBlack);
  arm.position.y = height - 0.5;
  g.add(arm);
  const insul = new THREE.MeshStandardMaterial({ color: 0x6f8f72, roughness: 0.3 });
  for (const x of [-0.8, -0.3, 0.3, 0.8]) {
    const i = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 8), insul, false);
    i.position.set(x, height - 0.38, 0);
    g.add(i);
  }
  // Transformer can on some poles
  const can = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 12), new THREE.MeshStandardMaterial({ color: 0x7b8a86, roughness: 0.5, metalness: 0.6 }));
  can.position.set(0, height - 2, 0.32);
  can.visible = false;
  can.name = "transformer";
  g.add(can);
  return g;
}

/** Sagging cable between two points (catenary approximation). */
export function cable(a: THREE.Vector3, b: THREE.Vector3, sag = 0.6, radius = 0.012): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const m = mesh(new THREE.TubeGeometry(curve, 24, radius, 4, false), MAT.cable, false, false);
  return m;
}

/** Litter: sachet-water bags, nylon bags, bottle caps scattered on the ground. */
export function litter(area: { x: number; z: number; w: number; d: number }, count: number, seed = 9): THREE.InstancedMesh {
  const rng = createRng(seed);
  const geo = new THREE.PlaneGeometry(0.14, 0.09);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const im = new THREE.InstancedMesh(geo, mat, count);
  const colors = [0xffffff, 0xe8f2ff, 0x2a2a2a, 0x2d6cdf, 0xd8312b, 0xf2c230];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3));
    const k = 0.6 + rng() * 1.2;
    s.set(k, 1, k);
    m.compose(new THREE.Vector3(area.x + rng() * area.w, 0.012, area.z + rng() * area.d), q, s);
    im.setMatrixAt(i, m);
    im.setColorAt(i, new THREE.Color(colors[Math.floor(rng() * colors.length)]!));
  }
  im.receiveShadow = true;
  return im;
}

// ------------------------------------------------------------------ street life details

const ANKARA = [
  ["#d9472b", "#f2b631", "#1d3f8a"],
  ["#1f6fb2", "#f6efe0", "#e07a1f"],
  ["#7a2f8f", "#f2b631", "#1a7a3c"],
  ["#0f6b5a", "#f4d35e", "#c8321f"],
  ["#b21f3a", "#1b1b1b", "#f2b631"],
];
const ankaraCache = new Map<number, THREE.CanvasTexture>();

/** Wax-print (ankara) fabric pattern: bold repeating circles, diamonds and leaves. */
export function ankaraTexture(seed: number): THREE.CanvasTexture {
  const key = seed % 10;
  const cached = ankaraCache.get(key);
  if (cached) return cached;
  const rng = createRng(500 + key);
  const [bg, a, b] = ANKARA[key % ANKARA.length]!;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = bg!;
  g.fillRect(0, 0, 256, 256);
  const motif = Math.floor(rng() * 3);
  for (let y = 0; y < 256; y += 64) {
    for (let x = (y / 64) % 2 ? 32 : 0; x < 288; x += 64) {
      g.fillStyle = a!;
      if (motif === 0) {
        g.beginPath();
        g.arc(x, y + 32, 22, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = b!;
        g.beginPath();
        g.arc(x, y + 32, 11, 0, Math.PI * 2);
        g.fill();
      } else if (motif === 1) {
        g.beginPath();
        g.moveTo(x, y + 6);
        g.lineTo(x + 24, y + 32);
        g.lineTo(x, y + 58);
        g.lineTo(x - 24, y + 32);
        g.closePath();
        g.fill();
        g.fillStyle = b!;
        g.fillRect(x - 5, y + 27, 10, 10);
      } else {
        g.beginPath();
        g.ellipse(x, y + 32, 26, 11, Math.PI / 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = b!;
        g.beginPath();
        g.ellipse(x, y + 32, 26, 4, Math.PI / 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  ankaraCache.set(key, t);
  return t;
}

/** Hawker's enamel basin with goods, carried on the head. */
export function headTray(seed: number): THREE.Group {
  const rng = createRng(seed);
  const g = new THREE.Group();
  const pad = mesh(new THREE.TorusGeometry(0.075, 0.025, 8, 18), new THREE.MeshStandardMaterial({ map: ankaraTexture(seed), roughness: 0.9 }));
  pad.rotation.x = Math.PI / 2;
  g.add(pad);
  const basinMat = new THREE.MeshStandardMaterial({ color: [0xf2f2ee, 0x2e6fb5, 0xd8312b][Math.floor(rng() * 3)], roughness: 0.25, metalness: 0.2 });
  const basin = mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.09, 24, 1, true), new THREE.MeshStandardMaterial({ color: basinMat.color, roughness: 0.25, metalness: 0.2, side: THREE.DoubleSide }));
  basin.position.y = 0.065;
  const base = mesh(new THREE.CircleGeometry(0.2, 24).rotateX(-Math.PI / 2), basinMat);
  base.position.y = 0.022;
  g.add(basin, base);
  const kind = Math.floor(rng() * 3);
  if (kind === 0) {
    const heap = produceHeap(0xe8901c, 22, 0.05, seed);
    heap.position.y = 0.03;
    heap.scale.setScalar(1.15);
    g.add(heap);
  } else if (kind === 1) {
    // Agege bread loaves in nylon
    const bread = new THREE.MeshStandardMaterial({ color: 0xc98a4a, roughness: 0.7 });
    for (let i = 0; i < 5; i++) {
      const loaf = mesh(new RoundedBoxGeometry(0.28, 0.08, 0.1, 2, 0.035), bread);
      loaf.position.set((rng() - 0.5) * 0.12, 0.07 + Math.floor(i / 3) * 0.08, -0.12 + (i % 3) * 0.12);
      loaf.rotation.y = (rng() - 0.5) * 0.3;
      g.add(loaf);
    }
  } else {
    // Pure water sachets, stacked
    const sachet = new THREE.MeshPhysicalMaterial({ color: 0xeef6ff, roughness: 0.15, transmission: 0.35, thickness: 0.03 });
    for (let i = 0; i < 9; i++) {
      const sc = mesh(new RoundedBoxGeometry(0.14, 0.05, 0.1, 2, 0.02), sachet);
      sc.position.set(-0.14 + (i % 3) * 0.14, 0.06 + Math.floor(i / 3) * 0.045, -0.1 + ((i * 7) % 3) * 0.1);
      g.add(sc);
    }
  }
  return g;
}

const ADS = [
  { t: "REDEMPTION NIGHT", s: "This Friday • All are welcome • Come and see!", bg: "#14306b", fg: "#ffd23f" },
  { t: "SUNRISE ESTATES", s: "Buy your land now! Plots from ₦2.5m • Pay small small", bg: "#f2f0e8", fg: "#0b6b3a" },
  { t: "JOLLOF & CHILL FEST", s: "Live band • Small chops • Kids corner • Dec 26", bg: "#c8321f", fg: "#fff3d6" },
  { t: "GET YOUR NIN TODAY", s: "Enrolment centre opposite the market", bg: "#ffffff", fg: "#1a1a1a" },
];

/** Rooftop billboard on a steel frame. */
export function billboard(index: number): THREE.Group {
  const ad = ADS[index % ADS.length]!;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g2 = c.getContext("2d")!;
  g2.fillStyle = ad.bg;
  g2.fillRect(0, 0, 1024, 512);
  g2.fillStyle = ad.fg;
  g2.textAlign = "center";
  fitText(g2, ad.t, 960, 130, SIGN_FONT);
  g2.fillText(ad.t, 512, 230);
  fitText(g2, ad.s, 940, 46, "Arial");
  g2.fillText(ad.s, 512, 350);
  weather(g2, createRng(90 + index), 1024, 512, 1.3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const g = new THREE.Group();
  const W = 7;
  const H = 3.5;
  const panel = mesh(new THREE.BoxGeometry(W, H, 0.12), new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.7, metalness: 0.5 }));
  panel.position.y = 2.2 + H / 2;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.15, H - 0.15), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  face.position.set(0, 2.2 + H / 2, 0.065);
  g.add(panel, face);
  for (const x of [-W / 3, W / 3]) {
    const post = mesh(new THREE.BoxGeometry(0.16, 2.3, 0.16), MAT.frame);
    post.position.set(x, 1.15, -0.2);
    const brace = mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), MAT.frame);
    brace.position.set(x, 1.1, -0.9);
    brace.rotation.x = 0.55;
    g.add(post, brace);
  }
  const walk = mesh(new THREE.BoxGeometry(W, 0.06, 0.6), MAT.frame);
  walk.position.set(0, 2.15, 0.3);
  g.add(walk);
  return g;
}
