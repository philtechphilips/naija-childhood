"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { GAMES } from "@/games/registry";
import type { GameDefinition } from "@/games/types";
import { api, apiEnabled, whenIdle } from "@/lib/api";

export interface RemoteConfig {
  games: Record<string, { enabled: boolean; badge: string | null }>;
  featured: string | null;
  announcement: { id: string; text: string; href: string | null } | null;
  roadmap: string[];
  minClientVersion: string;
}

interface State {
  config: RemoteConfig | null;
  fetchedAt: number;
  dismissed: string[];
  refresh: () => Promise<void>;
  dismiss: (id: string) => void;
}

const STALE_MS = 10 * 60_000;

/** Server-driven settings, remembered on the phone so the app starts instantly offline. */
export const useRemoteConfig = create<State>()(
  persist(
    (set, get) => ({
      config: null,
      fetchedAt: 0,
      dismissed: [],
      async refresh() {
        if (!apiEnabled || Date.now() - get().fetchedAt < STALE_MS) return;
        try {
          const r = await api<{ config: RemoteConfig }>("/config", { timeoutMs: 6000 });
          set({ config: r.config, fetchedAt: Date.now() });
        } catch {
          // Keep using the last good config.
        }
      },
      dismiss(id) {
        set({ dismissed: [...get().dismissed, id].slice(-20) });
      },
    }),
    { name: "naija-childhood:remote-config", version: 1, storage: createJSONStorage(() => localStorage), partialize: (s) => ({ config: s.config, fetchedAt: s.fetchedAt, dismissed: s.dismissed }) },
  ),
);

export function refreshRemoteConfigWhenIdle() {
  whenIdle(() => void useRemoteConfig.getState().refresh());
}

/** Games that are switched on, featured one first. Without a server: every game, in order. */
export function useGames(): (GameDefinition & { badge: string | null })[] {
  const config = useRemoteConfig((s) => s.config);
  return useMemo(() => {
    const list = GAMES.filter((g) => config?.games[g.slug]?.enabled !== false).map((g) => ({ ...g, badge: config?.games[g.slug]?.badge ?? null }));
    if (config?.featured) list.sort((a, b) => Number(b.slug === config.featured) - Number(a.slug === config.featured));
    return list;
  }, [config]);
}

export function useAnnouncement() {
  const config = useRemoteConfig((s) => s.config);
  const dismissed = useRemoteConfig((s) => s.dismissed);
  const a = config?.announcement;
  return a && !dismissed.includes(a.id) ? a : null;
}
