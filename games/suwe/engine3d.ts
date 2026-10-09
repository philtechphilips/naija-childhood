import * as THREE from "three";
import type { EngineContext, GameEngine } from "@/games/types";
import { createLoop } from "@/games/core/loop";
import { clamp, hudText } from "@/games/core/draw";
import { createStage, QUALITY } from "@/games/core3d/stage";
import { buildStreet } from "@/games/core3d/street";
import { createCrowd, type Crowd } from "@/games/core3d/crowd";
import { Character } from "@/games/core3d/character";
import { createOverlay, drawLoading } from "@/games/core3d/overlay";
import { createAmbience } from "@/games/core3d/ambience";
import { createNaijaMusic } from "@/games/core/naija-music";
import { createSuweMatch, type SuweEvent } from "./match";
import { bindSuweKeys, drawSuweHud } from "./hud";
import { BOX, createBoardDecal, ORIGIN, toWorld } from "./board3d";
import type { Board, Foot } from "./rules";

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Realistic 3D Suwe: a boy hopping a chalk board in a Lagos side street. */
export function createSuwe3D(ctx: EngineContext): GameEngine {
  const stage = createStage(ctx.canvas);
  const overlay = createOverlay(ctx.canvas);
  const ambience = createAmbience(ctx.sfx);
  // Highlife: palm-wine guitar and bell, gets busier on later boards.
  const music = createNaijaMusic(ctx.sfx, "highlife", { enabled: ctx.music });
  const m = createSuweMatch({ mode: ctx.mode, seed: ctx.seed, difficulty: ctx.options.difficulty });
  // Dev only: lets automated playtests (and trailer capture) read the board.
  if (process.env.NODE_ENV !== "production") (window as unknown as { __suwe?: typeof m }).__suwe = m;
  const st = m.st;

  let ready = false;
  let disposed = false;
  let failed = false;
  let progress = 0;
  let kid: Character | null = null;
  let crowd: Crowd | null = null;
  const watchers: Character[] = [];
  let boardMesh: THREE.Mesh | null = null;
  const highlight = {
    target: quad(0xffd166),
    sweep: quad(0xffffff),
    stone: quad(0xff5040),
  };
  const rings = [ring(), ring()];
  const stone = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.055, 1).scale(1.2, 0.55, 1),
    new THREE.MeshStandardMaterial({ color: 0x8e877c, roughness: 0.85 }),
  );
  stone.castShadow = true;
  stage.scene.add(stone);
  const popups: { text: string; color: string; size: number; y: number; age: number }[] = [];
  let throwAnim = -10;
  let pickAnim = -10;
  let lastFrame = performance.now();
  const camTarget = new THREE.Vector3();

  function quad(color: number) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(BOX * 0.92, BOX * 0.92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    q.position.y = 0.03;
    stage.scene.add(q);
    return q;
  }
  function ring() {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0, depthWrite: false }));
    r.position.y = 0.035;
    stage.scene.add(r);
    return r;
  }
  function placeQuad(q: THREE.Mesh, index: number, opacity: number) {
    const b = m.boxBounds(index);
    toWorld({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }, 0.03, q.position);
    (q.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  function drawBoard(board: Board) {
    boardMesh?.removeFromParent();
    boardMesh = createBoardDecal(board);
    stage.scene.add(boardMesh);
  }

  async function init() {
    await buildStreet(stage.scene, { detailed: stage.quality !== "low", jail: false });
    if (disposed) return;
    progress = 0.55;
    kid = await Character.create("tunde", ["idle_m", "cheer_m"]);
    kid.play("idle_m");
    stage.scene.add(kid.root);
    const spots: [string, string, number, number, number][] = [
      ["ada", "clap_f", 1.6, 1.2, -Math.PI / 2],
      ["aisha", "idle_f", 1.7, 2.4, -Math.PI / 2],
      ["emeka", "cheer_m", -1.7, 3.0, Math.PI / 2],
    ];
    await Promise.all(
      spots.map(async ([id, clip, dx, dz, rot]) => {
        const w = await Character.create(id, [clip]);
        w.root.position.set(ORIGIN.x + dx, 0, ORIGIN.z + dz);
        w.root.rotation.y = rot;
        w.play(clip, { offset: Math.random() });
        stage.scene.add(w.root);
        watchers.push(w);
      }),
    );
    progress = 0.85;
    crowd = await createCrowd(stage.scene, { walkers: Math.round(QUALITY[stage.quality].npcs * 0.6), exclude: ["tunde", "ada", "aisha", "emeka"], traffic: QUALITY[stage.quality].traffic, rollers: true });
    drawBoard(st.board);
    ready = true;
    music.start();
    lastFrame = performance.now();
  }
  init().catch((e) => {
    console.error(e);
    failed = true;
  });

  function handle(events: SuweEvent[]) {
    for (const e of events) {
      if (e.type === "sfx") ctx.sfx.play(e.name, e.volume);
      else if (e.type === "haptic") ctx.haptic(e.pattern);
      else if (e.type === "popup") popups.push({ text: e.text, color: e.color, size: e.size, y: e.y, age: 0 });
      else if (e.type === "board") drawBoard(st.board);
      else if (e.type === "throw") throwAnim = st.clock;
      else if (e.type === "land" && e.step.pick) pickAnim = st.clock;
      else if (e.type === "finish") ctx.onEnd({ ...e.result, options: ctx.options });
    }
    music.setIntensity(Math.min(1, st.level / 4));
    if (st.phase === "end") music.stop(2);
  }
  const press = (f: Foot) => {
    ambience.resume();
    handle(m.press(f));
  };

  function update(dt: number) {
    if (!ready) return;
    handle(m.update(dt));
    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.1) popups.splice(i, 1);
  }

  function poseKid(dt: number) {
    if (!kid) return;
    if (st.phase === "end") {
      const cleared = m.daily && st.target > st.board.boxes.length;
      if (cleared && kid.current !== "cheer_m") kid.play("cheer_m");
    }
    kid.update(dt);
    const f = m.currentFeet();
    const mid = { x: (f.l.x + f.r.x) / 2, z: (f.l.z + f.r.z) / 2 };
    const hop = ctx.reducedMotion ? 0.04 : 0.24;
    toWorld(mid, f.lift * hop, kid.root.position);
    if (st.phase === "end") return;

    const lw = toWorld(f.l);
    const rw = toWorld(f.r);
    const spread = lw.distanceTo(rw);
    if (f.oneFoot) {
      // Hopping on the right foot, left knee bent up behind.
      kid.rotateWorld("L Thigh", X, -0.45);
      kid.rotateWorld("L Calf", X, 1.45);
      kid.rotateWorld("R Thigh", Z, -0.06);
    } else if (spread > 0.45) {
      const a = Math.atan2(spread / 2 - 0.1, 0.62);
      kid.rotateWorld("L Thigh", Z, a);
      kid.rotateWorld("R Thigh", Z, -a);
    }
    if (f.lift > 0.05) {
      for (const s of ["L", "R"]) {
        kid.rotateWorld(`${s} Thigh`, X, -0.35 * f.lift);
        kid.rotateWorld(`${s} Calf`, X, 0.6 * f.lift);
      }
    }
    // Arms out for balance while hopping.
    if (st.phase === "hop") {
      kid.rotateWorld("L UpperArm", Z, 0.75);
      kid.rotateWorld("R UpperArm", Z, -0.75);
    }
    // Throwing arm swing
    const tt = (st.clock - throwAnim) / 0.45;
    if (tt >= 0 && tt < 1) kid.rotateWorld("R UpperArm", X, -Math.sin(tt * Math.PI) * 1.6);
    // Bend down to pick the stone
    const pt = (st.clock - pickAnim) / 0.4;
    if (pt >= 0 && pt < 1) kid.rotateWorld("Spine1", X, -Math.sin(pt * Math.PI) * 0.7);
  }

  function render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (ready) stage.adapt(dt);
    overlay.begin();
    if (!ready || !kid) {
      progress = Math.min(progress + dt * 0.04, 0.95);
      drawLoading(overlay, failed ? "Couldn't load the 3D street" : "Loading the street…", progress);
      return;
    }
    poseKid(dt);
    for (const w of watchers) w.update(dt);
    crowd?.update(dt, stage.camera.position);

    // Highlights: target box pulses during the throw; the sweeping glow shows where the stone will land.
    const n = st.board.boxes.length;
    for (const q of Object.values(highlight)) (q.material as THREE.MeshBasicMaterial).opacity = 0;
    if (st.phase === "throw") {
      placeQuad(highlight.target, st.target, 0.22 + Math.sin(st.clock * 6) * 0.08);
      const cur = Math.floor(clamp(st.sweep, 0, n - 0.0001)) + 1;
      placeQuad(highlight.sweep, cur, 0.45);
      (highlight.sweep.material as THREE.MeshBasicMaterial).color.set(cur === st.target ? 0x7ee08a : 0xffffff);
    }
    if ((st.phase === "hop" || st.phase === "flight") && st.stoneBox && st.stepIndex < st.plan.length / 2) placeQuad(highlight.stone, st.stoneBox, 0.2);

    // Hop cue rings shrinking onto the landing spots.
    for (const r of rings) (r.material as THREE.MeshBasicMaterial).opacity = 0;
    const step = st.phase === "hop" ? st.plan[st.stepIndex] : undefined;
    if (step) {
      const t = (st.nextAt - st.clock) / st.beat;
      const land = m.stepFeet(step);
      const spots = step.foot === "split" ? [land.l, land.r] : [land.r];
      spots.forEach((p, i) => {
        const r = rings[i]!;
        toWorld(p, 0.035, r.position);
        // Easy waits for you: once closed, the ring pulses gently until you press.
        const waiting = m.relaxed && t < 0 ? 0.025 * Math.abs(Math.sin(st.clock * 5)) : 0;
        r.scale.setScalar(THREE.MathUtils.lerp(0.14, 0.5, clamp(t, 0, 1)) + waiting);
        const mat = r.material as THREE.MeshBasicMaterial;
        mat.color.set(step.foot === "split" ? 0x7ec8ff : 0xffd166);
        mat.opacity = clamp(1.2 - t, 0.35, 0.95);
      });
    }

    // Stone: in hand, flying, or resting in its box.
    if (st.phase === "flight") {
      const t = clamp((st.clock - st.phaseAt) / 0.5, 0, 1);
      const to = m.boxCenter(st.thrownBox);
      const from = toWorld(m.currentFeet().r, 1.0);
      const dest = toWorld(to, 0.03);
      stone.position.lerpVectors(from, dest, t);
      stone.position.y += Math.sin(t * Math.PI) * 0.9;
      stone.visible = true;
    } else if (!st.holdingStone && st.stoneBox) {
      toWorld(m.boxCenter(st.stoneBox), 0.03, stone.position);
      stone.visible = true;
    } else stone.visible = false;

    // Camera behind and above the hopper, looking up the board.
    const f = m.currentFeet();
    const focus = toWorld({ x: 0, z: Math.max(-0.7, (f.l.z + f.r.z) / 2) });
    camTarget.lerp(focus, camTarget.lengthSq() === 0 ? 1 : Math.min(1, dt * 5));
    stage.camera.position.set(camTarget.x + 0.75, 3.3, camTarget.z - 2.3);
    stage.camera.lookAt(camTarget.x - 0.15, 0.2, camTarget.z + 2.6);
    stage.focusShadows(camTarget);
    stage.render();

    const { g, w: W, h: H, font } = overlay;
    drawSuweHud(g, W, H, m, font);
    if (step && (st.level === 0 || m.daily || m.relaxed)) {
      const land = m.stepFeet(step);
      const mid = toWorld({ x: (land.l.x + land.r.x) / 2, z: (land.l.z + land.r.z) / 2 }, 0.5);
      const p = overlay.project(mid, stage.camera);
      if (p) hudText(g, step.foot === "split" ? "SPLIT" : step.pick ? "HOP + PICK" : "HOP", p.x, p.y, { size: 18, font: font.display, color: step.foot === "split" ? "#7ec8ff" : "#ffd166", stroke: "rgba(0,0,0,0.55)", strokeWidth: 4 });
    }
    for (const pp of popups) {
      hudText(g, pp.text, W / 2, H * pp.y - pp.age * 30, { size: pp.size, font: font.display, color: pp.color, stroke: "rgba(0,0,0,0.55)", alpha: pp.age < 0.8 ? 1 : 1 - (pp.age - 0.8) / 0.3 });
    }
  }

  const loop = createLoop(update, render);
  const unbind = bindSuweKeys(() => st.phase, press);

  return {
    start() {
      loop.start();
    },
    setPaused(p) {
      loop.setPaused(p);
      ambience.setVolume(p ? 0 : 1);
      music.setVolume(p ? 0 : 1);
    },
    setMusic(on) {
      music.setEnabled(on);
    },
    input(id, down) {
      if (!down) return;
      if (id === "hop") press("hop");
      else if (id === "split") press("split");
    },
    destroy() {
      disposed = true;
      loop.stop();
      unbind();
      ambience.dispose();
      music.dispose();
      crowd?.dispose();
      kid?.dispose();
      for (const w of watchers) w.dispose();
      overlay.dispose();
      stage.dispose();
    },
  };
}
