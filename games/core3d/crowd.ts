import * as THREE from "three";
import { createRng, pick } from "@/games/core/rng";
import { Character } from "./character";
import { STALLS, WALK_LANES } from "./street-layout";
import { createTraffic, type Traffic } from "./traffic";
import { headTray } from "./procedural";
import { createTyreRollers, updateTyreRollers, type TyreRoller } from "./kids";

const ADULT_M = ["man1", "man2", "man3", "police"];
const ADULT_F = ["woman1", "woman2"];
const KIDS = ["tunde", "emeka", "ada", "aisha"];

interface Walker {
  c: Character;
  lane: (typeof WALK_LANES)[number];
  dir: 1 | -1;
  speed: number;
  x: number;
}

export interface Crowd {
  walkers: Walker[];
  people: Character[];
  traffic: Traffic | null;
  /**
   * Advances pedestrians and traffic. `roadPeople` are extra positions (metres) cars should
   * brake for, e.g. players running across the road. Returns true if a driver honked.
   */
  update(dt: number, focus: THREE.Vector3, roadPeople?: { x: number; z: number }[]): boolean;
  /** Pedestrian positions (for gentle collision with the player). */
  obstacles(): { x: number; z: number }[];
  dispose(): void;
}

/**
 * Street life: walkers on both sidewalks, traders at their stalls, people
 * chatting outside shops. Characters far from the camera skip animation updates.
 */
export async function createCrowd(scene: THREE.Scene, opts: { walkers: number; seed?: number; exclude?: string[]; traffic?: number; rollers?: boolean }): Promise<Crowd> {
  const rng = createRng(opts.seed ?? 21);
  const avail = (ids: string[]) => ids.filter((i) => !opts.exclude?.includes(i));
  const people: Character[] = [];
  const walkers: Walker[] = [];

  const spawn = async (id: string, clips: string[]) => {
    const c = await Character.create(id, clips);
    scene.add(c.root);
    people.push(c);
    return c;
  };

  const jobs: Promise<unknown>[] = [];

  // Pedestrians
  for (let i = 0; i < opts.walkers; i++) {
    const female = rng() < 0.45;
    const kid = rng() < 0.15;
    const id = kid ? pick(rng, KIDS) : female ? pick(rng, avail(ADULT_F)) : pick(rng, avail(ADULT_M).filter((x) => x !== "police"));
    const lane = WALK_LANES[i % WALK_LANES.length]!;
    const dir: 1 | -1 = i % 2 ? 1 : -1;
    const walk = female && !kid ? "walk_f" : "walk_m";
    jobs.push(
      spawn(id, [walk]).then((c) => {
        const speed = 1.05 + rng() * 0.45;
        const x = lane.x0 + rng() * (lane.x1 - lane.x0);
        c.root.position.set(x, 0, lane.z + (rng() - 0.5) * 0.4);
        c.root.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
        c.play(walk, { offset: rng() });
        c.setTimeScale(speed / 1.25);
        // Hawkers: many women walk with goods balanced on their heads.
        if (female && !kid && rng() < 0.55) c.attach("Head", headTray(i * 7 + 3), new THREE.Vector3(0, 0.17, 0));
        walkers.push({ c, lane, dir, speed, x });
      }),
    );
  }

  // Traders sitting at their stalls
  for (const s of STALLS) {
    const female = rng() < 0.75;
    const id = female ? pick(rng, avail(ADULT_F)) : pick(rng, avail(ADULT_M).filter((x) => x !== "police"));
    const clip = female ? "sit_f" : "sit_m";
    jobs.push(
      spawn(id, [clip]).then((c) => {
        const local = new THREE.Vector3(0.3, 0, -1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
        c.root.position.set(s.x + local.x, 0.02, s.z + local.z);
        c.root.rotation.y = s.rot;
        c.play(clip, { offset: rng() });
      }),
    );
  }

  // Standing groups and a phone caller outside shops
  const standers: [string, string, number, number, number][] = [
    [pick(rng, avail(ADULT_M)), "talk_m", 9, 31.2, Math.PI * 0.85],
    [pick(rng, avail(ADULT_F)), "talk_f", 9.9, 31.0, -Math.PI * 0.6],
    [pick(rng, avail(ADULT_M)), "phone_m", 52, 31.4, Math.PI],
    [pick(rng, avail(ADULT_M)), "look_m", 27.5, 17.4, 0.3],
    [pick(rng, avail(ADULT_M)), "crouch_m", 24.2, 20.15, 0],
  ];
  for (const [id, clip, x, z, rot] of standers) {
    jobs.push(
      spawn(id, [clip]).then((c) => {
        c.root.position.set(x, 0, z);
        c.root.rotation.y = rot;
        c.play(clip, { offset: rng() });
      }),
    );
  }

  await Promise.all(jobs);
  const traffic = opts.traffic ? createTraffic(scene, opts.traffic, (opts.seed ?? 21) + 3) : null;
  // Boys rolling old tyres with sticks: one down the side street, one along the north sidewalk.
  const rollers: TyreRoller[] = opts.rollers
    ? await createTyreRollers(scene, [
        [new THREE.Vector3(31.5, 0, 34), new THREE.Vector3(36.5, 0, 34), new THREE.Vector3(36.8, 0, 46), new THREE.Vector3(31.2, 0, 46)],
        [new THREE.Vector3(10, 0, 32.4), new THREE.Vector3(28, 0, 32.4), new THREE.Vector3(28, 0, 31.4), new THREE.Vector3(10, 0, 31.4)],
      ])
    : [];

  const tmp = new THREE.Vector3();
  return {
    walkers,
    people,
    traffic,
    update(dt, focus, roadPeople = []) {
      for (const w of walkers) {
        w.x += w.dir * w.speed * dt;
        if (w.x > w.lane.x1) w.x = w.lane.x0;
        if (w.x < w.lane.x0) w.x = w.lane.x1;
        w.c.root.position.x = w.x;
      }
      for (const c of people) {
        const d = tmp.copy(c.root.position).sub(focus).lengthSq();
        // Far-away people animate at a lower rate to save CPU on phones.
        if (d < 900 || Math.random() < 0.35) c.update(d < 900 ? dt : dt / 0.35);
      }
      if (rollers.length) updateTyreRollers(rollers, dt);
      return traffic ? traffic.update(dt, roadPeople) : false;
    },
    obstacles() {
      return people.map((c) => ({ x: c.root.position.x, z: c.root.position.z }));
    },
    dispose() {
      for (const c of people) c.dispose();
      for (const r of rollers) {
        r.kid.dispose();
        r.tyre.removeFromParent();
      }
      traffic?.dispose();
    },
  };
}
