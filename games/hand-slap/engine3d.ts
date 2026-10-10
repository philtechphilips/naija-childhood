import * as THREE from "three";
import type { EngineContext, GameEngine } from "@/games/types";
import { createLoop } from "@/games/core/loop";
import { clamp, hudText, roundRect } from "@/games/core/draw";
import { createStage } from "@/games/core3d/stage";
import { Character } from "@/games/core3d/character";
import { createOverlay, drawLoading } from "@/games/core3d/overlay";
import { buildPlace, type Place, type PlaceId } from "@/games/core3d/places";
import { createWatchers, faceToward } from "@/games/core3d/kids";
import { createNaijaMusic } from "@/games/core/naija-music";
import { createCountVoice } from "@/games/skipping/shared";
import { FEINT, TARGET, WINDOW } from "./rules";
import type { SlapEvent } from "./match";
import { measureArms, reach, type ArmRig } from "./arms";
import { OPPONENT, bindSlapKeys, buildSlapResult, roleLine, slapText, startSlapMatch, youGotHit } from "./shared";

interface Player {
  char: Character;
  rig: ArmRig;
  /** Unit vector the kid faces, and their right-hand side. */
  fwd: THREE.Vector3;
  /** Smoothed hand targets, so poses ease between states. */
  hands: Record<"L" | "R", THREE.Vector3>;
  thumbs: Record<"L" | "R", THREE.Vector3>;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Backhand slap, side-on: you on the left, Emeka on the right, hands in the middle. */
export function createHandSlap3D(ctx: EngineContext): GameEngine {
  const stage = createStage(ctx.canvas, { preset: ctx.options.time === "evening" ? "evening" : "day" });
  const overlay = createOverlay(ctx.canvas);
  const music = createNaijaMusic(ctx.sfx, "afrobeats", { enabled: ctx.music });
  const voice = createCountVoice(ctx.sfx);
  const { m } = startSlapMatch(ctx);
  const { st } = m;
  const placeId = (["school", "compound", "street"].includes(ctx.options.place ?? "") ? ctx.options.place : "school") as PlaceId;
  const act = () => handle(m.press("act"));
  const fake = () => handle(m.press("fake"));
  const unbind = bindSlapKeys(act, fake);
  if (process.env.NODE_ENV !== "production") (window as unknown as { __slap?: typeof m }).__slap = m;

  let ready = false;
  let failed = false;
  let disposed = false;
  let ended = false;
  let endWait = 0;
  let progress = 0;
  let place: Place | null = null;
  const players: Player[] = [];
  let crowd: Character[] = [];
  const spot = new THREE.Vector3();
  let banner: { text: string; color: string; sub?: string; age: number } | null = null;
  let flash = 0;
  let shake = 0;
  let lastFrame = performance.now();
  /** Resting height where the hands meet (the camera frames this). */
  let meetY = 0;

  async function init() {
    place = await buildPlace(stage.scene, placeId, { detailed: stage.quality !== "low", walkers: placeId === "street" ? 8 : 0, traffic: placeId === "street" ? 3 : 0, rollers: false });
    if (disposed) return;
    spot.copy(place.spot);
    progress = 0.5;
    const [you, cpu] = await Promise.all([Character.create("ada", ["idle_f"]), Character.create(OPPONENT.avatar, ["idle_m"])]);
    if (disposed) return;
    // The camera looks along +z, so screen-left is +x: you stand on the left.
    for (const [c, side] of [
      [you, 1],
      [cpu, -1],
    ] as const) {
      c.play(c === you ? "idle_f" : "idle_m", { fade: 0 });
      c.root.position.copy(spot);
      c.root.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      c.update(0.001);
      stage.scene.add(c.root);
    }
    const rigs = [measureArms(you), measureArms(cpu)];
    // Stand so both pairs of hands meet comfortably in the middle.
    const reachLen = Math.min(rigs[0]!.len.L[0] + rigs[0]!.len.L[1], rigs[1]!.len.L[0] + rigs[1]!.len.L[1]);
    const gap = reachLen * 0.78 + 0.08;
    you.root.position.x = spot.x + gap;
    cpu.root.position.x = spot.x - gap;
    for (const [i, c] of [you, cpu].entries()) {
      const fwd = new THREE.Vector3(i === 0 ? -1 : 1, 0, 0);
      players.push({ char: c, rig: rigs[i]!, fwd, hands: { L: new THREE.Vector3(), R: new THREE.Vector3() }, thumbs: { L: new THREE.Vector3(), R: new THREE.Vector3() } });
    }
    progress = 0.75;
    // Friends crowding round to watch.
    const ring: [string, string, number, number, number][] = [];
    const ids: [string, string][] = [
      ["tunde", "cheer_m"],
      ["aisha", "clap_f"],
      ["woman1", "cheer_f"],
      ["tunde", "clap_m"],
      ["aisha", "cheer_f"],
    ];
    const n = stage.quality === "low" ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.2 + (i / (n - 1)) * Math.PI * 0.6;
      const x = spot.x + Math.cos(a) * 3.0;
      const z = spot.z + Math.sin(a) * 2.6;
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

  function handle(ev: SlapEvent[]) {
    for (const e of ev) {
      const t = slapText(e);
      if (t) banner = { ...t, age: 0 };
      switch (e.type) {
        case "count":
          voice.count(e.n);
          break;
        case "go":
          ctx.sfx.play("go", 0.6);
          music.start();
          break;
        case "slap":
          ctx.sfx.play("clap", 1);
          ctx.sfx.play(e.by === 0 ? "point" : "caught", 0.6);
          if (e.by === 1) {
            flash = 1;
            shake = 1;
            ctx.haptic([40, 30, 60]);
          } else ctx.haptic(20);
          break;
        case "dodge":
          ctx.sfx.play(e.by === 0 ? "perfect" : "miss", 0.8);
          break;
        case "feint":
          ctx.sfx.play("tick", 0.25);
          break;
        case "timeout":
          ctx.sfx.play("miss", 0.6);
          break;
        case "end":
          ctx.sfx.play(e.won ? "win" : "lose");
          music.stop(2);
          break;
      }
    }
  }
  handle(m.pending);

  function update(dt: number) {
    if (!ready) return;
    handle(m.update(dt));
    if (banner) {
      banner.age += dt;
      if (banner.age > 1.6) banner = null;
    }
    flash = Math.max(0, flash - dt * 2.5);
    shake = Math.max(0, shake - dt * 4);
    music.setIntensity(st.phase === "open" ? 0.8 : 0.45);
    if (st.phase === "end" && (endWait += dt) > 2.6) finish();
  }

  function finish() {
    if (ended) return;
    ended = true;
    ctx.onEnd(buildSlapResult(ctx, m));
  }

  /** Where each player's hands should be right now, from the match state. */
  function pose(dt: number) {
    const t = st.clock;
    const att = players[st.attacker]!;
    const def = players[st.attacker === 0 ? 1 : 0]!;
    const shoulderY = att.char.bone("L UpperArm")?.getWorldPosition(new THREE.Vector3()).y ?? 1.1;
    const meet = new THREE.Vector3(spot.x, Math.min(shoulderY, def.char.bone("L UpperArm")?.getWorldPosition(new THREE.Vector3()).y ?? 1.1) - 0.3, spot.z);
    meetY = meet.y;
    const strike = st.strike;
    const sinceOutcome = st.outcome ? t - st.outcome.at : 99;
    const showing = st.phase === "after" || st.phase === "end";
    for (const p of players) {
      const attacking = p === att;
      const center = p.char.root.position;
      for (const side of ["L", "R"] as const) {
        const sh = p.char.bone(`${side} UpperArm`)?.getWorldPosition(new THREE.Vector3());
        if (!sh) continue;
        // Hands sit a little apart, each in line with its own shoulder.
        const lateral = sh.clone().sub(center).setY(0);
        lateral.sub(p.fwd.clone().multiplyScalar(lateral.dot(p.fwd)));
        const across = lateral.clone().normalize();
        const target = meet.clone().add(lateral.clone().multiplyScalar(0.75));
        // Attacker underneath with palms up; defender resting on top, palms down.
        target.y += attacking ? -0.035 : 0.035;
        target.add(p.fwd.clone().multiplyScalar(attacking ? 0.02 : -0.02));
        let thumb = attacking ? across.clone() : across.clone().negate();
        let snap = false;
        if (attacking) {
          if (strike) {
            const u = t - strike.at;
            if (u < strike.windup) {
              // Wind-up: hands drop and draw back (the tell).
              const k = u / strike.windup;
              target.y -= 0.12 * k;
              target.add(p.fwd.clone().multiplyScalar(-0.06 * k));
            } else {
              // Whip up and over onto the backs of the other hands, flipping palms down.
              const k = clamp((u - strike.windup) / strike.travel, 0, 1);
              const landY = 0.035 + 0.075;
              target.y += -0.12 + (0.12 + landY) * k + 0.22 * Math.sin(k * Math.PI);
              target.add(p.fwd.clone().multiplyScalar(-0.06 + 0.1 * k));
              thumb = across.clone().lerp(across.clone().negate(), k).add(UP.clone().multiplyScalar(0.3 * (1 - Math.abs(2 * k - 1))));
            }
            snap = true;
          } else if (st.feint && st.feint.by === st.attacker) {
            const k = (t - st.feint.at) / FEINT.dur;
            target.y -= 0.11 * Math.sin(Math.PI * clamp(k, 0, 1));
            target.add(p.fwd.clone().multiplyScalar(-0.05 * Math.sin(Math.PI * clamp(k, 0, 1))));
            snap = true;
          }
        } else {
          if (st.pulledAt !== null && t >= st.pulledAt) {
            // Yank the hands back to the chest.
            const k = clamp((t - st.pulledAt) / 0.1, 0, 1);
            target.lerp(sh.clone().add(p.fwd.clone().multiplyScalar(0.12)).add(new THREE.Vector3(0, -0.3, 0)).add(lateral.clone().multiplyScalar(-0.3)), k);
            snap = true;
          } else if (showing && sinceOutcome < 0.9 && st.strike) {
            // Just got slapped: hands knocked down, a sting-shake.
            const k = Math.exp(-sinceOutcome * 5);
            target.y -= 0.1 * k;
            target.z += Math.sin(sinceOutcome * 60) * 0.03 * k;
          }
        }
        const rate = snap ? 60 : 12;
        if (p.hands[side].lengthSq() === 0) p.hands[side].copy(target);
        else p.hands[side].lerp(target, 1 - Math.exp(-rate * dt));
        p.thumbs[side].lerp(thumb, 1 - Math.exp(-(snap ? 40 : 12) * dt));
        const pole = across.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, -1, 0));
        reach(p.char, p.rig, side, p.hands[side], pole, p.thumbs[side].lengthSq() > 0.01 ? p.thumbs[side] : thumb);
      }
    }
  }

  function render() {
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (ready) stage.adapt(frameDt);
    overlay.begin();
    if (!ready) {
      progress = Math.min(progress + frameDt * 0.04, 0.95);
      drawLoading(overlay, "Loading…", progress);
      if (failed) hudText(overlay.g, "Couldn't load the 3D scene. Check your connection.", overlay.w / 2, overlay.h / 2 + 70, { size: 14, font: overlay.font.body, weight: 700, color: "#ff8a6b" });
      return;
    }
    for (const p of players) p.char.update(frameDt);
    for (const c of crowd) c.update(frameDt);
    pose(frameDt);
    place?.update(frameDt, stage.camera.position);

    // Side-on camera, close on the hands; further back on a tall phone screen.
    const portrait = clamp((1.3 - stage.camera.aspect) / 0.8, 0, 1);
    stage.camera.fov = 42 + 12 * portrait;
    stage.camera.updateProjectionMatrix();
    const jolt = shake * 0.02;
    const handY = meetY || 0.85;
    stage.camera.position.set(spot.x + 0.15 + Math.sin(now * 0.09) * jolt, handY + 0.75 + 0.1 * portrait, spot.z - 2.0 - 0.7 * portrait);
    stage.camera.lookAt(spot.x, handY + 0.08 + 0.02 * portrait, spot.z);
    stage.focusShadows(spot);
    stage.render();
    drawHud();
  }

  function drawHud() {
    const { g, w: W, h: H, font } = overlay;
    if (flash > 0) {
      g.fillStyle = `rgba(220,30,30,${0.35 * flash})`;
      g.fillRect(0, 0, W, H);
    }
    // Score: five hand marks each
    // Phones in portrait have the pause and sound buttons top-left: sit below them.
    const top = W < 600 ? 66 : 10;
    const row = (x: number, align: 1 | -1, name: string, pts: number, color: string) => {
      roundRect(g, align > 0 ? x - 6 : x - 112, top, 118, 54, 12);
      g.fillStyle = "rgba(12,16,14,0.72)";
      g.fill();
      hudText(g, name, x, top + 16, { size: 13, font: font.body, weight: 800, color, align: align > 0 ? "left" : "right", shadow: false });
      for (let i = 0; i < TARGET; i++) {
        const cx = x + align * (8 + i * 20);
        g.beginPath();
        g.arc(cx, top + 38, 7, 0, Math.PI * 2);
        g.fillStyle = i < pts ? color : "rgba(255,255,255,0.18)";
        g.fill();
      }
    };
    row(18, 1, "YOU", st.points[0], "#ffd166");
    row(W - 18, -1, OPPONENT.name.toUpperCase(), st.points[1], "#ff9f7a");

    // Whose turn
    const line = roleLine(m);
    if (line) hudText(g, line, W / 2, top + 82, { size: Math.min(16, W / 24), font: font.body, weight: 800, color: st.attacker === 0 ? "#ffd166" : "#7ec8ff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4 });

    // Countdown
    if (st.phase === "count") {
      const n = 3 - Math.floor((st.clock - st.phaseAt) / 0.5);
      const k = ((st.clock - st.phaseAt) % 0.5) / 0.5;
      hudText(g, String(clamp(n, 1, 3)), W / 2, H * 0.36, { size: 110 - k * 30, font: font.display, color: "#fff", stroke: "rgba(0,0,0,0.5)", alpha: 1 - k * 0.5 });
    }
    // Your strike window drains while you wait.
    if (st.phase === "open" && st.attacker === 0 && !st.strike) {
      const left = clamp(1 - (st.clock - st.phaseAt) / WINDOW, 0, 1);
      const bw = Math.min(220, W * 0.55);
      roundRect(g, W / 2 - bw / 2, top + 100, bw, 8, 4);
      g.fillStyle = "rgba(255,255,255,0.2)";
      g.fill();
      roundRect(g, W / 2 - bw / 2, top + 100, bw * left, 8, 4);
      g.fillStyle = left < 0.3 ? "#ff6b5a" : "#ffd166";
      g.fill();
    }
    if (banner) {
      const a = banner.age < 1.2 ? 1 : 1 - (banner.age - 1.2) / 0.4;
      const pop = 1 + Math.max(0, 0.25 - banner.age) * 1.5;
      hudText(g, banner.text, W / 2, H * 0.3, { size: Math.min(54, W / 8) * pop, font: font.display, color: banner.color, stroke: "rgba(0,0,0,0.55)", alpha: a });
      if (banner.sub) hudText(g, banner.sub, W / 2, H * 0.3 + 44, { size: Math.min(15, W / 26), font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4, alpha: a });
    }
    if (st.phase === "end" && endWait > 0.6) {
      hudText(g, st.won ? "YOU WIN!" : youGotHit(m) ? "RED HANDS!" : "YOU LOSE", W / 2, H * 0.45, { size: Math.min(56, W / 8), font: font.display, color: st.won ? "#ffd166" : "#ff8a6b", stroke: "rgba(0,0,0,0.5)" });
    }
  }

  const loop = createLoop(update, render);

  return {
    start() {
      loop.start();
    },
    setPaused(p) {
      loop.setPaused(p);
      music.setVolume(p ? 0 : 1);
    },
    setMusic(on) {
      music.setEnabled(on);
    },
    input(id, down) {
      if (!down) return;
      if (id === "act") act();
      else if (id === "fake") fake();
    },
    destroy() {
      disposed = true;
      loop.stop();
      unbind();
      music.dispose();
      place?.dispose();
      for (const p of players) p.char.dispose();
      for (const c of crowd) c.dispose();
      overlay.dispose();
      stage.dispose();
    },
  };
}
