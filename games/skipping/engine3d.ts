import * as THREE from "three";
import type { EngineContext, GameEngine } from "@/games/types";
import { createLoop } from "@/games/core/loop";
import { clamp, easeOutBack, hudText, roundRect } from "@/games/core/draw";
import { createStage, type LightPreset } from "@/games/core3d/stage";
import { Character } from "@/games/core3d/character";
import { createOverlay, drawLoading } from "@/games/core3d/overlay";
import { buildPlace, type Place, type PlaceId } from "@/games/core3d/places";
import { createWatchers, faceToward } from "@/games/core3d/kids";
import { HOUSES, bunting } from "@/games/core3d/sportsday";
import { AIR, LIVES } from "./rules";
import { createSkipMatch, type SkipEvent } from "./match";
import { bindJumpKeys, createCountVoice } from "./shared";
import { createNaijaMusic } from "@/games/core/naija-music";

const PRESET: Record<string, LightPreset> = { afternoon: "day", evening: "evening", rainy: "overcast" };
const TUCK = ["L Thigh", "L Calf", "R Thigh", "R Calf"];
/** Turners stand this far either side of the jumper (m). */
const HALF = 2.4;

export function createSkipping3D(ctx: EngineContext): GameEngine {
  const stage = createStage(ctx.canvas, { preset: PRESET[ctx.options.time ?? "afternoon"] ?? "day" });
  const overlay = createOverlay(ctx.canvas);
  const m = createSkipMatch({ difficulty: ctx.options.difficulty ?? "easy", seed: ctx.seed, mode: ctx.mode });
  const voice = createCountVoice(ctx.sfx);
  // Fuji-style percussion; goes wild during PEPPER.
  const music = createNaijaMusic(ctx.sfx, "fuji", { enabled: ctx.music });
  const unbind = bindJumpKeys(() => handle(m.press()));
  // Dev only: lets automated playtests read the rope.
  if (process.env.NODE_ENV !== "production") (window as unknown as { __skip?: typeof m }).__skip = m;
  const placeId = (["school", "compound", "street"].includes(ctx.options.place ?? "") ? ctx.options.place : "school") as PlaceId;
  let ready = false;
  let failed = false;
  let disposed = false;
  let progress = 0;
  let place: Place | null = null;
  let jumper: Character | null = null;
  const turners: Character[] = [];
  let crowd: Character[] = [];
  let tuck: Map<string, THREE.Quaternion> | null = null;
  let rope: THREE.Mesh | null = null;
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xe9e2c8, roughness: 0.8 });
  const spot = new THREE.Vector3();
  const bubbles: { text: string; target: THREE.Object3D; age: number; color: string }[] = [];
  const popups: { text: string; color: string; size: number; age: number }[] = [];
  let pepperFlash = 0;
  let lastFrame = performance.now();

  async function init() {
    place = await buildPlace(stage.scene, placeId, { detailed: stage.quality !== "low", walkers: placeId === "street" ? 10 : 0, traffic: placeId === "street" ? 4 : 0, rollers: false });
    if (disposed) return;
    spot.copy(place.spot);
    progress = 0.45;
    if (placeId === "school") {
      stage.scene.add(bunting(new THREE.Vector3(spot.x - 6, 2.8, spot.z + 4.5), new THREE.Vector3(spot.x + 6, 2.8, spot.z + 4.5), HOUSES.map((h) => h.color)));
    }
    // Jumper in the middle, a turner each side facing in.
    jumper = await Character.create("ada", ["idle_f", "crouch_m"]);
    jumper.play("idle_f");
    jumper.root.position.copy(spot);
    jumper.root.rotation.y = Math.PI; // facing the camera (which looks along +z, towards the buildings)
    stage.scene.add(jumper.root);
    tuck = jumper.samplePose("crouch_m", 0.6, TUCK);
    for (const [id, side] of [
      ["aisha", -1],
      ["emeka", 1],
    ] as const) {
      const c = await Character.create(id, [id === "aisha" ? "idle_f" : "idle_m"]);
      c.play(id === "aisha" ? "idle_f" : "idle_m", { offset: side > 0 ? 0.4 : 0 });
      c.root.position.set(spot.x + side * HALF, 0, spot.z);
      c.root.rotation.y = faceToward(spot.x + side * HALF, spot.z, spot.x, spot.z);
      stage.scene.add(c.root);
      turners.push(c);
    }
    if (disposed) return;
    progress = 0.75;
    // Friends waiting their turn, counting out loud.
    const ring: [string, string, number, number, number][] = [];
    const ids: [string, string][] = [
      ["tunde", "clap_m"],
      ["emeka", "cheer_m"],
      ["aisha", "clap_f"],
      ["woman1", "cheer_f"],
      ["woman2", "clap_f"],
      ["tunde", "cheer_m"],
    ];
    const n = stage.quality === "low" ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.15 + (i / (n - 1)) * Math.PI * 0.7;
      const x = spot.x + Math.cos(a) * 4.6 * (i % 2 ? 1 : 1.15);
      const z = spot.z + Math.sin(a) * 3.6;
      const [id, clip] = ids[i % ids.length]!;
      ring.push([id, clip, x, z, faceToward(x, z, spot.x, spot.z)]);
    }
    crowd = await createWatchers(stage.scene, ring);
    voice.preload();
    progress = 1;
    ready = true;
    lastFrame = performance.now();
  }
  init().catch((e) => {
    console.error(e);
    failed = true;
  });

  const popup = (text: string, color = "#fff", size = 30) => popups.push({ text, color, size, age: 0 });

  function handle(ev: SkipEvent[]) {
    for (const e of ev) {
      if (e.type === "jump") ctx.sfx.play("tick", 0.35);
      else if (e.type === "go") {
        music.start();
        popup("JUMP IN!", "#7ee08a", 44);
      }
      else if (e.type === "pepper") {
        pepperFlash = 1.4;
        ctx.sfx.play("whistle", 0.6);
        voice.say("pepper");
        popup("PEPPER! 🌶️", "#ff5d5d", 54);
        if (crowd[1]) bubbles.push({ text: "PEPPER!", target: crowd[1].root, age: 0, color: "#d62828" });
      } else if (e.type === "pepperEnd") popup("You survive pepper!", "#ffd166", 26);
      else if (e.type === "pass") {
        if (e.judgement === "trip") {
          ctx.sfx.play("miss", 0.7);
          ctx.haptic([60, 40, 60]);
          popup(m.st.lives > 0 ? "Rope don catch your leg!" : "OUT!", "#ff8a6b", 30);
          if (crowd[0]) bubbles.push({ text: "Ehn ehn! Out!", target: crowd[0].root, age: 0, color: "#14213d" });
        } else {
          ctx.sfx.play(e.judgement === "perfect" ? "perfect" : "stomp", e.judgement === "perfect" ? 0.35 : 0.3);
          voice.count(e.count);
          const who = crowd[e.count % Math.max(1, crowd.length)];
          if (who) bubbles.push({ text: `${e.count}!`, target: who.root, age: 0, color: e.pepper ? "#d62828" : "#14213d" });
        }
      } else if (e.type === "finish") ctx.onEnd({ ...e.result, options: ctx.options });
    }
  }

  function update(dt: number) {
    if (!ready) return;
    handle(m.update(dt));
    music.setIntensity(m.st.pepperLeft > 0 ? 1 : Math.min(0.8, m.st.totals.jumps / 40));
    if (m.st.phase === "end") music.stop(2);
    pepperFlash = Math.max(0, pepperFlash - dt);
    for (const b of bubbles) b.age += dt;
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i]!.age > 1.1) bubbles.splice(i, 1);
    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.3) popups.splice(i, 1);
  }

  const handPos = (c: Character, out: THREE.Vector3) => {
    const hand = c.bone("R Hand");
    if (hand) hand.getWorldPosition(out);
    else out.copy(c.root.position).setY(1);
    return out;
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const across = new THREE.Vector3();
  const swing = new THREE.Vector3();

  function updateRope() {
    const [t0, t1] = turners;
    if (!t0 || !t1) return;
    const angle = m.ropeAngle();
    // Turners' arms circle with the rope.
    for (const [i, t] of [t0, t1].entries()) {
      const dir = i === 0 ? 1 : -1;
      t.rotateWorld("R UpperArm", new THREE.Vector3(dir, 0, 0), Math.sin(angle) * 0.35);
      t.rotateWorld("R Forearm", new THREE.Vector3(0, 0, 1), Math.cos(angle) * 0.25 - 0.6);
    }
    handPos(t0, a);
    handPos(t1, b);
    across.subVectors(b, a).normalize();
    // Swing plane: down at angle 0 (under the feet), up at π, coming towards the camera (+z) over the top.
    const side = new THREE.Vector3().crossVectors(across, up).normalize().multiplyScalar(-1);
    const mid = (a.y + b.y) / 2;
    const sag = mid + 0.02;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 28; i++) {
      const s = i / 28;
      const p = new THREE.Vector3().lerpVectors(a, b, s);
      const r = Math.sin(s * Math.PI) * sag;
      swing.copy(up).multiplyScalar(-Math.cos(angle) * r).addScaledVector(side, Math.sin(angle) * r * 0.8);
      p.add(swing);
      p.y = Math.max(0.015, p.y);
      pts.push(p);
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.013, 5, false);
    if (!rope) {
      rope = new THREE.Mesh(geo, ropeMat);
      rope.castShadow = true;
      stage.scene.add(rope);
    } else {
      rope.geometry.dispose();
      rope.geometry = geo;
    }
  }

  function render() {
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    overlay.begin();
    if (failed) {
      hudText(overlay.g, "Couldn't load the yard. Check your connection.", overlay.w / 2, overlay.h / 2, { size: 16, font: overlay.font.body, weight: 700, color: "#fff" });
      return;
    }
    if (!ready || !jumper) {
      drawLoading(overlay, "Finding the long rope…", progress);
      return;
    }
    stage.adapt(frameDt);
    const h = m.jumpHeight();
    jumper.root.position.set(spot.x, h, spot.z);
    jumper.update(frameDt);
    if (tuck && h > 0.02) jumper.blendPose(tuck, clamp(h / 0.3, 0, 1) * 0.55);
    for (const t of turners) t.update(frameDt);
    for (const c of crowd) c.update(frameDt);
    updateRope();
    place?.update(frameDt, stage.camera.position);

    // Camera: in front of the jumper, a little to the side, so the rope's arc reads.
    // On tall phone screens swing round to a three-quarter view (and widen the lens)
    // so both turners and the whole rope stay in frame.
    const aspect = overlay.w / Math.max(1, overlay.h);
    const portrait = clamp((1.3 - aspect) / 0.8, 0, 1);
    const yaw = 0.25 + portrait * 0.55;
    const dist = 5.6 + portrait * 1.6;
    const fov = 55 + portrait * 10;
    if (Math.abs(stage.camera.fov - fov) > 0.1) {
      stage.camera.fov = fov;
      stage.camera.updateProjectionMatrix();
    }
    stage.camera.position.set(spot.x + Math.sin(yaw) * dist, 1.75 + portrait * 0.4, spot.z - Math.cos(yaw) * dist);
    stage.camera.lookAt(spot.x, 0.95, spot.z);
    stage.focusShadows(spot);
    stage.render();
    drawHud(now / 1000);
  }

  function drawHud(time: number) {
    const { g, w: W, h: H, font } = overlay;
    const st = m.st;
    if (pepperFlash > 0) {
      g.fillStyle = `rgba(255,60,40,${Math.min(0.25, pepperFlash * 0.2) * (Math.floor(time * 8) % 2 ? 1 : 0.5)})`;
      g.fillRect(0, 0, W, H);
    }
    // Jump count, big.
    hudText(g, String(st.totals.jumps), W / 2, 92, { size: 56, font: font.display, color: "#fff", stroke: "rgba(0,0,0,0.6)" });
    hudText(g, st.totals.combo >= 10 ? `STREAK ×${(1 + Math.min(4, Math.floor(st.totals.combo / 10)) * 0.5).toFixed(1)}` : "JUMPS", W / 2, 130, { size: 13, font: font.body, weight: 800, color: "#ffd166", stroke: "rgba(0,0,0,0.6)", strokeWidth: 3 });
    // Lives (top right) and score.
    for (let i = 0; i < LIVES; i++) hudText(g, i < st.lives ? "❤" : "♡", W - 22 - i * 24, 28, { size: 20, font: font.body, color: i < st.lives ? "#ff5d5d" : "rgba(255,255,255,0.4)", shadow: false });
    hudText(g, st.totals.score.toLocaleString(), W - 16, 58, { size: 20, font: font.display, color: "#fff", align: "right", stroke: "rgba(0,0,0,0.5)" });

    // Rope dial: the dot is the rope; press when it reaches the yellow wedge.
    const cx = W / 2;
    const cy = H - 92;
    const R = 34;
    roundRect(g, cx - 54, cy - 54, 108, 108, 26);
    g.fillStyle = "rgba(10,14,12,0.7)";
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    // Angle 0 (rope under your feet) is drawn at the bottom of the dial; it turns clockwise.
    const toScreen = (ang: number) => Math.PI / 2 + ang;
    const press = (2 * Math.PI * (AIR / 2)) / st.turnDur;
    g.strokeStyle = "#ffd166";
    g.lineWidth = 8;
    g.beginPath();
    g.arc(cx, cy, R, toScreen(-press - 0.35), toScreen(-press + 0.35));
    g.stroke();
    const ang = m.ropeAngle();
    g.fillStyle = st.pepperLeft > 0 ? "#ff5d5d" : "#fff";
    g.beginPath();
    g.arc(cx + Math.cos(toScreen(ang)) * R, cy + Math.sin(toScreen(ang)) * R, 8, 0, Math.PI * 2);
    g.fill();
    hudText(g, "JUMP", cx, cy, { size: 14, font: font.display, color: "#fff", shadow: false });

    for (const bb of bubbles) {
      const scr = overlay.project(bb.target.getWorldPosition(a).setY(a.y + 1.85), stage.camera);
      if (!scr) continue;
      const k = easeOutBack(Math.min(1, bb.age / 0.15));
      g.save();
      g.globalAlpha = bb.age < 0.8 ? 1 : 1 - (bb.age - 0.8) / 0.3;
      g.translate(scr.x, scr.y);
      g.scale(k, k);
      g.font = `400 16px ${font.display}`;
      const tw = g.measureText(bb.text).width + 18;
      roundRect(g, -tw / 2, -30, tw, 26, 9);
      g.fillStyle = "#fff";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#0b110d";
      g.stroke();
      hudText(g, bb.text, 0, -17, { size: 16, font: font.display, color: bb.color, shadow: false });
      g.restore();
    }
    popups.forEach((p, i) => {
      hudText(g, p.text, W / 2, H * 0.3 + i * (p.size + 6) - p.age * 12, { size: p.size, font: font.display, color: p.color, stroke: "rgba(0,0,0,0.6)", alpha: p.age < 0.9 ? 1 : 1 - (p.age - 0.9) / 0.4 });
    });
    if (st.phase === "intro" && st.totals.jumps === 0) hudText(g, "Press JUMP when the rope dot reaches the yellow", W / 2, H - 172, { size: 14, font: font.body, weight: 700, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4 });
  }

  const loop = createLoop(update, render);
  return {
    start: () => loop.start(),
    setPaused: (p) => {
      loop.setPaused(p);
      music.setVolume(p ? 0 : 1);
    },
    setMusic: (on) => music.setEnabled(on),
    input(id, down) {
      if (down && id === "jump") handle(m.press());
    },
    destroy() {
      disposed = true;
      loop.stop();
      unbind();
      jumper?.dispose();
      music.dispose();
      for (const t of turners) t.dispose();
      for (const c of crowd) c.dispose();
      rope?.geometry.dispose();
      place?.dispose();
      overlay.dispose();
      stage.dispose();
    },
  };
}
