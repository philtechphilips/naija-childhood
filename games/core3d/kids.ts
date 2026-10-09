import * as THREE from "three";
import { Character } from "./character";
import { MAT } from "./procedural";

/**
 * Neighbourhood kids: tyre-rollers running behind an old tyre with a stick,
 * and children standing around watching, clapping and cheering.
 */
export interface TyreRoller {
  kid: Character;
  tyre: THREE.Group;
  path: THREE.CatmullRomCurve3;
  length: number;
  t: number;
  speed: number;
  spin: number;
}

function makeTyre(radius: number): THREE.Group {
  const g = new THREE.Group();
  const rubber = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.17, 12, 32), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
  rubber.castShadow = true;
  // Tread blocks so the spin reads
  const tread = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.02, radius * 0.06, 4, 24), new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 1, wireframe: true }));
  g.add(rubber, tread);
  return g;
}

export async function createTyreRollers(scene: THREE.Scene, routes: THREE.Vector3[][], kids = ["tunde", "emeka"]): Promise<TyreRoller[]> {
  const out: TyreRoller[] = [];
  await Promise.all(
    routes.map(async (pts, i) => {
      const kid = await Character.create(kids[i % kids.length]!, ["run_m"]);
      kid.play("run_m", { offset: Math.random() });
      // A short stick in the right hand to drive the tyre.
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.55, 6), MAT.woodDark);
      kid.attach("R Hand", stick, new THREE.Vector3(0, -0.2, 0.12), new THREE.Euler(0.9, 0, 0));
      scene.add(kid.root);
      const tyre = makeTyre(0.3);
      scene.add(tyre);
      const path = new THREE.CatmullRomCurve3(pts, true, "centripetal");
      out.push({ kid, tyre, path, length: path.getLength(), t: Math.random(), speed: 2.6 + Math.random() * 0.6, spin: 0 });
    }),
  );
  return out;
}

const _p = new THREE.Vector3();
const _a = new THREE.Vector3();

export function updateTyreRollers(rollers: TyreRoller[], dt: number) {
  for (const r of rollers) {
    r.t = (r.t + (r.speed * dt) / r.length) % 1;
    // Tyre leads; the kid runs just behind it.
    const tt = (r.t + 0.9 / r.length) % 1;
    r.path.getPointAt(tt, _p);
    r.path.getTangentAt(tt, _a);
    r.tyre.position.set(_p.x, 0.3, _p.z);
    const yaw = Math.atan2(_a.x, _a.z);
    r.spin += (r.speed * dt) / 0.3;
    r.tyre.rotation.set(0, 0, 0);
    // Wheel plane must contain the direction of travel: local +x -> tangent.
    r.tyre.rotateY(yaw - Math.PI / 2);
    r.tyre.rotateX(0.08 * Math.sin(r.spin * 0.25));
    r.tyre.rotateZ(-r.spin);
    r.path.getPointAt(r.t, _p);
    r.path.getTangentAt(r.t, _a);
    r.kid.root.position.set(_p.x, 0, _p.z);
    r.kid.root.rotation.y = Math.atan2(_a.x, _a.z);
    r.kid.setTimeScale(r.speed / 4.2);
    r.kid.update(dt);
  }
}

/** Children standing round, watching: [avatar, clip, x, z, facing yaw]. */
export async function createWatchers(scene: THREE.Scene, spots: [string, string, number, number, number][]): Promise<Character[]> {
  return Promise.all(
    spots.map(async ([id, clip, x, z, rot]) => {
      const c = await Character.create(id, [clip]);
      c.root.position.set(x, 0, z);
      c.root.rotation.y = rot;
      c.play(clip, { offset: Math.random() });
      scene.add(c.root);
      return c;
    }),
  );
}

/** Yaw that makes a character at (x, z) face the point (tx, tz). */
export const faceToward = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
