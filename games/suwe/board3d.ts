import * as THREE from "three";
import { createRng } from "@/games/core/rng";
import { chalkLine } from "@/games/core/draw";
import type { V } from "./match";
import type { Board } from "./rules";

/** Box size in metres and where the board starts (in the laterite side street, running north). */
export const BOX = 0.62;
export const ORIGIN = new THREE.Vector3(34, 0, 35.6);

/** Board coordinates -> world. Board +x is the hopper's right, which is world -x (camera looks +z). */
export const toWorld = (p: V, y = 0, out = new THREE.Vector3()) => out.set(ORIGIN.x - p.x * BOX, y, ORIGIN.z + p.z * BOX);

/** Chalk board painted to a canvas and laid on the ground as a decal. */
export function createBoardDecal(board: Board): THREE.Mesh {
  const rows = board.rows.length;
  const lenBoxes = rows + 2.2; // start line + rows + home
  const pxPerBox = 180;
  const c = document.createElement("canvas");
  c.width = Math.round(2.6 * pxPerBox);
  c.height = Math.round(lenBoxes * pxPerBox);
  const g = c.getContext("2d")!;
  const rng = createRng(rows * 31 + board.boxes.length);
  // The plane is turned so canvas-right is the hopper's right (world -x) and canvas-top is home (+z).
  const P = (x: number, z: number) => [c.width / 2 + x * pxPerBox, c.height - (z + 0.9) * pxPerBox] as const;
  const line = (x0: number, z0: number, x1: number, z1: number, w = 9) => {
    const [a, b] = P(x0, z0);
    const [cc, d] = P(x1, z1);
    chalkLine(g, rng, a, b, cc, d, w);
  };
  board.rows.forEach((cols, r) => {
    const x = cols === 1 ? 0.5 : 1;
    line(-x, r, x, r);
    line(-x, r, -x, r + 1);
    line(x, r, x, r + 1);
    if (cols === 2) line(0, r, 0, r + 1);
    const next = board.rows[r + 1];
    const nx = Math.max(x, next === 2 ? 1 : 0.5);
    line(-nx, r + 1, nx, r + 1);
  });
  for (let i = 0; i < 16; i++) {
    const a0 = Math.PI - (i / 16) * Math.PI;
    const a1 = Math.PI - ((i + 1) / 16) * Math.PI;
    line(Math.cos(a0) * 0.75, rows + Math.sin(a0) * 0.9, Math.cos(a1) * 0.75, rows + Math.sin(a1) * 0.9);
  }
  line(-1.1, -0.4, 1.1, -0.4, 10);
  g.fillStyle = "rgba(245,241,232,0.8)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const b of board.boxes) {
    const cx = b.cols === 1 ? 0 : b.col === 0 ? -0.5 : 0.5;
    const [x, y] = P(cx, b.row + 0.5);
    g.save();
    g.translate(x, y);
    // Numbers face the hopper: the canvas is laid with its top toward +z.
    g.font = `900 ${pxPerBox * 0.42}px Arial Black, Arial`;
    g.globalAlpha = 0.65;
    g.fillText(String(b.index), 0, 0);
    g.restore();
  }
  const [hx, hy] = P(0, rows + 0.4);
  g.font = `900 ${pxPerBox * 0.24}px Arial Black, Arial`;
  g.fillText("HOME", hx, hy);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const w = 2.6 * BOX;
  const h = lenBoxes * BOX;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2).rotateY(Math.PI),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  // Centre of the canvas in board space is (0, lenBoxes/2 - 0.9).
  toWorld({ x: 0, z: lenBoxes / 2 - 0.9 }, 0.015, mesh.position);
  mesh.receiveShadow = true;
  return mesh;
}

