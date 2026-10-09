import type { EngineContext, GameEngine } from "@/games/types";
import { fitCanvas, fonts, makeLayer } from "@/games/core/canvas";
import { createLoop } from "@/games/core/loop";
import { createRng } from "@/games/core/rng";
import { paintBackdrop, rainOverlay, type Arena } from "@/games/core/scenery";
import { drawKid, LOOKS, neutralPose, type KidLook, type KidPose } from "@/games/core/kid";
import {
  chalkLine,
  chalkText,
  clamp,
  drawParticles,
  drawPopups,
  dustPuff,
  easeOutCubic,
  shadowEllipse,
  updateParticles,
  updatePopups,
  type Particle,
  type Popup,
} from "@/games/core/draw";
import type { Difficulty } from "./ai";
import { createTenTenMatch, type TenTenEvent } from "./match";
import { drawTenTenHud, JUDGE_STYLE, judgeLabel } from "./hud";
import type { Player, Side } from "./rules";
import { bindTenTenKeys } from "./keys";
import { createMusicSync, createTenTenMusic } from "./music";

interface Layout {
  horizon: number;
  sP: number;
  sO: number;
  px: number;
  pFeet: number;
  ox: number;
  oFeet: number;
}

/** 3D place/time choices map onto the painted 2D backdrops. */
function arena2d(options: Record<string, string>): Arena {
  if (options.time === "rainy" || options.arena === "rainy") return "rainy";
  if (options.place === "school" || options.arena === "school" || options.arena === "evening") return "school";
  return "compound";
}

/** Lightweight 2D Ten-Ten renderer (fallback when 3D isn't available). */
export function createTenTenEngine(ctx: EngineContext): GameEngine {
  const canvas = ctx.canvas;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas 2D is not supported on this device");

  const m = createTenTenMatch({ mode: ctx.mode, difficulty: (ctx.options.difficulty as Difficulty) ?? "normal", seed: ctx.seed, playerName: ctx.playerName });
  const s = m.state;
  const music = createTenTenMusic(ctx.sfx);
  let musicOn = ctx.music;
  music.preload();
  const musicSync = createMusicSync(music, m);
  const arena = arena2d(ctx.options);
  const rng = createRng(ctx.seed);
  const looks: [KidLook, KidLook] = [LOOKS.greenPinafore!, rng() < 0.5 ? LOOKS.bluePinafore! : LOOKS.maroonPinafore!];

  let font = fonts();
  let bg: HTMLCanvasElement | null = null;
  let L: Layout = computeLayout(1, 1);
  const { vp, dispose: disposeFit } = fitCanvas(canvas, (v) => {
    bg = null;
    L = computeLayout(v.w, v.h);
  });
  const popups: Popup[] = [];
  const particles: Particle[] = [];
  let lastEarly = -10;

  function computeLayout(w: number, h: number): Layout {
    const sP = clamp(Math.min(h / 240, w / 150), 1.1, 3.6);
    const spread = Math.min(w * 0.27, h * 0.26);
    return { horizon: h * 0.37, sP, sO: sP * 0.74, px: w / 2 - spread * 0.92, pFeet: h * 0.93, ox: w / 2 + spread * 0.82, oFeet: h * 0.665 };
  }

  function footPoint(player: Player, side: Side) {
    const sc = player === 0 ? L.sP : L.sO;
    const x = player === 0 ? L.px : L.ox;
    const y = player === 0 ? L.pFeet : L.oFeet;
    return { x: x + (side === "L" ? -24 : 24) * sc, y };
  }

  function handle(events: TenTenEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case "countdown":
          ctx.sfx.play("countdown");
          break;
        case "go":
          ctx.sfx.play("go");
          break;
        case "beat":
          // The band plays the claps, perfectly on the beat.
          break;
        case "stomp": {
          ctx.sfx.play("stomp", 0.7);
          if (e.player === 0 || m.local) ctx.haptic(12);
          const f = footPoint(e.player, e.side);
          dustPuff(particles, f.x, f.y, (e.player === 0 ? L.sP : L.sO) * 0.6, arena === "compound" ? "#b9b2a5" : "#d29a72", 8);
          break;
        }
        case "early":
          ctx.sfx.play("tick", 0.5);
          if (s.clock - lastEarly > 0.8) popups.push({ text: "Wait for THROW", x: vp.w / 2, y: vp.h * 0.5, color: "#f4f1ea", age: 0, life: 0.8, size: 18 });
          lastEarly = s.clock;
          break;
        case "resolve": {
          const show = (p: Player) => {
            const j = e.judgements[p];
            const x = p === 0 ? L.px : L.ox;
            const y = p === 0 ? L.pFeet - 112 * L.sP : L.oFeet - 120 * L.sO;
            popups.push({ text: judgeLabel(j, e.sides[p], e.offsets[p]), x, y, color: JUDGE_STYLE[j].color, age: 0, life: 1, size: p === 0 ? 26 : 20 });
          };
          show(0);
          if (m.local || e.judgements[1] === "miss") show(1);
          if (e.judgements[0] === "perfect") ctx.sfx.play("perfect", 0.8);
          if (e.winner === null) popups.push({ text: "Both fouled. Again!", x: vp.w / 2, y: vp.h * 0.47, color: "#f4f1ea", age: 0, life: 1.1, size: 22 });
          else {
            ctx.sfx.play(e.winner === 0 || m.local ? "point" : "lose", 0.9);
            if (e.winner === 0) ctx.haptic([18, 40, 18]);
            popups.push({ text: `+1 ${m.names[e.winner].toUpperCase()}`, x: vp.w / 2, y: vp.h * 0.47, color: e.winner === 0 ? "#7ee08a" : m.local ? "#7ec8ff" : "#ff8a6b", age: 0, life: 1.1, size: 30 });
          }
          if (e.switched) popups.push({ text: "SWITCH!", x: vp.w / 2, y: vp.h * 0.4, color: "#ffd166", age: 0, life: 1, size: 22 });
          break;
        }
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
    updatePopups(popups, dt);
    updateParticles(particles, dt);
    handle(m.update(dt));
    if (musicOn) musicSync.update();
  }

  function poseFor(player: Player): KidPose {
    const pose = neutralPose(player === 0 ? "back" : "front");
    if (s.phase === "intro") {
      pose.clap = 0.2;
      return pose;
    }
    if (s.phase === "end") {
      const won = s.points[player] >= m.target;
      const t = s.clock - s.endAt;
      pose.cheer = won ? clamp(t * 3, 0, 1) : 0;
      pose.lift = won && !ctx.reducedMotion ? Math.abs(Math.sin(t * 6)) * 10 : 0;
      pose.mood = won ? 1 : -1;
      return pose;
    }
    const u = m.barPos();
    const bump = (d: number) => clamp(1 - Math.abs(d) / 0.38, 0, 1);
    pose.clap = Math.max(bump(u), bump(u - 1));
    if (u > 1.55 && u < 3) {
      const t = (u - 1.55) / 1.45;
      pose.lift = Math.sin(t * Math.PI) * 15;
      pose.footL.y = pose.footR.y = -Math.sin(t * Math.PI) * 3;
      pose.clap = Math.max(pose.clap, 0.15);
    }
    if (u >= 3 && u < 3.18) pose.squash = 1 - (u - 3) / 0.18;
    const side = s.pending.revealed[player] ? s.pending.sides[player] : null;
    const at = m.pressedAt(player);
    if (side && at !== null) {
      const t = easeOutCubic((s.clock - at) / 0.045);
      const lift = u < 3 ? -4 : 0;
      if (side === "L") {
        pose.footL.x = -17 * t;
        pose.footL.y = -3 * t + lift;
      } else {
        pose.footR.x = 17 * t;
        pose.footR.y = -3 * t + lift;
      }
    }
    if (s.lastOutcome && s.clock - s.lastOutcome.at < s.beat * 1.2) {
      pose.mood = s.lastOutcome.winner === player ? 1 : s.lastOutcome.winner === null ? 0 : -1;
    }
    return pose;
  }

  function buildBackground() {
    const layer = makeLayer(vp.w * vp.dpr, vp.h * vp.dpr);
    const c = layer.ctx;
    c.scale(vp.dpr, vp.dpr);
    paintBackdrop(c, createRng(ctx.seed ^ 0x51ed), vp.w, vp.h, L.horizon, arena, font.display);
    const chalkRng = createRng(7);
    const cx = (L.px + L.ox) / 2;
    const cy = (L.pFeet + L.oFeet) / 2;
    const rx = (L.ox - L.px) * 0.95 + 40 * L.sP;
    const ry = (L.pFeet - L.oFeet) * 0.85;
    c.save();
    c.translate(cx, cy);
    c.scale(1, ry / rx);
    for (let i = 0; i < 48; i++) {
      const a0 = (i / 48) * Math.PI * 2;
      const a1 = ((i + 1) / 48) * Math.PI * 2;
      chalkLine(c, chalkRng, Math.cos(a0) * rx, Math.sin(a0) * rx, Math.cos(a1) * rx, Math.sin(a1) * rx, 3.2 * (rx / ry) ** 0.2);
    }
    c.restore();
    for (const player of [0, 1] as Player[]) {
      for (const side of ["L", "R"] as Side[]) {
        const p = footPoint(player, side);
        const sc = player === 0 ? L.sP : L.sO;
        const w = 19 * sc;
        const h = 8 * sc;
        chalkLine(c, chalkRng, p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y - h / 2, 1.6 * sc * 0.9);
        chalkLine(c, chalkRng, p.x + w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2, 1.6 * sc * 0.9);
        chalkLine(c, chalkRng, p.x + w / 2, p.y + h / 2, p.x - w / 2, p.y + h / 2, 1.6 * sc * 0.9);
        chalkLine(c, chalkRng, p.x - w / 2, p.y + h / 2, p.x - w / 2, p.y - h / 2, 1.6 * sc * 0.9);
        chalkText(c, chalkRng, side === "L" ? "LEFT" : "RIGHT", p.x, p.y + h * 0.95, Math.max(10, 6 * sc), font.display);
      }
    }
    bg = layer.canvas;
  }

  function padGlow(player: Player, side: Side, color: string) {
    if (!g) return;
    const p = footPoint(player, side);
    const sc = player === 0 ? L.sP : L.sO;
    g.save();
    g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16 * sc);
    gr.addColorStop(0, color);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(p.x, p.y, 16 * sc, 7 * sc, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function render() {
    if (!g) return;
    if (!bg) {
      font = fonts();
      buildBackground();
    }
    const W = vp.w;
    const H = vp.h;
    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    if (bg) g.drawImage(bg, 0, 0, W, H);
    const p = s.pending;
    const p0 = p.revealed[0] ? p.sides[0] : null;
    const p1 = p.revealed[1] ? p.sides[1] : null;
    if (p0) padGlow(0, p0, "rgba(255,209,102,0.55)");
    if (p1) padGlow(1, p1, "rgba(126,200,255,0.5)");
    if (p0 && p1) {
      const a = footPoint(0, p0);
      const b = footPoint(1, p1);
      g.save();
      g.strokeStyle = p0 === p1 ? "rgba(126,224,138,0.9)" : "rgba(255,107,90,0.85)";
      g.lineWidth = 3;
      g.setLineDash([8, 6]);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.restore();
    }
    const oPose = poseFor(1);
    const pPose = poseFor(0);
    shadowEllipse(g, L.ox, L.oFeet + 2, 20 * L.sO * (1 - oPose.lift / 60), 6 * L.sO);
    drawKid(g, L.ox, L.oFeet, L.sO, looks[1], oPose);
    shadowEllipse(g, L.px, L.pFeet + 2, 20 * L.sP * (1 - pPose.lift / 60), 6 * L.sP);
    drawKid(g, L.px, L.pFeet, L.sP, looks[0], pPose);
    drawParticles(g, particles);
    if (arena === "rainy") rainOverlay(g, W, H, ctx.reducedMotion ? 0 : s.clock, 1);
    if (s.phase === "intro") {
      g.fillStyle = "rgba(10,14,12,0.35)";
      g.fillRect(0, 0, W, H);
    }
    drawTenTenHud(g, W, H, m, font, { reducedMotion: ctx.reducedMotion, cueY: L.horizon + (L.oFeet - L.horizon) * 0.1, coachY: H * 0.55 });
    drawPopups(g, popups, font.display, ctx.reducedMotion);
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
      music.setVolume(p ? 0 : 1);
      if (p) musicSync.reset();
    },
    input(id, down) {
      if (!down) return;
      if (id === "p1L") handle(m.press(0, "L"));
      else if (id === "p1R") handle(m.press(0, "R"));
      else if (id === "p2L") handle(m.press(1, "L"));
      else if (id === "p2R") handle(m.press(1, "R"));
    },
    destroy() {
      loop.stop();
      disposeFit();
      unbind();
    },
  };
}
