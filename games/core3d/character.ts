import * as THREE from "three";
import { instantiateAvatar, loadClip, type AvatarInfo } from "./assets";

const _pq = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/**
 * A realistic animated person: Rocketbox avatar + mocap clips, with helpers
 * for layering procedural poses (clapping, leg throws, hops) on top of the mocap.
 */
export class Character {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  readonly info: AvatarInfo;
  private readonly model: THREE.Object3D;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly boneMap = new Map<string, THREE.Bone>();
  current: string | null = null;
  height = 1.7;

  private constructor(model: THREE.Object3D, info: AvatarInfo) {
    this.model = model;
    this.info = info;
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.boneMap.set(o.name, o as THREE.Bone);
    });
    const box = new THREE.Box3().setFromObject(model);
    this.height = Math.max(0.5, box.max.y - box.min.y);
  }

  static async create(id: string, clips: string[]): Promise<Character> {
    const { root, info } = await instantiateAvatar(id);
    const c = new Character(root, info);
    if (id === "police") c.addPoliceBeret();
    await Promise.all(clips.map((name) => c.addClip(name)));
    return c;
  }

  async addClip(name: string) {
    if (this.actions.has(name)) return;
    const clip = await loadClip(name, this.info.rig);
    this.actions.set(name, this.mixer.clipAction(clip));
  }

  has(name: string) {
    return this.actions.has(name);
  }

  play(name: string, { fade = 0.25, loop = true, timeScale = 1, restart = false, offset = 0 } = {}) {
    const next = this.actions.get(name);
    if (!next) return;
    next.timeScale = timeScale;
    if (this.current === name && !restart) return;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    if (offset) next.time = offset * next.getClip().duration;
    next.play();
    const prev = this.current ? this.actions.get(this.current) : null;
    if (prev && prev !== next) next.crossFadeFrom(prev, fade, true);
    this.current = name;
  }

  setTimeScale(scale: number) {
    if (this.current) {
      const a = this.actions.get(this.current);
      if (a) a.timeScale = scale;
    }
  }

  update(dt: number) {
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
  }

  /** Bone by Biped part name, e.g. "L Thigh" -> Bip01_L_Thigh / Bip02_L_Thigh. */
  bone(part: string): THREE.Bone | undefined {
    return this.boneMap.get(`${this.info.rig}_${part.replace(/ /g, "_")}`);
  }

  /** Rotates a bone around a world-space axis, independent of the Biped's local axes. */
  rotateWorld(part: string, axis: THREE.Vector3, angle: number) {
    const b = this.bone(part);
    if (!b || !b.parent || Math.abs(angle) < 1e-5) return;
    b.parent.getWorldQuaternion(_pq);
    _q.setFromAxisAngle(axis, angle);
    // world' = delta * parentWorld * local  ->  local' = parentWorld^-1 * world'
    const world = _pq.clone().multiply(b.quaternion);
    world.premultiply(_q);
    b.quaternion.copy(_pq.invert().multiply(world));
    b.updateMatrixWorld(true);
  }

  /** Snapshot of local bone rotations from a clip at a given time (for pose blending). */
  samplePose(clipName: string, time: number, parts: string[]): Map<string, THREE.Quaternion> | null {
    const action = this.actions.get(clipName);
    if (!action) return null;
    const saved = parts.map((p) => this.bone(p)?.quaternion.clone());
    const temp = new THREE.AnimationMixer(this.model);
    const a = temp.clipAction(action.getClip());
    a.play();
    temp.setTime(time);
    const pose = new Map<string, THREE.Quaternion>();
    for (const p of parts) {
      const b = this.bone(p);
      if (b) pose.set(p, b.quaternion.clone());
    }
    temp.stopAllAction();
    temp.uncacheRoot(this.model);
    parts.forEach((p, i) => {
      const b = this.bone(p);
      const q = saved[i];
      if (b && q) b.quaternion.copy(q);
    });
    return pose;
  }

  /** Blends listed bones toward a stored pose (0..1). Call after update(). */
  blendPose(pose: Map<string, THREE.Quaternion>, weight: number) {
    if (weight <= 0) return;
    for (const [part, q] of pose) this.bone(part)?.quaternion.slerp(q, Math.min(1, weight));
    this.root.updateMatrixWorld(true);
  }

  /** Finds the time in a clip where two bones come closest (e.g. hands meeting in a clap). */
  closestApproach(clipName: string, a: string, b: string, steps = 60): number {
    const action = this.actions.get(clipName);
    const ba = this.bone(a);
    const bb = this.bone(b);
    if (!action || !ba || !bb) return 0;
    const clip = action.getClip();
    const temp = new THREE.AnimationMixer(this.model);
    const act = temp.clipAction(clip);
    act.play();
    let best = 0;
    let bestD = Infinity;
    const pa = new THREE.Vector3();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * clip.duration;
      temp.setTime(t);
      this.model.updateMatrixWorld(true);
      ba.getWorldPosition(pa);
      bb.getWorldPosition(_v);
      const d = pa.distanceTo(_v);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    temp.stopAllAction();
    temp.uncacheRoot(this.model);
    return best;
  }

  /**
   * Attaches an object to a bone so it follows the animation. The offset is
   * given in world space relative to the bone, measured in the bind pose.
   */
  attach(part: string, obj: THREE.Object3D, worldOffset: THREE.Vector3, worldRot = new THREE.Euler()) {
    const b = this.bone(part);
    if (!b) return;
    this.root.updateMatrixWorld(true);
    const target = b.getWorldPosition(new THREE.Vector3()).add(worldOffset);
    b.add(obj);
    obj.position.copy(b.worldToLocal(target));
    const bq = b.getWorldQuaternion(new THREE.Quaternion());
    obj.quaternion.copy(bq.invert().multiply(new THREE.Quaternion().setFromEuler(worldRot)));
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  /** Nigeria Police Force black beret with a gold badge. */
  addPoliceBeret() {
    const g = new THREE.Group();
    const felt = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.95 });
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), felt);
    crown.scale.set(1.08, 0.42, 1.12);
    crown.position.set(-0.025, 0, -0.01);
    crown.rotation.z = 0.25;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.014, 8, 28), felt);
    band.rotation.x = Math.PI / 2;
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), new THREE.MeshStandardMaterial({ color: 0xd4a62a, metalness: 0.9, roughness: 0.3 }));
    badge.position.set(0.045, 0.03, 0.098);
    badge.rotation.set(-0.2, 0.4, 0);
    g.add(crown, band, badge);
    // Sits on the crown of the head. The Head bone's origin is at the top of the neck (about ear
    // level), so the crown is ~17cm above it on an adult.
    this.attach("Head", g, new THREE.Vector3(0, 0.16 * (this.info.kind === "adult" ? 1 : 0.85), -0.012));
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, 1).applyQuaternion(this.root.quaternion);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.removeFromParent();
  }
}

export const ARM_CHAIN = ["L Clavicle", "L UpperArm", "L Forearm", "L Hand", "R Clavicle", "R UpperArm", "R Forearm", "R Hand", "Spine1", "Spine2", "Neck", "Head"];
