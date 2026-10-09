import * as THREE from "three";
import { MAT } from "./procedural";

/**
 * Inter-house sports day dressing: house-colour canopies, bunting, chalk
 * lanes, the finish tape and the big banner. Used by the sack race and
 * skipping rope scenes on the school field.
 */
export const HOUSES = [
  { name: "Red", color: 0xd62828, css: "#e04a4a" },
  { name: "Blue", color: 0x1e5fbf, css: "#4f8ff0" },
  { name: "Green", color: 0x1f8a3f, css: "#3fbf64" },
  { name: "Yellow", color: 0xf2c200, css: "#ffd23f" },
] as const;

/** Party canopy (4 x 4 m): white frame, pyramid roof and valance in the house colour. */
export function canopy(color: number, w = 4, d = 4): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.6 });
  for (const x of [-w / 2, w / 2]) {
    for (const z of [-d / 2, d / 2]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4), frame);
      leg.position.set(x, 1.2, z);
      leg.castShadow = true;
      g.add(leg);
    }
  }
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2, 0.9, 4, 1, true), cloth);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.85;
  roof.castShadow = true;
  g.add(roof);
  const valance = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.3, d + 0.02), cloth);
  valance.position.y = 2.3;
  g.add(valance);
  return g;
}

/** String of triangular flags between two points, alternating colours. */
export function bunting(a: THREE.Vector3, b: THREE.Vector3, colors: number[] = HOUSES.map((h) => h.color)): THREE.Group {
  const g = new THREE.Group();
  const len = a.distanceTo(b);
  const n = Math.max(4, Math.floor(len / 0.45));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * len * 0.06;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.006, 4, false), MAT.cable));
  const tri = new THREE.BufferGeometry();
  tri.setAttribute("position", new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.26, 0], 3));
  tri.computeVertexNormals();
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const yaw = Math.atan2(-dir.z, dir.x);
  colors.forEach((c, k) => {
    const mesh = new THREE.InstancedMesh(tri, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }), Math.ceil(n / colors.length));
    const m = new THREE.Matrix4();
    let j = 0;
    for (let i = k; i < n; i += colors.length) {
      const p = curve.getPointAt((i + 0.5) / n);
      m.makeRotationY(yaw).setPosition(p);
      mesh.setMatrixAt(j++, m);
    }
    mesh.count = j;
    g.add(mesh);
  });
  return g;
}

/** Flat chalk line on the ground. */
export function chalkLine(x0: number, z0: number, x1: number, z1: number, width = 0.07): THREE.Mesh {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 1, transparent: true, opacity: 0.85 }));
  m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
  m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  m.receiveShadow = true;
  return m;
}

/** Cloth banner on two poles. */
export function banner(lines: string[], w = 6, h = 1.2, bg = "#0d47a1", fg = "#ffffff"): THREE.Group {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = Math.round((1024 * h) / w);
  const x = c.getContext("2d")!;
  x.fillStyle = bg;
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = fg;
  x.textAlign = "center";
  x.textBaseline = "middle";
  lines.forEach((l, i) => {
    let size = i === 0 ? c.height * 0.42 : c.height * 0.22;
    x.font = `900 ${size}px Arial Black, Arial, sans-serif`;
    while (x.measureText(l).width > c.width * 0.92) x.font = `900 ${(size *= 0.92)}px Arial Black, Arial, sans-serif`;
    x.fillText(l, c.width / 2, c.height * (lines.length === 1 ? 0.5 : i === 0 ? 0.38 : 0.78));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }));
  cloth.position.y = 1.6 + h / 2;
  cloth.castShadow = true;
  g.add(cloth);
  for (const px of [-w / 2, w / 2]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7 + h), MAT.woodDark);
    pole.position.set(px, (1.7 + h) / 2, -0.03);
    g.add(pole);
  }
  return g;
}

/** Finish tape across the track: two posts and a red ribbon that snaps in two. */
export function finishTape(span: number) {
  const g = new THREE.Group();
  const post = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 });
  for (const z of [-span / 2, span / 2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3), post);
    p.position.set(0, 0.65, z);
    p.castShadow = true;
    g.add(p);
  }
  const red = new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.6, side: THREE.DoubleSide });
  const halves = [-1, 1].map((s) => {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(span / 2, 0.06), red);
    h.rotation.y = Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.0, s * (span / 2));
    h.position.z = -s * (span / 4);
    pivot.add(h);
    g.add(pivot);
    return pivot;
  });
  let broken = 0;
  return {
    obj: g,
    snap() {
      if (!broken) broken = 0.0001;
    },
    update(dt: number) {
      if (!broken) return;
      broken = Math.min(1, broken + dt * 2.5);
      // Each half swings back towards its post and droops.
      halves.forEach((p, i) => {
        p.rotation.x = (i ? -1 : 1) * broken * 1.2;
        p.rotation.y = (i ? 1 : -1) * broken * 0.9;
      });
    },
  };
}
