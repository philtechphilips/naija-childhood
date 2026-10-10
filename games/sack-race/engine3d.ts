import * as THREE from "three";
import type { EngineContext, GameEngine } from "@/games/types";
import { createLoop } from "@/games/core/loop";
import { clamp, easeOutBack, hudText, lerp, roundRect } from "@/games/core/draw";
import { createStage } from "@/games/core3d/stage";
import { Character } from "@/games/core3d/character";
import { createOverlay, drawLoading } from "@/games/core3d/overlay";
import { buildPlace, type Place } from "@/games/core3d/places";
import { createWatchers, faceToward } from "@/games/core3d/kids";
import { HOUSES, banner, bunting, canopy, chalkLine, finishTape } from "@/games/core3d/sportsday";
import { HOP, LANES, LEVELS, createRace, hurdleAhead, inMud, type Difficulty, type RaceEvent } from "./rules";
import { RACERS, PLAYER_LANE, bindHopKeys, courseOf, createCommentary, raceResult, ordinal } from "./shared";
import { createNaijaMusic } from "@/games/core/naija-music";

const LANE_W = 1.45;
const laneZ = (lane: number) => -2.6 + lane * LANE_W;
const GINGER = "#ff9a3c";
const LEAP_CUE = "#c69bff";

/** Burlap sack that hides the legs, with a band in the house colour. */
function sack(color: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#a8875a";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 3) {
    g.fillStyle = `rgba(80,58,30,${0.12 + ((i * 7) % 5) * 0.03})`;
    g.fillRect(i, 0, 1, 128);
    g.fillRect(0, i, 128, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  const grp = new THREE.Group();
  // Lathe profile: slack burlap that bulges at the knees and is gathered in at the waist.
  const profile = [
    [0.0, 0.0],
    [0.17, 0.0],
    [0.2, 0.06],
    [0.21, 0.26],
    [0.2, 0.46],
    [0.185, 0.6],
    [0.17, 0.68],
    [0.19, 0.72],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 20);
  // Wrinkles: push vertices in and out a little.
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.05 * Math.sin(a * 7 + y * 9) + 0.03 * Math.sin(a * 13 - y * 17);
    pos.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide }));
  body.castShadow = true;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.17, 18).rotateX(Math.PI / 2), body.material);
  bottom.position.y = 0.005;
  const bandMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, emissive: new THREE.Color(GINGER), emissiveIntensity: 0 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.205, 0.09, 20, 1, true), bandMat);
  band.position.y = 0.5;
  grp.add(body, bottom, band);
  return { grp, bandMat };
}

/** Foam school hurdle across one lane. Pivots at its foot so it can be knocked flat. */
function hurdle(width: number, mats: { frame: THREE.Material; bar: THREE.Material; stripe: THREE.Material }) {
  const g = new THREE.Group();
  const H = 0.38;
  for (const z of [-width / 2, width / 2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, 0.05), mats.frame);
    leg.position.set(0, H / 2, z);
    leg.castShadow = true;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.06), mats.frame);
    foot.position.set(0.06, 0.02, z);
    g.add(leg, foot);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, width), mats.bar);
  bar.position.y = H;
  bar.castShadow = true;
  g.add(bar);
  for (const z of [-width / 4, width / 4]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.125, width / 8), mats.stripe);
    s.position.set(0, H, z);
    g.add(s);
  }
  return g;
}

interface View {
  char: Character;
  /** Outer group: position along the lane and the hop arc. */
  rig: THREE.Group;
  sack: THREE.Group;
  band: THREE.MeshStandardMaterial;
}

interface Bit {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

export function createSackRace3D(ctx: EngineContext): GameEngine {
  const stage = createStage(ctx.canvas, { preset: "day" });
  const overlay = createOverlay(ctx.canvas);
  const difficulty = (["easy", "normal", "hard"].includes(ctx.options.difficulty ?? "") ? ctx.options.difficulty : "easy") as Difficulty;
  const kind = courseOf(ctx.mode);
  const race = createRace({ difficulty, seed: ctx.seed, player: PLAYER_LANE, course: kind });
  const course = race.course;
  const L = course.length;
  // The obstacle course is longer, so it starts further back to keep clear of the classroom block.
  const START_X = kind === "obstacles" ? -15 : -14;
  const RUNOUT = kind === "obstacles" ? 1.2 : 3;
  const talk = createCommentary(race);
  const obstacles = kind === "obstacles";
  const unbind = bindHopKeys(
    () => handle(race.press(PLAYER_LANE)),
    obstacles ? () => handle(race.press(PLAYER_LANE, true)) : undefined,
  );
  const music = createNaijaMusic(ctx.sfx, "afrobeats", { enabled: ctx.music });
  // Dev only: lets automated playtests read the race.
  if (process.env.NODE_ENV !== "production") (window as unknown as { __race?: typeof race }).__race = race;
  let ready = false;
  let failed = false;
  let disposed = false;
  let ended = false;
  let progress = 0;
  let place: Place | null = null;
  const views: View[] = [];
  const crowd: Character[] = [];
  /** hurdles[lane][k]: the mesh and how far it has toppled (0..1). */
  const hurdles: { obj: THREE.Group; fall: number }[][] = [];
  let tape: ReturnType<typeof finishTape> | null = null;
  const popups: { text: string; color: string; size: number; age: number }[] = [];
  let lastCount = 4;
  let lastFrame = performance.now();
  let shake = 0;
  const cam = new THREE.Vector3(START_X, 2.4, -9);
  const look = new THREE.Vector3(START_X + 2, 0.9, 0);

  // Dust kicked up on landings, mud splashes and ginger sparks, from one small pool.
  const bitGeo = new THREE.IcosahedronGeometry(1, 0);
  const bitMats = {
    dust: new THREE.MeshStandardMaterial({ color: 0xc08a5c, roughness: 1 }),
    mud: new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.3 }),
    spark: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
  };
  const bits: Bit[] = [];
  const maxBits = ctx.reducedMotion ? 0 : stage.quality === "low" ? 24 : 60;
  function spawn(x: number, z: number, n: number, mat: keyof typeof bitMats, up = 1.4) {
    for (let i = 0; i < n && maxBits > 0; i++) {
      let b = bits.find((o) => o.life <= 0);
      if (!b) {
        if (bits.length >= maxBits) return;
        const mesh = new THREE.Mesh(bitGeo, bitMats.dust);
        stage.scene.add(mesh);
        b = { mesh, v: new THREE.Vector3(), life: 0, max: 1, size: 0.05 };
        bits.push(b);
      }
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.2;
      b.mesh.material = bitMats[mat];
      b.mesh.position.set(x + Math.cos(a) * 0.15, 0.05, z + Math.sin(a) * 0.15);
      b.v.set(Math.cos(a) * sp, up * (0.6 + Math.random() * 0.8), Math.sin(a) * sp);
      b.max = b.life = 0.35 + Math.random() * 0.35;
      b.size = mat === "spark" ? 0.025 : 0.035 + Math.random() * 0.04;
      b.mesh.visible = true;
    }
  }
  function updateBits(dt: number) {
    for (const b of bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      b.v.y -= 7 * dt;
      b.mesh.position.addScaledVector(b.v, dt);
      if (b.mesh.position.y < 0.03) {
        b.mesh.position.y = 0.03;
        b.v.set(b.v.x * 0.6, 0, b.v.z * 0.6);
      }
      b.mesh.scale.setScalar(b.size * (b.life / b.max));
    }
  }

  async function init() {
    place = await buildPlace(stage.scene, "school", { detailed: stage.quality !== "low", walkers: 0, traffic: 0, rollers: false });
    if (disposed) return;
    progress = 0.4;
    const s = stage.scene;
    // Lanes, start and finish lines.
    for (let i = 0; i <= LANES; i++) {
      const z = laneZ(i) - LANE_W / 2;
      s.add(chalkLine(START_X - 1.5, z, START_X + L + RUNOUT, z));
    }
    s.add(chalkLine(START_X, laneZ(0) - LANE_W / 2, START_X, laneZ(LANES - 1) + LANE_W / 2, 0.12));
    s.add(chalkLine(START_X + L, laneZ(0) - LANE_W / 2, START_X + L, laneZ(LANES - 1) + LANE_W / 2, 0.12));
    tape = finishTape(LANES * LANE_W + 0.6);
    tape.obj.position.set(START_X + L + 0.15, 0, laneZ(1.5));
    s.add(tape.obj);

    // Obstacles: a foam hurdle in every lane at each mark, and wet mud patches.
    const mats = {
      frame: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 }),
      bar: new THREE.MeshStandardMaterial({ color: 0xe8552b, roughness: 0.75 }),
      stripe: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }),
    };
    for (let lane = 0; lane < LANES; lane++) {
      hurdles.push(
        course.hurdles.map((h) => {
          const obj = hurdle(LANE_W * 0.82, mats);
          obj.position.set(START_X + h, 0, laneZ(lane));
          s.add(obj);
          return { obj, fall: 0 };
        }),
      );
    }
    const mudMat = new THREE.MeshStandardMaterial({ color: 0x6b3a1a, roughness: 0.75, metalness: 0, envMapIntensity: 0.25, transparent: true, opacity: 0.96 });
    const blob = new THREE.CircleGeometry(0.5, 28).rotateX(-Math.PI / 2);
    course.mud.forEach(([a, b], k) => {
      for (let lane = 0; lane < LANES; lane++) {
        const m = new THREE.Mesh(blob, mudMat);
        m.scale.set(b - a + 0.1, 1, LANE_W * (0.78 + ((k + lane) % 3) * 0.05));
        m.position.set(START_X + (a + b) / 2, 0.015 + lane * 0.0005, laneZ(lane));
        m.rotation.y = Math.sin(k * 3.1 + lane * 1.7) * 0.12;
        m.receiveShadow = true;
        s.add(m);
      }
    });

    // House canopies along the far side, the banner and bunting.
    HOUSES.forEach((h, i) => {
      const c = canopy(h.color);
      c.position.set(-12 + i * 7.5, 0, 7.2);
      s.add(c);
    });
    const b = banner(obstacles ? ["INTER-HOUSE SPORTS", "Obstacle sack race · Leap am, no fall!"] : ["INTER-HOUSE SPORTS", "Sack race · Primary 4 & 5 · Oya, ginger!"], 7.5, 1.3);
    b.position.set(START_X + L / 2, 0, 10.4);
    b.rotation.y = Math.PI;
    s.add(b);
    s.add(bunting(new THREE.Vector3(START_X - 2, 2.6, 5.2), new THREE.Vector3(START_X + L + RUNOUT, 2.6, 5.2)));

    // Racers: the player is Blue House.
    for (let lane = 0; lane < LANES; lane++) {
      const r = RACERS[lane]!;
      const char = await Character.create(r.avatar, [r.female ? "idle_f" : "idle_m"]);
      if (disposed) return;
      char.play(r.female ? "idle_f" : "idle_m", { offset: lane * 0.2 });
      const rig = new THREE.Group();
      rig.add(char.root);
      const sk = sack(HOUSES[lane]!.color);
      rig.add(sk.grp);
      rig.position.set(START_X, 0, laneZ(lane));
      rig.rotation.y = Math.PI / 2; // facing +x, down the track
      s.add(rig);
      views.push({ char, rig, sack: sk.grp, band: sk.bandMat });
    }
    progress = 0.75;
    // Pupils, parents and teachers lining the track.
    const spots: [string, string, number, number, number][] = [];
    const ids: [string, string][] = [
      ["emeka", "cheer_m"],
      ["tunde", "clap_m"],
      ["woman1", "clap_f"],
      ["ada", "cheer_f"],
      ["man1", "clap_m"],
      ["aisha", "clap_f"],
      ["woman2", "cheer_f"],
      ["man2", "idle_m"],
    ];
    const n = stage.quality === "low" ? 6 : stage.quality === "medium" ? 10 : 14;
    for (let i = 0; i < n; i++) {
      const [id, clip] = ids[i % ids.length]!;
      const x = START_X - 1 + (i / n) * (L + 4) + Math.sin(i * 7.1) * 0.6;
      // Everyone watches from the far side so the camera's view of the lanes stays clear.
      const z = 3.4 + (i % 3) * 0.75;
      spots.push([id, clip, x, z, faceToward(x, z, x, 0)]);
    }
    crowd.push(...(await createWatchers(s, spots)));
    progress = 1;
    ready = true;
    lastFrame = performance.now();
  }
  init().catch((e) => {
    console.error(e);
    failed = true;
  });

  const popup = (text: string, color = "#fff", size = 30) => {
    // One of each message at a time: a fresh one replaces the old.
    const same = popups.findIndex((p) => p.text === text);
    if (same >= 0) popups.splice(same, 1);
    popups.push({ text, color, size, age: 0 });
    if (popups.length > 3) popups.shift();
  };

  function handle(ev: RaceEvent[]) {
    talk.feed(ev);
    for (const e of ev) {
      const mine = e.lane === PLAYER_LANE;
      const r = race.racers[e.lane]!;
      const wx = START_X + r.x;
      const wz = laneZ(e.lane);
      switch (e.type) {
        case "hop":
          if (r.ginger) spawn(wx, wz, 4, "spark", 2);
          if (!mine) break;
          if (e.launch === "perfect") {
            ctx.sfx.play("perfect", 0.4);
            popup(e.leap ? "PERFECT LEAP!" : "PERFECT!", r.ginger ? GINGER : "#ffd166", 26);
          } else if (e.launch === "good") ctx.sfx.play("stomp", 0.5);
          else if (e.launch === "wobble") {
            ctx.sfx.play("miss", 0.4);
            if (!r.stuck) popup("Too early! Wobble!", "#ff8a6b", 22);
          } else ctx.sfx.play("stomp", 0.35);
          break;
        case "land":
          spawn(wx, wz, e.mud ? 7 : 4, e.mud ? "mud" : "dust", e.mud ? 2 : 1);
          if (mine && !e.mud) shake = Math.max(shake, r.leap ? 0.06 : 0.025);
          break;
        case "rocket":
          if (mine) {
            ctx.sfx.play("perfect", 0.5);
            popup("ROCKET START!", "#7ee08a", 30);
          }
          break;
        case "falsestart":
          if (mine) {
            ctx.sfx.play("whistle", 0.6);
            ctx.haptic(80);
            popup("FALSE START! Wait…", "#ff8a6b", 28);
          }
          break;
        case "ginger":
          if (mine) {
            ctx.sfx.play("win", 0.35);
            ctx.haptic(30);
            popup("🔥 GINGER! 🔥", GINGER, 40);
          }
          break;
        case "clear":
          if (mine) {
            ctx.sfx.play("point", 0.45);
            popup("CLEARED! +40", "#7ee08a", 26);
          }
          break;
        case "trip": {
          const hv = hurdles[e.lane]?.[e.hurdle];
          if (hv) hv.fall = 0.0001;
          spawn(START_X + course.hurdles[e.hurdle]!, wz, 6, "dust", 1.6);
          if (mine) popup("You knock the hurdle!", "#ff8a6b", 24);
          break;
        }
        case "splash":
          if (mine) {
            ctx.sfx.play("miss", 0.5);
            ctx.haptic(40);
            popup("SPLASH! Mud!", "#c79a6b", 28);
          }
          break;
        case "fall":
          spawn(wx + 0.4, wz, 8, inMud(course, r.x) ? "mud" : "dust", 1.2);
          if (mine) {
            ctx.sfx.play("lose", 0.6);
            ctx.haptic([60, 40, 60]);
            shake = 0.15;
            popup("You fall for sack! Get up!", "#ff8a6b", 24);
          }
          break;
        case "finish":
          if (e.place === 1) tape?.snap();
          if (mine) {
            ctx.sfx.play(e.place === 1 ? "win" : "point", 0.8);
            popup(e.place === 1 ? "YOU WIN! 🥇" : `${ordinal(e.place)} place!`, e.place === 1 ? "#ffd166" : "#7ee08a", 40);
          }
          break;
      }
    }
  }

  function update(dt: number) {
    if (!ready) return;
    const before = race.clock;
    handle(race.step(dt));
    talk.update(dt);
    // Countdown: "On your marks... get set... GO!"
    const n = Math.ceil(-race.clock);
    if (race.clock < 0 && n < lastCount) {
      lastCount = n;
      ctx.sfx.play("countdown", 0.6);
    }
    if (before < 0 && race.clock >= 0) {
      music.start();
      ctx.sfx.play("whistle", 0.9);
      popup("GO! GO! GO!", "#7ee08a", 52);
    }
    tape?.update(dt);
    for (const lane of hurdles) {
      for (const h of lane) {
        if (h.fall <= 0 || h.fall >= 1) continue;
        h.fall = Math.min(1, h.fall + dt * 4);
        // Tip forward onto the track with a little bounce.
        h.obj.rotation.z = -1.5 * easeOutBack(h.fall);
      }
    }
    updateBits(dt);
    shake = Math.max(0, shake - dt * 0.6);
    // The hook comes in for the final stretch.
    const me = race.racers[PLAYER_LANE]!;
    music.setIntensity(me.x / L);
    if (me.state === "done") music.stop(2.5);
    for (const p of popups) p.age += dt;
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i]!.age > 1.3) popups.splice(i, 1);
    if (race.over() && !ended) {
      ended = true;
      setTimeout(() => ctx.onEnd(raceResult(ctx, race)), 1200);
    }
  }

  function render() {
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    overlay.begin();
    if (failed) {
      hudText(overlay.g, "Couldn't load sports day. Check your connection.", overlay.w / 2, overlay.h / 2, { size: 16, font: overlay.font.body, weight: 700, color: "#fff" });
      return;
    }
    if (!ready) {
      drawLoading(overlay, "Setting up sports day…", progress);
      return;
    }
    stage.adapt(frameDt);
    const clock = race.clock;
    race.racers.forEach((r, i) => {
      const v = views[i]!;
      let y = 0;
      let squash = 1;
      let tilt = 0;
      if (r.state === "air") {
        const u = clamp((clock - r.t0) / r.air, 0, 1);
        const wob = r.launch === "wobble";
        const h = r.leap ? (wob ? HOP.height.leapWobble : HOP.height.leap) : wob ? HOP.height.wobble : HOP.height.hop;
        y = 4 * h * u * (1 - u);
        squash = u < 0.12 ? lerp(r.leap ? 0.78 : 0.86, r.leap ? 1.12 : 1.06, u / 0.12) : (r.leap ? 1.12 : 1.06) - 0.06 * u;
        // Lean into a leap; a tripping hop pitches forward as it meets the hurdle.
        tilt = wob ? Math.sin(u * Math.PI * 3) * 0.12 : r.trip !== null ? u * 0.5 : r.leap ? -0.18 + u * 0.24 : -0.06;
      } else if (r.state === "fallen") {
        const u = clamp((clock - r.t0) / HOP.fallSeconds, 0, 1);
        // Topple forward, lie there, scramble back up.
        tilt = u < 0.2 ? (u / 0.2) * 1.45 : u < 0.75 ? 1.45 : 1.45 * (1 - (u - 0.75) / 0.25);
      } else if (r.state === "ground") {
        const since = clock - (r.t0 + r.air);
        squash = since < 0.1 ? lerp(r.stuck ? 0.8 : 0.86, 1, since / 0.1) : 1;
        // Stuck in mud: a slow sink-and-struggle wobble.
        if (r.stuck) tilt = Math.sin(clock * 9 + i) * 0.08;
      }
      v.rig.position.set(START_X + r.x, y - (r.stuck && r.state !== "air" ? 0.05 : 0), laneZ(i));
      v.char.root.rotation.x = tilt;
      v.sack.rotation.x = tilt;
      v.sack.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      // Sink the kid a little so the sack comes up to the waist.
      v.char.root.position.y = (squash - 1) * 0.5 - 0.06;
      v.band.emissiveIntensity = r.ginger ? 0.6 + 0.4 * Math.sin(clock * 14) : Math.max(0, v.band.emissiveIntensity - frameDt * 3);
      v.char.update(frameDt);
    });
    for (const c of crowd) c.update(frameDt);
    place?.update(frameDt, stage.camera.position);

    // Camera follows YOUR racer. Wide screens: side-on TV shot. Tall phone screens: a chase shot from
    // behind and beside you, so you and the lanes ahead stay in view. Pulls back a touch on ginger.
    const me = race.racers[PLAYER_LANE]!;
    const px = START_X + me.x;
    const aspect = overlay.w / Math.max(1, overlay.h);
    const portrait = clamp((1.3 - aspect) / 0.8, 0, 1);
    const back = me.ginger ? 0.5 : 0;
    // The side shot stops short of the classroom block at the end of the field.
    const sideX = Math.min(17, px);
    const wantCam = new THREE.Vector3(sideX + 0.4 - back, 1.85 + back * 0.3, -6.4 - back).lerp(new THREE.Vector3(px - 3.4 - back, 2.2 + back * 0.3, laneZ(PLAYER_LANE) - 2.9), portrait);
    const wantLook = new THREE.Vector3(sideX + 1.6, 0.75, laneZ(1.5)).lerp(new THREE.Vector3(px + 2.8, 0.55, laneZ(PLAYER_LANE) + 0.9), portrait);
    cam.lerp(wantCam, Math.min(1, frameDt * 4));
    look.lerp(wantLook, Math.min(1, frameDt * 5));
    const fov = 55 + portrait * 8;
    if (Math.abs(stage.camera.fov - fov) > 0.1) {
      stage.camera.fov = fov;
      stage.camera.updateProjectionMatrix();
    }
    stage.camera.position.copy(cam);
    if (shake > 0) stage.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    stage.camera.lookAt(look);
    stage.focusShadows(new THREE.Vector3(px + 2, 0, laneZ(PLAYER_LANE)));
    stage.render();
    drawHud(clock);
  }

  function drawHud(clock: number) {
    const { g, w: W, h: H, font } = overlay;
    const me = race.racers[PLAYER_LANE]!;

    // Landing ring: shrinks onto your sack; press as it closes. Purple means LEAP the hurdle ahead.
    const landed = clock - (me.t0 + me.air);
    if (clock >= 0 && (me.state === "air" || (me.state === "ground" && landed < 0.6))) {
      const landAt = me.t0 + me.air;
      const t = clamp((landAt - clock) / me.air, -0.5, 1);
      const leapCue = obstacles && hurdleAhead(course, me, me.state === "air" ? me.toX : me.x) !== null;
      const scr = overlay.project(new THREE.Vector3(START_X + me.toX, 0.02, laneZ(PLAYER_LANE)), stage.camera);
      if (scr) {
        const r = lerp(16, 64, clamp(t, 0, 1));
        const hot = Math.abs(t) < 0.18;
        g.lineWidth = 4;
        g.strokeStyle = leapCue ? LEAP_CUE : hot ? (me.ginger ? GINGER : "#ffd166") : "rgba(255,255,255,0.8)";
        g.beginPath();
        g.ellipse(scr.x, scr.y, r, r * 0.42, 0, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([4, 4]);
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(scr.x, scr.y, 16, 7, 0, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        if (leapCue && me.state === "air") hudText(g, "LEAP!", scr.x, scr.y - 34, { size: 20, font: font.display, color: LEAP_CUE, stroke: "rgba(0,0,0,0.6)" });
        else if (Math.abs(t) < 0.22) hudText(g, "HOP!", scr.x, scr.y - 34, { size: 20, font: font.display, color: "#ffd166", stroke: "rgba(0,0,0,0.6)" });
      }
    }

    // Hop meter: fills while you're in the air; press HOP when it's in the yellow zone (the landing).
    // Works even when you can't see your feet.
    if (clock >= 0 && me.state !== "done" && me.state !== "fallen") {
      const span = 1.3; // the bar shows 0..130% of the hop
      const mw = Math.min(W * 0.78, 320);
      const mx = (W - mw) / 2;
      const my = H - 58;
      const u = me.state === "air" ? clamp((clock - me.t0) / me.air, 0, span) : me.state === "ground" ? clamp(1 + landed / me.air, 1, span) : 0;
      const win = (HOP.window.good * LEVELS[difficulty].window) / Math.max(0.2, me.air);
      const zone0 = clamp(1 - win, 0, span) / span;
      const zone1 = clamp(1 + win, 0, span) / span;
      const leapCue = obstacles && hurdleAhead(course, me, me.state === "air" ? me.toX : me.x) !== null;
      const inZone = u / span >= zone0 && u / span <= zone1 && me.state !== "ready";
      roundRect(g, mx - 8, my - 8, mw + 16, 34, 14);
      g.fillStyle = "rgba(10,14,12,0.72)";
      g.fill();
      roundRect(g, mx + zone0 * mw, my - 2, (zone1 - zone0) * mw, 22, 8);
      g.fillStyle = leapCue ? "rgba(178,102,255,0.55)" : "rgba(255,209,102,0.45)";
      g.fill();
      roundRect(g, mx, my + 4, Math.max(6, (u / span) * mw), 10, 5);
      g.fillStyle = inZone ? (leapCue ? LEAP_CUE : "#ffd166") : "#7ee08a";
      g.fill();
      // Landing line
      g.fillStyle = "#fff";
      g.fillRect(mx + mw / span - 1, my - 4, 2, 26);
      const label = me.state === "ready" ? "Tap HOP to start" : inZone ? (leapCue ? "LEAP!" : "HOP NOW!") : me.state === "air" ? "in the air…" : "HOP!";
      hudText(g, label, W / 2, my - 18, { size: inZone ? 22 : 15, font: font.display, color: inZone ? (leapCue ? LEAP_CUE : "#ffd166") : "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4 });
    }

    // Race progress bar with every house, and the obstacles on it.
    const bw = Math.min(W - 140, 420);
    const bx = (W - bw) / 2;
    const by = 74; // below the pause + sound buttons
    roundRect(g, bx - 12, by - 14, bw + 24, 40, 14);
    g.fillStyle = "rgba(10,14,12,0.72)";
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(bx, by + 5, bw, 3);
    for (const [a, b] of course.mud) {
      g.fillStyle = "rgba(140,90,50,0.9)";
      g.fillRect(bx + (a / L) * bw, by + 3, ((b - a) / L) * bw, 7);
    }
    course.hurdles.forEach((h, k) => {
      g.fillStyle = me.knocked[k] ? "rgba(255,255,255,0.3)" : "#ff7a4f";
      g.fillRect(bx + (h / L) * bw - 1.5, by - 2, 3, 16);
    });
    hudText(g, "🏁", bx + bw + 2, by + 6, { size: 15, font: font.body, color: "#fff", shadow: false });
    race.racers.forEach((r, i) => {
      const x = bx + (Math.min(r.x, L) / L) * bw;
      g.beginPath();
      g.arc(x, by + 6, i === PLAYER_LANE ? 8 : 6, 0, Math.PI * 2);
      g.fillStyle = HOUSES[i]!.css;
      g.fill();
      if (i === PLAYER_LANE || r.ginger) {
        g.lineWidth = 2.5;
        g.strokeStyle = r.ginger ? GINGER : "#fff";
        g.stroke();
      }
    });
    const t = Math.max(0, me.finishTime ?? clock);
    // Narrow screens: the timer sits under the bar (opposite your place) so it doesn't cover the finish flag.
    const narrow = W < 560;
    hudText(g, `${t.toFixed(2)}s`, W - 16, narrow ? by + 52 : by + 6, { size: narrow ? 22 : 18, font: font.display, color: "#fff", align: "right", shadow: false, ...(narrow ? { stroke: "rgba(0,0,0,0.5)" } : {}) });
    if (clock > 0) {
      hudText(g, ordinal(race.standing(PLAYER_LANE)), 16, by + 52, { size: 26, font: font.display, color: "#ffd166", align: "left", stroke: "rgba(0,0,0,0.5)" });
      // Streak pips: fill four for GINGER.
      for (let k = 0; k < HOP.gingerStreak; k++) {
        g.beginPath();
        g.arc(22 + k * 15, by + 80, 5, 0, Math.PI * 2);
        g.fillStyle = me.ginger ? GINGER : k < me.streak ? "#ffd166" : "rgba(255,255,255,0.25)";
        g.fill();
      }
      if (me.ginger) hudText(g, `GINGER ×${me.streak}`, 16, by + 100, { size: 14, font: font.display, color: GINGER, align: "left", stroke: "rgba(0,0,0,0.6)" });
    }

    // The announcer.
    if (talk.text && talk.alpha > 0) {
      g.save();
      g.globalAlpha = talk.alpha;
      g.font = `800 14px ${font.body}`;
      const tw = Math.min(W - 150, g.measureText(talk.text).width + 40);
      roundRect(g, (W - tw) / 2, by + 34, tw, 26, 13);
      g.fillStyle = "rgba(10,14,12,0.62)";
      g.fill();
      g.restore();
      hudText(g, `📣 ${talk.text}`, W / 2, by + 47, { size: 14, font: font.body, weight: 800, color: "#fff", shadow: false, alpha: talk.alpha });
    }

    if (clock < 0) {
      const n = Math.ceil(-clock);
      const words = ["", "Get set…", "On your marks…", obstacles ? "Obstacle race!" : "Sack race!"];
      const k = easeOutBack(clamp((n + clock + 1) * 3, 0, 1));
      g.save();
      g.translate(W / 2, H * 0.4);
      g.scale(k, k);
      hudText(g, String(n), 0, 0, { size: 90, font: font.display, color: "#fff", stroke: "rgba(0,0,0,0.55)" });
      g.restore();
      hudText(g, words[n] ?? "", W / 2, H * 0.4 + 70, { size: 20, font: font.display, color: "#ffd166", stroke: "rgba(0,0,0,0.55)" });
      const tip = n === 3 ? "Press HOP as the ring closes on your sack" : n === 2 && obstacles ? "Ring turns purple? LEAP the hurdle!" : "Go right on the whistle for a rocket start";
      hudText(g, tip, W / 2, H - 40, { size: 15, font: font.body, weight: 700, color: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 4 });
    }
    popups.forEach((p, i) => {
      hudText(g, p.text, W / 2, H * 0.38 + i * (p.size + 6) - p.age * 14, { size: p.size, font: font.display, color: p.color, stroke: "rgba(0,0,0,0.6)", alpha: p.age < 0.9 ? 1 : 1 - (p.age - 0.9) / 0.4 });
    });
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
      disposed = true;
      loop.stop();
      unbind();
      for (const v of views) v.char.dispose();
      for (const c of crowd) c.dispose();
      bitGeo.dispose();
      for (const m of Object.values(bitMats)) m.dispose();
      music.dispose();
      place?.dispose();
      overlay.dispose();
      stage.dispose();
    },
  };
}
