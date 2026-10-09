import type { EngineContext, GameEngine } from "@/games/types";
import { fitCanvas, fonts, makeLayer } from "@/games/core/canvas";
import { createLoop } from "@/games/core/loop";
import { createRng, pick } from "@/games/core/rng";
import {
  clamp,
  drawPopups,
  hudText,
  roundRect,
  updatePopups,
  type Popup,
} from "@/games/core/draw";
import { MAP, SIM_MAP } from "./map";
import { drawTopKid, paintMap, type TopLook } from "./art";
import { HEAD_START, type Team } from "./rules";
import { createMatch, type Difficulty } from "./sim";
import { createChaseInput } from "./input";
import { createNaijaMusic } from "@/games/core/naija-music";

const SKINS = ["#5a3420", "#6b3f26", "#4e2c1a", "#7a4a2e"];
const SHIRTS = ["#e4572e", "#ffb703", "#8338ec", "#2a9d8f", "#ff6fae", "#3a86ff"];

/** 2D top-down renderer for the chase (used when 3D isn't available). */
export function createPoliceThiefEngine(ctx: EngineContext): GameEngine {
  const canvas = ctx.canvas;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas 2D is not supported on this device");
  const jailbreak = ctx.mode === "jailbreak";
  const role: Team = jailbreak ? "thief" : ((ctx.options.role as Team) ?? "thief");
  const match = createMatch(SIM_MAP, {
    role,
    difficulty: (ctx.options.difficulty as Difficulty) ?? "normal",
    jailbreak,
    seed: ctx.seed,
    playerName: ctx.playerName,
  });
  const { actors, human, pickups, state } = match;
  const thieves = match.thieves;
  const input = createChaseInput();
  const music = createNaijaMusic(ctx.sfx, "amapiano", { enabled: ctx.music });
  const looks = new Map<number, TopLook>();
  for (const a of actors) {
    const r = createRng(Math.floor(a.variant * 1e6));
    looks.set(a.id, { shirt: a.team === "police" ? "#24365c" : a.human ? "#1fa463" : pick(r, SHIRTS), skin: pick(r, SKINS), hair: "#15100c", police: a.team === "police", spiky: r() < 0.4 });
  }

  let font = fonts();
  let mapLayer: HTMLCanvasElement | null = null;
  let mapLayerScale = 1;
  let zoom = 1;
  const cam = { x: MAP.w / 2, y: MAP.h / 2 };
  const { vp, dispose: disposeFit } = fitCanvas(canvas, (v) => {
    zoom = clamp(Math.max(v.w, v.h) / 900, 0.72, 1.5);
    const wantScale = Math.min(2, zoom * v.dpr);
    if (!mapLayer || Math.abs(wantScale - mapLayerScale) > 0.2) mapLayer = null;
  });

  let ended = false;
  const popups: Popup[] = [];
  let message: { text: string; until: number } | null = null;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const worldPopup = (text: string, x: number, y: number, color: string, size = 18) => popups.push({ text, x, y, color, age: 0, life: 1.2, size });

  function update(dt: number) {
    updatePopups(popups, dt);
    const events = match.update(dt, { dir: input.dir(), sprint: input.sprint() });
    for (const e of events) {
      switch (e.type) {
        case "countdown":
          ctx.sfx.play("countdown");
          break;
        case "start":
          ctx.sfx.play("whistle");
          break;
        case "tick":
          ctx.sfx.play("tick", 1);
          break;
        case "caught":
          ctx.sfx.play("whistle", 0.8);
          ctx.sfx.play("caught");
          worldPopup("CAUGHT!", e.thief.x, e.thief.y - 30, "#ff8a6b", 20);
          if (e.by.human) ctx.haptic([20, 30, 20]);
          if (e.thief.human) {
            ctx.haptic(80);
            message = { text: "Caught! Wait for a teammate to free you", until: state.clock + 3.5 };
          }
          break;
        case "rescue":
          ctx.sfx.play("rescue");
          worldPopup(e.freed.length > 1 ? `JAILBREAK ×${e.freed.length}!` : "JAILBREAK!", match.jailCenter.x, MAP.jail.y - 16, "#7ee08a", 22);
          if (e.rescuer.human) ctx.haptic([15, 30, 15, 30, 15]);
          if (e.freed.some((t) => t.human)) message = { text: "You're free! Run!", until: state.clock + 2 };
          break;
        case "pickup":
          ctx.sfx.play("pickup");
          worldPopup(e.pickup.kind === "puff" ? "Puff-puff! Speed up" : "Pure water! Energy full", e.pickup.x, e.pickup.y - 20, e.pickup.kind === "puff" ? "#ffd166" : "#7ec8ff");
          break;
        case "end":
          ctx.sfx.play(e.winner === role ? "win" : "lose");
          ctx.sfx.play("whistle");
          break;
      }
    }
    if (state.phase === "play") music.start();
    else if (state.phase === "end") music.stop(2);
    if (state.phase === "end" && state.clock - state.endAt > 1.8) finish();
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

  function buildMap() {
    mapLayerScale = Math.min(2, zoom * vp.dpr);
    const layer = makeLayer(MAP.w * mapLayerScale, MAP.h * mapLayerScale);
    layer.ctx.scale(mapLayerScale, mapLayerScale);
    paintMap(layer.ctx, createRng(1234), MAP, font.display);
    mapLayer = layer.canvas;
  }

  function render() {
    if (!g) return;
    if (!mapLayer) {
      font = fonts();
      buildMap();
    }
    const W = vp.w;
    const H = vp.h;
    // Camera follows the player, clamped to the map.
    const viewW = W / zoom;
    const viewH = H / zoom;
    const tx = viewW >= MAP.w ? MAP.w / 2 : clamp(human.x, viewW / 2, MAP.w - viewW / 2);
    const ty = viewH >= MAP.h ? MAP.h / 2 : clamp(human.y, viewH / 2, MAP.h - viewH / 2);
    cam.x += (tx - cam.x) * 0.12;
    cam.y += (ty - cam.y) * 0.12;

    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    g.fillStyle = "#2a1a10";
    g.fillRect(0, 0, W, H);
    const ox = W / 2 - cam.x * zoom;
    const oy = H / 2 - cam.y * zoom;
    g.setTransform(vp.dpr * zoom, 0, 0, vp.dpr * zoom, vp.dpr * ox, vp.dpr * oy);
    if (mapLayer) g.drawImage(mapLayer, 0, 0, MAP.w, MAP.h);

    // Pickups
    for (const p of pickups) {
      const bob = ctx.reducedMotion ? 0 : Math.sin(p.age * 5) * 2;
      const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 22);
      glow.addColorStop(0, p.kind === "puff" ? "rgba(255,209,102,0.55)" : "rgba(126,200,255,0.55)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow;
      g.fillRect(p.x - 22, p.y - 22, 44, 44);
      if (p.kind === "puff") {
        for (const [dx, dy] of [[-5, 2], [5, 2], [0, -5]] as const) {
          const gr = g.createRadialGradient(p.x + dx - 2, p.y + dy - 2 + bob, 1, p.x + dx, p.y + dy + bob, 6);
          gr.addColorStop(0, "#e9a54d");
          gr.addColorStop(1, "#8a4a14");
          g.fillStyle = gr;
          g.beginPath();
          g.arc(p.x + dx, p.y + dy + bob, 6, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.fillStyle = "rgba(220,240,255,0.92)";
        roundRect(g, p.x - 9, p.y - 7 + bob, 18, 14, 4);
        g.fill();
        g.fillStyle = "#2a7fd0";
        g.fillRect(p.x - 6, p.y - 2 + bob, 12, 4);
      }
    }

    // Actors, sorted by y for overlap
    const sorted = [...actors].sort((a, b) => a.y - b.y);
    for (const a of sorted) {
      let alpha = 1;
      if (a.hidden && !a.human) {
        // Hidden thieves: teammates see a ghost, police only see rustling up close.
        if (role === "thief") alpha = 0.45;
        else alpha = dist(a, human) < 110 ? 0.3 : 0;
      }
      if (a.hidden && a.human) alpha = 0.6;
      if (alpha <= 0) continue;
      if (a.immuneFor > 0 && Math.floor(state.clock * 10) % 2 === 0) alpha *= 0.5;
      // Team ring
      g.globalAlpha = alpha;
      g.strokeStyle = a.human ? "#ffd166" : a.team === "police" ? "rgba(126,200,255,0.8)" : "rgba(255,159,122,0.8)";
      g.lineWidth = a.human ? 3 : 2;
      g.beginPath();
      g.ellipse(a.x, a.y + 3, 18, 15, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
      drawTopKid(g, a.x, a.y, a.facing, a.walk, looks.get(a.id)!, alpha * (a.jailed ? 0.85 : 1));
      if (a.sprinting && !ctx.reducedMotion && Math.hypot(a.vx, a.vy) > 120) {
        g.fillStyle = "rgba(230,190,150,0.35)";
        g.beginPath();
        g.arc(a.x - a.vx * 0.08, a.y - a.vy * 0.08 + 6, 5, 0, Math.PI * 2);
        g.fill();
      }
      if (a.human || a.jailed) {
        hudText(g, a.human ? "YOU" : a.name, a.x, a.y - 26, {
          size: a.human ? 12 : 10,
          font: font.body,
          weight: 800,
          color: a.human ? "#ffd166" : "#fff",
          stroke: "rgba(0,0,0,0.6)",
          strokeWidth: 3,
          alpha,
        });
      }
    }
    drawPopups(g, popups, font.display, ctx.reducedMotion);

    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    drawHud(W, H);
  }

  function drawHud(W: number, H: number) {
    if (!g) return;
    // Timer
    const t = Math.ceil(state.timeLeft);
    const timeText = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
    roundRect(g, W / 2 - 52, 12, 104, 44, 14);
    g.fillStyle = t <= 10 && state.phase === "play" ? "rgba(140,30,20,0.85)" : "rgba(12,16,14,0.78)";
    g.fill();
    hudText(g, timeText, W / 2, 35, { size: 26, font: font.display, color: "#fff", shadow: false });
    // Thief status pips
    const ts = thieves();
    const pipW = 18;
    const startX = W / 2 - (ts.length * (pipW + 4)) / 2;
    ts.forEach((th, i) => {
      const x = startX + i * (pipW + 4);
      g.fillStyle = th.jailed ? "rgba(255,255,255,0.18)" : th.human ? "#ffd166" : "#ff9f7a";
      roundRect(g, x, 62, pipW, 8, 4);
      g.fill();
    });
    if (state.clock < HEAD_START + 6) hudText(g, role === "thief" ? "Stay free till time runs out" : "Catch every thief", W / 2, 88, {
      size: 12,
      font: font.body,
      weight: 700,
      color: "rgba(255,255,255,0.85)",
      stroke: "rgba(0,0,0,0.5)",
      strokeWidth: 3,
    });

    // Energy bar (top-left, under pause)
    const bx = 14;
    const by = 64;
    roundRect(g, bx, by, 120, 30, 10);
    g.fillStyle = "rgba(12,16,14,0.72)";
    g.fill();
    hudText(g, human.boostFor > 0 ? "BOOST" : "ENERGY", bx + 10, by + 15, { size: 10, font: font.body, weight: 800, color: human.boostFor > 0 ? "#ffd166" : "rgba(255,255,255,0.7)", align: "left", shadow: false });
    roundRect(g, bx + 58, by + 11, 52, 8, 4);
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.fill();
    roundRect(g, bx + 58, by + 11, 52 * (human.stamina / 100), 8, 4);
    g.fillStyle = human.exhausted ? "#ff6b5a" : "#7ee08a";
    g.fill();

    drawMinimap(W);

    if (state.phase === "intro") {
      const n = HEAD_START - Math.floor(state.clock);
      g.fillStyle = "rgba(10,14,12,0.35)";
      g.fillRect(0, 0, W, H);
      hudText(g, String(Math.max(1, n)), W / 2, H * 0.42, { size: 96, font: font.display, color: "#fff", stroke: "rgba(0,0,0,0.5)" });
      hudText(g, role === "thief" ? "Police are counting… RUN and HIDE!" : "Count to 3… then catch them all!", W / 2, H * 0.42 + 70, {
        size: 17,
        font: font.display,
        color: "#ffd166",
        stroke: "rgba(0,0,0,0.5)",
        strokeWidth: 4,
      });
    }
    if (message && state.clock < message.until) {
      hudText(g, message.text, W / 2, H * 0.3, { size: Math.min(16, W / 26), font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4 });
    }
    if (state.phase === "end") {
      const won = state.winner === role;
      g.fillStyle = "rgba(10,14,12,0.4)";
      g.fillRect(0, 0, W, H);
      hudText(g, won ? "YOU WIN!" : "GAME OVER", W / 2, H * 0.42, { size: 54, font: font.display, color: won ? "#ffd166" : "#ff8a6b", stroke: "rgba(0,0,0,0.5)" });
    }
  }

  function drawMinimap(W: number) {
    if (!g) return;
    const mw = Math.min(130, W * 0.24);
    const s = mw / MAP.w;
    const mh = MAP.h * s;
    const x0 = W - mw - 12;
    const y0 = 12;
    roundRect(g, x0 - 4, y0 - 4, mw + 8, mh + 8, 10);
    g.fillStyle = "rgba(12,16,14,0.72)";
    g.fill();
    g.fillStyle = "rgba(194,116,71,0.55)";
    g.fillRect(x0, y0, mw, mh);
    g.fillStyle = "rgba(60,30,15,0.85)";
    for (const b of [...MAP.buildings, ...MAP.lowWalls]) g.fillRect(x0 + b.x * s, y0 + b.y * s, Math.max(1.5, b.w * s), Math.max(1.5, b.h * s));
    g.fillStyle = "rgba(40,90,40,0.85)";
    for (const b of MAP.bushes) g.fillRect(x0 + b.x * s, y0 + b.y * s, b.w * s, b.h * s);
    g.strokeStyle = "rgba(255,255,255,0.8)";
    g.lineWidth = 1;
    g.strokeRect(x0 + MAP.jail.x * s, y0 + MAP.jail.y * s, MAP.jail.w * s, MAP.jail.h * s);
    for (const a of actors) {
      if (a.hidden && !a.human && role === "police") continue;
      g.fillStyle = a.human ? "#ffd166" : a.team === "police" ? "#7ec8ff" : "#ff9f7a";
      g.beginPath();
      g.arc(x0 + a.x * s, y0 + a.y * s, a.human ? 3 : 2.2, 0, Math.PI * 2);
      g.fill();
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
      music.setVolume(p ? 0 : 1);
    },
    setMusic(on) {
      music.setEnabled(on);
    },
    input(id, down) {
      if (id === "sprint") input.setSprint(down);
    },
    axis(x, y) {
      input.setAxis(x, y);
    },
    destroy() {
      loop.stop();
      music.dispose();
      disposeFit();
      input.dispose();
    },
  };
}
