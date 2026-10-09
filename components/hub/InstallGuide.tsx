"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useUi } from "@/stores/ui-store";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/bits";
import { track } from "@/lib/analytics";
import { Screen } from "./Screen";
import styles from "./InstallGuide.module.css";

type Platform = "android" | "samsung" | "iphone" | "iphone-chrome" | "desktop";

/** Little drawings of the buttons people have to find, so the steps match what they see. */
const Key = ({ children, label }: { children: ReactNode; label: string }) => (
  <span className={styles.key} aria-label={label} role="img">
    {children}
  </span>
);
const Dots = () => <Key label="three dots menu">⋮</Key>;
const Burger = () => <Key label="menu">☰</Key>;
const ShareIcon = () => (
  <Key label="Share button">
    <Icon name="share" size={16} />
  </Key>
);
const PlusBox = () => (
  <Key label="Add to Home Screen">
    <Icon name="plus" size={16} />
  </Key>
);
const InstallIcon = () => (
  <Key label="Install icon">
    <Icon name="download" size={16} />
  </Key>
);

const GUIDES: Record<Platform, { label: string; browser: string; steps: ReactNode[] }> = {
  android: {
    label: "Android",
    browser: "Chrome",
    steps: [
      <>
        Open this page in <b>Chrome</b>.
      </>,
      <>
        Tap the <Dots /> menu at the top-right corner.
      </>,
      <>
        Tap <b>Add to Home screen</b> (or <b>Install app</b>).
      </>,
      <>
        Tap <b>Install</b> (or <b>Add</b>). The Naija Childhood icon lands on your home screen.
      </>,
    ],
  },
  samsung: {
    label: "Samsung",
    browser: "Samsung Internet",
    steps: [
      <>
        Open this page in <b>Samsung Internet</b>.
      </>,
      <>
        Tap the <Burger /> menu at the bottom-right.
      </>,
      <>
        Tap <b>Add page to</b>, then <b>Home screen</b>.
      </>,
      <>
        Tap <b>Add</b>. Done!
      </>,
    ],
  },
  iphone: {
    label: "iPhone",
    browser: "Safari",
    steps: [
      <>
        Open this page in <b>Safari</b>.
      </>,
      <>
        Tap the <ShareIcon /> <b>Share</b> button (bottom of the screen, or top on iPad).
      </>,
      <>
        Scroll down and tap <PlusBox /> <b>Add to Home Screen</b>.
      </>,
      <>
        Tap <b>Add</b> at the top-right. Open the game from your home screen from now on.
      </>,
    ],
  },
  "iphone-chrome": {
    label: "iPhone Chrome",
    browser: "Chrome on iPhone",
    steps: [
      <>
        Tap the <ShareIcon /> <b>Share</b> button in the address bar (iOS 16.4 or newer).
      </>,
      <>
        Tap <PlusBox /> <b>Add to Home Screen</b>.
      </>,
      <>
        Tap <b>Add</b>. If you don&apos;t see the option, open this page in <b>Safari</b> and follow the iPhone steps.
      </>,
    ],
  },
  desktop: {
    label: "Computer",
    browser: "Chrome or Edge",
    steps: [
      <>
        Open this page in <b>Chrome</b> or <b>Edge</b>.
      </>,
      <>
        Click the <InstallIcon /> <b>Install</b> icon at the right end of the address bar.
      </>,
      <>
        Click <b>Install</b>. Naija Childhood opens in its own window, and you can pin it to your taskbar or dock.
      </>,
    ],
  },
};

function detect(): { platform: Platform; inApp: string | null } {
  if (typeof navigator === "undefined") return { platform: "android", inApp: null };
  const ua = navigator.userAgent;
  const inApp = /FBAN|FBAV/i.test(ua) ? "Facebook" : /Instagram/i.test(ua) ? "Instagram" : /musical_ly|TikTok/i.test(ua) ? "TikTok" : /WhatsApp/i.test(ua) ? "WhatsApp" : /\bwv\b|; wv\)/i.test(ua) ? "this app" : null;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return { platform: /CriOS/i.test(ua) ? "iphone-chrome" : "iphone", inApp };
  if (/SamsungBrowser/i.test(ua)) return { platform: "samsung", inApp };
  if (/Android/i.test(ua)) return { platform: "android", inApp };
  return { platform: "desktop", inApp };
}

/** "Add to Home Screen" guide: one-tap install where the browser allows it, clear steps everywhere else. */
export function InstallGuide() {
  const installEvent = useUi((s) => s.installEvent);
  const installed = useUi((s) => s.installed);
  const [platform, setPlatform] = useState<Platform>("android");
  const [inApp, setInApp] = useState<string | null>(null);

  useEffect(() => {
    const d = detect();
    setPlatform(d.platform);
    setInApp(d.inApp);
    track("install_prompt_shown", { platform: d.platform, guide: true });
  }, []);

  const guide = GUIDES[platform];

  return (
    <Screen photo="school-friends" title="Add to Home Screen" kicker="Play like a real app" back={{ href: "/profile", label: "Back" }}>
      <div className={styles.wrap}>
        {installed ? (
          <section className={`${styles.panel} ${styles.done}`}>
            <span className={styles.big}>
              <Icon name="check" size={28} />
            </span>
            <div>
              <strong>You don add am already!</strong>
              <p>Naija Childhood is on your home screen. Open it from the icon for full-screen play.</p>
            </div>
          </section>
        ) : installEvent ? (
          <section className={`${styles.panel} ${styles.oneTap}`}>
            <div>
              <strong>One tap and you&apos;re done</strong>
              <p>Your browser can install Naija Childhood straight away.</p>
            </div>
            <button
              type="button"
              className={styles.installBtn}
              onClick={async () => {
                await installEvent.prompt();
                const choice = await installEvent.userChoice;
                if (choice.outcome === "accepted") useUi.getState().setInstallEvent(null);
              }}
            >
              <Icon name="download" size={24} /> Install now
            </button>
          </section>
        ) : null}

        {inApp && !installed && (
          <section className={`${styles.panel} ${styles.warn}`}>
            <strong>First, open this page in your browser</strong>
            <p>
              You opened the game inside <b>{inApp}</b>, which can&apos;t add it to your home screen. Tap the <Dots /> or <b>…</b> menu and choose{" "}
              <b>{platform.startsWith("iphone") ? "Open in Safari" : "Open in Chrome"}</b> (or <b>Open in browser</b>). Then follow the steps below.
            </p>
          </section>
        )}

        <section className={styles.panel} aria-labelledby="steps-title">
          <h2 id="steps-title" className={styles.panelTitle}>
            {guide.label === "Computer" ? "On a computer" : `On ${guide.label}`}
          </h2>
          <Segmented
            label="Your phone"
            value={platform}
            onChange={setPlatform}
            options={(Object.keys(GUIDES) as Platform[]).map((p) => ({ value: p, label: GUIDES[p].label }))}
          />
          <p className={styles.browser}>
            Using <b>{guide.browser}</b>
          </p>
          <ol className={styles.steps}>
            {guide.steps.map((s, i) => (
              <li key={i} className={styles.step}>
                <span className={styles.num}>{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.panel} aria-labelledby="why-title">
          <h2 id="why-title" className={styles.panelTitle}>
            Why add am?
          </h2>
          <ul className={styles.perks}>
            <li>
              <span>📱</span> Its own icon on your home screen, like any other app
            </li>
            <li>
              <span>🖥️</span> Full screen, with no browser bars in the way of the game
            </li>
            <li>
              <span>📶</span> Works offline once loaded: play even when data finish
            </li>
            <li>
              <span>⚡</span> Opens faster, and there&apos;s no app store download wahala
            </li>
          </ul>
        </section>
      </div>
    </Screen>
  );
}
