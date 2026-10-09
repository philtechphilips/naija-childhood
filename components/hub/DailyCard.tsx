"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dailyChallenge, dayKey } from "@/lib/daily";
import { getGame } from "@/games/registry";
import { useProfile } from "@/stores/profile-store";
import { Photo } from "@/components/ui/Photo";
import { Icon } from "@/components/ui/Icon";
import styles from "./DailyCard.module.css";

function useTimeLeft() {
  const [left, setLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(24, 0, 0, 0);
      const ms = end.getTime() - now.getTime();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setLeft(`${h}h ${m}m left`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return left;
}

export function DailyCard({ large = false }: { large?: boolean }) {
  const challenge = dailyChallenge();
  const game = getGame(challenge.game);
  const done = useProfile((s) => s.daily[dayKey()]?.completed ?? false);
  const left = useTimeLeft();
  if (!game) return null;

  return (
    <Link href={`/games/${game.slug}?daily=1`} className={`${styles.card} ${large ? styles.large : ""}`} data-done={done}>
      <Photo name="school-yard" alt="Kids playing Ten-Ten in the market while traders look on" className={styles.photo} sizes="(min-width: 960px) 700px, 100vw" />
      <div className={styles.scrim} />
      <div className={styles.top}>
        <span className={styles.tag}>
          <Icon name="flag" size={14} /> Daily challenge
        </span>
        <span className={styles.timer}>
          <Icon name="clock" size={14} /> {left}
        </span>
      </div>
      <div className={styles.body}>
        <span className={styles.game}>{game.name}</span>
        <h3 className={styles.title}>{challenge.title}</h3>
        <p className={styles.desc}>{challenge.description}</p>
        <span className={styles.cta}>
          {done ? (
            <>
              <Icon name="check" size={18} /> Completed · +100 XP earned
            </>
          ) : (
            <>
              <Icon name="play" size={16} /> Take the challenge · +100 XP
            </>
          )}
        </span>
      </div>
    </Link>
  );
}
