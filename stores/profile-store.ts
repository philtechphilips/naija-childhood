"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { GameResult, GameSlug } from "@/games/types";
import { ACHIEVEMENTS, levelInfo, xpForResult, type AchievementDef } from "@/lib/progression";
import { dailyChallenge, dayKey, meetsChallenge, shiftDay } from "@/lib/daily";
import { validateResult } from "@/lib/validation";
import { sanitizeName } from "@/lib/names";
import { useSync } from "./sync-store";

export interface SessionRecord {
  id: string;
  game: GameSlug;
  mode: string;
  score: number;
  won: boolean | null;
  at: number;
  durationMs: number;
  ranked: boolean;
  difficulty?: string;
  role?: string;
}

export interface RecordOutcome {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  newAchievements: AchievementDef[];
  newBest: boolean;
  previousBest: number;
  rank: number | null;
  dailyCompleted: boolean;
  rejected: string | null;
}

interface ProfileState {
  id: string;
  name: string;
  avatar: number;
  createdAt: number;
  xp: number;
  sessions: SessionRecord[];
  bests: Partial<Record<GameSlug, number>>;
  gamesPlayed: Record<string, number>;
  wins: Record<string, number>;
  totalRescues: number;
  achievements: Record<string, number>;
  favorites: GameSlug[];
  streak: { current: number; best: number; lastDay: string | null };
  daily: Record<string, { completed: boolean; bestScore: number }>;
  lastPlayed: GameSlug | null;

  setProfile: (name: string, avatar: number) => void;
  toggleFavorite: (slug: GameSlug) => void;
  recordResult: (result: GameResult) => RecordOutcome;
  reset: () => void;
}

const MAX_SESSIONS = 300;

const initial = () => ({
  id: "",
  name: "",
  avatar: 0,
  createdAt: 0,
  xp: 0,
  sessions: [] as SessionRecord[],
  bests: {},
  gamesPlayed: {},
  wins: {},
  totalRescues: 0,
  achievements: {},
  favorites: [] as GameSlug[],
  streak: { current: 0, best: 0, lastDay: null as string | null },
  daily: {},
  lastPlayed: null as GameSlug | null,
});

const isRanked = (r: GameResult) => r.mode !== "local" && r.mode !== "practice";

export const useProfile = create<ProfileState>()(
  persist(
    (set, get) => ({
      ...initial(),

      setProfile(name, avatar) {
        const state = get();
        set({
          name: sanitizeName(name),
          avatar,
          id: state.id || crypto.randomUUID(),
          createdAt: state.createdAt || Date.now(),
        });
      },

      toggleFavorite(slug) {
        const favs = get().favorites;
        set({ favorites: favs.includes(slug) ? favs.filter((f) => f !== slug) : [...favs, slug] });
      },

      recordResult(result) {
        const s = get();
        const today = dayKey();
        const validation = validateResult(result);
        const ranked = isRanked(result) && validation.ok;

        // Streak: consecutive days with at least one game. Missing a day just restarts it.
        let streak = s.streak;
        if (s.streak.lastDay !== today) {
          const current = s.streak.lastDay === shiftDay(today, -1) ? s.streak.current + 1 : 1;
          streak = { current, best: Math.max(s.streak.best, current), lastDay: today };
        }

        const challenge = dailyChallenge(today);
        const prevDaily = s.daily[today];
        const dailyHit = validation.ok && meetsChallenge(challenge, result);
        const dailyCompleted = dailyHit && !prevDaily?.completed;
        const daily = {
          ...s.daily,
          [today]: {
            completed: (prevDaily?.completed ?? false) || dailyHit,
            bestScore: result.game === challenge.game ? Math.max(prevDaily?.bestScore ?? 0, result.score) : prevDaily?.bestScore ?? 0,
          },
        };

        const xpGained = validation.ok ? xpForResult(result, { daily: dailyCompleted }) : 0;
        const levelBefore = levelInfo(s.xp).level;
        const xp = s.xp + xpGained;

        const gamesPlayed = { ...s.gamesPlayed, [result.game]: (s.gamesPlayed[result.game] ?? 0) + 1 };
        const wins = result.won && ranked ? { ...s.wins, [result.game]: (s.wins[result.game] ?? 0) + 1 } : s.wins;
        const totalRescues = s.totalRescues + (result.stats.rescues ?? 0);

        const previousBest = s.bests[result.game] ?? 0;
        const newBest = ranked && result.score > previousBest;
        const bests = newBest ? { ...s.bests, [result.game]: result.score } : s.bests;

        const record: SessionRecord = {
          id: crypto.randomUUID(),
          game: result.game,
          mode: result.mode,
          score: result.score,
          won: result.won,
          at: Date.now(),
          durationMs: result.durationMs,
          ranked,
          difficulty: result.options.difficulty,
          role: result.options.role,
        };
        const sessions = [record, ...s.sessions].slice(0, MAX_SESSIONS);

        let rank: number | null = null;
        if (ranked) {
          const sorted = sessions.filter((x) => x.game === result.game && x.ranked).sort((a, b) => b.score - a.score);
          rank = sorted.findIndex((x) => x.id === record.id) + 1;
        }

        const snapshot = { gamesPlayed, wins, totalRescues, streak: streak.current };
        const achievements = { ...s.achievements };
        const newAchievements: AchievementDef[] = [];
        if (validation.ok) {
          for (const a of ACHIEVEMENTS) {
            if (achievements[a.code]) continue;
            if (a.check(snapshot, result)) {
              achievements[a.code] = Date.now();
              newAchievements.push(a);
            }
          }
        }

        set({ xp, sessions, bests, gamesPlayed, wins, totalRescues, achievements, streak, daily, lastPlayed: result.game });
        // Queue for upload (only if online features are on); the server re-checks everything.
        if (validation.ok) useSync.getState().enqueue(result, record.id, record.at);

        return {
          xpGained,
          levelBefore,
          levelAfter: levelInfo(xp).level,
          newAchievements,
          newBest,
          previousBest,
          rank,
          dailyCompleted,
          rejected: validation.ok ? null : validation.reason,
        };
      },

      reset() {
        set(initial());
      },
    }),
    {
      name: "naija-childhood:profile",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { setProfile, toggleFavorite, recordResult, reset, ...data } = s;
        return data;
      },
    },
  ),
);
