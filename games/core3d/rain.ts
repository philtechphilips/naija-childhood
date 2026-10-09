import * as THREE from "three";

/** Falling rain streaks around a point (cheap: one LineSegments, moved on the CPU). */
export function createRain(scene: THREE.Scene, count = 1600, radius = 14) {
  const pos = new Float32Array(count * 6);
  const speed = new Float32Array(count);
  const reset = (i: number, cx: number, cz: number, y?: number) => {
    const x = cx + (Math.random() - 0.5) * radius * 2;
    const z = cz + (Math.random() - 0.5) * radius * 2;
    const yy = y ?? Math.random() * 12;
    pos.set([x, yy, z, x + 0.03, yy - 0.45, z + 0.02], i * 6);
    speed[i] = 14 + Math.random() * 6;
  };
  for (let i = 0; i < count; i++) reset(i, 0, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc9d6e0, transparent: true, opacity: 0.35 }));
  lines.frustumCulled = false;
  scene.add(lines);
  return {
    update(dt: number, center: THREE.Vector3) {
      for (let i = 0; i < count; i++) {
        const o = i * 6;
        const dy = speed[i]! * dt;
        pos[o + 1]! -= dy;
        pos[o + 4]! -= dy;
        if (pos[o + 1]! < 0) reset(i, center.x, center.z, 12);
      }
      geo.attributes.position!.needsUpdate = true;
    },
    dispose() {
      lines.removeFromParent();
      geo.dispose();
    },
  };
}
