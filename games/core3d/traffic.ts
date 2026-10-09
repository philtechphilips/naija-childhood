import * as THREE from "three";
import { createRng } from "@/games/core/rng";
import { danfo, keke } from "./procedural";

/**
 * Moving traffic on the main road: danfos and kekes in both directions.
 * They keep their distance, brake for people on the road, and toot when blocked.
 */
export const LANES = [
  { z: 23.5, dir: 1 as const },
  { z: 25.7, dir: -1 as const },
];
const X0 = -55;
const X1 = 125;

export interface Car {
  obj: THREE.Group;
  wheels: THREE.Object3D[];
  lane: (typeof LANES)[number];
  x: number;
  speed: number;
  cruise: number;
  length: number;
  width: number;
  kind: "danfo" | "keke";
  hornCooldown: number;
}

export interface Traffic {
  cars: Car[];
  /**
   * Advances traffic. `people` are positions (metres) of anyone who might be on the road;
   * cars brake for them. Returns true when a driver honks at someone.
   */
  update(dt: number, people: { x: number; z: number }[]): boolean;
  /** Footprints (centre, half sizes) for collision. */
  footprints(): { x: number; z: number; hx: number; hz: number; vx: number }[];
  dispose(): void;
}

export function createTraffic(scene: THREE.Scene, count: number, seed = 11): Traffic {
  const rng = createRng(seed);
  const cars: Car[] = [];
  for (let i = 0; i < count; i++) {
    const lane = LANES[i % LANES.length]!;
    const kind = rng() < 0.6 ? "danfo" : "keke";
    const obj = kind === "danfo" ? danfo(100 + i) : keke(200 + i);
    const wheels: THREE.Object3D[] = [];
    obj.traverse((o) => {
      if (o.name === "wheel") wheels.push(o);
    });
    // Spread cars along the lane.
    const x = X0 + ((i / count) * (X1 - X0) + rng() * 12) % (X1 - X0);
    obj.position.set(x, 0, lane.z);
    obj.rotation.y = lane.dir === 1 ? 0 : Math.PI;
    scene.add(obj);
    const cruise = kind === "danfo" ? 6.5 + rng() * 3 : 5 + rng() * 2;
    cars.push({ obj, wheels, lane, x, speed: cruise, cruise, length: kind === "danfo" ? 4.8 : 2.6, width: kind === "danfo" ? 2 : 1.4, kind, hornCooldown: 0 });
  }

  return {
    cars,
    update(dt, people) {
      let honk = false;
      for (const c of cars) {
        c.hornCooldown = Math.max(0, c.hornCooldown - dt);
        const dir = c.lane.dir;
        // Distance to the nearest thing ahead in this lane (car or person).
        let gap = Infinity;
        for (const o of cars) {
          if (o === c || o.lane !== c.lane) continue;
          const d = (o.x - c.x) * dir;
          if (d > 0) gap = Math.min(gap, d - (o.length + c.length) / 2);
        }
        let personAhead = false;
        for (const p of people) {
          if (Math.abs(p.z - c.lane.z) > c.width / 2 + 0.6) continue;
          const d = (p.x - c.x) * dir - c.length / 2;
          if (d > -0.5 && d < gap) {
            gap = d;
            personAhead = true;
          }
        }
        const want = gap < 2 ? 0 : gap < 9 ? c.cruise * ((gap - 2) / 7) : c.cruise;
        const accel = want < c.speed ? 9 : 2.5;
        c.speed += Math.sign(want - c.speed) * Math.min(Math.abs(want - c.speed), accel * dt);
        if (personAhead && gap < 6 && c.hornCooldown <= 0 && c.speed < c.cruise * 0.6) {
          c.hornCooldown = 4 + Math.random() * 3;
          honk = true;
        }
        c.x += dir * c.speed * dt;
        if (dir === 1 && c.x > X1) c.x = X0;
        if (dir === -1 && c.x < X0) c.x = X1;
        c.obj.position.x = c.x;
        const spin = (c.speed * dt) / (c.kind === "danfo" ? 0.38 : 0.28);
        for (const w of c.wheels) w.rotation.z -= spin;
      }
      return honk;
    },
    footprints() {
      return cars.map((c) => ({ x: c.x, z: c.lane.z, hx: c.length / 2, hz: c.width / 2, vx: c.lane.dir * c.speed }));
    },
    dispose() {
      for (const c of cars) c.obj.removeFromParent();
    },
  };
}
