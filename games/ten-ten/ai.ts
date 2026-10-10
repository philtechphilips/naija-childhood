import type { Rng } from "@/games/core/rng";
import type { Judgement, Side } from "./rules";

export type Difficulty = "easy" | "normal" | "hard";

interface AiProfile {
  /** Probability the CPU acts on its read of your pattern instead of guessing. */
  read: number;
  /** Probability of fouling a throw. */
  foul: number;
  /** Probability of a perfect throw when it doesn't foul. */
  perfect: number;
  startBpm: number;
  /** bpm added after each throw, and the fastest it gets. */
  rampBpm: number;
  topBpm: number;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy: { read: 0.12, foul: 0.1, perfect: 0.3, startBpm: 84, rampBpm: 1.5, topBpm: 112 },
  normal: { read: 0.5, foul: 0.04, perfect: 0.55, startBpm: 96, rampBpm: 2, topBpm: 132 },
  hard: { read: 0.78, foul: 0.015, perfect: 0.8, startBpm: 112, rampBpm: 2.5, topBpm: 160 },
};

/**
 * Learns the human's habits: blends 2nd-order, 1st-order and overall
 * frequencies of their past throws to predict the next side.
 */
export class SidePredictor {
  private history: Side[] = [];
  private counts = new Map<string, { L: number; R: number }>();

  record(side: Side) {
    const h = this.history;
    const bump = (key: string) => {
      const c = this.counts.get(key) ?? { L: 0, R: 0 };
      c[side]++;
      this.counts.set(key, c);
    };
    bump("*");
    if (h.length >= 1) bump(`1:${h[h.length - 1]}`);
    if (h.length >= 2) bump(`2:${h[h.length - 2]}${h[h.length - 1]}`);
    h.push(side);
  }

  /** Probability the next throw is "L". */
  probLeft(): number {
    const h = this.history;
    const est = (key: string, weight: number) => {
      const c = this.counts.get(key);
      if (!c) return null;
      const n = c.L + c.R;
      return { p: (c.L + 0.5) / (n + 1), w: weight * Math.min(1, n / 3) };
    };
    const parts = [
      est("*", 0.5),
      h.length >= 1 ? est(`1:${h[h.length - 1]}`, 1) : null,
      h.length >= 2 ? est(`2:${h[h.length - 2]}${h[h.length - 1]}`, 1.6) : null,
    ].filter((x): x is { p: number; w: number } => x !== null && x.w > 0);
    if (parts.length === 0) return 0.5;
    const total = parts.reduce((s, x) => s + x.w, 0);
    return parts.reduce((s, x) => s + x.p * x.w, 0) / total;
  }
}

/** The CPU picks its side before it can see yours. */
export function cpuChooseSide(isLeader: boolean, predictor: SidePredictor, difficulty: Difficulty, rng: Rng): Side {
  const profile = AI_PROFILES[difficulty];
  if (rng() < profile.read) {
    const pl = predictor.probLeft();
    const predicted: Side = Math.abs(pl - 0.5) < 0.04 ? (rng() < 0.5 ? "L" : "R") : pl > 0.5 ? "L" : "R";
    // Leader wants the same side, follower wants the opposite.
    if (isLeader) return predicted;
    return predicted === "L" ? "R" : "L";
  }
  return rng() < 0.5 ? "L" : "R";
}

export function cpuTiming(difficulty: Difficulty, rng: Rng): { judgement: Judgement; offset: number } {
  const p = AI_PROFILES[difficulty];
  if (rng() < p.foul) return { judgement: "miss", offset: 0.3 };
  if (rng() < p.perfect) return { judgement: "perfect", offset: (rng() - 0.5) * 0.1 };
  return { judgement: "good", offset: (rng() - 0.5) * 0.24 };
}
