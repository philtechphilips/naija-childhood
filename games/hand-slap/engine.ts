import type { EngineContext, GameEngine } from "@/games/types";
import { context2d, fitCanvas, fonts } from "@/games/core/canvas";
import { createLoop } from "@/games/core/loop";
import { clamp, hudText, roundRect } from "@/games/core/draw";
import { createNaijaMusic } from "@/games/core/naija-music";
import { createCountVoice } from "@/games/skipping/shared";
import { FEINT, TARGET, WINDOW } from "./rules";
import type { SlapEvent } from "./match";
import { OPPONENT, bindSlapKeys, buildSlapResult, roleLine, slapText, startSlapMatch } from "./shared";

/** Lightweight backhand slap: four hands seen from above, yours at the bottom. */
export function createHandSlapEngine(ctx: EngineContext): GameEngine {
  const g = context2d(ctx.canvas);
  const fit = fitCanvas(ctx.canvas, () => {});
  const vp = fit.vp;
  const font = fonts();
  const music = createNaijaMusic(ctx.sfx, "afrobeats", { enabled: ctx.music });
  const voice = createCountVoice(ctx.sfx);
  voice.preload();
  const { m } = startSlapMatch(ctx);
  const { st } = m;
  const act = () => handle(m.press("act"));
  const fake = () => handle(m.press("fake"));
  const unbind = bindSlapKeys(act, fake);
  let banner: { text: string; color: string; sub?: string; age: number } | null = null;
  let flash = 0;
  let ended = false;
  let endWait = 0;

  function handle(ev: SlapEvent[]) {
    for (const e of ev) {
      const t = slapText(e);
      if (t) banner = { ...t, age: 0 };
      if (e.type === "count") voice.count(e.n);
      else if (e.type === "go") {
        ctx.sfx.play("go", 0.6);
        music.start();
      } else if (e.type === "slap") {
        ctx.sfx.play("clap", 1);
        if (e.by === 1) {
          flash = 1;
          ctx.haptic([40, 30, 60]);
        }
      } else if (e.type === "dodge") ctx.sfx.play(e.by === 0 ? "perfect" : "miss", 0.8);
      else if (e.type === "feint") ctx.sfx.play("tick", 0.25);
      else if (e.type === "end") {
        ctx.sfx.play(e.won ? "win" : "lose");
        music.stop(2);
      }
    }
  }
  handle(m.pending);

  function update(dt: number) {
    handle(m.update(dt));
    if (banner && (banner.age += dt) > 1.6) banner = null;
    flash = Math.max(0, flash - dt * 2.5);
    if (st.phase === "end" && (endWait += dt) > 2.6 && !ended) {
      ended = true;
      ctx.onEnd(buildSlapResult(ctx, m));
    }
  }

  /** One hand from above: palm (light) or back (skin), fingers pointing along `dir`. */
  function hand(x: number, y: number, s: number, dir: 1 | -1, back: boolean, red: number) {
    g.save();
    g.translate(x, y);
    g.scale(s, s * dir);
    // Backs of hands go redder with every slap they take.
    const skin = back ? `rgb(${Math.round(138 + red * 90)},${Math.round(92 - red * 45)},${Math.round(62 - red * 30)})` : "#c98d6a";
    g.fillStyle = skin;
    roundRect(g, -22, -10, 44, 46, 16);
    g.fill();
    for (let i = 0; i < 4; i++) {
      roundRect(g, -20 + i * 11, -44, 9, 40, 5);
      g.fill();
    }
    roundRect(g, 18, -2, 10, 26, 5);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.12)";
    roundRect(g, -14, 34, 28, 30, 8);
    g.fill();
    g.restore();
  }

  function render() {
    const W = vp.w;
    const H = vp.h;
    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    g.fillStyle = "#b5643c";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i < 40; i++) g.fillRect((i * 97) % W, (i * 53) % H, 3, 3);

    const t = st.clock;
    const s = Math.min(W, H) / 260;
    const cy = H * 0.5;
    const gapX = 34 * s;
    const strike = st.strike;
    // Vertical offset of each player's hands toward the middle (positive = towards the other).
    let youOff = 0;
    let cpuOff = 0;
    let youOver = st.attacker === 1;
    let cpuOver = st.attacker === 0;
    const att = st.attacker;
    let aOff = 0;
    if (strike) {
      const u = t - strike.at;
      aOff = u < strike.windup ? -10 * (u / strike.windup) : -10 + 40 * clamp((u - strike.windup) / strike.travel, 0, 1);
      if (u > strike.windup + strike.travel * 0.5) {
        if (att === 0) youOver = true;
        else cpuOver = true;
      }
    } else if (st.feint && st.feint.by === att) aOff = -10 * Math.sin(Math.PI * clamp((t - st.feint.at) / FEINT.dur, 0, 1));
    const dOff = st.pulledAt !== null && t >= st.pulledAt ? -60 * clamp((t - st.pulledAt) / 0.1, 0, 1) : 0;
    if (att === 0) {
      youOff = aOff;
      cpuOff = dOff;
    } else {
      cpuOff = aOff;
      youOff = dOff;
    }
    const drawPair = (who: 0 | 1, over: boolean) => {
      const dir = who === 0 ? 1 : -1;
      const off = who === 0 ? youOff : cpuOff;
      const y = cy + dir * (36 * s - off * s);
      const red = (who === 0 ? st.points[1] : st.points[0]) / TARGET;
      for (const side of [-1, 1]) hand(W / 2 + side * gapX, y + (over ? 0 : 0), s, dir as 1 | -1, over, red);
    };
    // Whoever's hands are on top is drawn last.
    if (youOver) {
      drawPair(1, cpuOver);
      drawPair(0, true);
    } else {
      drawPair(0, false);
      drawPair(1, true);
    }
    hudText(g, OPPONENT.name, W / 2, cy - 150 * s, { size: 13, font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.5)", strokeWidth: 3 });

    if (flash > 0) {
      g.fillStyle = `rgba(220,30,30,${0.35 * flash})`;
      g.fillRect(0, 0, W, H);
    }
    const row = (x: number, align: 1 | -1, name: string, pts: number, color: string) => {
      hudText(g, name, x, 26, { size: 13, font: font.body, weight: 800, color, align: align > 0 ? "left" : "right", shadow: false });
      for (let i = 0; i < TARGET; i++) {
        g.beginPath();
        g.arc(x + align * (8 + i * 20), 50, 7, 0, Math.PI * 2);
        g.fillStyle = i < pts ? color : "rgba(255,255,255,0.25)";
        g.fill();
      }
    };
    row(16, 1, "YOU", st.points[0], "#ffd166");
    row(W - 16, -1, OPPONENT.name.toUpperCase(), st.points[1], "#ffe0d0");
    const line = roleLine(m);
    if (line) hudText(g, line, W / 2, 92, { size: Math.min(16, W / 24), font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.5)", strokeWidth: 4 });
    if (st.phase === "count") {
      const n = 3 - Math.floor((t - st.phaseAt) / 0.5);
      hudText(g, String(clamp(n, 1, 3)), W / 2, cy, { size: 96, font: font.display, color: "#fff", stroke: "rgba(0,0,0,0.5)" });
    }
    if (st.phase === "open" && st.attacker === 0 && !strike) {
      const left = clamp(1 - (t - st.phaseAt) / WINDOW, 0, 1);
      const bw = Math.min(220, W * 0.55);
      roundRect(g, W / 2 - bw / 2, 112, bw * left, 8, 4);
      g.fillStyle = left < 0.3 ? "#ff6b5a" : "#ffd166";
      g.fill();
    }
    if (banner) {
      const a = banner.age < 1.2 ? 1 : 1 - (banner.age - 1.2) / 0.4;
      hudText(g, banner.text, W / 2, H * 0.24, { size: Math.min(50, W / 8), font: font.display, color: banner.color, stroke: "rgba(0,0,0,0.55)", alpha: a });
      if (banner.sub) hudText(g, banner.sub, W / 2, H * 0.24 + 40, { size: Math.min(15, W / 26), font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4, alpha: a });
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
      loop.stop();
      unbind();
      music.dispose();
      fit.dispose();
    },
  };
}
