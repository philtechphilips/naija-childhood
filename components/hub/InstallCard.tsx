"use client";

import { useEffect, useState } from "react";
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

/** Install prompt on Chromium browsers; manual Add-to-Home-Screen steps on iOS. */
export function InstallCard({ force = false }: { force?: boolean }) {
  const installEvent = useUi((s) => s.installEvent);
  const installed = useUi((s) => s.installed);
  const dismissedAt = useSettings((s) => s.installDismissedAt);
  const setSettings = useSettings((s) => s.set);
  const [ios, setIos] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => setIos(isIos()), []);

  const visible = !installed && (installEvent || ios) && (force || Date.now() - dismissedAt > WEEK);

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
        <strong>Install Naija Childhood</strong>
        <p>Play from your home screen — faster, full-screen, and solo games work offline.</p>
        {showSteps && (
          <ol className={styles.steps}>
            <li>
              Tap <Icon name="share" size={14} /> <b>Share</b> in Safari
            </li>
            <li>
              Choose <b>Add to Home Screen</b>
            </li>
          </ol>
        )}
      </div>
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="sun"
          onClick={async () => {
            if (installEvent) {
              await installEvent.prompt();
              const choice = await installEvent.userChoice;
              if (choice.outcome === "accepted") useUi.getState().setInstallEvent(null);
            } else {
              setShowSteps(true);
            }
          }}
        >
          Install
        </Button>
        {!force && (
          <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={() => setSettings({ installDismissedAt: Date.now() })}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
