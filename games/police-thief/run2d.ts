import type { EngineContext, GameEngine } from "@/games/types";
import { createLoop } from "@/games/core/loop";
import { context2d, fitCanvas, fonts } from "@/games/core/canvas";
import { clamp, hudText, roundRect } from "@/games/core/draw";
import { LOOKS, drawKid, neutralPose, type KidLook } from "@/games/core/kid";
import { OBSTACLES, RUN, SNACKS, laneX, type Obstacle } from "./run-rules";
import { createRun, type RunEvent } from "./run-sim";
import { createNaijaMusic } from "@/games/core/naija-music";
import { KIND_NAMES, bindRunKeys, runResult } from "./run-shared";

const POLICE_LOOK: KidLook = { ...LOOKS.brownShorts!, top: "#16191f", bottom: "#16191f", collar: "#16191f", socks: "#111", shoes: "#0b0b0b" };
const THIEF_LOOK: KidLook = { ...LOOKS.brownShorts!, top: "#e8762c", bottom: "#4b4f57" };
const PAINTS = ["#e2d6bd", "#c9d6dc", "#e8c9a0", "#d3dcc5", "#e9e4da", "#d9b9ad", "#f0dca8"];
const CAM_BACK = 5;
const CAM_H = 2.7;

/** Lightweight pseudo-3D street run for phones that can't do WebGL well. */
export function createPoliceRun2D(ctx: EngineContext): GameEngine {
  const g = context2d(ctx.canvas);
  const fit = fitCanvas(ctx.canvas, () => {});
  const vp = fit.vp;
  const font = fonts();
  const run = createRun(ctx.seed);
  const s = run.state;
  const unbind = bindRunKeys((a) => run.press(a));
  // Original Amapiano groove that builds as the chase heats up.
  const music = createNaijaMusic(ctx.sfx, "amapiano", { enabled: ctx.music });
  const popups: { text: string; color: string; age: number; size: number }[] = [];
  let ended = false;
  let shake = 0;
  let camX = 0;
  ctx.sfx.play("whistle", 0.8);

  const popup = (text: string, color = "#fff", size = 28) => popups.push({ text, color, age: 0, size });

  function handle(ev: RunEvent[]) {
    for (const e of ev) {
      if (e.type === "coin") ctx.sfx.play("pickup", 0.35);
      else if (e.type === "jump") ctx.sfx.play("tick", 0.5);
      else if (e.type === "go") {
        music.start();
        popup("OYA RUN!", "#ffd166", 54);
      }
      else if (e.type === "snack") {
        ctx.sfx.play("rescue", 0.6);
        popup(SNACKS[e.kind].rush ? "ENERGY RUSH!" : "SNATCHED!", SNACKS[e.kind].rush ? "#7ec8ff" : "#ffd166", 34);
      } else if (e.type === "tired") popup("Thief dey tire! Snatch food!", "#ff8a6b", 20);
      else if (e.type === "stumble") {
        ctx.sfx.play("whistle", 0.9);
        ctx.haptic([40, 30, 40]);
        shake = 0.5;
        popup("WAHALA!", "#ff8a6b", 34);
        popup(`You trip for the ${KIND_NAMES[e.kind]}`, "#fff", 18);
      } else if (e.type === "caught") {
        music.stop(1.5);
        ctx.sfx.play("caught", 0.9);
        ctx.haptic([80, 40, 160]);
        shake = 0.9;
      } else if (e.type === "near" && Math.random() < 0.6) ctx.sfx.play("horn", 0.4);
      else if (e.type === "milestone") popup(`${e.metres} m!`, "#7ee08a", 30);
    }
  }

  function update(dt: number) {
    handle(run.update(dt));
    music.setIntensity(Math.max(s.chase, (s.speed - 10) / 11, s.rush > 0 ? 1 : 0));
    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.4) popups.splice(i, 1);
    shake = Math.max(0, shake - dt * 1.6);
    camX += (s.x * 0.6 - camX) * Math.min(1, dt * 8);
    if (s.phase === "over" && !ended) {
      ended = true;
      ctx.onEnd(runResult(ctx, run));
    }
  }

  function render() {
    const W = vp.w;
    const H = vp.h;
    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    const horizon = H * 0.36;
    const f = H * 0.95;
    const camZ = s.dist - CAM_BACK;
    const proj = (x: number, y: number, z: number) => {
      const dz = Math.max(0.3, z - camZ);
      return { x: W / 2 + ((x - camX) * f) / dz, y: horizon + ((CAM_H - y) * f) / dz, k: f / dz };
    };
    if (shake > 0 && !ctx.reducedMotion) g.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 8);

    // Sky and haze.
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#8fb8d8");
    sky.addColorStop(1, "#e8dcc6");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, horizon + 2);

    // Shophouses on both sides, far to near.
    const BW = 11;
    const first = Math.floor(s.dist / BW) - 1;
    for (let i = first + 16; i >= first; i--) {
      const z0 = i * BW;
      for (const side of [-1, 1]) {
        const x = side * 8.3;
        const floors = 1 + ((i * 7 + (side > 0 ? 3 : 0)) % 3);
        const hgt = 3.5 + (floors - 1) * 3.1;
        const a = proj(x, 0, z0);
        const b = proj(x, hgt, z0 + BW - 0.6);
        const c = proj(x, hgt, z0);
        const d = proj(x, 0, z0 + BW - 0.6);
        g.fillStyle = PAINTS[(i * 3 + (side > 0 ? 1 : 0)) % PAINTS.length]!;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(c.x, c.y);
        g.lineTo(b.x, b.y);
        g.lineTo(d.x, d.y);
        g.closePath();
        g.fill();
        // Shop openings
        g.fillStyle = "rgba(30,24,18,0.75)";
        for (let k = 0; k < 3; k++) {
          const p = proj(x, 2.6, z0 + 1 + k * 3.4);
          const q = proj(x, 0, z0 + 3.2 + k * 3.4);
          g.fillRect(Math.min(p.x, q.x), p.y, Math.abs(q.x - p.x), q.y - p.y);
        }
      }
    }

    // Road, gutters and sidewalks.
    const near = s.dist - CAM_BACK + 0.5;
    const farZ = s.dist + 180;
    const quad = (x0: number, x1: number, color: string) => {
      const a = proj(x0, 0, near);
      const b = proj(x1, 0, near);
      const c = proj(x1, 0, farZ);
      const d = proj(x0, 0, farZ);
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(c.x, c.y);
      g.lineTo(d.x, d.y);
      g.closePath();
      g.fill();
    };
    quad(-8.3, 8.3, "#c9bfae");
    quad(-4.3, 4.3, "#2a2621");
    quad(-3.6, 3.6, "#4a4742");
    g.fillStyle = "rgba(235,230,215,0.55)";
    for (let z = Math.floor(near / 6) * 6; z < s.dist + 120; z += 6) {
      const z0 = Math.max(z, near);
      if (z + 3 <= z0) continue;
      for (const x of [-1.05, 1.05]) {
        const a = proj(x - 0.07, 0, z0);
        const b = proj(x + 0.07, 0, z0);
        const c = proj(x + 0.07, 0, z + 3);
        const d = proj(x - 0.07, 0, z + 3);
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.lineTo(c.x, c.y);
        g.lineTo(d.x, d.y);
        g.closePath();
        g.fill();
      }
    }

    // Everything on the road, far to near.
    type Item = { z: number; draw: () => void };
    const items: Item[] = [];
    for (const o of run.track.obstacles) {
      if (o.z > s.dist + 160) break;
      if (o.z + OBSTACLES[o.kind].len < camZ + 1) continue;
      items.push({ z: o.z, draw: () => drawObstacle(o) });
    }
    for (const c of run.track.coins) {
      if (c.z > s.dist + 120) break;
      if (c.taken || c.z < camZ + 1) continue;
      items.push({
        z: c.z,
        draw: () => {
          const p = proj(laneX(c.lane), c.y, c.z);
          g.fillStyle = "#f2b81c";
          g.beginPath();
          g.ellipse(p.x, p.y, p.k * 0.25 * Math.abs(Math.cos(performance.now() / 250 + c.id)) + 1, p.k * 0.25, 0, 0, Math.PI * 2);
          g.fill();
        },
      });
    }
    for (const k of run.track.snacks) {
      if (k.z > s.dist + 140) break;
      if (k.taken || k.z < camZ + 1) continue;
      items.push({
        z: k.z,
        draw: () => {
          const p = proj(laneX(k.lane), 1, k.z);
          g.fillStyle = k.kind === "roll" ? "#d4161c" : "#1446a0";
          const w = p.k * (k.kind === "roll" ? 0.6 : 0.3);
          const h = p.k * (k.kind === "roll" ? 0.25 : 0.7);
          roundRect(g, p.x - w / 2, p.y - h / 2, w, h, Math.min(w, h) / 3);
          g.fill();
          g.fillStyle = "#ffcf2e";
          g.fillRect(p.x - w / 2, p.y - h * 0.1, w, h * 0.2);
        },
      });
    }
    items.push({ z: s.dist, draw: drawRunner });
    if (s.chase > 0.05 || s.phase !== "run") {
      const gap = s.phase === "caught" || s.phase === "over" ? 0.9 : 15 - 13.2 * Math.pow(s.chase, 0.7);
      for (const side of [-0.75, 0.75]) items.push({ z: s.dist - gap, draw: () => drawPerson(s.x + side, s.dist - gap, POLICE_LOOK, 0) });
    }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();

    function drawObstacle(o: Obstacle) {
      const spec = OBSTACLES[o.kind];
      const x = spec.wide ? 0 : (o.x ?? laneX(o.lane));
      const hw = spec.wide ? 3.6 : spec.halfW;
      const front = proj(x - hw, 0, Math.max(o.z, camZ + 0.5));
      const frontR = proj(x + hw, 0, Math.max(o.z, camZ + 0.5));
      if (spec.clear === "hole") {
        const back = proj(x, 0, o.z + spec.len);
        g.fillStyle = "#1f1c16";
        g.beginPath();
        g.ellipse((front.x + frontR.x) / 2, (front.y + back.y) / 2, (frontR.x - front.x) / 2, Math.max(2, (front.y - back.y) / 2), 0, 0, Math.PI * 2);
        g.fill();
        return;
      }
      const yBottom = spec.clear === "slide" ? spec.h : 0;
      const yTop = spec.clear === "slide" ? spec.h + 0.8 : spec.h;
      const tl = proj(x - hw, yTop, o.z);
      const br = proj(x + hw, yBottom, o.z);
      if (o.kind === "hawker") {
        drawPerson(x, o.z, { ...THIEF_LOOK, top: "#7b1fa2", bottom: "#4a148c" }, 0);
        return;
      }
      const color: Record<string, string> = { brt: "#1f4fa3", danfo: "#f0b000", keke: "#e8b100", okada: "#b3121b", barrier: "#d62828", checkpoint: "#d62828", table: "#7a5636", generator: "#c0392b", cart: "#7a5636", pole: "#8a857b", banner: "#7b1fa2" };
      g.fillStyle = color[o.kind] ?? "#888";
      g.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      if (o.kind === "danfo") {
        g.fillStyle = "#1b2326";
        g.fillRect(tl.x + (br.x - tl.x) * 0.08, tl.y + (br.y - tl.y) * 0.12, (br.x - tl.x) * 0.84, (br.y - tl.y) * 0.3);
        g.fillStyle = "#111";
        g.fillRect(tl.x, tl.y + (br.y - tl.y) * 0.62, br.x - tl.x, (br.y - tl.y) * 0.06);
      } else if (o.kind === "barrier" || o.kind === "checkpoint") {
        g.fillStyle = "#f4f1ea";
        const n = o.kind === "checkpoint" ? 12 : 4;
        for (let k = 0; k < n; k += 2) g.fillRect(tl.x + ((br.x - tl.x) * k) / n, tl.y, (br.x - tl.x) / n, (br.y - tl.y) * 0.4);
      } else if (o.kind === "banner") {
        hudText(g, "OWAMBE TODAY!", (tl.x + br.x) / 2, (tl.y + br.y) / 2, { size: Math.max(6, (br.y - tl.y) * 0.45), font: font.display, color: "#ffd54f", shadow: false });
      }
    }

    function drawPerson(x: number, z: number, look: KidLook, lift: number, slide = 0) {
      const p = proj(x, lift, z);
      const scale = (p.k * 1.45) / 100;
      const pose = neutralPose("back");
      const t = performance.now() / 1000;
      const stride = s.phase === "run" || s.phase === "intro" ? Math.sin(t * (6 + s.speed * 0.5)) : 0;
      pose.footL = { x: 0, y: -Math.max(0, stride) * 14 };
      pose.footR = { x: 0, y: -Math.max(0, -stride) * 14 };
      pose.squash = slide * 0.5;
      g.save();
      g.translate(p.x, p.y);
      g.scale(1, 1 - slide * 0.45);
      drawKid(g, 0, 0, scale, look, pose);
      g.restore();
    }

    function drawRunner() {
      drawPerson(s.x, s.dist, THIEF_LOOK, s.y, s.slide > 0 && s.grounded ? 1 : 0);
    }

    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    drawHud(W, H);
  }

  function drawHud(W: number, H: number) {
    const st = run.stats();
    const time = performance.now() / 1000;
    if (s.chase > 0.05 && s.phase !== "over") {
      const a = Math.min(0.4, s.chase * 0.42);
      const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, Math.floor(time * 6) % 2 ? `rgba(40,110,255,${a})` : `rgba(255,40,50,${a})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    const pw = 160;
    roundRect(g, W - pw - 12, 12, pw, 70, 16);
    g.fillStyle = "rgba(10,14,12,0.72)";
    g.fill();
    hudText(g, (Math.floor(st.distance) + st.coins * 10).toLocaleString(), W - 26, 36, { size: 26, font: font.display, color: "#fff", align: "right", shadow: false });
    hudText(g, `₦ ${st.coins}`, W - pw, 62, { size: 15, font: font.display, color: "#ffd166", align: "left", shadow: false });
    hudText(g, `${Math.floor(st.distance)} m`, W - 26, 62, { size: 13, font: font.body, weight: 700, color: "rgba(255,255,255,0.75)", align: "right", shadow: false });
    const ew = Math.min(160, W * 0.36);
    roundRect(g, 12, 62, ew, 30, 12);
    g.fillStyle = "rgba(10,14,12,0.72)";
    g.fill();
    roundRect(g, 22, 74, (ew - 20) * s.energy + 2, 8, 4);
    g.fillStyle = s.rush > 0 ? "#7ec8ff" : s.energy < RUN.tired ? "#ff5d5d" : "#7ee08a";
    g.fill();
    if (s.phase === "intro" || (s.phase === "run" && s.runTime < 4.5)) {
      hudText(g, "Swipe ← → to dodge · ↑ jump · ↓ slide", W / 2, H - 50, { size: 14, font: font.body, weight: 700, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4 });
    }
    popups.forEach((p, i) => {
      hudText(g, p.text, W / 2, H * 0.28 + i * (p.size + 6) - p.age * 14, { size: p.size, font: font.display, color: p.color, stroke: "rgba(0,0,0,0.6)", alpha: p.age < 1 ? 1 : 1 - (p.age - 1) / 0.4 });
    });
    if (s.phase === "caught" || s.phase === "over") {
      hudText(g, "CAUGHT!", W / 2, H * 0.36, { size: 56, font: font.display, color: "#ff5d5d", stroke: "rgba(0,0,0,0.65)" });
      if (s.caughtBy) hudText(g, `You ran into the ${KIND_NAMES[s.caughtBy]}`, W / 2, H * 0.36 + 46, { size: 16, font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4, alpha: clamp((s.clock - s.caughtAt) * 2, 0, 1) });
    }
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
      if (down && (id === "left" || id === "right" || id === "jump" || id === "slide")) run.press(id);
    },
    destroy() {
      loop.stop();
      unbind();
      music.dispose();
      fit.dispose();
    },
  };
}
