import type { EngineContext, GameEngine } from "@/games/types";
import { context2d, fitCanvas, fonts } from "@/games/core/canvas";
import { createLoop } from "@/games/core/loop";
import { hudText, roundRect } from "@/games/core/draw";
import { createNaijaMusic } from "@/games/core/naija-music";
import { createChaseInput } from "@/games/police-thief/input";
import { createCountVoice } from "@/games/skipping/shared";
import { BASE, SOLIDS, SPOT_R, SPOTS, YARD, spotAt } from "./rules";
import type { HideSeekEvent } from "./sim";
import { bindActionKey, buildResult, eventText, hint, spokenCount, startMatch, tipSize } from "./shared";

const COLORS: Record<string, string> = { ada: "#ffd166", tunde: "#7ec8ff", aisha: "#ff9fd0", emeka: "#ff9f7a" };

/** Lightweight top-down hide & seek: the compound seen from above, gate at the bottom. */
export function createHideSeekEngine(ctx: EngineContext): GameEngine {
  const g = context2d(ctx.canvas);
  const fit = fitCanvas(ctx.canvas, () => {});
  const vp = fit.vp;
  const font = fonts();
  const music = createNaijaMusic(ctx.sfx, "highlife", { enabled: ctx.music });
  const voice = createCountVoice(ctx.sfx);
  voice.preload();
  const { m, mode } = startMatch(ctx);
  const { st, me, seeker } = m;
  const countTotal = st.countLeft;
  const input = createChaseInput();
  const action = () => handle(m.press(mode === "hide" ? "hide" : "look"));
  const unbind = bindActionKey(action);
  const popups: { text: string; color: string; age: number }[] = [];
  let ended = false;
  let endWait = 0;

  function handle(ev: HideSeekEvent[]) {
    for (const e of ev) {
      const say = eventText(e, mode);
      if (say) popups.push({ text: say.text, color: say.color, age: 0 });
      if (e.type === "count") {
        const n = spokenCount(countTotal, e.n);
        if (n) voice.count(n);
      } else if (e.type === "go") {
        ctx.sfx.play("whistle");
        music.start();
      } else if (e.type === "hid") ctx.sfx.play("chalk", 0.6);
      else if (e.type === "found" || e.type === "spotted") ctx.sfx.play(mode === "seek" ? "point" : "whistle", 0.8);
      else if (e.type === "caught") ctx.sfx.play("caught");
      else if (e.type === "home") ctx.sfx.play(e.kid.human || mode === "hide" ? "rescue" : "miss");
      else if (e.type === "rustle") ctx.sfx.play("tick", 0.18);
      else if (e.type === "end") {
        ctx.sfx.play(e.won ? "win" : "lose");
        music.stop(2);
      }
    }
  }

  function update(dt: number) {
    // Top-down with the gate at the bottom: screen up = +z, screen right = +x.
    const d = input.dir();
    handle(m.update(dt, { move: { x: d.x, z: -d.y }, run: input.sprint() }));
    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.8) popups.splice(i, 1);
    if (st.phase === "end" && (endWait += dt) > 2.4 && !ended) {
      ended = true;
      ctx.onEnd(buildResult(ctx, m, mode));
    }
  }

  function render() {
    const W = vp.w;
    const H = vp.h;
    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    g.fillStyle = "#7a4a2e";
    g.fillRect(0, 0, W, H);
    // Fit the yard (plus room fronts) into the screen, leaving space for the HUD and controls.
    const yw = YARD.x1 - YARD.x0 + 1.4;
    const yh = YARD.z1 - YARD.z0 + 1.4;
    const s = Math.min((W - 24) / yw, (H - 200) / yh);
    const cx = W / 2;
    const top = 80;
    const X = (x: number) => cx + x * s;
    const Y = (z: number) => top + (YARD.z1 + 0.7 - z) * s;

    // Rooms all round, concrete yard in the middle, gate at the bottom.
    g.fillStyle = "#d9c3a0";
    g.fillRect(X(YARD.x0 - 0.7), Y(YARD.z1 + 0.7), yw * s, yh * s);
    g.fillStyle = "#cfc8bc";
    g.fillRect(X(YARD.x0), Y(YARD.z1), (YARD.x1 - YARD.x0) * s, (YARD.z1 - YARD.z0) * s);
    g.fillStyle = "#3a3a3a";
    g.fillRect(X(-2.5), Y(YARD.z0) - 3, 5 * s, 6);

    for (const o of SOLIDS) {
      g.fillStyle = o.r < 0.25 ? "#a89c88" : "#5e6b52";
      if (o.hz) {
        roundRect(g, X(o.x - o.r), Y(o.z + o.hz + o.r), o.r * 2 * s, (o.hz + o.r) * 2 * s, o.r * s);
        g.fillStyle = "#4b5a6b";
        g.fill();
      } else {
        g.beginPath();
        g.arc(X(o.x), Y(o.z), o.r * s, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Base
    g.strokeStyle = "#ffd166";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(X(BASE.x), Y(BASE.z), BASE.r * s, 0, Math.PI * 2);
    g.stroke();
    hudText(g, "BASE", X(BASE.x), Y(BASE.z), { size: 11, font: font.body, weight: 800, color: "#ffd166", stroke: "rgba(0,0,0,0.5)", strokeWidth: 3 });

    // Spots
    const inSpot = spotAt(me.pos);
    const showSpots = st.phase !== "end" && (mode === "hide" ? me.state === "free" : st.phase === "seek");
    if (showSpots) {
      for (const sp of SPOTS) {
        g.strokeStyle = inSpot?.id === sp.id ? "#ffd166" : "rgba(126,224,138,0.6)";
        g.lineWidth = 2;
        g.setLineDash([4, 4]);
        g.beginPath();
        g.arc(X(sp.x), Y(sp.z), SPOT_R * s * 0.8, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
    }

    // Seeker's view
    if (mode === "hide" && st.phase === "seek") {
      const h = seeker.heading;
      g.fillStyle = st.ai.mode === "chase" ? "rgba(255,93,93,0.22)" : "rgba(255,209,102,0.2)";
      g.beginPath();
      g.moveTo(X(seeker.pos.x), Y(seeker.pos.z));
      for (let i = 0; i <= 16; i++) {
        const a = h - m.level.fov + (i / 16) * m.level.fov * 2;
        g.lineTo(X(seeker.pos.x + Math.sin(a) * m.level.vision), Y(seeker.pos.z + Math.cos(a) * m.level.vision));
      }
      g.closePath();
      g.fill();
    }

    // Kids
    for (const k of m.kids) {
      if (mode === "seek" && !k.seeker && (k.state === "hidden" || st.phase === "count")) continue;
      const r = (k.state === "hidden" ? 0.22 : 0.3) * s;
      g.globalAlpha = k.state === "hidden" ? 0.65 : 1;
      g.fillStyle = COLORS[k.avatar] ?? "#fff";
      g.beginPath();
      g.arc(X(k.pos.x), Y(k.pos.z), r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = k.human ? "#fff" : "rgba(0,0,0,0.5)";
      g.lineWidth = k.human ? 3 : 1.5;
      g.stroke();
      g.beginPath();
      g.moveTo(X(k.pos.x), Y(k.pos.z));
      g.lineTo(X(k.pos.x + Math.sin(k.heading) * 0.45), Y(k.pos.z + Math.cos(k.heading) * 0.45));
      g.stroke();
      g.globalAlpha = 1;
      hudText(g, k.human ? "YOU" : k.name, X(k.pos.x), Y(k.pos.z) - r - 9, { size: 10, font: font.body, weight: 800, color: k.human ? "#ffd166" : "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 3 });
    }

    // Seek-mode count: eyes closed
    if (mode === "seek" && st.phase === "count") {
      g.fillStyle = "rgba(5,8,6,0.92)";
      g.fillRect(0, 0, W, H);
      hudText(g, "Eyes closed…", W / 2, H * 0.36, { size: 22, font: font.display, color: "#ffd166" });
      hudText(g, String(Math.max(1, spokenCount(countTotal, Math.ceil(st.countLeft)) ?? countTotal)), W / 2, H * 0.36 + 64, { size: 80, font: font.display, color: "#fff" });
    }

    // Timer
    const counting = st.phase === "count";
    const tl = Math.ceil(st.timeLeft);
    roundRect(g, W / 2 - 56, 12, 112, 44, 14);
    g.fillStyle = "rgba(12,16,14,0.8)";
    g.fill();
    hudText(g, counting ? `${Math.ceil(st.countLeft)}` : `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, "0")}`, W / 2, 35, { size: 26, font: font.display, color: counting ? "#ffd166" : "#fff", shadow: false });
    const tip = hint(m, mode);
    if (tip) hudText(g, tip, W / 2, H - Math.max(150, H * 0.27), { size: tipSize(tip, W), font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4 });
    popups.forEach((p, i) => {
      hudText(g, p.text, W / 2, H * 0.22 + i * 30, { size: Math.min(20, W / 18), font: font.display, color: p.color, stroke: "rgba(0,0,0,0.55)", strokeWidth: 4, alpha: p.age < 1.4 ? 1 : 1 - (p.age - 1.4) / 0.4 });
    });
    if (st.phase === "end") {
      hudText(g, st.won ? "YOU WIN!" : "GAME OVER", W / 2, H * 0.45, { size: Math.min(52, W / 8), font: font.display, color: st.won ? "#ffd166" : "#ff8a6b", stroke: "rgba(0,0,0,0.5)" });
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
      else if ((id === "hide" || id === "look") && down) action();
    },
    axis(x, y) {
      input.setAxis(x, y);
    },
    destroy() {
      loop.stop();
      unbind();
      input.dispose();
      music.dispose();
      fit.dispose();
    },
  };
}
