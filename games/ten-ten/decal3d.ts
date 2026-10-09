import * as THREE from "three";
import { createRng } from "@/games/core/rng";
import { chalkLine, chalkText } from "@/games/core/draw";
import type { Player, Side } from "./rules";

/** The match spot: a clearing in the market, facing the road. */
export const SPOT = new THREE.Vector3(36.5, 0, 11.3);
export const GAP = 0.75;

/** Where a thrown foot lands: out to the side and a little toward the other girl. */
export const padOffset = (player: Player, side: Side) => ({
  // Screen-left (L) is world +x for a camera looking down +z.
  x: side === "L" ? 0.34 : -0.34,
  z: player === 0 ? -GAP + 0.18 : GAP - 0.18,
});

/** Chalk ring, foot pads and lettering drawn on the ground. */
export function createTenTenDecal(spot: THREE.Vector3 = SPOT): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d")!;
  const rng = createRng(5);
  const S = 1024 / 4; // 4m square
  // PlaneGeometry rotated flat: canvas x -> world +x, canvas y -> world +z.
  const toPx = (x: number, z: number) => [512 + x * S, 512 + z * S] as const;
  // Ring around the players
  for (let i = 0; i < 64; i++) {
    const a0 = (i / 64) * Math.PI * 2;
    const a1 = ((i + 1) / 64) * Math.PI * 2;
    const [x0, y0] = toPx(Math.cos(a0) * 1.25, Math.sin(a0) * 1.7);
    const [x1, y1] = toPx(Math.cos(a1) * 1.25, Math.sin(a1) * 1.7);
    chalkLine(g, rng, x0, y0, x1, y1, 7);
  }
  for (const player of [0, 1] as Player[]) {
    for (const side of ["L", "R"] as Side[]) {
      const o = padOffset(player, side);
      const [cx, cy] = toPx(o.x, o.z);
      const w = 0.38 * S;
      const h = 0.22 * S;
      chalkLine(g, rng, cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, 5);
      chalkLine(g, rng, cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, 5);
      chalkLine(g, rng, cx + w / 2, cy + h / 2, cx - w / 2, cy + h / 2, 5);
      chalkLine(g, rng, cx - w / 2, cy + h / 2, cx - w / 2, cy - h / 2, 5);
    }
  }
  // Rotate 180° so the lettering reads correctly from the player's side of the ring.
  g.save();
  g.translate(512, 512);
  g.scale(-1, -1);
  chalkText(g, rng, "TEN-TEN", 0, 0, 60, "Arial Black, Arial");
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mesh.position.set(spot.x, 0.015, spot.z);
  mesh.receiveShadow = true;
  return mesh;
}
