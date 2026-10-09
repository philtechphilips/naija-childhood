"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createStage } from "@/games/core3d/stage";
import { buildStreet } from "@/games/core3d/street";
import { createCrowd } from "@/games/core3d/crowd";
import { ARM_CHAIN, Character } from "@/games/core3d/character";
import { createTenTenDecal, GAP, SPOT } from "@/games/ten-ten/decal3d";
import { createBoardDecal, toWorld } from "@/games/suwe/board3d";
import { CLASSIC, makeBoard } from "@/games/suwe/rules";

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

type Ctx = { scene: THREE.Scene; camera: THREE.PerspectiveCamera; focus: (v: THREE.Vector3) => void };

async function person(scene: THREE.Scene, id: string, clip: string, x: number, z: number, rotY: number, offset: number) {
  const c = await Character.create(id, [clip]);
  c.root.position.set(x, 0, z);
  c.root.rotation.y = rotY;
  c.play(clip, { offset, fade: 0 });
  c.update(0.001);
  scene.add(c.root);
  return c;
}

/** Ten-Ten girls posed mid-throw, with the clap pose blended from mocap. */
async function tenTenGirls(scene: THREE.Scene, legOut: boolean) {
  scene.add(createTenTenDecal());
  const ada = await Character.create("ada", ["idle_f", "clap_f"]);
  const aisha = await Character.create("aisha", ["idle_f", "clap_f"]);
  for (const [c, facing] of [
    [ada, 1],
    [aisha, -1],
  ] as const) {
    c.root.position.set(SPOT.x, 0, SPOT.z + (facing === 1 ? -GAP : GAP));
    c.root.rotation.y = facing === 1 ? 0 : Math.PI;
    c.play("idle_f", { fade: 0 });
    c.update(0.001);
    scene.add(c.root);
  }
  const t = ada.closestApproach("clap_f", "L Hand", "R Hand");
  const pose = ada.samplePose("clap_f", t, ARM_CHAIN.filter((b) => b !== "Head" && b !== "Neck"));
  if (pose) ada.blendPose(pose, 0.9);
  ada.root.position.y = 0.1;
  for (const s of ["L", "R"]) {
    ada.rotateWorld(`${s} Thigh`, X, -0.25);
    ada.rotateWorld(`${s} Calf`, X, 0.45);
  }
  if (legOut) {
    aisha.root.position.y = 0.05;
    aisha.rotateWorld("R Thigh", Z, 0.62);
    aisha.rotateWorld("R Thigh", X, 0.5);
    aisha.rotateWorld("L UpperArm", Z, -0.5);
    aisha.rotateWorld("R UpperArm", Z, 0.5);
  }
  return [ada, aisha];
}

const SHOTS: Record<string, (c: Ctx) => Promise<void>> = {
  async "ten-ten"({ scene, camera, focus }) {
    await tenTenGirls(scene, true);
    await person(scene, "emeka", "clap_m", SPOT.x - 1.9, SPOT.z + 0.1, Math.PI / 2, 0.3);
    await person(scene, "tunde", "cheer_m", SPOT.x + 1.6, SPOT.z + 1.4, -Math.PI * 0.7, 0.35);
    await person(scene, "woman1", "clap_f", SPOT.x - 1.2, SPOT.z + 2.4, Math.PI * 0.85, 0.5);
    camera.position.set(SPOT.x - 2.4, 1.2, SPOT.z - 1.9);
    camera.lookAt(SPOT.x + 0.15, 0.85, SPOT.z + 0.2);
    camera.fov = 42;
    focus(SPOT);
  },
  async "police-thief"({ scene, camera, focus }) {
    await person(scene, "tunde", "run_m", 23.6, 23.8, -Math.PI / 2 + 0.25, 0.22);
    await person(scene, "ada", "run_m", 25.6, 22.7, -Math.PI / 2 + 0.15, 0.62);
    await person(scene, "police", "run_m", 25.0, 24.7, -Math.PI / 2 + 0.12, 0.7);
    await person(scene, "police", "run_m", 27.2, 23.4, -Math.PI / 2 - 0.1, 0.15);
    camera.position.set(19.6, 0.95, 25.4);
    camera.lookAt(27, 1.2, 24.0);
    camera.fov = 40;
    focus(new THREE.Vector3(26, 0, 24));
  },
  async suwe({ scene, camera, focus }) {
    const board = makeBoard(CLASSIC);
    scene.add(createBoardDecal(board));
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.055, 1).scale(1.2, 0.55, 1), new THREE.MeshStandardMaterial({ color: 0x8e877c, roughness: 0.85 }));
    stone.castShadow = true;
    toWorld({ x: -0.5, z: 3.5 }, 0.03, stone.position);
    scene.add(stone);
    const kid = await Character.create("tunde", ["idle_m"]);
    kid.play("idle_m", { fade: 0 });
    kid.update(0.001);
    toWorld({ x: 0, z: 2.5 }, 0.2, kid.root.position);
    scene.add(kid.root);
    kid.rotateWorld("L Thigh", X, -0.5);
    kid.rotateWorld("L Calf", X, 1.5);
    kid.rotateWorld("R Thigh", X, -0.15);
    kid.rotateWorld("R Calf", X, 0.3);
    kid.rotateWorld("L UpperArm", Z, 0.85);
    kid.rotateWorld("R UpperArm", Z, -0.85);
    await person(scene, "ada", "clap_f", 32.4, 37.3, Math.PI / 2, 0.4);
    await person(scene, "aisha", "clap_f", 32.5, 38.4, Math.PI / 2 + 0.3, 0.8);
    await person(scene, "emeka", "cheer_m", 35.7, 39.2, -Math.PI / 2 - 0.4, 0.3);
    camera.position.set(35.4, 1.55, 40.6);
    camera.lookAt(33.9, 0.55, 37.0);
    camera.fov = 45;
    focus(new THREE.Vector3(34, 0, 37.5));
  },
  async "school-friends"({ scene, camera, focus }) {
    await person(scene, "tunde", "cheer_m", 15.1, 31.1, Math.PI + 0.25, 0.32);
    await person(scene, "ada", "clap_f", 16.0, 31.4, Math.PI + 0.1, 0.45);
    await person(scene, "aisha", "idle_f", 16.85, 31.3, Math.PI - 0.1, 0.2);
    await person(scene, "emeka", "cheer_m", 17.75, 31.0, Math.PI - 0.3, 0.7);
    camera.position.set(16.4, 1.3, 27.6);
    camera.lookAt(16.4, 1.05, 31.3);
    camera.fov = 42;
    focus(new THREE.Vector3(16.4, 0, 31));
  },
  async "school-yard"({ scene, camera, focus }) {
    await tenTenGirls(scene, true);
    await person(scene, "emeka", "clap_m", SPOT.x - 1.9, SPOT.z + 0.1, Math.PI / 2, 0.3);
    await person(scene, "tunde", "cheer_m", SPOT.x + 1.9, SPOT.z + 0.4, -Math.PI / 2, 0.6);
    camera.position.set(29.5, 2.4, 17.8);
    camera.lookAt(36, 0.9, 11);
    camera.fov = 50;
    focus(new THREE.Vector3(34, 0, 12));
  },
  async intensity({ scene, camera, focus }) {
    await person(scene, "emeka", "run_m", 16.6, 24.2, -Math.PI / 2 + 0.1, 0.1);
    await person(scene, "ada", "run_m", 17.9, 25.4, -Math.PI / 2, 0.45);
    await person(scene, "tunde", "run_m", 19.3, 23.4, -Math.PI / 2 - 0.08, 0.8);
    camera.position.set(12.2, 0.75, 24.5);
    camera.lookAt(19, 1.05, 24.5);
    camera.fov = 44;
    focus(new THREE.Vector3(18, 0, 24.5));
  },
  async playground({ scene, camera, focus }) {
    await person(scene, "ada", "cheer_f", 16.0, 31.3, Math.PI + 0.25, 0.4);
    await person(scene, "aisha", "clap_f", 16.8, 31.4, Math.PI - 0.2, 0.55);
    camera.position.set(16.4, 1.2, 29.0);
    camera.lookAt(16.4, 1.0, 31.3);
    camera.fov = 40;
    focus(new THREE.Vector3(16.4, 0, 31));
  },
};

/** Development tool: renders posed in-game scenes used as the app's key art. */
export function KeyArt() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    if (!ref.current) return;
    const params = new URLSearchParams(location.search);
    const shot = params.get("shot") ?? "ten-ten";
    const stage = createStage(ref.current, { quality: "high", preset: (params.get("light") as "day" | "evening") ?? "day" });
    stage.renderer.setPixelRatio(2);
    let raf = 0;
    let alive = true;
    (async () => {
      await buildStreet(stage.scene, { detailed: true, jail: shot === "police-thief" });
      const crowd = await createCrowd(stage.scene, { walkers: 30, seed: 5, traffic: 8, rollers: true });
      crowd.update(0.001, new THREE.Vector3());
      let subject = new THREE.Vector3();
      await SHOTS[shot]!({
        scene: stage.scene,
        camera: stage.camera,
        focus: (v) => {
          subject = v.clone();
          stage.focusShadows(v);
        },
      });
      stage.camera.updateProjectionMatrix();
      // Clear passers-by and traffic that would block the shot.
      const cam = stage.camera.position.clone();
      const dir = new THREE.Vector3();
      stage.camera.getWorldDirection(dir);
      const reach = cam.distanceTo(subject) + 1.5;
      const blocks = (p: THREE.Vector3, radius: number) => {
        const rel = p.clone().sub(cam);
        const t = rel.dot(dir);
        if (rel.length() < 4) return true;
        if (t < 0 || t > reach) return false;
        const perp = rel.clone().sub(dir.clone().multiplyScalar(t));
        perp.y = 0;
        return perp.length() < radius;
      };
      for (const c of crowd.people) if (blocks(c.root.position.clone().setY(1), 1.4)) c.root.visible = false;
      for (const car of crowd.traffic?.cars ?? []) if (blocks(car.obj.position.clone().setY(1), 3.2)) car.obj.visible = false;
      let frames = 0;
      const loop = () => {
        if (!alive) return;
        raf = requestAnimationFrame(loop);
        stage.render();
        if (++frames === 90) setStatus("ready");
      };
      loop();
    })().catch((e) => setStatus(`error: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stage.dispose();
    };
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 100 }}>
      <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />
      <div id="status" data-status={status} style={{ display: "none" }}>
        {status}
      </div>
    </div>
  );
}
