import * as THREE from "three";
import type { EngineContext, GameEngine } from "@/games/types";
import { createLoop } from "@/games/core/loop";
import { clamp, easeOutBack, hudText, lerp, roundRect } from "@/games/core/draw";
import { createStage, type LightPreset } from "@/games/core3d/stage";
import { Character } from "@/games/core3d/character";
import { createOverlay, drawLoading } from "@/games/core3d/overlay";
import { createAmbience } from "@/games/core3d/ambience";
import { preload } from "@/games/core3d/assets";
import { createRain } from "@/games/core3d/rain";
import { OBSTACLES, RUN, SNACKS, laneX, type Obstacle, type ObstacleKind, type SnackKind } from "./run-rules";
import { createRun, type RunEvent } from "./run-sim";
import { createNaijaMusic } from "@/games/core/naija-music";
import { HAWKER_CALLS, SEG, buildObstacle, buildSegment, hawkerPerson, hawkerStand, kondo, okadaRider, type HawkerStand, type Segment } from "./run-world";
import { bindRunKeys, runResult, KIND_NAMES } from "./run-shared";
import { SHOUT_TEXT, createStreetVoices, type Shout } from "./run-voices";

const CONDUCTOR = ["Oshodi! Oshodi!", "CMS! Enter with your change!", "Obalende! Ojuelegba!", "Ikeja along! Hold your change!", "Yaba! Yaba! Yaba!"];
const SHOUTS: Shout[] = ["ole", "ole", "holdam", "catcham", "thief", "ole2"];

const PRESET: Record<string, LightPreset> = { afternoon: "day", evening: "evening", rainy: "overcast" };
const LEGS = ["L Thigh", "L Calf", "L Foot", "R Thigh", "R Calf", "R Foot"];
const POOL: Record<ObstacleKind, number> = { brt: 2, hawker: 7, danfo: 7, keke: 7, okada: 3, barrier: 5, checkpoint: 2, table: 5, generator: 4, cart: 4, pole: 4, banner: 2, pothole: 7 };
const VIEW_AHEAD = 190;
const N_SEG = 7;

interface ObView {
  obj: THREE.Object3D;
  rider?: Character;
}

/** Police & Thief street run, rendered as a realistic Lagos road. */
export function createPoliceRun3D(ctx: EngineContext): GameEngine {
  const preset = PRESET[ctx.options.time ?? "afternoon"] ?? "day";
  const stage = createStage(ctx.canvas, { preset });
  const fog = stage.scene.fog as THREE.Fog | null;
  if (fog) {
    // The road leapfrogs ahead in 32 m slices; haze hides where it ends.
    fog.near = preset === "overcast" ? 14 : 30;
    fog.far = preset === "overcast" ? 120 : 175;
  }
  const overlay = createOverlay(ctx.canvas);
  const ambience = createAmbience(ctx.sfx);
  const run = createRun(ctx.seed);
  const s = run.state;
  const unbind = bindRunKeys((a) => run.press(a));
  // Original Amapiano groove that builds as the chase heats up.
  const music = createNaijaMusic(ctx.sfx, "amapiano", { enabled: ctx.music });
  const voices = createStreetVoices(ctx.sfx);
  voices.preload();
  /** Speech bubbles over people in the street (anchored to their 3D position). */
  const bubbles: { text: string; target: THREE.Object3D; lift: number; age: number; color: string }[] = [];
  let nextShout = 3;
  let nextCall = 1.5;
  // Dev only: lets automated playtests read the run and steer.
  if (process.env.NODE_ENV !== "production") (window as unknown as { __run?: typeof run }).__run = run;
  const rain = preset === "overcast" ? createRain(stage.scene, stage.quality === "low" ? 700 : 1500, 16) : null;

  let ready = false;
  let failed = false;
  let disposed = false;
  let ended = false;
  let progress = 0;
  const segments: Segment[] = [];
  const pools = new Map<ObstacleKind, ObView[]>();
  const views = new Map<number, ObView>();
  let thief: Character | null = null;
  const police: Character[] = [];
  let jumpPose: Map<string, THREE.Quaternion> | null = null;
  let coins: THREE.InstancedMesh | null = null;
  /** Hawkers holding out sausage rolls / energy drinks for the thief to snatch. */
  const standPool: Record<SnackKind, HawkerStand[]> = { roll: [], energy: [] };
  const standViews = new Map<number, HawkerStand>();
  const popups: { text: string; color: string; age: number; size: number }[] = [];
  const sparks: { pos: THREE.Vector3; age: number }[] = [];
  let shake = 0;
  let slideLean = 0;
  let lastFrame = performance.now();
  const camPos = new THREE.Vector3(0, 3, 6);
  const camLook = new THREE.Vector3(0, 1.2, -6);

  async function init() {
    const quality = stage.quality;
    const detailed = quality !== "low";
    await preload({ avatars: ["tunde", "police", "woman1", "man1", "man2", "man3", "woman2", "emeka"], anims: ["run_m", "idle_m", "crouch_m", "sit_m", "walk_f", "talk_f", "talk_m", "phone_m", "idle_f", "look_m", "walk_m", "walk_f", "cheer_m"] }, (p) => (progress = p * 0.3));
    if (disposed) return;
    for (let i = 0; i < N_SEG; i++) {
      const seg = await buildSegment(i, { detailed, people: quality === "high" ? 4 : quality === "medium" ? 2 : 0 });
      if (disposed) return;
      seg.root.position.z = -i * SEG;
      stage.scene.add(seg.root);
      segments.push(seg);
      progress = 0.3 + (0.45 * (i + 1)) / N_SEG;
    }
    // Obstacle pools, built up front so nothing pops in mid-run.
    let seed = ctx.seed % 997;
    const kinds = Object.keys(POOL) as ObstacleKind[];
    for (const kind of kinds) {
      const list: ObView[] = [];
      for (let i = 0; i < POOL[kind]; i++) {
        const obj = await buildObstacle(kind, ++seed * 13 + i);
        obj.visible = false;
        obj.userData.kind = kind;
        stage.scene.add(obj);
        const view: ObView = { obj };
        if (kind === "okada") {
          view.rider = await okadaRider(seed + i);
          obj.add(view.rider.root);
        } else if (kind === "hawker") {
          view.rider = await hawkerPerson(seed + i);
          obj.add(view.rider.root);
        }
        list.push(view);
      }
      pools.set(kind, list);
      if (disposed) return;
    }
    for (const kind of ["roll", "energy"] as const) {
      for (let i = 0; i < 3; i++) {
        const stand = await hawkerStand(kind, seed + i * 7);
        stand.root.visible = false;
        stage.scene.add(stand.root);
        standPool[kind].push(stand);
      }
    }
    progress = 0.9;

    // Naira coins: one instanced mesh, gold with a ₦ on each face.
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(54, 50, 10, 64, 64, 64);
    grad.addColorStop(0, "#fff3b0");
    grad.addColorStop(0.6, "#f2b81c");
    grad.addColorStop(1, "#b37a06");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#a86d00";
    g.lineWidth = 8;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#8a5600";
    g.font = "900 72px Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("₦", 64, 68);
    const face = new THREE.CanvasTexture(c);
    face.colorSpace = THREE.SRGBColorSpace;
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2b81c, metalness: 0.9, roughness: 0.28, emissive: 0x3a2400 });
    const faceMat = new THREE.MeshStandardMaterial({ map: face, metalness: 0.7, roughness: 0.3, emissive: 0x2a1a00 });
    const geo = new THREE.CylinderGeometry(0.27, 0.27, 0.05, 28);
    geo.rotateX(Math.PI / 2);
    coins = new THREE.InstancedMesh(geo, [gold, faceMat, faceMat], 220);
    coins.castShadow = true;
    coins.frustumCulled = false;
    stage.scene.add(coins);

    thief = await Character.create("tunde", ["run_m", "idle_m", "crouch_m"]);
    thief.root.rotation.y = Math.PI; // run away from the camera (-z)
    thief.play("run_m");
    stage.scene.add(thief.root);
    jumpPose = thief.samplePose("crouch_m", 0.6, LEGS);
    for (let i = 0; i < 2; i++) {
      const p = await Character.create("police", ["run_m", "idle_m", "talk_m"]);
      // Kondo in the right hand, hanging down along the leg while they run.
      p.attach("R Hand", kondo(), new THREE.Vector3(0, -0.02, 0.03));
      p.root.rotation.y = Math.PI;
      p.play("run_m", { offset: i * 0.4 });
      stage.scene.add(p.root);
      police.push(p);
    }
    progress = 1;
    ready = true;
    lastFrame = performance.now();
    ctx.sfx.play("whistle", 0.8);
  }
  init().catch((e) => {
    console.error(e);
    failed = true;
  });

  function popup(text: string, color = "#fff", size = 30) {
    popups.push({ text, color, age: 0, size });
  }

  function handle(ev: RunEvent[]) {
    for (const e of ev) {
      switch (e.type) {
        case "coin":
          ctx.sfx.play("pickup", 0.35);
          sparks.push({ pos: new THREE.Vector3(laneX(e.lane), e.y, -e.z), age: 0 });
          break;
        case "snack": {
          ctx.sfx.play("rescue", 0.6);
          ctx.haptic(20);
          const sn = SNACKS[e.kind];
          popup(sn.rush ? "ENERGY RUSH!" : "E DON ENTER!", sn.rush ? "#7ec8ff" : "#ffd166", 38);
          popup(`You snatch ${sn.name}!`, "#fff", 20);
          // The hawker you robbed is not happy.
          const snack = run.track.snacks.find((x) => x.taken && x.lane === e.lane && Math.abs(x.z - e.z) < 0.01);
          const stand = snack ? standViews.get(snack.id) : undefined;
          if (stand) {
            stand.offer.visible = false;
            stand.person.play(stand.angryClip, { fade: 0.15 });
            bubbles.push({ text: e.kind === "roll" ? "Ole! My gala!" : "Thief! Pay for my drink!", target: stand.person.root, lift: 2.0, age: 0, color: "#d62828" });
            voices.shout("ole", snack!.side, 0.8);
          }
          break;
        }
        case "tired":
          ctx.sfx.play("lose", 0.4);
          popup("Thief dey tire! Snatch food!", "#ff8a6b", 24);
          shoutFrom("catcham");
          break;
        case "rushEnd":
          break;
        case "jump":
          ctx.sfx.play("tick", 0.5);
          break;
        case "slide":
          ctx.sfx.play("chalk", 0.6);
          break;
        case "lane":
          break;
        case "go":
          music.start();
          ctx.sfx.play("go", 0.7);
          popup("OYA RUN!", "#ffd166", 64);
          voices.chant(3);
          for (let k = 0; k < 3; k++) shoutFrom("ole", k * 0.2);
          break;
        case "splash":
          ctx.sfx.play("miss", 0.5);
          break;
        case "stumble":
          ctx.sfx.play("whistle", 0.9);
          ctx.haptic([40, 30, 40]);
          shake = 0.5;
          popup("WAHALA!", "#ff8a6b", 40);
          popup(e.side ? "You jam the side!" : `You trip for the ${KIND_NAMES[e.kind]}`, "#fff", 20);
          popup("Police dey come!", "#7ec8ff", 20);
          voices.shout("holdam", 0, 0.8);
          shoutFrom("holdam");
          break;
        case "caught":
          music.stop(1.5);
          ctx.sfx.play("caught", 0.9);
          ctx.haptic([80, 40, 160]);
          shake = 0.9;
          thief?.play("idle_m", { fade: 0.2 }); // hands-up surrender is layered on top
          setTimeout(() => {
            if (police[0]) bubbles.push({ text: "Oya! Kneel down there!", target: police[0].root, lift: 2.2, age: 0, color: "#14213d" });
          }, 600);
          setTimeout(() => {
            if (police[0]) bubbles.push({ text: "You think say you fit run?", target: police[0].root, lift: 2.2, age: 0, color: "#14213d" });
          }, 2000);
          voices.chant(3, 0.75);
          for (let k = 0; k < 3; k++) shoutFrom("ole", k * 0.25, true);
          for (const p of police) p.play("idle_m", { fade: 0.3 });
          break;
        case "near": {
          if (Math.random() < 0.7) ctx.sfx.play("horn", 0.45);
          // Danfo conductors hanging out of the door, calling their stops.
          const o = run.track.obstacles.find((x) => x.kind === e.kind && x.lane === e.lane && x.z > s.dist);
          const v = o ? views.get(o.id) : undefined;
          if (v && e.kind === "danfo") bubbles.push({ text: CONDUCTOR[o!.seed % CONDUCTOR.length]!, target: v.obj, lift: 3.1, age: 0, color: "#9a4d00" });
          break;
        }
        case "milestone":
          ctx.sfx.play("point", 0.5);
          popup(`${e.metres.toLocaleString()} m! Na so!`, "#7ee08a", 34);
          break;
        case "land":
          break;
      }
    }
  }

  /** Someone on the sidewalk just ahead shouts at the thief. */
  function shoutFrom(word: Shout, delay = 0, behind = false) {
    const near: THREE.Object3D[] = [];
    const p = new THREE.Vector3();
    for (const seg of segments) {
      for (const c of [...seg.people, ...seg.walkers.map((w) => w.c)]) {
        c.root.getWorldPosition(p);
        const ahead = -p.z - s.dist;
        if (behind ? ahead > -10 && ahead < 14 : ahead > 4 && ahead < 30) near.push(c.root);
      }
    }
    const target = near[Math.floor(Math.random() * near.length)];
    if (target) bubbles.push({ text: SHOUT_TEXT[word], target, lift: 2.05, age: -delay, color: word.startsWith("ole") ? "#d62828" : "#14213d" });
    return target;
  }

  function syncObstacles() {
    const live = new Set<number>();
    for (const o of run.track.obstacles) {
      if (o.z > s.dist + VIEW_AHEAD) break;
      if (o.z + OBSTACLES[o.kind].len < s.dist - 12) continue;
      live.add(o.id);
      let v = views.get(o.id);
      if (!v) {
        v = pools.get(o.kind)?.pop();
        if (!v) continue;
        views.set(o.id, v);
        v.obj.visible = true;
      }
      place(v, o);
    }
    for (const [id, v] of views) {
      if (live.has(id)) continue;
      v.obj.visible = false;
      views.delete(id);
      pools.get(v.obj.userData.kind as ObstacleKind)?.push(v);
    }
  }
  function place(v: ObView, o: Obstacle) {
    const spec = OBSTACLES[o.kind];
    v.obj.position.set(spec.wide ? 0 : (o.x ?? laneX(o.lane)), 0, -(o.z + spec.len / 2));
    // Traffic driving ahead of you shows its back; hawkers face where they're walking.
    if (o.vx) v.obj.rotation.y = o.vx > 0 ? Math.PI / 2 : -Math.PI / 2;
    else v.obj.rotation.y = o.speed < 0 ? Math.PI : 0;
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();
  function syncCoins(t: number) {
    if (!coins) return;
    let n = 0;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * 4);
    for (const c of run.track.coins) {
      if (c.z > s.dist + 120) break;
      if (c.taken || c.z < s.dist - 4) continue;
      if (n >= coins.count) break;
      m4.compose(tmp.set(laneX(c.lane), c.y, -c.z), q, one);
      coins.setMatrixAt(n++, m4);
    }
    coins.count = n;
    coins.instanceMatrix.needsUpdate = true;
  }

  function syncSnacks(t: number, frameDt: number) {
    const live = new Set<number>();
    for (const k of run.track.snacks) {
      if (k.z > s.dist + 140) break;
      if (k.z < s.dist - 6) continue;
      live.add(k.id);
      let st = standViews.get(k.id);
      if (!st) {
        st = standPool[k.kind].pop();
        if (!st) continue;
        // Hawker stands just off the lane, holding the snack out over it.
        st.root.position.set(laneX(k.lane) + k.side * 1.05, 0, -k.z);
        st.setSide(k.side === -1 ? 1 : -1);
        st.offer.visible = !k.taken;
        st.person.play(st.idleClip, { fade: 0 });
        st.root.visible = true;
        standViews.set(k.id, st);
      }
      if (k.taken && st.offer.visible) st.offer.visible = false;
      const item = st.offer.getObjectByName("item");
      if (item) item.rotation.y = t * 2.5;
      st.offer.position.y = 1.05 + Math.sin(t * 3 + k.id) * 0.05;
      st.person.update(frameDt);
    }
    for (const [id, st] of standViews) {
      if (live.has(id)) continue;
      st.root.visible = false;
      standViews.delete(id);
      standPool[st.kind].push(st);
    }
  }

  function recycleSegments() {
    for (const seg of segments) {
      const near = -seg.root.position.z; // track metre where this slice starts
      if (near + SEG < s.dist - 14) seg.root.position.z -= N_SEG * SEG;
    }
  }

  function update(dt: number) {
    if (!ready) return;
    handle(run.update(dt));
    music.setIntensity(Math.max(s.chase, (s.speed - 10) / 11, s.rush > 0 ? 1 : 0));
    if (s.phase === "over" && !ended) {
      ended = true;
      ctx.onEnd(runResult(ctx, run));
    }
    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.4) popups.splice(i, 1);
    for (const p of sparks) p.age += dt;
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i]!.age > 0.45) sparks.splice(i, 1);
    shake = Math.max(0, shake - dt * 1.6);
    for (const b of bubbles) b.age += dt;
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i]!.age > 1.6) bubbles.splice(i, 1);
    // Hawkers ahead calling out their goods.
    nextCall -= dt;
    if (nextCall <= 0 && s.phase === "run") {
      nextCall = 1.6 + Math.random() * 2.2;
      const p = new THREE.Vector3();
      const ahead = segments.flatMap((sg) => sg.hawkers).filter((h) => {
        h.root.getWorldPosition(p);
        const d = -p.z - s.dist;
        return d > 6 && d < 34;
      });
      const h = ahead[Math.floor(Math.random() * ahead.length)];
      if (h) bubbles.push({ text: HAWKER_CALLS[Math.floor(Math.random() * HAWKER_CALLS.length)]!, target: h.root, lift: 2.35, age: 0, color: "#7a3d00" });
    }
    // The street notices the thief: "Ole!", "Hold am!", "Catch am!"
    if (s.phase === "run") {
      nextShout -= dt;
      if (nextShout <= 0) {
        nextShout = 2.2 + Math.random() * 3;
        const word = SHOUTS[Math.floor(Math.random() * SHOUTS.length)]!;
        const who = shoutFrom(word);
        if (who) voices.shout(word, Math.sign(who.getWorldPosition(new THREE.Vector3()).x - s.x));
      }
    }
  }

  function animateRunner(frameDt: number) {
    if (!thief) return;
    const r = thief.root;
    r.position.set(s.x, s.y, -s.dist);
    const sliding = s.slide > 0 && s.grounded && s.phase === "run";
    slideLean = lerp(slideLean, sliding ? 1 : 0, Math.min(1, frameDt * 16));
    const wobble = s.sinceStumble < 0.6 ? Math.sin(s.sinceStumble * 34) * 0.22 * (1 - s.sinceStumble / 0.6) : 0;
    // Facing -z (rotation.y = π), so leaning back is a negative x tilt in local terms.
    // Caught: turn round to face the police coming up behind.
    const turn = s.phase === "caught" || s.phase === "over" ? clamp((s.clock - s.caughtAt) / 0.5, 0, 1) : 0;
    r.rotation.set(-slideLean * 1.05, Math.PI * (1 - turn) + (s.laneT < 1 ? (s.x - s.fromX > 0 ? -0.2 : 0.2) * (1 - s.laneT) : 0), wobble, "YXZ");
    if (s.phase === "run" || s.phase === "intro") thief.setTimeScale(sliding ? 0.35 : clamp(s.speed / 8.5, 0.9, 1.85));
    thief.update(frameDt);
    if (jumpPose && !s.grounded && s.phase === "run") thief.blendPose(jumpPose, clamp(s.y / 0.45, 0, 1) * 0.85);

    // Police on your heels: close after a stumble, dropping back as you get away.
    const caughtNow = s.phase === "caught" || s.phase === "over";
    const gap = lerp(13, 1.5, Math.pow(s.chase, 0.55));
    const arrest = caughtNow ? clamp((s.clock - s.caughtAt) / 0.8, 0, 1) : 0;
    police.forEach((p, i) => {
      const side = i === 0 ? -0.75 : 0.75;
      if (caughtNow) {
        // Arrest: one officer steps in front with his kondo up, the other stands by.
        // Both come from behind (the camera side): one right up to him, one a step back.
        const tx = s.x + (i === 0 ? -0.45 : -1.15);
        const tz = -s.dist + (i === 0 ? 0.95 : 0.15);
        p.root.position.x = lerp(p.root.position.x, tx, Math.min(1, frameDt * 4));
        p.root.position.z = lerp(p.root.position.z, tz, Math.min(1, frameDt * 4));
        p.root.position.y = 0;
        p.root.lookAt(s.x, 0, -s.dist);
        p.update(frameDt);
        if (i === 0 && arrest > 0.3) {
          // Waving the kondo over his head, telling the thief to kneel. No hitting.
          const t = s.clock - s.caughtAt;
          const fwd = new THREE.Vector3(Math.sin(p.root.rotation.y), 0, Math.cos(p.root.rotation.y));
          p.rotateWorld("R UpperArm", fwd, -(2.2 + Math.sin(t * 9) * 0.3) * Math.min(1, (arrest - 0.3) / 0.4));
        }
        return;
      }
      const px = lerp(p.root.position.x, s.x + side, Math.min(1, frameDt * 3));
      const pz = -s.dist + gap + i * 0.9;
      p.root.position.set(px, 0, pz);
      p.root.rotation.set(0, Math.PI, 0);
      p.setTimeScale(clamp(s.speed / 8.5, 0.9, 1.85));
      p.update(frameDt);
    });
    // Thief kneels with his hands up.
    if (caughtNow && thief) {
      const k = clamp((s.clock - s.caughtAt - 0.2) / 0.5, 0, 1);
      if (k > 0) {
        const fwd = new THREE.Vector3(0, 0, 1);
        thief.rotateWorld("L UpperArm", fwd, 2.7 * k);
        thief.rotateWorld("R UpperArm", fwd, -2.7 * k);
      }
    }
  }

  function render() {
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    overlay.begin();
    if (failed) {
      hudText(overlay.g, "Couldn't load the street. Check your connection.", overlay.w / 2, overlay.h / 2, { size: 16, font: overlay.font.body, weight: 700, color: "#fff" });
      return;
    }
    if (!ready) {
      drawLoading(overlay, "Loading the Lagos road…", progress);
      return;
    }
    stage.adapt(frameDt);
    syncObstacles();
    syncCoins(now / 1000);
    syncSnacks(now / 1000, frameDt);
    recycleSegments();
    animateRunner(frameDt);
    for (const v of views.values()) v.rider?.update(frameDt);
    for (const seg of segments) {
      const z = -seg.root.position.z;
      if (z < s.dist + 70 && z + SEG > s.dist - 10) {
        for (const p of seg.people) p.update(frameDt);
        for (const h of seg.hawkers) h.update(frameDt);
        for (const w of seg.walkers) {
          const r = w.c.root;
          r.position.z += w.v * frameDt;
          if (r.position.z > -1) r.position.z -= SEG - 2;
          else if (r.position.z < -SEG + 1) r.position.z += SEG - 2;
          w.c.update(frameDt);
        }
      }
    }

    // Chase camera: behind and above, leaning into lane changes; swings round when caught.
    const caught = s.phase === "caught" || s.phase === "over";
    const t = caught ? Math.min(1, (s.clock - s.caughtAt) / 1.2) : 0;
    // Caught: rise up and back so the arrest is framed without clipping into what you hit.
    // Caught: swing round to a front-side view of the arrest.
    const want = new THREE.Vector3(s.x * (0.65 + t * 0.35) + t * 2.3, 2.05 + s.y * 0.4 - t * 0.25, -s.dist + 3.1 + t * 0.2);
    const look = new THREE.Vector3(s.x * (0.85 + t * 0.15) - t * 0.4, 1.0 + s.y * 0.5 - t * 0.1, -s.dist - 7 + t * 7.3);
    // Never put the camera inside a bus: lift it over any vehicle it would pass through.
    const camTrackZ = -want.z;
    for (const o of run.track.obstacles) {
      if (o.z > camTrackZ + 2) break;
      const spec = OBSTACLES[o.kind];
      if (spec.clear !== "block" || o.z + spec.len < camTrackZ - 2) continue;
      if (Math.abs(want.x - (o.x ?? laneX(o.lane))) < spec.halfW + 0.6) want.y = Math.max(want.y, spec.h + 0.9);
    }
    camPos.lerp(want, Math.min(1, frameDt * 7));
    camLook.lerp(look, Math.min(1, frameDt * 9));
    if (shake > 0 && !ctx.reducedMotion) camPos.add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.25, (Math.random() - 0.5) * shake * 0.2, 0));
    stage.camera.position.copy(camPos);
    stage.camera.lookAt(camLook);
    const fov = 60 + clamp((s.speed - 10) * 0.7, 0, 9);
    if (Math.abs(stage.camera.fov - fov) > 0.05) {
      stage.camera.fov = lerp(stage.camera.fov, fov, Math.min(1, frameDt * 3));
      stage.camera.updateProjectionMatrix();
    }
    stage.focusShadows(tmp.set(s.x, 0, -s.dist - 10));
    rain?.update(frameDt, tmp.set(s.x, 0, -s.dist - 6));
    stage.render();
    drawHud(now / 1000);
  }

  function drawHud(time: number) {
    const { g, w: W, h: H, font } = overlay;
    const stats = run.stats();
    // Police lights at the screen edges while they're close.
    if (s.chase > 0.05 && s.phase !== "over") {
      const blue = Math.floor(time * 6) % 2 === 0;
      const a = Math.min(0.42, s.chase * 0.45);
      const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, blue ? `rgba(40,110,255,${a})` : `rgba(255,40,50,${a})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }

    // Score plate (top right): score, coins, metres.
    const pw = 168;
    const px = W - pw - 12;
    roundRect(g, px, 12, pw, 74, 16);
    g.fillStyle = "rgba(10,14,12,0.72)";
    g.fill();
    hudText(g, Math.floor(stats.distance + stats.coins * 10).toLocaleString(), px + pw - 14, 36, { size: 28, font: font.display, color: "#fff", align: "right", shadow: false });
    g.fillStyle = "#f2b81c";
    g.beginPath();
    g.arc(px + 22, 66, 9, 0, Math.PI * 2);
    g.fill();
    hudText(g, "₦", px + 22, 67, { size: 11, font: font.body, weight: 800, color: "#8a5600", shadow: false });
    hudText(g, String(stats.coins), px + 38, 66, { size: 17, font: font.display, color: "#ffd166", align: "left", shadow: false });
    hudText(g, `${Math.floor(stats.distance)} m`, px + pw - 14, 66, { size: 14, font: font.body, weight: 700, color: "rgba(255,255,255,0.75)", align: "right", shadow: false });

    // Police meter (top centre) while they're on you.
    if (s.chase > 0.02 && (s.phase === "run" || s.phase === "intro")) {
      const bw = Math.min(220, W * 0.5);
      const bx = (W - bw) / 2;
      const by = 64;
      roundRect(g, bx, by, bw, 30, 12);
      g.fillStyle = "rgba(10,14,12,0.75)";
      g.fill();
      roundRect(g, bx + 70, by + 10, (bw - 82) * s.chase, 10, 5);
      g.fillStyle = Math.floor(time * 6) % 2 ? "#ff4757" : "#3f8cff";
      g.fill();
      hudText(g, "POLICE", bx + 12, by + 15, { size: 13, font: font.body, weight: 800, color: "#fff", align: "left", shadow: false });
    }

    // Energy (top left, under the pause button): snacks refill it.
    {
      const ex = 12;
      const ey = 62;
      const ew = Math.min(170, W * 0.36);
      roundRect(g, ex, ey, ew, 34, 12);
      g.fillStyle = "rgba(10,14,12,0.72)";
      g.fill();
      hudText(g, "ENERGY", ex + 10, ey + 11, { size: 10, font: font.body, weight: 800, color: "rgba(255,255,255,0.7)", align: "left", shadow: false });
      const low = s.energy < RUN.tired;
      roundRect(g, ex + 10, ey + 19, ew - 20, 8, 4);
      g.fillStyle = "rgba(255,255,255,0.14)";
      g.fill();
      roundRect(g, ex + 10, ey + 19, Math.max(4, (ew - 20) * s.energy), 8, 4);
      g.fillStyle = s.rush > 0 ? "#7ec8ff" : low ? (Math.floor(time * 4) % 2 ? "#ff5d5d" : "#ff9f43") : "#7ee08a";
      g.fill();
      if (s.rush > 0) hudText(g, "RUSH", ex + ew - 10, ey + 11, { size: 10, font: font.body, weight: 800, color: "#7ec8ff", align: "right", shadow: false });
    }

    // Sugar rush: speed streaks at the edges.
    if (s.rush > 0 && s.phase === "run" && !ctx.reducedMotion) {
      g.strokeStyle = "rgba(200,230,255,0.35)";
      g.lineWidth = 2;
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + time * 0.5;
        const r0 = Math.max(W, H) * (0.45 + ((time * 2 + k * 0.37) % 1) * 0.2);
        g.beginPath();
        g.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0);
        g.lineTo(W / 2 + Math.cos(a) * (r0 + 60), H / 2 + Math.sin(a) * (r0 + 60));
        g.stroke();
      }
    }

    // Controls hint for the first few seconds.
    if (s.phase === "intro" || (s.phase === "run" && s.runTime < 4.5)) {
      const a = s.phase === "intro" ? 1 : clamp((4.5 - s.runTime) / 1, 0, 1);
      hudText(g, "Swipe ← → to dodge · ↑ jump · ↓ slide", W / 2, H - 60, { size: 15, font: font.body, weight: 700, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4, alpha: a });
    }

    for (const b of bubbles) {
      if (b.age < 0) continue;
      const scr = overlay.project(b.target.getWorldPosition(tmp).setY(tmp.y + b.lift), stage.camera);
      if (!scr || scr.y < 0) continue;
      const k = ctx.reducedMotion ? 1 : easeOutBack(Math.min(1, b.age / 0.2));
      const alpha = b.age < 1.2 ? 1 : 1 - (b.age - 1.2) / 0.4;
      g.save();
      g.globalAlpha = alpha;
      g.translate(scr.x, scr.y);
      g.scale(k, k);
      g.font = `400 17px ${font.display}`;
      const tw = g.measureText(b.text).width + 20;
      roundRect(g, -tw / 2, -34, tw, 28, 10);
      g.fillStyle = "#fff";
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = "#0b110d";
      g.stroke();
      g.beginPath();
      g.moveTo(-6, -7);
      g.lineTo(0, 2);
      g.lineTo(6, -7);
      g.fillStyle = "#fff";
      g.fill();
      hudText(g, b.text, 0, -20, { size: 17, font: font.display, color: b.color, shadow: false });
      g.restore();
    }

    popups.forEach((p, i) => {
      const k = easeOutBack(Math.min(1, p.age / 0.25));
      const alpha = p.age < 1 ? 1 : 1 - (p.age - 1) / 0.4;
      g.save();
      g.translate(W / 2, H * 0.3 + i * (p.size + 8) - p.age * 16);
      g.scale(ctx.reducedMotion ? 1 : k, ctx.reducedMotion ? 1 : k);
      hudText(g, p.text, 0, 0, { size: p.size, font: font.display, color: p.color, stroke: "rgba(0,0,0,0.6)", alpha });
      g.restore();
    });

    for (const sp of sparks) {
      const scr = overlay.project(sp.pos, stage.camera);
      if (!scr) continue;
      g.globalAlpha = 1 - sp.age / 0.45;
      g.fillStyle = "#fff2a8";
      const r = 4 + sp.age * 40;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.beginPath();
        g.arc(scr.x + Math.cos(a) * r, scr.y - sp.age * 30 + Math.sin(a) * r, 2.5, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    if (s.phase === "caught" || s.phase === "over") {
      const t = s.clock - s.caughtAt;
      const k = easeOutBack(Math.min(1, t / 0.35));
      g.save();
      // High up, so the arrest itself stays in view.
      g.translate(W / 2, H * 0.2);
      g.scale(k, k);
      hudText(g, "CAUGHT!", 0, 0, { size: 64, font: font.display, color: "#ff5d5d", stroke: "rgba(0,0,0,0.65)" });
      g.restore();
      if (s.caughtBy) hudText(g, `Ole! Dem don catch you. You jam the ${KIND_NAMES[s.caughtBy]}`, W / 2, H * 0.2 + 52, { size: 17, font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4, alpha: clamp(t * 2, 0, 1) });
    }
  }

  const loop = createLoop(update, render);
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
      if (down && (id === "left" || id === "right" || id === "jump" || id === "slide")) run.press(id);
    },
    destroy() {
      disposed = true;
      loop.stop();
      unbind();
      ambience.dispose();
      music.dispose();
      rain?.dispose();
      for (const seg of segments) {
        for (const p of seg.people) p.dispose();
        for (const h of seg.hawkers) h.dispose();
        for (const w of seg.walkers) w.c.dispose();
      }
      thief?.dispose();
      for (const p of police) p.dispose();
      overlay.dispose();
      stage.dispose();
    },
  };
}
