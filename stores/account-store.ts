"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { GameSlug } from "@/games/types";
import { api, apiEnabled, setAuthProvider } from "@/lib/api";
import { useProfile } from "./profile-store";
import { useSync } from "./sync-store";

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  avatar: number;
  xp: number;
}

interface AuthResponse {
  user: AccountUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AccountState {
  user: AccountUser | null;
  accessToken: string | null;
  accessExpires: number;
  refreshToken: string | null;
  register: (input: { email: string; password: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Saves a name/avatar change to the account (no-op for guests). */
  saveProfile: (name: string, avatar: number) => Promise<void>;
  /** Pulls bests and profile from the server and merges them into this phone. */
  restore: () => Promise<void>;
  renew: () => Promise<string | null>;
}

let renewing: Promise<string | null> | null = null;

/**
 * Optional account. Guests play everything on the phone; logging in syncs
 * scores to the server so they reach global leaderboards and other devices.
 */
export const useAccount = create<AccountState>()(
  persist(
    (set, get) => {
      const signedIn = async (r: AuthResponse) => {
        set({ user: r.user, accessToken: r.accessToken, accessExpires: Date.now() + (r.expiresIn - 30) * 1000, refreshToken: r.refreshToken });
        useSync.getState().setEnabled(true);
        await get().restore();
      };
      return {
        user: null,
        accessToken: null,
        accessExpires: 0,
        refreshToken: null,
        async register({ email, password }) {
          const p = useProfile.getState();
          await signedIn(await api<AuthResponse>("/auth/register", { method: "POST", body: { email, password, name: p.name, avatar: p.avatar } }));
        },
        async login({ email, password }) {
          await signedIn(await api<AuthResponse>("/auth/login", { method: "POST", body: { email, password } }));
        },
        async logout() {
          const token = get().refreshToken;
          set({ user: null, accessToken: null, refreshToken: null, accessExpires: 0 });
          useSync.getState().setEnabled(false);
          if (token) await api("/auth/logout", { method: "POST", body: { refreshToken: token } }).catch(() => {});
        },
        async deleteAccount() {
          await api("/me", { method: "DELETE", authed: true });
          set({ user: null, accessToken: null, refreshToken: null, accessExpires: 0 });
          useSync.getState().setEnabled(false);
          useSync.getState().clear();
        },
        async saveProfile(name, avatar) {
          if (!get().user) return;
          const user = await api<AccountUser>("/me", { method: "PATCH", authed: true, body: { name, avatar } });
          set({ user });
        },
        async restore() {
          const me = await api<{ user: AccountUser; bests: Partial<Record<GameSlug, number>>; gamesPlayed: Record<string, number> }>("/me", { authed: true });
          set({ user: me.user });
          // Keep the better of what's on this phone and what's on the server.
          useProfile.setState((s) => {
            const bests = { ...s.bests };
            for (const [g, score] of Object.entries(me.bests) as [GameSlug, number][]) bests[g] = Math.max(bests[g] ?? 0, score);
            const gamesPlayed = { ...s.gamesPlayed };
            for (const [g, n] of Object.entries(me.gamesPlayed)) gamesPlayed[g] = Math.max(gamesPlayed[g] ?? 0, n);
            return { bests, gamesPlayed, name: me.user.name, avatar: me.user.avatar, xp: Math.max(s.xp, me.user.xp) };
          });
        },
        renew() {
          // One refresh at a time, however many requests hit a 401 together.
          renewing ??= (async () => {
            const token = get().refreshToken;
            if (!token) return null;
            try {
              const r = await api<AuthResponse>("/auth/refresh", { method: "POST", body: { refreshToken: token } });
              set({ user: r.user, accessToken: r.accessToken, accessExpires: Date.now() + (r.expiresIn - 30) * 1000, refreshToken: r.refreshToken });
              return r.accessToken;
            } catch {
              set({ user: null, accessToken: null, refreshToken: null, accessExpires: 0 });
              useSync.getState().setEnabled(false);
              return null;
            } finally {
              renewing = null;
            }
          })();
          return renewing;
        },
      };
    },
    {
      name: "naija-childhood:account",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user, refreshToken: s.refreshToken }),
      onRehydrateStorage: () => (s) => {
        if (s?.refreshToken) useSync.getState().setEnabled(true);
      },
    },
  ),
);

setAuthProvider({
  access() {
    const s = useAccount.getState();
    return s.accessToken && Date.now() < s.accessExpires ? s.accessToken : null;
  },
  renew: () => useAccount.getState().renew(),
});

export const accountsAvailable = apiEnabled;
