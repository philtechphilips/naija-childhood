"use client";

import Link from "next/link";
import { useProfile } from "@/stores/profile-store";
import { ACHIEVEMENTS, levelInfo } from "@/lib/progression";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/bits";
import styles from "./PlayerHud.module.css";

/** Player badge: avatar inside a circular XP ring with the level on a pill. */
export function PlayerBadge() {
  const name = useProfile((s) => s.name);
  const avatar = useProfile((s) => s.avatar);
  const xp = useProfile((s) => s.xp);
  const lvl = levelInfo(xp);
  const R = 27;
  const C = 2 * Math.PI * R;
  return (
    <Link href="/profile" className={styles.badge} aria-label={`${name}, level ${lvl.level}`}>
      <span className={styles.ring}>
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="7" />
          <circle cx="32" cy="32" r={R} fill="none" stroke="#ffd23f" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${C * lvl.progress} ${C}`} transform="rotate(-90 32 32)" />
        </svg>
        <span className={styles.ringAvatar}>
          <Avatar name={name} color={avatar} size={44} />
        </span>
        <span className={styles.levelPill}>{lvl.level}</span>
      </span>
      <span className={styles.badgeText}>
        <strong>{name}</strong>
        <span>{lvl.title}</span>
      </span>
    </Link>
  );
}

/** Streak and achievement counters, styled like in-game currency chips. */
export function HudChips() {
  const streak = useProfile((s) => s.streak.current);
  const unlocked = useProfile((s) => Object.keys(s.achievements).length);
  return (
    <div className={styles.chips}>
      <span className={`${styles.chip} ${styles.chipFire}`} title="Day streak">
        <Icon name="flame" size={17} /> {streak}
      </span>
      <Link href="/profile" className={`${styles.chip} ${styles.chipStar}`} title="Achievements">
        <Icon name="star" size={17} fill="currentColor" /> {unlocked}/{ACHIEVEMENTS.length}
      </Link>
    </div>
  );
}

/** The top bar every hub screen shares: badge on the left, counters on the right. */
export function PlayerHud({ className, left }: { className?: string; left?: React.ReactNode }) {
  return (
    <header className={`${styles.hud} ${className ?? ""}`}>
      {left ?? <PlayerBadge />}
      <HudChips />
    </header>
  );
}
