import * as THREE from "three";
import type { EngineContext, GameEngine } from "@/games/types";
import { createLoop } from "@/games/core/loop";
import { hudText, roundRect } from "@/games/core/draw";
import { createStage, QUALITY } from "@/games/core3d/stage";
import { buildStreet } from "@/games/core3d/street";
import { createCrowd, type Crowd } from "@/games/core3d/crowd";
import { Character } from "@/games/core3d/character";
import { createOverlay, drawLoading } from "@/games/core3d/overlay";
import { createAmbience } from "@/games/core3d/ambience";
import { createNaijaMusic } from "@/games/core/naija-music";
import { SIM_UNITS, streetSimMap } from "@/games/core3d/street-layout";
import { HEAD_START, type Team } from "./rules";
import { createMatch, type Actor, type Difficulty } from "./sim";
import { createChaseInput } from "./input";

const U = SIM_UNITS;
/** Scales the 2D-tuned speeds/distances: thieves run ~6 m/s, sprint ~9 m/s. */
const SCALE = 0.8;
const KID_IDS = ["tunde", "emeka", "ada", "aisha"];
const KID_NAMES: Record<string, string> = { tunde: "Tunde", emeka: "Emeka", ada: "Ada", aisha: "Aisha" };
const CLIPS = ["idle_m", "walk_m", "run_m", "crouch_m", "cheer_m"];

interface View {
  actor: Actor;
  char: Character;
  female: boolean;
  anim: string;
}

/** Realistic third-person Police & Thief on a busy Lagos street. */
export function createPoliceThief3D(ctx: EngineContext): GameEngine {
  const stage = createStage(ctx.canvas);
  const overlay = createOverlay(ctx.canvas);
  const ambience = createAmbience(ctx.sfx);
  const music = createNaijaMusic(ctx.sfx, "amapiano", { enabled: ctx.music });
  const jailbreak = ctx.mode === "jailbreak";
  const role: Team = jailbreak ? "thief" : ((ctx.options.role as Team) ?? "thief");
  const map = streetSimMap();
  const match = createMatch(map, {
    role,
    difficulty: (ctx.options.difficulty as Difficulty) ?? "normal",
    jailbreak,
    seed: ctx.seed,
    playerName: ctx.playerName,
    scale: SCALE,
    thiefBoost: 1.1,
  });
  const { state, human } = match;
  const input = createChaseInput();

  let ready = false;
  let progress = 0;
  let disposed = false;
  let ended = false;
  let crowd: Crowd | null = null;
  const views: View[] = [];
  const pickupMeshes = new Map<number, THREE.Object3D>();
  const popups: { text: string; pos: THREE.Vector3; color: string; age: number }[] = [];
  let message: { text: string; until: number } | null = null;

  // Camera heading in the ground plane (angle in sim space: x right, y = world z).
  let camHeading = role === "thief" ? -Math.PI / 2 : Math.PI / 2;
  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  let lastFrame = performance.now();

  const toWorld = (x: number, y: number, out = new THREE.Vector3()) => out.set(x / U, 0, y / U);

  async function init() {
    await buildStreet(stage.scene, { detailed: stage.quality !== "low" });
    if (disposed) return;
    progress = 0.55;
    crowd = await createCrowd(stage.scene, { walkers: QUALITY[stage.quality].npcs, traffic: QUALITY[stage.quality].traffic, rollers: true });
    if (disposed) return;
    progress = 0.85;
    // Thieves are the neighbourhood kids; police wear the black uniform.
    const kids = [...KID_IDS];
    if (role === "thief") kids.splice(0, kids.length, "tunde", "ada", "emeka", "aisha");
    let k = 0;
    await Promise.all(
      match.actors.map(async (a) => {
        const id = a.team === "police" ? "police" : kids[k++ % kids.length]!;
        const char = await Character.create(id, CLIPS);
        if (a.team === "thief" && !a.human) a.name = KID_NAMES[id] ?? a.name;
        stage.scene.add(char.root);
        char.play("idle_m", { offset: a.variant });
        views.push({ actor: a, char, female: id === "ada" || id === "aisha", anim: "idle_m" });
      }),
    );
    progress = 1;
    ready = true;
    lastFrame = performance.now();
  }
  init().catch((e) => {
    console.error(e);
    message = { text: "Couldn't load the 3D street. Check your connection.", until: Infinity };
  });

  function worldPopup(text: string, a: { x: number; y: number }, color: string) {
    popups.push({ text, pos: toWorld(a.x, a.y).setY(2.2), color, age: 0 });
  }

  function camForward() {
    return { x: Math.cos(camHeading), y: Math.sin(camHeading) };
  }

  function update(dt: number) {
    if (!ready) return;
    // Joystick/keys are camera-relative: up = away from the camera.
    const raw = input.dir();
    const f = camForward();
    const r = { x: -f.y, y: f.x };
    const dir = { x: r.x * raw.x + f.x * -raw.y, y: r.y * raw.x + f.y * -raw.y };
    const events = match.update(dt, { dir, sprint: input.sprint() });

    // Pedestrians are solid: nudge chase actors around them.
    if (crowd) {
      const obs = crowd.obstacles();
      for (const a of match.actors) {
        if (a.jailed) continue;
        for (const o of obs) {
          const dx = a.x - o.x * U;
          const dy = a.y - o.z * U;
          const d = Math.hypot(dx, dy);
          const min = 0.55 * U;
          if (d > 0 && d < min) {
            a.x += (dx / d) * (min - d);
            a.y += (dy / d) * (min - d);
          }
        }
      }
    }

    // Moving traffic: anyone in a car's path gets shoved to the nearer side of it.
    for (const f of crowd?.traffic?.footprints() ?? []) {
      for (const a of match.actors) {
        if (a.jailed) continue;
        const ax = a.x / U;
        const az = a.y / U;
        const r = 0.45;
        if (Math.abs(ax - f.x) < f.hx + r && Math.abs(az - f.z) < f.hz + r) {
          const side = az >= f.z ? 1 : -1;
          a.y = (f.z + side * (f.hz + r + 0.02)) * U;
          a.vx += f.vx * U * 0.3;
        }
      }
    }

    for (const e of events) {
      switch (e.type) {
        case "countdown":
          ctx.sfx.play("countdown");
          break;
        case "start":
          ctx.sfx.play("whistle");
          ambience.resume();
          break;
        case "tick":
          ctx.sfx.play("tick", 1);
          break;
        case "caught":
          ctx.sfx.play("whistle", 0.8);
          ctx.sfx.play("caught");
          worldPopup("CAUGHT!", e.thief, "#ff8a6b");
          if (e.by.human) ctx.haptic([20, 30, 20]);
          if (e.thief.human) {
            ctx.haptic(80);
            message = { text: "Caught! Wait for a teammate to free you", until: state.clock + 3.5 };
          }
          break;
        case "rescue":
          ctx.sfx.play("rescue");
          worldPopup(e.freed.length > 1 ? `JAILBREAK ×${e.freed.length}!` : "JAILBREAK!", match.jailCenter, "#7ee08a");
          if (e.rescuer.human) ctx.haptic([15, 30, 15, 30, 15]);
          if (e.freed.some((t) => t.human)) message = { text: "You're free! Run!", until: state.clock + 2 };
          break;
        case "pickup":
          ctx.sfx.play("pickup");
          worldPopup(e.pickup.kind === "puff" ? "Puff-puff! Speed up" : "Pure water! Energy full", e.pickup, e.pickup.kind === "puff" ? "#ffd166" : "#7ec8ff");
          break;
        case "end":
          ctx.sfx.play(e.winner === role ? "win" : "lose");
          ctx.sfx.play("whistle");
          break;
      }
    }

    // Camera swings round behind the direction you're running.
    const speed = Math.hypot(human.vx, human.vy);
    if (speed > 40 * SCALE) {
      let d = human.facing - camHeading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      // Don't swing when running straight back toward the camera.
      if (Math.abs(d) < 2.4) camHeading += d * Math.min(1, dt * 1.8);
    }

    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.3) popups.splice(i, 1);
    if (state.phase === "play") music.start();
    else if (state.phase === "end") music.stop(2);
    if (state.phase === "end" && state.clock - state.endAt > 2.2) finish();
  }

  function finish() {
    if (ended) return;
    ended = true;
    const s = match.summary();
    ctx.onEnd({
      game: "police-thief",
      mode: ctx.mode,
      options: { ...ctx.options, role },
      score: s.score,
      won: s.won,
      durationMs: Math.round(state.clock * 1000),
      headline: s.headline,
      detail: s.detail,
      stats: s.stats,
      seed: ctx.seed,
      log: s.log,
    });
  }

  function pickupMesh(kind: "puff" | "water") {
    const g = new THREE.Group();
    if (kind === "puff") {
      const mat = new THREE.MeshStandardMaterial({ color: 0xb8692a, roughness: 0.75 });
      for (const [x, z] of [
        [-0.07, 0.03],
        [0.07, 0.03],
        [0, -0.07],
      ] as const) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), mat);
        ball.position.set(x, 0.08, z);
        ball.castShadow = true;
        g.add(ball);
      }
      const paper = new THREE.Mesh(new THREE.CircleGeometry(0.18, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9 }));
      paper.position.y = 0.01;
      g.add(paper);
    } else {
      const sachet = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.15), new THREE.MeshPhysicalMaterial({ color: 0xeaf4ff, roughness: 0.15, transmission: 0.5, thickness: 0.05 }));
      sachet.position.y = 0.05;
      sachet.castShadow = true;
      g.add(sachet);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.38, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: kind === "puff" ? 0xffd166 : 0x7ec8ff, transparent: true, opacity: 0.8 }));
    ring.position.y = 0.02;
    g.add(ring);
    g.scale.setScalar(1.6);
    return g;
  }

  function render() {
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (ready) stage.adapt(frameDt);
    overlay.begin();
    if (!ready) {
      progress = Math.min(progress + frameDt * 0.04, 0.95);
      drawLoading(overlay, "Loading the street…", progress);
      if (message) hudText(overlay.g, message.text, overlay.w / 2, overlay.h / 2 + 70, { size: 14, font: overlay.font.body, weight: 700, color: "#ff8a6b" });
      return;
    }

    // Characters follow the simulation.
    for (const v of views) {
      const a = v.actor;
      toWorld(a.x, a.y, v.char.root.position);
      v.char.root.rotation.y = Math.PI / 2 - a.facing;
      const sp = Math.hypot(a.vx, a.vy) / U;
      let anim = "idle_m";
      let ts = 1;
      if (state.phase === "end") anim = state.winner === a.team ? "cheer_m" : "idle_m";
      else if (a.jailed) anim = "crouch_m";
      else if (a.hidden && sp < 0.8) anim = "crouch_m";
      else if (sp > 3.2) {
        anim = "run_m";
        ts = THREE.MathUtils.clamp(sp / 5.2, 0.75, 1.5);
      } else if (sp > 0.35) {
        anim = "walk_m";
        ts = THREE.MathUtils.clamp(sp / 1.4, 0.6, 1.8);
      }
      if (anim !== v.anim) {
        v.char.play(anim, { fade: 0.2 });
        v.anim = anim;
      }
      v.char.setTimeScale(ts);
      v.char.update(frameDt);
    }

    // Pickups
    const live = new Set(match.pickups.map((p) => p.id));
    for (const [id, m] of pickupMeshes) {
      if (!live.has(id)) {
        m.removeFromParent();
        pickupMeshes.delete(id);
      }
    }
    for (const p of match.pickups) {
      let m = pickupMeshes.get(p.id);
      if (!m) {
        m = pickupMesh(p.kind);
        stage.scene.add(m);
        pickupMeshes.set(p.id, m);
      }
      toWorld(p.x, p.y, m.position);
      m.position.y = ctx.reducedMotion ? 0.05 : 0.05 + Math.abs(Math.sin(p.age * 3)) * 0.12;
      m.rotation.y = p.age * 1.5;
    }

    if (crowd?.update(frameDt, stage.camera.position, match.actors.filter((a) => !a.jailed).map((a) => ({ x: a.x / U, z: a.y / U })))) ctx.sfx.play("horn", 0.8);

    // Third-person camera, pulled in if a building is in the way.
    const hp = toWorld(human.x, human.y);
    const f = camForward();
    let dist = 6.2;
    const height = 3.1;
    for (let d = 1.5; d <= 6.2; d += 0.25) {
      const sx = human.x - f.x * d * U;
      const sy = human.y - f.y * d * U;
      if (map.solids.some((s) => sx > s.x - 6 && sx < s.x + s.w + 6 && sy > s.y - 6 && sy < s.y + s.h + 6)) {
        dist = d - 0.3;
        break;
      }
    }
    const targetPos = new THREE.Vector3(hp.x - f.x * dist, height * (0.55 + 0.45 * (dist / 6.2)), hp.z - f.y * dist);
    camPos.lerp(targetPos, camPos.lengthSq() === 0 ? 1 : Math.min(1, frameDt * 6));
    lookAt.lerp(new THREE.Vector3(hp.x + f.x * 2.5, 1.1, hp.z + f.y * 2.5), camPos.lengthSq() === 0 ? 1 : Math.min(1, frameDt * 8));
    stage.camera.position.copy(camPos);
    stage.camera.lookAt(lookAt);
    stage.focusShadows(hp);
    stage.render();
    drawHud(frameDt);
  }

  function drawHud(dt: number) {
    const { g, w: W, h: H, font } = overlay;
    // Name tags
    for (const v of views) {
      if (!v.actor.human && !v.actor.jailed) continue;
      const p = overlay.project(v.char.root.position.clone().setY(v.char.height + 0.35), stage.camera);
      if (!p) continue;
      hudText(g, v.actor.human ? "YOU" : v.actor.name, p.x, p.y, { size: v.actor.human ? 13 : 11, font: font.body, weight: 800, color: v.actor.human ? "#ffd166" : "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 3 });
    }
    for (const pp of popups) {
      const p = overlay.project(pp.pos.clone().setY(2.2 + pp.age * 0.8), stage.camera);
      if (!p) continue;
      hudText(g, pp.text, p.x, p.y, { size: 22, font: font.display, color: pp.color, stroke: "rgba(0,0,0,0.55)", alpha: pp.age < 1 ? 1 : 1 - (pp.age - 1) / 0.3 });
    }
    void dt;

    // Timer + thief status
    const t = Math.ceil(state.timeLeft);
    roundRect(g, W / 2 - 52, 12, 104, 44, 14);
    g.fillStyle = t <= 10 && state.phase === "play" ? "rgba(140,30,20,0.85)" : "rgba(12,16,14,0.72)";
    g.fill();
    hudText(g, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, W / 2, 35, { size: 26, font: font.display, color: "#fff", shadow: false });
    const ts = match.thieves();
    const startX = W / 2 - (ts.length * 22) / 2;
    ts.forEach((th, i) => {
      g.fillStyle = th.jailed ? "rgba(255,255,255,0.25)" : th.human ? "#ffd166" : "#ff9f7a";
      roundRect(g, startX + i * 22, 62, 18, 8, 4);
      g.fill();
    });
    if (state.clock < HEAD_START + 6) {
      hudText(g, role === "thief" ? "Stay free till time runs out • Hide among the stalls" : "Catch every thief", W / 2, 90, { size: 12, font: font.body, weight: 700, color: "#fff", stroke: "rgba(0,0,0,0.5)", strokeWidth: 3 });
    }
    // Energy
    roundRect(g, 14, 64, 120, 30, 10);
    g.fillStyle = "rgba(12,16,14,0.72)";
    g.fill();
    hudText(g, human.boostFor > 0 ? "BOOST" : human.hidden ? "HIDDEN" : "ENERGY", 24, 79, { size: 10, font: font.body, weight: 800, color: human.boostFor > 0 || human.hidden ? "#ffd166" : "rgba(255,255,255,0.75)", align: "left", shadow: false });
    roundRect(g, 72, 75, 52, 8, 4);
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.fill();
    roundRect(g, 72, 75, 52 * (human.stamina / 100), 8, 4);
    g.fillStyle = human.exhausted ? "#ff6b5a" : "#7ee08a";
    g.fill();

    // Minimap with the camera's view direction
    const mw = Math.min(130, W * 0.26);
    const s = mw / map.w;
    const mh = map.h * s;
    const x0 = W - mw - 12;
    const y0 = 12;
    roundRect(g, x0 - 4, y0 - 4, mw + 8, mh + 8, 10);
    g.fillStyle = "rgba(12,16,14,0.72)";
    g.fill();
    g.fillStyle = "rgba(120,110,100,0.5)";
    g.fillRect(x0, y0 + 20 * U * s, mw, 9 * U * s);
    g.fillStyle = "rgba(230,215,190,0.55)";
    for (const b of map.solids) g.fillRect(x0 + b.x * s, y0 + b.y * s, Math.max(1.5, b.w * s), Math.max(1.5, b.h * s));
    g.fillStyle = "rgba(80,150,80,0.6)";
    for (const b of map.hides) g.fillRect(x0 + b.x * s, y0 + b.y * s, b.w * s, b.h * s);
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 1;
    g.strokeRect(x0 + map.jail.x * s, y0 + map.jail.y * s, map.jail.w * s, map.jail.h * s);
    for (const a of match.actors) {
      if (a.hidden && !a.human && role === "police") continue;
      g.fillStyle = a.human ? "#ffd166" : a.team === "police" ? "#7ec8ff" : "#ff9f7a";
      g.beginPath();
      g.arc(x0 + a.x * s, y0 + a.y * s, a.human ? 3 : 2.2, 0, Math.PI * 2);
      g.fill();
    }

    if (state.phase === "intro") {
      const n = HEAD_START - Math.floor(state.clock);
      hudText(g, String(Math.max(1, n)), W / 2, H * 0.4, { size: 96, font: font.display, color: "#fff", stroke: "rgba(0,0,0,0.5)" });
      hudText(g, role === "thief" ? "Police are counting… RUN and HIDE!" : "Count to 3… then catch them all!", W / 2, H * 0.4 + 70, { size: 18, font: font.display, color: "#ffd166", stroke: "rgba(0,0,0,0.5)", strokeWidth: 4 });
    }
    if (message && state.clock < message.until) {
      hudText(g, message.text, W / 2, H * 0.28, { size: Math.min(17, W / 24), font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4 });
    }
    if (state.phase === "end") {
      const won = state.winner === role;
      hudText(g, won ? "YOU WIN!" : "GAME OVER", W / 2, H * 0.4, { size: 56, font: font.display, color: won ? "#ffd166" : "#ff8a6b", stroke: "rgba(0,0,0,0.5)" });
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
      if (id === "sprint") input.setSprint(down);
      ambience.resume();
    },
    axis(x, y) {
      input.setAxis(x, y);
      ambience.resume();
    },
    destroy() {
      disposed = true;
      loop.stop();
      input.dispose();
      ambience.dispose();
      music.dispose();
      crowd?.dispose();
      for (const v of views) v.char.dispose();
      overlay.dispose();
      stage.dispose();
    },
  };
}
