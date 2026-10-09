import * as THREE from "three";
import type { EngineContext, GameEngine } from "@/games/types";
import { createLoop } from "@/games/core/loop";
import { clamp, easeOutCubic, hudText } from "@/games/core/draw";
import { createStage, QUALITY, type LightPreset } from "@/games/core3d/stage";
import { buildPlace, type Place, type PlaceId } from "@/games/core3d/places";
import { createWatchers, faceToward } from "@/games/core3d/kids";
import { ARM_CHAIN, Character } from "@/games/core3d/character";
import { createOverlay, drawLoading } from "@/games/core3d/overlay";
import { createAmbience } from "@/games/core3d/ambience";
import { createRain } from "@/games/core3d/rain";
import type { Difficulty } from "./ai";
import { createTenTenMatch, type TenTenEvent } from "./match";
import { drawTenTenHud, JUDGE_STYLE, judgeLabel } from "./hud";
import type { Player, Side } from "./rules";
import { bindTenTenKeys } from "./keys";
import { createMusicSync, createTenTenMusic } from "./music";
import { createTenTenDecal, GAP, padOffset, SPOT } from "./decal3d";

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const PRESET: Record<string, LightPreset> = { afternoon: "day", evening: "evening", rainy: "overcast" };

/** Older saved options used a single "arena" value; map it onto place + time. */
export function tenTenScene(options: Record<string, string>): { place: PlaceId; time: string } {
  const legacy = options.arena;
  const place = (options.place as PlaceId) ?? "street";
  const time = options.time ?? (legacy === "evening" || legacy === "rainy" ? legacy : "afternoon");
  return { place, time };
}

interface Girl {
  c: Character;
  /** +1 faces +z (the player, back to camera), -1 faces -z. */
  facing: 1 | -1;
  clapPose: Map<string, THREE.Quaternion> | null;
  base: THREE.Vector3;
  anim: string;
}

/** Realistic 3D Ten-Ten: two schoolgirls in a street, school yard or compound, with kids watching. */
export function createTenTen3D(ctx: EngineContext): GameEngine {
  const scene = tenTenScene(ctx.options);
  const stage = createStage(ctx.canvas, { preset: PRESET[scene.time] ?? "day" });
  const overlay = createOverlay(ctx.canvas);
  const ambience = createAmbience(ctx.sfx);
  const m = createTenTenMatch({
    mode: ctx.mode,
    difficulty: (ctx.options.difficulty as Difficulty) ?? "normal",
    seed: ctx.seed,
    playerName: ctx.playerName,
    opponent: ctx.mode === "local" ? undefined : "Aisha",
  });
  // Dev only: lets automated playtests (and trailer capture) read the beat.
  if (process.env.NODE_ENV !== "production") (window as unknown as { __tenten?: typeof m }).__tenten = m;
  const s = m.state;
  const music = createTenTenMusic(ctx.sfx);
  let musicOn = ctx.music;
  music.preload();
  const musicSync = createMusicSync(music, m);

  let ready = false;
  let disposed = false;
  let progress = 0;
  let place: Place | null = null;
  let spot = SPOT.clone();
  let rain: ReturnType<typeof createRain> | null = null;
  const girls: Girl[] = [];
  const watchers: Character[] = [];
  const pads = new Map<string, THREE.Mesh>();
  const popups: { text: string; pos: THREE.Vector3; color: string; size: number; age: number; lane: number }[] = [];
  let lastFrame = performance.now();
  let failed = false;
  let lastEarly = -10;

  const padPos = (player: Player, side: Side) => {
    const o = padOffset(player, side);
    return new THREE.Vector3(spot.x + o.x, 0.02, spot.z + o.z);
  };

  function chalkDecal() {
    stage.scene.add(createTenTenDecal(spot));
    for (const player of [0, 1] as Player[]) {
      for (const side of ["L", "R"] as Side[]) {
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: player === 0 ? 0xffd166 : 0x7ec8ff, transparent: true, opacity: 0, depthWrite: false }));
        pad.position.copy(padPos(player, side)).setY(0.03);
        stage.scene.add(pad);
        pads.set(`${player}${side}`, pad);
      }
    }
  }

  async function init() {
    const q = QUALITY[stage.quality];
    place = await buildPlace(stage.scene, scene.place, { detailed: stage.quality !== "low", walkers: Math.round(q.npcs * 0.7), traffic: q.traffic });
    if (disposed) return;
    spot = place.spot.clone();
    progress = 0.5;
    const [ada, aisha] = await Promise.all([Character.create("ada", ["idle_f", "clap_f", "cheer_f"]), Character.create("aisha", ["idle_f", "clap_f", "cheer_f"])]);
    if (disposed) return;
    for (const [c, facing] of [
      [ada, 1],
      [aisha, -1],
    ] as const) {
      const base = new THREE.Vector3(spot.x, 0, spot.z + (facing === 1 ? -GAP : GAP));
      c.root.position.copy(base);
      c.root.rotation.y = facing === 1 ? 0 : Math.PI;
      c.play("idle_f");
      stage.scene.add(c.root);
      // Real mocap hand-clap: freeze the frame where the hands meet and blend to it on the beat.
      const t = c.closestApproach("clap_f", "L Hand", "R Hand");
      const clapPose = c.samplePose("clap_f", t, ARM_CHAIN.filter((b) => b !== "Head" && b !== "Neck"));
      girls.push({ c, facing, clapPose, base, anim: "idle_f" });
    }
    progress = 0.7;
    // Kids and neighbours crowd round to watch, clapping along.
    watchers.push(...(await createWatchers(stage.scene, place.watchers.map(([id, clip, x, z]) => [id, clip, x, z, faceToward(x, z, spot.x, spot.z)]))));
    progress = 0.9;
    chalkDecal();
    if (scene.time === "rainy") rain = createRain(stage.scene);
    ready = true;
    lastFrame = performance.now();
  }
  init().catch((e) => {
    console.error(e);
    failed = true;
  });

  function popupAt(player: Player | null, text: string, color: string, size = 24) {
    const pos = player === null ? new THREE.Vector3(spot.x, 2.3, spot.z) : girls[player]!.base.clone().setY(2.0);
    // Popups that land together stack instead of drawing over each other.
    const lane = popups.filter((q) => q.age < 0.9).length;
    popups.push({ text, pos, color, size, age: 0, lane });
  }

  function handle(events: TenTenEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case "countdown":
          ctx.sfx.play("countdown");
          break;
        case "go":
          ctx.sfx.play("go");
          ambience.resume();
          break;
        case "beat":
          // The band plays the claps, perfectly on the beat.
          break;
        case "stomp":
          ctx.sfx.play("stomp", 0.7);
          if (e.player === 0 || m.local) ctx.haptic(12);
          break;
        case "early":
          // Instant feedback even when it's too soon: a tick, and a reminder now and then.
          ctx.sfx.play("tick", 0.5);
          if (s.clock - lastEarly > 0.8) popupAt(null, "Wait for THROW", "#f4f1ea", 18);
          lastEarly = s.clock;
          break;
        case "resolve":
          popupAt(0, judgeLabel(e.judgements[0], e.sides[0], e.offsets[0]), JUDGE_STYLE[e.judgements[0]].color, 26);
          if (m.local || e.judgements[1] === "miss") popupAt(1, judgeLabel(e.judgements[1], e.sides[1], e.offsets[1]), JUDGE_STYLE[e.judgements[1]].color, 22);
          if (e.judgements[0] === "perfect") ctx.sfx.play("perfect", 0.8);
          if (e.winner === null) popupAt(null, "Both fouled. Again!", "#f4f1ea", 22);
          else {
            ctx.sfx.play(e.winner === 0 || m.local ? "point" : "lose", 0.9);
            if (e.winner === 0) ctx.haptic([18, 40, 18]);
            popupAt(null, `+1 ${m.names[e.winner].toUpperCase()}`, e.winner === 0 ? "#7ee08a" : m.local ? "#7ec8ff" : "#ff8a6b", 30);
          }
          if (e.switched) popupAt(null, "SWITCH!", "#ffd166", 22);
          break;
        case "end":
          ctx.sfx.play(e.winner === 0 || m.local ? "win" : "lose");
          break;
        case "finish":
          ctx.onEnd({ ...e.result, options: ctx.options });
          break;
      }
    }
  }

  function update(dt: number) {
    if (!ready) return;
    handle(m.update(dt));
    if (musicOn) musicSync.update();
    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.2) popups.splice(i, 1);
  }

  /** Layers the Ten-Ten moves over the mocap idle: clap, jump, knee bend, leg throw. */
  function pose(player: Player, dt: number) {
    const girl = girls[player]!;
    const { c, facing } = girl;
    const fwdSign = facing === 1 ? -1 : 1; // rotation sign about +X that swings a limb toward the other girl
    if (s.phase === "end") {
      const won = s.points[player] >= m.target;
      const want = won ? "cheer_f" : "idle_f";
      if (girl.anim !== want) {
        c.play(want, { fade: 0.3 });
        girl.anim = want;
      }
      c.update(dt);
      c.root.position.copy(girl.base);
      if (!won) c.rotateWorld("Head", X, fwdSign * -0.35);
      return;
    }
    c.update(dt);
    if (s.phase === "intro") return;
    const u = m.barPos();
    const bump = (d: number) => clamp(1 - Math.abs(d) / 0.42, 0, 1);
    const clap = Math.max(bump(u), bump(u - 1));
    if (girl.clapPose) c.blendPose(girl.clapPose, clap);

    let lift = 0;
    let crouch = 0;
    if (u > 1.55 && u < 3) {
      const t = (u - 1.55) / 1.45;
      lift = Math.sin(t * Math.PI) * (ctx.reducedMotion ? 0.06 : 0.2);
      crouch = Math.max(0, 1 - t * 4) * 0.6 + Math.sin(t * Math.PI) * 0.35;
    }
    if (u >= 3 && u < 3.25) crouch = Math.max(crouch, (1 - (u - 3) / 0.25) * 0.7);
    c.root.position.set(girl.base.x, lift - crouch * 0.06, girl.base.z);
    if (crouch > 0) {
      for (const side of ["L", "R"]) {
        c.rotateWorld(`${side} Thigh`, X, fwdSign * crouch * 0.55);
        c.rotateWorld(`${side} Calf`, X, -fwdSign * crouch * 1.0);
      }
    }
    // Leg throw: the chosen foot shoots out to one side and toward the other girl.
    const side = s.pending.revealed[player] ? s.pending.sides[player] : null;
    const at = m.pressedAt(player);
    if (side && at !== null && u < 3.95) {
      const t = easeOutCubic((s.clock - at) / 0.045);
      // Screen-left is world +x; for the player that's her left leg, for the opponent her right.
      const leg = (side === "L") === (facing === 1) ? "L Thigh" : "R Thigh";
      const outward = side === "L" ? 1 : -1;
      c.rotateWorld(leg, Z, outward * 0.5 * t);
      c.rotateWorld(leg, X, fwdSign * 0.45 * t);
      const pad = pads.get(`${player}${side}`);
      if (pad) (pad.material as THREE.MeshBasicMaterial).opacity = 0.55 * t;
    }
  }

  function render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (ready) stage.adapt(dt);
    overlay.begin();
    if (!ready) {
      progress = Math.min(progress + dt * 0.04, 0.95);
      drawLoading(overlay, failed ? "Couldn't load the 3D street" : "Loading the market…", progress);
      return;
    }
    for (const pad of pads.values()) (pad.material as THREE.MeshBasicMaterial).opacity *= 0.9;
    pose(0, dt);
    pose(1, dt);
    for (const w of watchers) w.update(dt);
    place?.update(dt, stage.camera.position);
    rain?.update(dt, spot);

    // Over-the-shoulder camera with a gentle handheld sway.
    const sway = ctx.reducedMotion ? 0 : Math.sin(s.clock * 0.6) * 0.06;
    stage.camera.position.set(spot.x + 0.85 + sway, 1.62, spot.z - GAP - 2.35);
    stage.camera.lookAt(spot.x - 0.1, 0.95, spot.z + GAP + 0.4);
    stage.focusShadows(spot);
    stage.render();

    const { g, w: W, h: H, font } = overlay;
    drawTenTenHud(g, W, H, m, font, { reducedMotion: ctx.reducedMotion, cueY: H * 0.34, coachY: H * 0.66 });
    for (const p of popups) {
      const scr = overlay.project(p.pos, stage.camera);
      if (!scr) continue;
      // Keep clear of the score cards, pause button and beat track at the top.
      const y = Math.max(scr.y, H * 0.5) + p.lane * p.size * 1.25 - p.age * 28;
      const x = Math.min(Math.max(scr.x, W * 0.22), W * 0.78);
      hudText(g, p.text, x, y, { size: p.size, font: font.display, color: p.color, stroke: "rgba(0,0,0,0.55)", alpha: p.age < 0.85 ? 1 : 1 - (p.age - 0.85) / 0.35 });
    }
  }

  const loop = createLoop(update, render);
  const unbind = bindTenTenKeys(m.local, (player, side) => handle(m.press(player, side)));

  return {
    start() {
      loop.start();
    },
    setMusic(on) {
      musicOn = on;
      music.setVolume(on ? 1 : 0);
      if (on) musicSync.reset();
    },
    setPaused(p) {
      loop.setPaused(p);
      ambience.setVolume(p ? 0 : 1);
      music.setVolume(p ? 0 : 1);
      if (p) musicSync.reset();
    },
    input(id, down) {
      if (!down) return;
      ambience.resume();
      if (id === "p1L") handle(m.press(0, "L"));
      else if (id === "p1R") handle(m.press(0, "R"));
      else if (id === "p2L") handle(m.press(1, "L"));
      else if (id === "p2R") handle(m.press(1, "R"));
    },
    destroy() {
      disposed = true;
      loop.stop();
      unbind();
      ambience.dispose();
      rain?.dispose();
      place?.dispose();
      for (const g of girls) g.c.dispose();
      for (const w of watchers) w.dispose();
      overlay.dispose();
      stage.dispose();
    },
  };
}
