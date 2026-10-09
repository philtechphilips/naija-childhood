import { createRng } from "@/games/core/rng";
import { clamp, easeInOut, lerp } from "@/games/core/draw";
import type { SfxName } from "@/games/core/audio";
import type { GameResult } from "@/games/types";
import { EV, generateBoard, hopPlan, HOP_WINDOW, judgeHop, judgeThrow, LIVES, replay, SUWE_LEVELS, type Board, type Foot, type Step, type SuweDifficulty } from "./rules";

/**
 * Suwe run state machine, shared by the 2D and 3D renderers.
 * Board space: x across (single box -0.5..0.5, doubles -1..1), z along the board (row r spans r..r+1).
 */
export interface V {
  x: number;
  z: number;
}

export interface Feet {
  l: V;
  r: V;
  lift: number;
  oneFoot: boolean;
}

export type SuweEvent =
  | { type: "sfx"; name: SfxName; volume?: number }
  | { type: "haptic"; pattern: number | number[] }
  | { type: "popup"; text: string; color: string; size: number; y: number }
  | { type: "board" }
  | { type: "throw"; box: number }
  | { type: "land"; step: Step; ok: boolean }
  | { type: "finish"; result: Omit<GameResult, "options"> };

const START_FEET: Feet = { l: { x: -0.2, z: -0.7 }, r: { x: 0.2, z: -0.7 }, lift: 0, oneFoot: false };

export type SuweMatch = ReturnType<typeof createSuweMatch>;

export function createSuweMatch(opts: { mode: string; seed: number; difficulty?: string }) {
  const daily = opts.mode === "daily";
  const difficulty: SuweDifficulty = opts.difficulty === "normal" || opts.difficulty === "hard" ? opts.difficulty : "easy";
  const tuning = SUWE_LEVELS[difficulty];
  /** Easy: the beat waits for your press instead of moving on without you. */
  const relaxed = tuning.waits;
  const rng = createRng(opts.seed);
  const level0 = daily ? 1 + Math.floor(rng() * 3) : 0;
  const st = {
    level: level0,
    board: generateBoard(rng, level0) as Board,
    target: 1,
    lives: LIVES,
    livesAtBoardStart: LIVES,
    totals: replay([]),
    clock: 0,
    phase: "intro" as "intro" | "throw" | "flight" | "hop" | "fail" | "end",
    phaseAt: 0,
    sweep: 0,
    sweepDir: 1,
    sweepSpeed: 1,
    thrownBox: 0,
    stoneBox: 0,
    stoneFrom: { x: 0.25, z: -0.75 } as V,
    plan: [] as Step[],
    stepIndex: 0,
    beat: 0.6,
    nextAt: 0,
    stepPressed: null as { foot: Foot; offset: number } | null,
    holdingStone: true,
    failText: "",
    feetFrom: START_FEET,
    feetTo: START_FEET,
    moveAt: -10,
  };
  const log: number[] = [];
  let ended = false;
  let out: SuweEvent[] = [];
  const emit = (e: SuweEvent) => out.push(e);
  const sfx = (name: SfxName, volume?: number) => emit({ type: "sfx", name, volume });
  const popup = (text: string, color: string, size = 26, y = 0.42) => emit({ type: "popup", text, color, size, y });

  const rows = () => st.board.rows.length;
  const boxCenter = (index: number): V => {
    const b = st.board.boxes.find((x) => x.index === index);
    if (!b) return { x: 0, z: 0 };
    return { x: b.cols === 1 ? 0 : b.col === 0 ? -0.5 : 0.5, z: b.row + 0.5 };
  };
  const boxBounds = (index: number) => {
    const b = st.board.boxes.find((x) => x.index === index)!;
    const x0 = b.cols === 1 ? -0.5 : b.col === 0 ? -1 : 0;
    return { x0, x1: x0 + 1, z0: b.row, z1: b.row + 1 };
  };

  function stepFeet(s: Step): Feet {
    if (s.home) return { l: { x: -0.32, z: rows() + 0.45 }, r: { x: 0.32, z: rows() + 0.45 }, lift: 0, oneFoot: false };
    if (s.exit) return START_FEET;
    if (s.foot === "split") {
      const [a, b] = s.boxes.map(boxCenter);
      return { l: a!, r: b!, lift: 0, oneFoot: false };
    }
    const c = boxCenter(s.boxes[0]!);
    // Standing on the right foot; the left one tucked up behind.
    return { l: { x: c.x - 0.16, z: c.z - 0.28 }, r: { x: c.x + 0.05, z: c.z }, lift: 0, oneFoot: true };
  }

  function currentFeet(): Feet {
    const t = clamp((st.clock - st.moveAt) / 0.22, 0, 1);
    const e = easeInOut(t);
    const lp = (a: V, b: V): V => ({ x: lerp(a.x, b.x, e), z: lerp(a.z, b.z, e) });
    return { l: lp(st.feetFrom.l, st.feetTo.l), r: lp(st.feetFrom.r, st.feetTo.r), lift: Math.sin(t * Math.PI), oneFoot: t < 0.5 ? st.feetFrom.oneFoot : st.feetTo.oneFoot };
  }

  function setFeet(next: Feet) {
    st.feetFrom = currentFeet();
    st.feetTo = next;
    st.moveAt = st.clock;
  }

  function push(ev: number) {
    log.push(ev);
    st.totals = replay(log);
  }

  function startThrow() {
    st.phase = "throw";
    st.phaseAt = st.clock;
    st.holdingStone = true;
    st.sweep = 0;
    st.sweepDir = 1;
    st.sweepSpeed = (1 / Math.max(0.2, 0.46 - st.level * 0.035 - st.target * 0.006)) * (daily ? 1.05 : 1) * tuning.sweep;
    st.stepIndex = 0;
    setFeet(START_FEET);
  }

  function loseLife(text: string) {
    st.lives--;
    st.failText = text;
    st.phase = "fail";
    st.phaseAt = st.clock;
    sfx("miss");
    emit({ type: "haptic", pattern: [60, 40, 60] });
    if (st.lives <= 0) {
      st.phase = "end";
      st.phaseAt = st.clock;
      sfx("lose");
    }
  }

  function doThrow() {
    const n = st.board.boxes.length;
    const pos = clamp(st.sweep, 0, n - 0.0001);
    st.thrownBox = Math.floor(pos) + 1;
    const j = judgeThrow(st.thrownBox === st.target, pos - Math.floor(pos));
    st.stoneBox = st.thrownBox;
    st.stoneFrom = { x: 0.25, z: -0.75 };
    st.holdingStone = false;
    st.phase = "flight";
    st.phaseAt = st.clock;
    sfx("chalk", 0.6);
    emit({ type: "throw", box: st.thrownBox });
    if (j === "miss") {
      push(EV.throwMiss);
      return;
    }
    push(j === "perfect" ? EV.throwPerfect : EV.throwGood);
    popup(j === "perfect" ? "BULLSEYE!" : "IN!", j === "perfect" ? "#ffd166" : "#7ee08a", 28, 0.32);
    if (j === "perfect") sfx("perfect", 0.8);
  }

  function startHops() {
    st.plan = hopPlan(st.board, st.target);
    st.stepIndex = 0;
    st.beat = Math.max(0.36, 0.62 - st.level * 0.035 - st.target * 0.004) * tuning.beat;
    st.nextAt = st.clock + st.beat * 1.6;
    st.stepPressed = null;
    st.phase = "hop";
    st.phaseAt = st.clock;
  }

  function resolveStep() {
    const s = st.plan[st.stepIndex]!;
    const p = st.stepPressed;
    const j = judgeHop(p?.offset ?? null, p?.foot ?? null, s.foot, tuning.window, relaxed);
    setFeet(stepFeet(s));
    if (j === "miss") {
      push(EV.hopMiss);
      const text = !p ? "Too slow!" : p.foot !== s.foot ? (s.foot === "split" ? "Both feet there!" : "One foot only!") : p.offset < 0 ? "Too early!" : "Too late!";
      emit({ type: "land", step: s, ok: false });
      loseLife(`${text} You stepped on the line.`);
      return;
    }
    push(j === "perfect" ? EV.hopPerfect : EV.hopGood);
    emit({ type: "land", step: s, ok: true });
    sfx(j === "perfect" ? "perfect" : "stomp", j === "perfect" ? 0.5 : 0.6);
    emit({ type: "haptic", pattern: 10 });
    if (j === "perfect" && st.totals.combo % 6 === 0 && st.totals.combo > 0) popup(`COMBO ×${st.totals.combo}`, "#ffd166", 24, 0.3);
    if (s.pick) {
      st.holdingStone = true;
      st.stoneBox = 0;
      popup("Stone picked!", "#f4f1ea", 18, 0.36);
    }
    st.stepIndex++;
    st.stepPressed = null;
    // Easy: the next ring starts closing from now, however long you took.
    st.nextAt = relaxed ? Math.max(st.nextAt, st.clock) + st.beat : st.nextAt + st.beat;
    if (st.stepIndex >= st.plan.length) boxDone();
  }

  function boxDone() {
    push(EV.boxCleared);
    sfx("point");
    st.target++;
    if (st.target > st.board.boxes.length) {
      push(EV.boardCleared);
      const perfectBoard = st.lives === st.livesAtBoardStart;
      if (perfectBoard) push(EV.perfectBoard);
      sfx("win");
      popup(perfectBoard ? "PERFECT BOARD!" : "BOARD CLEARED!", "#ffd166", 32, 0.4);
      if (daily) {
        st.phase = "end";
        st.phaseAt = st.clock;
        return;
      }
      st.level++;
      st.board = generateBoard(rng, st.level);
      emit({ type: "board" });
      st.target = 1;
      st.livesAtBoardStart = st.lives;
      st.phase = "fail";
      st.failText = `Board ${st.level + 1}: faster, longer. Oya!`;
      st.phaseAt = st.clock;
      return;
    }
    popup(`Box ${st.target - 1} done!`, "#7ee08a", 24, 0.36);
    startThrow();
  }

  function result(): Omit<GameResult, "options"> {
    const t = st.totals;
    const won = daily ? st.target > st.board.boxes.length : null;
    return {
      game: "suwe",
      mode: opts.mode,
      score: t.score,
      won,
      durationMs: Math.round(st.clock * 1000),
      headline: daily
        ? won
          ? "Daily board cleared!"
          : `Reached box ${st.target} of ${st.board.boxes.length}`
        : t.boxes === 0
          ? "No step on line! Try again"
          : `${t.boxes} box${t.boxes === 1 ? "" : "es"} cleared${t.boards > 0 ? ` · ${t.boards} full board${t.boards === 1 ? "" : "s"}` : ""}`,
      detail: `Best combo ×${t.bestCombo} · ${t.perfects} perfect landings`,
      stats: { boxes: t.boxes, boards: t.boards, perfectBoards: t.perfectBoards, bestCombo: t.bestCombo, perfects: t.perfects },
      seed: opts.seed,
      log: [...log],
    };
  }

  function press(foot: Foot): SuweEvent[] {
    out = [];
    if (st.phase === "throw") doThrow();
    else if (st.phase === "hop" && !st.stepPressed) {
      const offset = st.clock - st.nextAt;
      // Far too early: ignore, so a nervous double-tap isn't punished. On Easy any press
      // counts once the last hop has landed (at least 0.3s apart, like a real hop).
      const ok = relaxed ? st.clock - st.moveAt >= 0.3 : offset >= -0.32 * Math.max(1, tuning.window * 0.8);
      if (ok) {
        st.stepPressed = { foot, offset };
        resolveStep();
      }
    }
    return out;
  }

  function update(dt: number): SuweEvent[] {
    out = [];
    st.clock += dt;
    switch (st.phase) {
      case "intro":
        if (st.clock > 1.4) startThrow();
        break;
      case "throw": {
        const n = st.board.boxes.length;
        st.sweep += st.sweepDir * st.sweepSpeed * dt;
        if (st.sweep >= n) {
          st.sweep = n - 0.0001;
          st.sweepDir = -1;
        } else if (st.sweep <= 0) {
          st.sweep = 0;
          st.sweepDir = 1;
        }
        break;
      }
      case "flight":
        if (st.clock - st.phaseAt > 0.55) {
          sfx("chalk", 0.9);
          if (st.thrownBox !== st.target) loseLife(`Missed! The stone landed in box ${st.thrownBox}.`);
          else startHops();
        }
        break;
      case "hop":
        if (!relaxed && !st.stepPressed && st.clock > st.nextAt + HOP_WINDOW.good * tuning.window) resolveStep();
        break;
      case "fail":
        if (st.clock - st.phaseAt > 1.6) {
          st.stoneBox = 0;
          startThrow();
        }
        break;
      case "end":
        if (!ended && st.clock - st.phaseAt > 1.8) {
          ended = true;
          emit({ type: "finish", result: result() });
        }
        break;
    }
    return out;
  }

  return { st, daily, relaxed, difficulty, rows, boxCenter, boxBounds, stepFeet, currentFeet, press, update };
}
