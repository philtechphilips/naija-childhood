"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SettingsState {
  sound: boolean;
  /** Background Naija beats in games (sound effects stay on). */
  music: boolean;
  haptics: boolean;
  /** null = follow the OS setting. */
  reducedMotion: boolean | null;
  installDismissedAt: number;
  /** "auto" picks realistic 3D when the device supports WebGL2. */
  graphics: "auto" | "3d" | "2d";
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      sound: true,
      music: true,
      haptics: true,
      reducedMotion: null,
      installDismissedAt: 0,
      graphics: "auto",
      set: (patch) => set(patch),
    }),
    {
      name: "naija-childhood:settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      partialize: ({ set: _set, ...data }) => data,
    },
  ),
);

export function prefersReducedMotion(setting: boolean | null): boolean {
  if (setting !== null) return setting;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
