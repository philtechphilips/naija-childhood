import * as THREE from "three";
import type { Character } from "@/games/core3d/character";

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();

const pos = (c: Character, part: string, out = new THREE.Vector3()) => {
  const b = c.bone(part);
  return b ? b.getWorldPosition(out) : null;
};

/** Turns `part` (around its pivot `from`) so the point `cur` moves onto the direction of `want`. */
function aim(c: Character, part: string, from: THREE.Vector3, cur: THREE.Vector3, want: THREE.Vector3) {
  _a.copy(cur).sub(from).normalize();
  _b.copy(want).sub(from).normalize();
  const angle = Math.acos(THREE.MathUtils.clamp(_a.dot(_b), -1, 1));
  if (angle < 1e-4) return;
  _axis.copy(_a).cross(_b);
  if (_axis.lengthSq() < 1e-10) return;
  c.rotateWorld(part, _axis.normalize(), angle);
}

/** Rotates a bone by a world-space quaternion. */
function rotateBy(c: Character, part: string, q: THREE.Quaternion) {
  q.normalize();
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(q.w, -1, 1));
  const s = Math.sqrt(1 - q.w * q.w);
  if (angle < 1e-4 || s < 1e-6) return;
  c.rotateWorld(part, _axis.set(q.x / s, q.y / s, q.z / s), angle);
}

export interface ArmRig {
  /** Upper arm and forearm lengths for each side (m). */
  len: { L: [number, number]; R: [number, number] };
}

export function measureArms(c: Character): ArmRig {
  c.root.updateMatrixWorld(true);
  const len = { L: [0.25, 0.22] as [number, number], R: [0.25, 0.22] as [number, number] };
  for (const side of ["L", "R"] as const) {
    const s = pos(c, `${side} UpperArm`);
    const e = pos(c, `${side} Forearm`);
    const h = pos(c, `${side} Hand`);
    if (s && e && h) len[side] = [s.distanceTo(e), e.distanceTo(h)];
  }
  return { len };
}

/**
 * Two-bone IK: puts the wrist at `target` (world) with the elbow bending
 * towards `pole`. Call after Character.update() each frame.
 */
export function reach(c: Character, rig: ArmRig, side: "L" | "R", target: THREE.Vector3, pole: THREE.Vector3) {
  const s = pos(c, `${side} UpperArm`);
  const e = pos(c, `${side} Forearm`);
  const h = pos(c, `${side} Hand`);
  if (!s || !e || !h) return;
  const [l1, l2] = rig.len[side];
  const to = target.clone().sub(s);
  const d = Math.min(Math.max(to.length(), Math.abs(l1 - l2) + 0.01), (l1 + l2) * 0.999);
  const dir = to.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bend = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = s.clone().add(dir.clone().multiplyScalar(a)).add(bend.multiplyScalar(hgt));
  const wrist = s.clone().add(dir.clone().multiplyScalar(d));
  aim(c, `${side} UpperArm`, s, e, elbow);
  pos(c, `${side} Forearm`, e);
  pos(c, `${side} Hand`, h);
  aim(c, `${side} Forearm`, e, h, wrist);
}

/**
 * Lays the hand flat: fingers along `fingers`, thumb towards `thumb`.
 * Palms down = thumbs pointing in towards each other; palms up = thumbs out.
 */
export function orientHand(c: Character, side: "L" | "R", fingers: THREE.Vector3, thumb: THREE.Vector3) {
  const h = pos(c, `${side} Hand`);
  const f = pos(c, `${side} Finger2`);
  const t = pos(c, `${side} Finger0`);
  if (!h || !f || !t) return;
  const basis = (fw: THREE.Vector3, th: THREE.Vector3, out: THREE.Matrix4) => {
    const x = fw.clone().normalize();
    const y = th.clone().sub(x.clone().multiplyScalar(th.dot(x))).normalize();
    const z = x.clone().cross(y);
    return out.makeBasis(x, y, z);
  };
  const cur = basis(f.sub(h), t.sub(h), _m1);
  const want = basis(fingers, thumb, _m2);
  // R = want * cur^T
  _q.setFromRotationMatrix(want.multiply(cur.transpose()));
  rotateBy(c, `${side} Hand`, _q);
}

/** Straightens the four fingers along the hand (an open, flat hand ready to slap). */
export function flattenFingers(c: Character, side: "L" | "R", amount = 1) {
  const h = pos(c, `${side} Hand`);
  const mid = pos(c, `${side} Finger2`);
  if (!h || !mid) return;
  const dir = mid.sub(h).normalize();
  for (const n of [1, 2, 3, 4]) {
    const chain = [`${side} Finger${n}`, `${side} Finger${n}1`, `${side} Finger${n}2`];
    for (let i = 0; i < chain.length - 1; i++) {
      const from = pos(c, chain[i]!);
      const to = pos(c, chain[i + 1]!);
      if (!from || !to) break;
      const cur = to.clone().sub(from).normalize();
      const want = cur.clone().lerp(dir, amount).normalize();
      aim(c, chain[i]!, from, to, from.clone().add(want));
    }
  }
}
