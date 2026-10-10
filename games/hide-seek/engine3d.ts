import * as THREE from "three";
import type { EngineContext, GameEngine } from "@/games/types";
import { createLoop } from "@/games/core/loop";
import { clamp, hudText, roundRect } from "@/games/core/draw";
import { createStage } from "@/games/core3d/stage";
import { Character } from "@/games/core3d/character";
import { createOverlay, drawLoading } from "@/games/core3d/overlay";
import { createAmbience } from "@/games/core3d/ambience";
import { buildPlace, type Place } from "@/games/core3d/places";
import { createNaijaMusic } from "@/games/core/naija-music";
import { createChaseInput } from "@/games/police-thief/input";
import { createCountVoice } from "@/games/skipping/shared";
import { BASE, SPOT_R, SPOTS, dist, spotAt } from "./rules";
import type { HideSeekEvent, Kid } from "./sim";
import { buildYard } from "./yard3d";
import { bindActionKey, buildResult, eventText, hint, spokenCount, startMatch, tipSize } from "./shared";

const FEMALE = new Set(["ada", "aisha"]);

interface View {
  kid: Kid;
  char: Character;
  female: boolean;
  anim: string;
  last: THREE.Vector3;
  speed: number;
}

/** Hide & seek (boju boju) in a face-me-I-face-you compound, third person. */
export function createHideSeek3D(ctx: EngineContext): GameEngine {
  const stage = createStage(ctx.canvas, { preset: ctx.options.time === "evening" ? "evening" : "day" });
  const overlay = createOverlay(ctx.canvas);
  const ambience = createAmbience(ctx.sfx);
  const music = createNaijaMusic(ctx.sfx, "highlife", { enabled: ctx.music });
  const voice = createCountVoice(ctx.sfx);
  const { m, mode } = startMatch(ctx);
  const { st, me, seeker } = m;
  const countTotal = st.countLeft;
  const input = createChaseInput();
  const action = () => handle(m.press(mode === "hide" ? "hide" : "look"));
  const unbind = bindActionKey(action);
  if (process.env.NODE_ENV !== "production") (window as unknown as { __hide?: typeof m }).__hide = m;

  let ready = false;
  let failed = false;
  let disposed = false;
  let ended = false;
  let progress = 0;
  let place: Place | null = null;
  const views: View[] = [];
  const rings = new Map<string, THREE.Mesh>();
  const leaves: THREE.MeshStandardMaterial[] = [];
  const popups: { text: string; color: string; size: number; age: number; at: THREE.Vector3 | null }[] = [];
  const rustles: { spot: string; age: number }[] = [];
  let cone: THREE.Mesh | null = null;
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
  /** The gate and the wall either side: hidden while the camera is behind them. */
  const gateWall: THREE.Object3D[] = [];
  let lastFrame = performance.now();
  let danger = 0;
  /** Seconds since the match ended (the match clock stops then). */
  let endWait = 0;
  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  async function init() {
    place = await buildPlace(stage.scene, "compound", { detailed: stage.quality !== "low", walkers: 0, traffic: 0, rollers: false, props: false });
    if (disposed) return;
    progress = 0.4;
    for (const o of stage.scene.children) if (Math.abs(o.position.z + 8.5) < 0.3 && Math.abs(o.position.x) < 7) gateWall.push(o);

    // Things to hide behind (they match the solids in rules.ts).
    leaves.push(...(await buildYard(stage.scene)).leaves);
    if (disposed) return;
    progress = 0.6;

    // Glowing rings on the hiding spots, and the base at the gate.
    for (const s of SPOTS) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(SPOT_R * 0.72, SPOT_R * 0.85, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7ee08a, transparent: true, opacity: 0.5, depthWrite: false }));
      ring.position.set(s.x, 0.03, s.z);
      stage.scene.add(ring);
      rings.set(s.id, ring);
    }
    const base = new THREE.Mesh(new THREE.RingGeometry(BASE.r - 0.12, BASE.r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.75, depthWrite: false }));
    base.position.set(BASE.x, 0.03, BASE.z);
    stage.scene.add(base);
    if (mode === "hide") {
      const fan = new THREE.CircleGeometry(m.level.vision, 28, -Math.PI / 2 - m.level.fov, m.level.fov * 2).rotateX(-Math.PI / 2);
      cone = new THREE.Mesh(fan, coneMat);
      cone.position.y = 0.04;
      cone.renderOrder = 2;
      stage.scene.add(cone);
    }

    await Promise.all(
      m.kids.map(async (kid) => {
        const female = FEMALE.has(kid.avatar);
        const clips = female ? ["idle_f", "walk_f", "run_f", "crouch_m", "cheer_f"] : ["idle_m", "walk_m", "run_m", "crouch_m", "cheer_m", "look_m"];
        const char = await Character.create(kid.avatar, clips);
        char.root.position.set(kid.pos.x, 0, kid.pos.z);
        char.root.rotation.y = kid.heading;
        stage.scene.add(char.root);
        const anim = female ? "idle_f" : "idle_m";
        char.play(anim);
        views.push({ kid, char, female, anim, last: char.root.position.clone(), speed: 0 });
      }),
    );
    voice.preload();
    progress = 1;
    ready = true;
    lastFrame = performance.now();
  }
  init().catch((e) => {
    console.error(e);
    failed = true;
  });

  const at = (k: { x: number; z: number }, y = 2.2) => new THREE.Vector3(k.x, y, k.z);
  const popup = (text: string, color: string, size: number, where: THREE.Vector3 | null = null) => popups.push({ text, color, size, age: 0, at: where });

  function handle(ev: HideSeekEvent[]) {
    for (const e of ev) {
      const say = eventText(e, mode);
      if (say) popup(say.text, say.color, say.big ? 26 : 17);
      switch (e.type) {
        case "count": {
          const n = spokenCount(countTotal, e.n);
          if (n) voice.count(n);
          break;
        }
        case "go":
          ctx.sfx.play("whistle");
          music.start();
          ambience.resume();
          break;
        case "hid":
          ctx.sfx.play("chalk", 0.6);
          ctx.haptic(15);
          break;
        case "spotted":
        case "found":
          ctx.sfx.play(mode === "seek" ? "point" : "whistle", 0.8);
          if (e.kid.human) ctx.haptic([30, 40, 30]);
          break;
        case "caught":
          ctx.sfx.play("caught");
          if (e.kid.human) ctx.haptic(80);
          break;
        case "home":
          ctx.sfx.play(e.kid.human || mode === "hide" ? "rescue" : "miss");
          break;
        case "closeCall":
          ctx.sfx.play("tick", 0.4);
          ctx.haptic(10);
          break;
        case "rustle":
          ctx.sfx.play("tick", 0.18);
          rustles.push({ spot: e.spot.id, age: 0 });
          popup(Math.random() < 0.5 ? "*rustle*" : "hehe…", "rgba(255,255,255,0.8)", 13, at(e.spot, 1.4));
          break;
        case "bolt":
          ctx.sfx.play("whistle", 0.6);
          break;
        case "empty":
          if (mode === "seek") ctx.sfx.play("tick", 0.3);
          break;
        case "end":
          ctx.sfx.play(e.won ? "win" : "lose");
          music.stop(2);
          break;
      }
    }
  }

  function update(dt: number) {
    if (!ready) return;
    // Camera looks along +z: screen up = +z, screen right = -x.
    const d = input.dir();
    handle(m.update(dt, { move: { x: -d.x, z: -d.y }, run: input.sprint() }));
    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.8) popups.splice(i, 1);
    for (const r of rustles) r.age += dt;
    for (let i = rustles.length - 1; i >= 0; i--) if (rustles[i]!.age > 0.6) rustles.splice(i, 1);
    // How close the seeker is to finding you (drives the heartbeat vignette and music).
    const near = mode === "hide" && st.phase === "seek" ? clamp(1 - (dist(seeker.pos, me.pos) - 1.5) / 4.5, 0, 1) : 0;
    danger += (near - danger) * Math.min(1, dt * 3);
    music.setIntensity(mode === "hide" ? 0.3 + danger * 0.7 : 0.5 + (m.hiders.some((h) => h.state === "bolting") ? 0.5 : 0));
    if (st.phase === "end" && (endWait += dt) > 2.4) finish();
  }

  function finish() {
    if (ended) return;
    ended = true;
    ctx.onEnd(buildResult(ctx, m, mode));
  }

  function animate(v: View, dt: number) {
    const k = v.kid;
    const root = v.char.root;
    root.position.set(k.pos.x, 0, k.pos.z);
    const moved = root.position.distanceTo(v.last) / Math.max(dt, 1e-3);
    v.last.copy(root.position);
    v.speed += (moved - v.speed) * Math.min(1, dt * 10);
    // Turn smoothly to the kid's heading.
    let dh = k.heading - root.rotation.y;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    root.rotation.y += dh * Math.min(1, dt * 10);

    const f = v.female ? "_f" : "_m";
    let anim = `idle${f}`;
    let ts = 1;
    if (st.phase === "end") {
      const winner = mode === "hide" ? (k.seeker ? !st.won : k.human ? st.won : k.state === "home") : k.seeker ? st.won : k.state === "home";
      anim = winner ? `cheer${f}` : `idle${f}`;
    } else if (k.state === "hidden") anim = "crouch_m";
    else if (v.speed > 3) {
      anim = `run${f}`;
      ts = clamp(v.speed / 4.4, 0.8, 1.3);
    } else if (v.speed > 0.3) {
      anim = `walk${f}`;
      ts = clamp(v.speed / 1.5, 0.7, 1.7);
    } else if (k.seeker && st.ai.mode === "check" && mode === "hide" && st.phase === "seek") anim = "look_m";
    if (anim !== v.anim && v.char.has(anim)) {
      v.char.play(anim, { fade: 0.2 });
      v.anim = anim;
    }
    v.char.setTimeScale(ts);
    // In seek mode you can't see the hiders until you find them.
    root.visible = !(mode === "seek" && !k.seeker && (k.state === "hidden" || (st.phase === "count" && k.state === "toSpot")));
    v.char.update(dt);
  }

  function render() {
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (ready) stage.adapt(frameDt);
    overlay.begin();
    if (!ready) {
      progress = Math.min(progress + frameDt * 0.04, 0.95);
      drawLoading(overlay, "Loading the compound…", progress);
      if (failed) hudText(overlay.g, "Couldn't load the 3D compound. Check your connection.", overlay.w / 2, overlay.h / 2 + 70, { size: 14, font: overlay.font.body, weight: 700, color: "#ff8a6b" });
      return;
    }
    for (const v of views) animate(v, frameDt);
    place?.update(frameDt, stage.camera.position);

    // Rings: in hide mode show where you can hide (bright when you're in one); in seek mode, spots you can LOOK in.
    const inSpot = spotAt(me.pos);
    const t = st.clock;
    for (const s of SPOTS) {
      const ring = rings.get(s.id)!;
      const mat = ring.material as THREE.MeshBasicMaterial;
      const here = inSpot?.id === s.id;
      const showing = st.phase !== "end" && (mode === "hide" ? me.state === "free" : st.phase === "seek");
      ring.visible = showing;
      const near = mode === "seek" && dist(s, me.pos) < 1.5;
      mat.color.set(here || near ? 0xffd166 : 0x7ee08a);
      mat.opacity = here || near ? 0.85 : 0.28 + Math.sin(t * 3) * 0.08;
      const shake = rustles.find((r) => r.spot === s.id);
      ring.scale.setScalar(shake ? 1 + Math.sin(shake.age * 40) * 0.08 : 1);
    }
    if (cone) {
      cone.visible = st.phase === "seek";
      cone.position.x = seeker.pos.x;
      cone.position.z = seeker.pos.z;
      cone.rotation.y = seeker.heading;
      coneMat.color.set(st.ai.mode === "chase" ? 0xff3b3b : 0xffc400);
      coneMat.opacity = st.ai.mode === "chase" ? 0.38 : 0.3;
    }
    // See through the mango tree when you're under it.
    const underTree = Math.hypot(me.pos.x - 3.7, me.pos.z - 2.6) < 3.4;
    for (const l of leaves) l.opacity += ((underTree ? 0.3 : 1) - l.opacity) * Math.min(1, frameDt * 6);

    // Follow camera, higher and further back on a tall phone screen.
    const aspect = stage.camera.aspect;
    const portrait = clamp((1.3 - aspect) / 0.8, 0, 1);
    stage.camera.fov = 50 + 8 * portrait;
    stage.camera.updateProjectionMatrix();
    const h = 5.8 + 3.2 * portrait;
    const back = 5.6 + 1.8 * portrait;
    // Stay nearer the middle of the yard so the side roofs don't fill the screen.
    const target = new THREE.Vector3(me.pos.x * 0.45, h, me.pos.z - back);
    const look = new THREE.Vector3(me.pos.x * 0.75, 0.6, me.pos.z + 1.8);
    const snap = camPos.lengthSq() === 0;
    camPos.lerp(target, snap ? 1 : Math.min(1, frameDt * 4));
    lookAt.lerp(look, snap ? 1 : Math.min(1, frameDt * 5));
    stage.camera.position.copy(camPos);
    stage.camera.lookAt(lookAt);
    for (const o of gateWall) o.visible = camPos.z > -8.1;
    stage.focusShadows(new THREE.Vector3(me.pos.x, 0, me.pos.z));
    stage.render();
    drawHud(frameDt);
  }

  function drawHud(dt: number) {
    const { g, w: W, h: H, font } = overlay;
    void dt;
    // Seek mode count: eyes closed.
    if (mode === "seek" && st.phase === "count") {
      g.fillStyle = "rgba(5,8,6,0.9)";
      g.fillRect(0, 0, W, H);
      hudText(g, "Eyes closed…", W / 2, H * 0.36, { size: 22, font: font.display, color: "#ffd166" });
      hudText(g, String(Math.max(1, spokenCount(countTotal, Math.ceil(st.countLeft)) ?? countTotal)), W / 2, H * 0.36 + 64, { size: 80, font: font.display, color: "#fff" });
      hudText(g, "They're hiding. You've got to find all three.", W / 2, H * 0.36 + 130, { size: 14, font: font.body, weight: 700, color: "rgba(255,255,255,0.8)" });
      return;
    }
    // Heartbeat vignette when the seeker is close.
    if (danger > 0.05 && me.state !== "caught") {
      const pulse = 0.6 + 0.4 * Math.sin(st.clock * (6 + danger * 6));
      const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      grad.addColorStop(0, "rgba(120,0,0,0)");
      grad.addColorStop(1, `rgba(150,10,10,${0.45 * danger * pulse})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }

    // Name tags
    for (const v of views) {
      if (!v.char.root.visible) continue;
      const k = v.kid;
      if (!k.human && !k.seeker && mode === "hide" && k.state === "hidden") continue;
      const p = overlay.project(v.char.root.position.clone().setY(k.state === "hidden" ? 1.3 : v.char.height + 0.35), stage.camera);
      if (!p) continue;
      const label = k.human ? "YOU" : k.seeker ? `${k.name} (seeker)` : k.name;
      hudText(g, label, p.x, p.y, { size: k.human ? 13 : 11, font: font.body, weight: 800, color: k.human ? "#ffd166" : k.seeker ? "#ffb36b" : "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 3 });
    }
    const bp = overlay.project(new THREE.Vector3(BASE.x, 0.4, BASE.z), stage.camera);
    if (bp) hudText(g, "BASE", bp.x, bp.y, { size: 12, font: font.body, weight: 800, color: "#ffd166", stroke: "rgba(0,0,0,0.6)", strokeWidth: 3 });

    // Timer / counting chip
    const counting = st.phase === "count";
    const tl = Math.ceil(st.timeLeft);
    const label = counting ? `${Math.ceil(st.countLeft)}` : `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, "0")}`;
    roundRect(g, W / 2 - 56, 12, 112, 44, 14);
    g.fillStyle = !counting && tl <= 10 && st.phase === "seek" ? "rgba(140,30,20,0.85)" : "rgba(12,16,14,0.72)";
    g.fill();
    hudText(g, label, W / 2, 35, { size: 26, font: font.display, color: counting ? "#ffd166" : "#fff", shadow: false });
    hudText(g, counting ? "EMEKA IS COUNTING" : mode === "hide" ? "STAY HIDDEN" : "TIME LEFT", W / 2, 66, { size: 10, font: font.body, weight: 800, color: "rgba(255,255,255,0.8)", stroke: "rgba(0,0,0,0.5)", strokeWidth: 3 });

    // Status: you (hide) or the hiders (seek)
    if (mode === "hide") {
      const status = me.state === "hidden" ? "HIDDEN" : me.state === "bolting" ? "RUN!" : me.state === "home" ? "HOME FREE" : me.state === "caught" ? "CAUGHT" : "IN THE OPEN";
      const color = me.state === "hidden" || me.state === "home" ? "#7ee08a" : me.state === "free" ? "#ffb36b" : "#ff8a6b";
      roundRect(g, W - 124, 12, 112, 30, 10);
      g.fillStyle = "rgba(12,16,14,0.72)";
      g.fill();
      hudText(g, status, W - 68, 27, { size: 12, font: font.body, weight: 800, color, shadow: false });
    } else {
      const x0 = W - 12 - (30 + m.hiders.length * 26);
      roundRect(g, x0, 12, 30 + m.hiders.length * 26, 30, 10);
      g.fillStyle = "rgba(12,16,14,0.72)";
      g.fill();
      hudText(g, "👀", x0 + 14, 27, { size: 14, font: font.body, shadow: false });
      m.hiders.forEach((h, i) => {
        g.beginPath();
        g.arc(x0 + 36 + i * 26, 27, 8, 0, Math.PI * 2);
        g.fillStyle = h.state === "found" ? "#7ee08a" : h.state === "home" ? "#ff8a6b" : h.state === "bolting" ? "#ffd166" : "rgba(255,255,255,0.2)";
        g.fill();
      });
    }

    const tip = hint(m, mode);
    if (tip) hudText(g, tip, W / 2, H - Math.max(150, H * 0.27), { size: tipSize(tip, W), font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4 });

    // Popups: stacked under the timer, or floating over a spot.
    let row = 0;
    for (const p of popups) {
      const alpha = p.age < 1.4 ? 1 : 1 - (p.age - 1.4) / 0.4;
      if (p.at) {
        const q = overlay.project(p.at.clone().setY(p.at.y + p.age * 0.5), stage.camera);
        if (q) hudText(g, p.text, q.x, q.y, { size: p.size, font: font.body, weight: 800, color: p.color, stroke: "rgba(0,0,0,0.5)", strokeWidth: 3, alpha });
        continue;
      }
      hudText(g, p.text, W / 2, H * 0.24 + row * 34 - p.age * 8, { size: Math.min(p.size, W / 16), font: font.display, color: p.color, stroke: "rgba(0,0,0,0.55)", strokeWidth: 4, alpha });
      row++;
    }
    if (st.phase === "end") {
      hudText(g, st.won ? "YOU WIN!" : "GAME OVER", W / 2, H * 0.42, { size: Math.min(56, W / 8), font: font.display, color: st.won ? "#ffd166" : "#ff8a6b", stroke: "rgba(0,0,0,0.5)" });
    }
  }

  const loop = createLoop(update, render);

  return {
    start() {
      loop.start();
    },
    setPaused(p) {
      loop.setPaused(p);
      if (p) input.clear();
      ambience.setVolume(p ? 0 : 1);
      music.setVolume(p ? 0 : 1);
    },
    setMusic(on) {
      music.setEnabled(on);
    },
    input(id, down) {
      ambience.resume();
      if (id === "sprint") input.setSprint(down);
      else if ((id === "hide" || id === "look") && down) action();
    },
    axis(x, y) {
      input.setAxis(x, y);
      ambience.resume();
    },
    destroy() {
      disposed = true;
      loop.stop();
      unbind();
      input.dispose();
      ambience.dispose();
      music.dispose();
      place?.dispose();
      for (const v of views) v.char.dispose();
      overlay.dispose();
      stage.dispose();
    },
  };
}
