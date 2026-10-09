import type { EngineContext, GameEngine } from "@/games/types";
import { context2d, fitCanvas, fonts } from "@/games/core/canvas";
import { createLoop } from "@/games/core/loop";
import { paintSky } from "@/games/core/scenery";
import { hudText } from "@/games/core/draw";
import { LOOKS, drawKid, neutralPose } from "@/games/core/kid";
import { AIR, LIVES } from "./rules";
import { createSkipMatch, type SkipEvent } from "./match";
import { bindJumpKeys, createCountVoice } from "./shared";
import { createNaijaMusic } from "@/games/core/naija-music";

/** Lightweight skipping rope: front view, the rope swings in front of and behind the jumper. */
export function createSkippingEngine(ctx: EngineContext): GameEngine {
  const g = context2d(ctx.canvas);
  const fit = fitCanvas(ctx.canvas, () => {});
  const vp = fit.vp;
  const font = fonts();
  const m = createSkipMatch({ difficulty: ctx.options.difficulty ?? "easy", seed: ctx.seed, mode: ctx.mode });
  const voice = createCountVoice(ctx.sfx);
  // Fuji-style percussion; goes wild during PEPPER.
  const music = createNaijaMusic(ctx.sfx, "fuji", { enabled: ctx.music });
  voice.preload();
  const popups: { text: string; color: string; age: number }[] = [];
  const handle = (ev: SkipEvent[]) => {
    for (const e of ev) {
      if (e.type === "pass") {
        if (e.judgement === "trip") {
          ctx.sfx.play("miss", 0.7);
          popups.push({ text: "Rope don catch your leg!", color: "#ff8a6b", age: 0 });
        } else voice.count(e.count);
      } else if (e.type === "pepper") {
        voice.say("pepper");
        popups.push({ text: "PEPPER!", color: "#ff5d5d", age: 0 });
      } else if (e.type === "go") {
        music.start();
        popups.push({ text: "JUMP IN!", color: "#7ee08a", age: 0 });
      }
      else if (e.type === "finish") ctx.onEnd({ ...e.result, options: ctx.options });
    }
  };
  const unbind = bindJumpKeys(() => handle(m.press()));

  function update(dt: number) {
    handle(m.update(dt));
    music.setIntensity(m.st.pepperLeft > 0 ? 1 : Math.min(0.8, m.st.totals.jumps / 40));
    if (m.st.phase === "end") music.stop(2);
    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.2) popups.splice(i, 1);
  }

  function render() {
    const W = vp.w;
    const H = vp.h;
    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    const horizon = H * 0.42;
    paintSky(g, W, horizon, "school");
    g.fillStyle = "#b5643c";
    g.fillRect(0, horizon, W, H - horizon);
    const ground = H * 0.78;
    const scale = Math.min(W, H) / 330;
    const cx = W / 2;
    const span = Math.min(W * 0.36, 150 * scale);
    const handY = ground - 62 * scale;
    const angle = m.ropeAngle();
    const ropeY = (s: number) => handY + Math.sin(s * Math.PI) * (ground - handY + 4) * Math.cos(angle);
    const drawRope = () => {
      g.strokeStyle = "#efe6c8";
      g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const s = i / 24;
        const x = cx - span + s * span * 2;
        if (i === 0) g.moveTo(x, ropeY(s));
        else g.lineTo(x, ropeY(s));
      }
      g.stroke();
    };
    // Rope behind the jumper while it's going over the back.
    const behind = Math.sin(angle) < 0;
    if (behind) drawRope();
    const lift = (m.jumpHeight() / 0.42) * 36 * scale;
    for (const side of [-1, 1]) drawKid(g, cx + side * span, ground, scale, LOOKS[side < 0 ? "bluePinafore" : "brownShorts"]!, { ...neutralPose("front"), mood: 1 });
    drawKid(g, cx, ground - lift, scale, LOOKS.greenPinafore!, { ...neutralPose("front"), lift: 0, mood: 1, squash: lift > 0 ? 0 : 0.05 });
    if (!behind) drawRope();

    const st = m.st;
    hudText(g, String(st.totals.jumps), W / 2, 56, { size: 54, font: font.display, color: "#fff", stroke: "rgba(0,0,0,0.55)" });
    for (let i = 0; i < LIVES; i++) hudText(g, i < st.lives ? "❤" : "♡", W - 22 - i * 24, 28, { size: 20, font: font.body, color: i < st.lives ? "#ff5d5d" : "rgba(255,255,255,0.5)", shadow: false });
    // Same dial as the 3D game: jump when the dot reaches the yellow.
    const dx = W / 2;
    const dy = H - 70;
    const R = 28;
    g.strokeStyle = "rgba(255,255,255,0.3)";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(dx, dy, R, 0, Math.PI * 2);
    g.stroke();
    const press = (2 * Math.PI * (AIR / 2)) / st.turnDur;
    g.strokeStyle = "#ffd166";
    g.lineWidth = 8;
    g.beginPath();
    g.arc(dx, dy, R, Math.PI / 2 - press - 0.35, Math.PI / 2 - press + 0.35);
    g.stroke();
    g.fillStyle = st.pepperLeft > 0 ? "#ff5d5d" : "#fff";
    g.beginPath();
    g.arc(dx + Math.cos(Math.PI / 2 + angle) * R, dy + Math.sin(Math.PI / 2 + angle) * R, 7, 0, Math.PI * 2);
    g.fill();
    popups.forEach((p, i) => hudText(g, p.text, W / 2, H * 0.24 + i * 34, { size: 28, font: font.display, color: p.color, stroke: "rgba(0,0,0,0.6)", alpha: 1 - p.age / 1.2 }));
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
      if (down && id === "jump") handle(m.press());
    },
    destroy() {
      loop.stop();
      unbind();
      music.dispose();
      fit.dispose();
    },
  };
}
