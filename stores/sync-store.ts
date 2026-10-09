"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { GameResult } from "@/games/types";
import { api, apiEnabled, ApiError, whenIdle } from "@/lib/api";
import { useUi } from "./ui-store";

export interface Queued {
  clientId: string;
  playedAt: string;
  result: GameResult;
}

interface SubmitOutcome {
  clientId: string;
  status: "accepted" | "duplicate" | "rejected";
}

/** Keep at most this many unsynced games (a guest's recent games wait here until they sign up). */
const MAX_QUEUE = 50;

interface SyncState {
  queue: Queued[];
  lastSyncAt: number | null;
  /** Set by the account store: whether there's someone to sync for. */
  enabled: boolean;
  syncing: boolean;
  enqueue: (result: GameResult, clientId: string, at: number) => void;
  flush: () => Promise<void>;
  setEnabled: (v: boolean) => void;
  clear: () => void;
}

let retryDelay = 5_000;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Background upload of finished games. Never runs while a game is on screen,
 * waits for idle time, batches up to 50 results per request, and backs off on
 * failure. Uploads are idempotent (clientId), so retries never double-count.
 */
export const useSync = create<SyncState>()(
  persist(
    (set, get) => ({
      queue: [],
      lastSyncAt: null,
      enabled: false,
      syncing: false,
      enqueue(result, clientId, at) {
        if (!apiEnabled) return;
        const queue = [...get().queue, { clientId, playedAt: new Date(at).toISOString(), result }].slice(-MAX_QUEUE);
        set({ queue });
        scheduleSync(4000);
      },
      setEnabled(enabled) {
        set({ enabled });
        if (enabled) scheduleSync(1500);
      },
      clear() {
        set({ queue: [], lastSyncAt: null });
      },
      async flush() {
        const s = get();
        if (!apiEnabled || !s.enabled || s.syncing || s.queue.length === 0) return;
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        // Never compete with a running game for the network or the main thread.
        if (useUi.getState().immersive) return scheduleSync(10_000);
        set({ syncing: true });
        const batch = s.queue.slice(0, 50);
        try {
          const res = await api<{ results: SubmitOutcome[] }>("/sessions", {
            method: "POST",
            authed: true,
            timeoutMs: 15_000,
            body: { results: batch.map((q) => ({ ...q.result, clientId: q.clientId, playedAt: q.playedAt })) },
          });
          // Accepted, duplicate and rejected are all final: drop them from the queue.
          const done = new Set(res.results.map((r) => r.clientId));
          set({ queue: get().queue.filter((q) => !done.has(q.clientId)), lastSyncAt: Date.now() });
          retryDelay = 5_000;
          if (get().queue.length) scheduleSync(1000);
        } catch (e) {
          // Logged out / bad request: stop. Network or server trouble: try again later.
          if (e instanceof ApiError && e.status === 401) set({ enabled: false });
          else if (e instanceof ApiError && e.status === 400) set({ queue: get().queue.slice(batch.length) });
          else {
            retryDelay = Math.min(retryDelay * 2, 5 * 60_000);
            scheduleSync(retryDelay);
          }
        } finally {
          set({ syncing: false });
        }
      },
    }),
    {
      name: "naija-childhood:sync",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ queue: s.queue, lastSyncAt: s.lastSyncAt }),
    },
  ),
);

export function scheduleSync(delay = 2000) {
  if (!apiEnabled || typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    whenIdle(() => void useSync.getState().flush());
  }, delay);
}
