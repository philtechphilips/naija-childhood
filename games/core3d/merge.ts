import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Collapses the static meshes under `root` into one mesh per material, keeping
 * how everything looks but cutting draw calls from hundreds to a few dozen.
 *
 * Call it before adding anything animated (characters, spinning items):
 * skinned, instanced, sprite, line and point objects are left alone, and so is
 * anything under an object with `userData.dynamic`.
 */
export function mergeStatic(root: THREE.Object3D): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: { mesh: THREE.Mesh; geo: THREE.BufferGeometry }[] }>();
  let before = 0;

  const visit = (o: THREE.Object3D) => {
    if (o.userData.dynamic) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && m.visible) {
      before++;
      const geo = m.geometry;
      const attrs = Object.keys(geo.attributes).sort().join(",");
      const key = `${m.material.uuid}|${attrs}|${geo.index ? 1 : 0}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
      let g = groups.get(key);
      if (!g) {
        g = { material: m.material, cast: m.castShadow, receive: m.receiveShadow, parts: [] };
        groups.set(key, g);
      }
      const rel = new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld);
      const copy = geo.clone();
      copy.applyMatrix4(rel);
      // Mirrored transforms flip triangle winding; merged meshes can't carry that, so leave them be.
      if (rel.determinant() < 0) {
        copy.dispose();
        return;
      }
      g.parts.push({ mesh: m, geo: copy });
    }
    for (const c of [...o.children]) visit(c);
  };
  for (const c of [...root.children]) visit(c);

  let after = 0;
  for (const g of groups.values()) {
    if (g.parts.length < 2) {
      for (const p of g.parts) p.geo.dispose();
      after += g.parts.length;
      continue;
    }
    const merged = mergeGeometries(g.parts.map((p) => p.geo), false);
    for (const p of g.parts) p.geo.dispose();
    if (!merged) {
      after += g.parts.length;
      continue;
    }
    const mesh = new THREE.Mesh(merged, g.material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    for (const p of g.parts) p.mesh.removeFromParent();
    after++;
  }
  // Drop groups left empty by the merge so the scene graph stays small.
  const prune = (o: THREE.Object3D) => {
    for (const c of [...o.children]) prune(c);
    if (o !== root && o.type === "Group" && o.children.length === 0 && !o.userData.dynamic) o.removeFromParent();
  };
  prune(root);
  return { before, after: after + (before - [...groups.values()].reduce((a, g) => a + g.parts.length, 0)) };
}
