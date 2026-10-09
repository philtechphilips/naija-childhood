"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GameDefinition, GameResult } from "@/games/types";
import type { RecordOutcome } from "@/stores/profile-store";
import { useProfile } from "@/stores/profile-store";
import { levelInfo } from "@/lib/progression";
import { shareResult } from "@/lib/share";
import { track } from "@/lib/analytics";
import { Photo } from "@/components/ui/Photo";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/bits";
import styles from "./PostGame.module.css";

function useCountUp(target: number, ms = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reducedMotion === "true") {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function PostGame({
  game,
  result,
  outcome,
  onRematch,
  onChangeMode,
}: {
  game: GameDefinition;
  result: GameResult;
  outcome: RecordOutcome;
  onRematch: () => void;
  onChangeMode: () => void;
}) {
  const name = useProfile((s) => s.name);
  const xp = useProfile((s) => s.xp);
  const lvl = levelInfo(xp);
  const score = useCountUp(result.score);
  const [shareState, setShareState] = useState<"idle" | "busy" | "done">("idle");
  // Ignore taps/keys for a moment so button-mashing at the end of a game can't trigger a rematch.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArmed(true), 700);
    return () => clearTimeout(id);
  }, []);
  const won = result.won;
  const tone = won === true ? "win" : won === false ? "lose" : "neutral";
  const leveledUp = outcome.levelAfter > outcome.levelBefore;

  return (
    <div className={styles.page} data-tone={tone} style={{ ["--accent" as string]: game.accent }}>
      <Photo name={game.photo} alt="" className={styles.bg} />
      <div className={styles.scrim} />

      <div className={styles.content}>
        <p className={styles.kicker}>
          {game.name} · {game.modes.find((m) => m.id === result.mode)?.label}
        </p>
        <h1 className={styles.headline}>{result.headline}</h1>
        <p className={styles.detail}>{result.detail}</p>

        <div className={styles.scoreCard}>
          <span className="eyebrow">Score</span>
          <span className={`${styles.score} tabular`}>{score.toLocaleString()}</span>
          <div className={styles.badges}>
            {outcome.newBest && result.score > 0 && (
              <span className={styles.badgeSun}>
                <Icon name="sparkle" size={14} /> New personal best
              </span>
            )}
            {outcome.rank !== null && (
              <span className={styles.badge}>
                <Icon name="trophy" size={14} /> #{outcome.rank} on this phone
              </span>
            )}
            {outcome.dailyCompleted && (
              <span className={styles.badgeGreen}>
                <Icon name="check" size={14} /> Daily challenge done
              </span>
            )}
          </div>
          {outcome.rejected && (
            <p className={styles.rejected}>
              <Icon name="info" size={14} /> Not ranked: {outcome.rejected}.
            </p>
          )}
        </div>

        <div className={styles.xpCard}>
          <div className={styles.xpRow}>
            <strong>+{outcome.xpGained} XP</strong>
            <span>
              Level {lvl.level} · {lvl.title}
            </span>
          </div>
          <ProgressBar value={lvl.progress} label="Level progress" />
          {leveledUp && <p className={styles.levelUp}>Level up! You&apos;re now level {outcome.levelAfter}.</p>}
        </div>

        {outcome.newAchievements.length > 0 && (
          <div className={styles.achievements}>
            {outcome.newAchievements.map((a, i) => (
              <div key={a.code} className={styles.achievement} style={{ animationDelay: `${300 + i * 120}ms` }}>
                <span className={styles.medal}>
                  <Icon name="star" size={20} />
                </span>
                <div>
                  <strong>{a.name}</strong>
                  <p>{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <Button size="lg" block icon="refresh" onClick={() => armed && onRematch()} autoFocus>
            Rematch
          </Button>
          <div className={styles.row}>
            <Button
              size="lg"
              variant="secondary"
              icon="share"
              disabled={shareState === "busy"}
              onClick={async () => {
                setShareState("busy");
                track("share_clicked", { game: game.slug });
                try {
                  await shareResult(result, name);
                } finally {
                  setShareState("done");
                }
              }}
            >
              {shareState === "busy" ? "Preparing…" : "Share"}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => armed && onChangeMode()}>
              Change mode
            </Button>
          </div>
          <Link href="/" className={styles.home}>
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
