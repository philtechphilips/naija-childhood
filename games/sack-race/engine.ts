import type { EngineContext, GameEngine } from "@/games/types";
import { context2d, fitCanvas, fonts } from "@/games/core/canvas";
import { createLoop } from "@/games/core/loop";
import { createRng } from "@/games/core/rng";
import { paintSky } from "@/games/core/scenery";
import { clamp, hudText, roundRect } from "@/games/core/draw";
import { LOOKS, drawKid, neutralPose, type KidLook } from "@/games/core/kid";
import { HOUSES } from "@/games/core3d/sportsday";
import { HOP, LANES, createRace, hurdleAhead, type Difficulty, type RaceEvent } from "./rules";
import { PLAYER_LANE, bindHopKeys, courseOf, createCommentary, ordinal, raceResult } from "./shared";
import { createNaijaMusic } from "@/games/core/naija-music";

const LOOK_KEYS = ["brownShorts", "greenPinafore", "bluePinafore", "maroonPinafore"];

/** Lightweight sack race: seen from the finish line, racers hop towards you. */
export function createSackRaceEngine(ctx: EngineContext): GameEngine {
  const g = context2d(ctx.canvas);
  const fit = fitCanvas(ctx.canvas, () => {});
  const vp = fit.vp;
  const font = fonts();
  const difficulty = (["easy", "normal", "hard"].includes(ctx.options.difficulty ?? "") ? ctx.options.difficulty : "easy") as Difficulty;
  const race = createRace({ difficulty, seed: ctx.seed, player: PLAYER_LANE, course: courseOf(ctx.mode) });
  const course = race.course;
  const L = course.length;
  const obstacles = course.kind === "obstacles";
  const talk = createCommentary(race);
  // Dev only: lets automated playtests read the race.
  if (process.env.NODE_ENV !== "production") (window as unknown as { __race?: typeof race }).__race = race;
  const looks: KidLook[] = LOOK_KEYS.map((k, i) => ({ ...LOOKS[k]!, top: HOUSES[i]!.css }));
  const popups: { text: string; color: string; age: number }[] = [];
  const rng = createRng(ctx.seed);
  const dots = Array.from({ length: 60 }, () => [rng(), rng()] as const);
  let ended = false;
  let wasNeg = true;

  const pop = (text: string, color: string) => {
    const same = popups.findIndex((p) => p.text === text);
    if (same >= 0) popups.splice(same, 1);
    popups.push({ text, color, age: 0 });
    if (popups.length > 3) popups.shift();
  };
  const handle = (ev: RaceEvent[]) => {
    talk.feed(ev);
    for (const e of ev) {
      if (e.lane !== PLAYER_LANE) continue;
      const me = race.racers[PLAYER_LANE]!;
      if (e.type === "hop") {
        ctx.sfx.play(e.launch === "perfect" ? "perfect" : e.launch === "wobble" ? "miss" : "stomp", 0.45);
        if (e.launch === "perfect") pop(e.leap ? "PERFECT LEAP!" : "PERFECT!", me.ginger ? "#ff9a3c" : "#ffd166");
        if (e.launch === "wobble" && !me.stuck) pop("Too early!", "#ff8a6b");
      } else if (e.type === "fall") pop("You fall for sack!", "#ff8a6b");
      else if (e.type === "rocket") pop("ROCKET START!", "#7ee08a");
      else if (e.type === "falsestart") {
        ctx.sfx.play("whistle", 0.6);
        pop("FALSE START!", "#ff8a6b");
      } else if (e.type === "ginger") {
        ctx.sfx.play("win", 0.35);
        pop("GINGER!", "#ff9a3c");
      } else if (e.type === "clear") {
        ctx.sfx.play("point", 0.45);
        pop("CLEARED!", "#7ee08a");
      } else if (e.type === "splash") {
        ctx.sfx.play("miss", 0.5);
        pop("SPLASH! Mud!", "#c79a6b");
      } else if (e.type === "finish") {
        ctx.sfx.play(e.place === 1 ? "win" : "point", 0.8);
        pop(e.place === 1 ? "YOU WIN!" : `${ordinal(e.place)} place!`, "#ffd166");
      }
    }
  };
  const unbind = bindHopKeys(
    () => handle(race.press(PLAYER_LANE)),
    obstacles ? () => handle(race.press(PLAYER_LANE, true)) : undefined,
  );
  const music = createNaijaMusic(ctx.sfx, "afrobeats", { enabled: ctx.music });

  function update(dt: number) {
    handle(race.step(dt));
    talk.update(dt);
    if (wasNeg && race.clock >= 0) {
      wasNeg = false;
      music.start();
      ctx.sfx.play("whistle", 0.9);
    }
    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.2) popups.splice(i, 1);
    const me = race.racers[PLAYER_LANE]!;
    music.setIntensity(me.x / L);
    if (me.state === "done") music.stop(2.5);
    if (race.over() && !ended) {
      ended = true;
      setTimeout(() => ctx.onEnd(raceResult(ctx, race)), 1000);
    }
  }

  function render() {
    const W = vp.w;
    const H = vp.h;
    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    const horizon = H * 0.3;
    paintSky(g, W, horizon, "school");
    g.fillStyle = "#b5643c";
    g.fillRect(0, horizon, W, H - horizon);
    g.fillStyle = "rgba(90,40,20,0.25)";
    for (const [a, b] of dots) g.fillRect(a * W, horizon + b * (H - horizon), 3, 2);
    // Camera stands just past the finish line, looking back down the lanes.
    const f = H * 0.9;
    const camZ = L + 4;
    const proj = (x: number, y: number, z: number) => {
      const d = Math.max(0.5, camZ - z);
      return { x: W / 2 + (x * f) / d, y: horizon + ((1.6 - y) * f) / d, k: f / d };
    };
    const laneX = (lane: number) => (lane - (LANES - 1) / 2) * 1.45;
    g.strokeStyle = "rgba(245,240,230,0.8)";
    g.lineWidth = 2;
    for (let i = 0; i <= LANES; i++) {
      const a = proj(laneX(i) - 0.725, 0, -2);
      const b = proj(laneX(i) - 0.725, 0, camZ - 0.6);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    // Mud patches and hurdles, far to near.
    for (const [a, b] of course.mud) {
      for (let i = 0; i < LANES; i++) {
        const p0 = proj(laneX(i), 0, a);
        const p1 = proj(laneX(i), 0, b);
        g.fillStyle = "#4a2f1b";
        g.beginPath();
        g.ellipse(p0.x, (p0.y + p1.y) / 2, 0.6 * p1.k, Math.max(2, (p1.y - p0.y) / 2), 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    course.hurdles.forEach((h, k) => {
      for (let i = 0; i < LANES; i++) {
        const knocked = race.racers[i]!.knocked[k];
        const a = proj(laneX(i) - 0.6, knocked ? 0.04 : 0.38, h);
        const b = proj(laneX(i) + 0.6, knocked ? 0.04 : 0.38, h);
        const foot = proj(laneX(i), 0, h);
        g.fillStyle = "#f4f1ea";
        if (!knocked) {
          g.fillRect(a.x, a.y, 0.04 * a.k, foot.y - a.y);
          g.fillRect(b.x - 0.04 * b.k, b.y, 0.04 * b.k, foot.y - b.y);
        }
        g.fillStyle = knocked ? "rgba(232,85,43,0.55)" : "#e8552b";
        g.fillRect(a.x, a.y - 0.06 * a.k, b.x - a.x, 0.12 * a.k);
      }
    });
    const fl = proj(-3, 0, L);
    const fr = proj(3, 0, L);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(fl.x, fl.y);
    g.lineTo(fr.x, fr.y);
    g.stroke();

    // Racers far to near.
    const order = race.racers.map((r, i) => ({ r, i })).sort((a, b) => a.r.x - b.r.x);
    for (const { r, i } of order) {
      let y = 0;
      if (r.state === "air") {
        const u = clamp((race.clock - r.t0) / r.air, 0, 1);
        const wob = r.launch === "wobble";
        y = 4 * (r.leap ? (wob ? HOP.height.leapWobble : HOP.height.leap) : wob ? HOP.height.wobble : HOP.height.hop) * u * (1 - u);
      }
      const p = proj(laneX(i), y, r.x);
      const ground = proj(laneX(i), 0, r.x);
      const scale = (p.k * 1.3) / 100;
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.beginPath();
      g.ellipse(ground.x, ground.y, 22 * scale, 6 * scale, 0, 0, Math.PI * 2);
      g.fill();
      g.save();
      if (r.state === "fallen") {
        g.translate(p.x, p.y);
        g.rotate(0.9);
        g.translate(-p.x, -p.y);
      }
      drawKid(g, p.x, p.y, scale, looks[i]!, { ...neutralPose("front"), mood: 1 });
      // The sack, up to the waist.
      g.fillStyle = "#a8875a";
      roundRect(g, p.x - 24 * scale, p.y - 52 * scale, 48 * scale, 52 * scale, 6 * scale);
      g.fill();
      g.fillStyle = r.ginger ? "#ff9a3c" : HOUSES[i]!.css;
      g.fillRect(p.x - 24 * scale, p.y - 40 * scale, 48 * scale, 6 * scale);
      g.restore();
      if (i === PLAYER_LANE) hudText(g, "YOU", p.x, p.y - 118 * scale, { size: 13, font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 3 });
    }

    // Timing bar: fill to the line, press as it hits.
    const me = race.racers[PLAYER_LANE]!;
    if (me.state === "air") {
      const u = clamp((race.clock - me.t0) / me.air, 0, 1.3);
      const leapCue = obstacles && hurdleAhead(course, me, me.toX) !== null;
      const bw = Math.min(260, W * 0.7);
      roundRect(g, (W - bw) / 2, H - 80, bw, 16, 8);
      g.fillStyle = "rgba(10,14,12,0.7)";
      g.fill();
      roundRect(g, (W - bw) / 2, H - 80, bw * Math.min(1, u), 16, 8);
      g.fillStyle = leapCue ? "#c69bff" : u > 0.85 ? (me.ginger ? "#ff9a3c" : "#ffd166") : "#7ee08a";
      g.fill();
      hudText(g, leapCue ? "LEAP at the end!" : "HOP at the end!", W / 2, H - 96, { size: 13, font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 3 });
    }
    hudText(g, `${Math.max(0, me.finishTime ?? race.clock).toFixed(2)}s`, W - 16, 26, { size: 20, font: font.display, color: "#fff", align: "right", stroke: "rgba(0,0,0,0.5)" });
    if (race.clock > 0) {
      hudText(g, ordinal(race.standing(PLAYER_LANE)), 16, 26, { size: 22, font: font.display, color: "#ffd166", align: "left", stroke: "rgba(0,0,0,0.5)" });
      for (let k = 0; k < HOP.gingerStreak; k++) {
        g.beginPath();
        g.arc(22 + k * 14, 52, 5, 0, Math.PI * 2);
        g.fillStyle = me.ginger ? "#ff9a3c" : k < me.streak ? "#ffd166" : "rgba(255,255,255,0.3)";
        g.fill();
      }
      if (me.ginger) hudText(g, `GINGER ×${me.streak}`, 16, 72, { size: 13, font: font.display, color: "#ff9a3c", align: "left", stroke: "rgba(0,0,0,0.6)" });
    }
    if (talk.text && talk.alpha > 0) hudText(g, `📣 ${talk.text}`, W / 2, H * 0.12, { size: 14, font: font.body, weight: 800, color: "#fff", stroke: "rgba(0,0,0,0.65)", strokeWidth: 4, alpha: talk.alpha });
    if (race.clock < 0) hudText(g, String(Math.ceil(-race.clock)), W / 2, H * 0.45, { size: 80, font: font.display, color: "#fff", stroke: "rgba(0,0,0,0.55)" });
    popups.forEach((p, i) => hudText(g, p.text, W / 2, H * 0.42 + i * 34, { size: 28, font: font.display, color: p.color, stroke: "rgba(0,0,0,0.6)", alpha: 1 - p.age / 1.2 }));
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
      if (!down) return;
      if (id === "hop") handle(race.press(PLAYER_LANE));
      else if (id === "leap") handle(race.press(PLAYER_LANE, true));
    },
    destroy() {
      loop.stop();
      unbind();
      music.dispose();
      fit.dispose();
    },
  };
}
