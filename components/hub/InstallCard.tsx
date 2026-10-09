"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUi } from "@/stores/ui-store";
import { useSettings } from "@/stores/settings-store";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import styles from "./InstallCard.module.css";

const WEEK = 7 * 24 * 3600 * 1000;

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Install prompt where the browser supports it, and a link to the step-by-step guide for everyone. */
export function InstallCard({ force = false }: { force?: boolean }) {
  const installEvent = useUi((s) => s.installEvent);
  const installed = useUi((s) => s.installed);
  const dismissedAt = useSettings((s) => s.installDismissedAt);
  const setSettings = useSettings((s) => s.set);
  const [ios, setIos] = useState(false);

  useEffect(() => setIos(isIos()), []);

  const visible = !installed && (force || Date.now() - dismissedAt > WEEK);

  useEffect(() => {
    if (visible) track("install_prompt_shown", { ios });
  }, [visible, ios]);

  if (!visible) return null;

  return (
    <div className={styles.card}>
      <div className={styles.icon}>
        <Icon name="download" />
      </div>
      <div className={styles.text}>
        <strong>Add Naija Childhood to your home screen</strong>
        <p>Its own icon, full screen, and it works offline: no app store needed.</p>
        <Link href="/install" className={styles.how}>
          How to add it on {ios ? "iPhone" : "your phone"} <Icon name="chevron" size={14} />
        </Link>
      </div>
      <div className={styles.actions}>
        {installEvent && (
          <Button
            size="sm"
            variant="sun"
            onClick={async () => {
              await installEvent.prompt();
              const choice = await installEvent.userChoice;
              if (choice.outcome === "accepted") useUi.getState().setInstallEvent(null);
            }}
          >
            Install
          </Button>
        )}
        {!force && (
          <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={() => setSettings({ installDismissedAt: Date.now() })}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
