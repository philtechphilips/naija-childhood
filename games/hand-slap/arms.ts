import * as THREE from "three";
import type { Character } from "@/games/core3d/character";

const _s = new THREE.Vector3();
const _e = new THREE.Vector3();
const _h = new THREE.Vector3();
const _t = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Turns `part` (around its pivot `from`) so the point `cur` moves onto direction `want`. */
function aim(c: Character, part: string, from: THREE.Vector3, cur: THREE.Vector3, want: THREE.Vector3) {
  _a.copy(cur).sub(from).normalize();
  _b.copy(want).sub(from).normalize();
  const dot = THREE.MathUtils.clamp(_a.dot(_b), -1, 1);
  const angle = Math.acos(dot);
  if (angle < 1e-4) return;
  const axis = _a.clone().cross(_b);
  if (axis.lengthSq() < 1e-10) return;
  c.rotateWorld(part, axis.normalize(), angle);
}

const pos = (c: Character, part: string, out: THREE.Vector3) => {
  const b = c.bone(part);
  return b ? b.getWorldPosition(out) : null;
};

export interface ArmRig {
  /** Upper arm and forearm lengths for each side (m). */
  len: { L: [number, number]; R: [number, number] };
}

export function measureArms(c: Character): ArmRig {
  c.root.updateMatrixWorld(true);
  const len = { L: [0.25, 0.22] as [number, number], R: [0.25, 0.22] as [number, number] };
  for (const side of ["L", "R"] as const) {
    const s = pos(c, `${side} UpperArm`, new THREE.Vector3());
    const e = pos(c, `${side} Forearm`, new THREE.Vector3());
    const h = pos(c, `${side} Hand`, new THREE.Vector3());
    if (s && e && h) len[side] = [s.distanceTo(e), e.distanceTo(h)];
  }
  return { len };
}

/**
 * Two-bone IK: puts one hand at `target` (world), elbow bending towards `pole`,
 * then twists the hand so the thumb points along `thumb` (palm up or down).
 * Call after Character.update() each frame.
 */
export function reach(c: Character, rig: ArmRig, side: "L" | "R", target: THREE.Vector3, pole: THREE.Vector3, thumb: THREE.Vector3 | null) {
  if (!pos(c, `${side} UpperArm`, _s) || !pos(c, `${side} Forearm`, _e) || !pos(c, `${side} Hand`, _h)) return;
  const [l1, l2] = rig.len[side];
  _t.copy(target).sub(_s);
  const d = Math.min(_t.length(), (l1 + l2) * 0.999);
  const dir = _t.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // Bend direction: the pole, made perpendicular to the shoulder→hand line.
  const bend = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = _s.clone().add(dir.clone().multiplyScalar(a)).add(bend.multiplyScalar(hgt));
  const hand = _s.clone().add(dir.clone().multiplyScalar(d));
  aim(c, `${side} UpperArm`, _s, _e, elbow);
  pos(c, `${side} Forearm`, _e);
  pos(c, `${side} Hand`, _h);
  aim(c, `${side} Forearm`, _e, _h, hand);
  if (!thumb) return;
  // Palm: roll the hand about the forearm until the thumb points the right way.
  const finger = pos(c, `${side} Finger0`, new THREE.Vector3());
  if (!finger) return;
  pos(c, `${side} Hand`, _h);
  const axis = _h.clone().sub(_e).normalize();
  const cur = finger.sub(_h);
  cur.sub(axis.clone().multiplyScalar(cur.dot(axis)));
  const want = thumb.clone().sub(axis.clone().multiplyScalar(thumb.dot(axis)));
  if (cur.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return;
  cur.normalize();
  want.normalize();
  let ang = Math.acos(THREE.MathUtils.clamp(cur.dot(want), -1, 1));
  if (cur.clone().cross(want).dot(axis) < 0) ang = -ang;
  _q.setFromAxisAngle(axis, ang);
  // Share the roll between forearm and hand so the wrist doesn't twist like a sweet wrapper.
  c.rotateWorld(`${side} Forearm`, axis, ang * 0.6);
  c.rotateWorld(`${side} Hand`, axis, ang * 0.4);
}
