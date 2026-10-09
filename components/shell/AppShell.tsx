"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/stores/profile-store";
import { useSettings } from "@/stores/settings-store";
import { useUi } from "@/stores/ui-store";
import { Nav } from "./Nav";
import { Onboarding } from "./Onboarding";
import { Splash } from "./Splash";
import { NetworkStatus } from "./NetworkStatus";
import { usePwa } from "./usePwa";
import { useAccount } from "@/stores/account-store";
import { scheduleSync } from "@/stores/sync-store";
import { refreshRemoteConfigWhenIdle } from "@/stores/remote-config";
import styles from "./AppShell.module.css";

function useHydrated() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const done = () => useProfile.persist.hasHydrated() && useSettings.persist.hasHydrated();
    if (done()) {
      setReady(true);
      return;
    }
    const unsubs = [useProfile.persist.onFinishHydration(() => done() && setReady(true)), useSettings.persist.onFinishHydration(() => done() && setReady(true))];
    return () => unsubs.forEach((u) => u());
  }, []);
  return ready;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const name = useProfile((s) => s.name);
  const immersive = useUi((s) => s.immersive);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  usePwa();

  // Online extras, all in idle time and never during a game: config refresh and score sync.
  useEffect(() => {
    void useAccount.persist?.hasHydrated();
    refreshRemoteConfigWhenIdle();
    scheduleSync(3000);
    const onOnline = () => scheduleSync(500);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  useEffect(() => {
    if (!immersive) scheduleSync(2500);
  }, [immersive]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion === null ? "auto" : String(reducedMotion);
  }, [reducedMotion]);

  if (!hydrated) return <Splash />;
  if (!name) return <Onboarding />;

  return (
    <div className={styles.shell} data-immersive={immersive}>
      {!immersive && <Nav />}
      <main className={styles.main}>{children}</main>
      <NetworkStatus />
    </div>
  );
}
