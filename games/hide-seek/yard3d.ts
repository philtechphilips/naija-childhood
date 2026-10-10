import * as THREE from "three";
import { instantiateProp } from "@/games/core3d/assets";
import { mangoTree } from "@/games/core3d/places";
import { placeProp } from "@/games/core3d/street";

/**
 * The things to hide behind, laid out to match the solids in rules.ts. Returns
 * the mango tree's leaf materials so the game can fade them when you're under it.
 */
export async function buildYard(scene: THREE.Scene): Promise<{ leaves: THREE.MeshStandardMaterial[] }> {
  const car = await instantiateProp("covered_car");
  const box = new THREE.Box3().setFromObject(car);
  const size = box.getSize(new THREE.Vector3());
  car.scale.setScalar(4.4 / Math.max(size.x, size.z));
  if (size.x > size.z) car.rotation.y = Math.PI / 2;
  const wrap = new THREE.Group();
  wrap.add(car);
  wrap.position.set(-3.2, 0, -5.3);
  scene.add(wrap);

  const leaves: THREE.MeshStandardMaterial[] = [];
  const tree = mangoTree(5, 0.72);
  tree.position.set(3.7, 0, 2.6);
  tree.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry.type === "IcosahedronGeometry") {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      leaves.push(mat);
    }
  });
  scene.add(tree);

  await Promise.all([
    placeProp(scene, "portable_generator", -4.9, 8.9, 0.6),
    placeProp(scene, "plastic_jerrycan", -4.2, 9.5, 0.2),
    placeProp(scene, "barrel_03", -4.8, 5.2, 0),
    placeProp(scene, "plastic_jerrycan", -4.3, 5.6, 1.1),
    placeProp(scene, "small_lpg_tank", -4.7, -0.6, 0),
    placeProp(scene, "pot_enamel_01", -4.3, -1.2, 0, 1, 0.42),
    placeProp(scene, "plastic_monobloc_chair_01", 4.1, -2.4, -Math.PI / 2 - 0.3),
    placeProp(scene, "plastic_monobloc_chair_01", 4.4, -1.6, -Math.PI / 2),
    placeProp(scene, "wicker_basket_01", 4.7, -2.3, 0.4),
  ]);
  const stove = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.5 }));
  stove.position.set(-4.3, 0.2, -1.2);
  stove.castShadow = true;
  scene.add(stove);
  return { leaves };
}
