"use client";

import { create } from "zustand";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface UiState {
  /** Hides navigation while a game is being played. */
  immersive: boolean;
  online: boolean;
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  setImmersive: (v: boolean) => void;
  setOnline: (v: boolean) => void;
  setInstallEvent: (e: BeforeInstallPromptEvent | null) => void;
  setInstalled: (v: boolean) => void;
}

export type { BeforeInstallPromptEvent };

export const useUi = create<UiState>()((set) => ({
  immersive: false,
  online: true,
  installEvent: null,
  installed: false,
  setImmersive: (immersive) => set({ immersive }),
  setOnline: (online) => set({ online }),
  setInstallEvent: (installEvent) => set({ installEvent }),
  setInstalled: (installed) => set({ installed }),
}));
