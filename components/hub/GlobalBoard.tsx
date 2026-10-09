"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GameSlug } from "@/games/types";
import { api } from "@/lib/api";
import { useAccount } from "@/stores/account-store";
import { Avatar } from "@/components/ui/bits";
import styles from "./LeaderboardView.module.css";

interface Row {
  rank: number;
  userId: string;
  name: string;
  avatar: number;
  score: number;
}

/** Session cache: boards show instantly when you flip back, then refresh quietly. */
const cache = new Map<string, Row[]>();

export function GlobalBoard({ game, period }: { game: GameSlug; period: "all" | "week" | "today" }) {
  const key = `${game}:${period}`;
  const user = useAccount((s) => s.user);
  const [rows, setRows] = useState<Row[] | null>(() => cache.get(key) ?? null);
  const [me, setMe] = useState<{ rank: number; score: number } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setRows(cache.get(key) ?? null);
    setError(false);
    api<{ rows: Row[] }>(`/leaderboards/${game}?period=${period}&limit=50`)
      .then((r) => {
        cache.set(key, r.rows);
        if (alive) setRows(r.rows);
      })
      .catch(() => alive && !cache.has(key) && setError(true));
    if (user) {
      api<{ me: { rank: number; score: number } | null }>(`/leaderboards/${game}/me?period=${period}`, { authed: true })
        .then((r) => alive && setMe(r.me))
        .catch(() => {});
    } else setMe(null);
    return () => {
      alive = false;
    };
  }, [game, period, key, user]);

  if (error) return <p className={styles.note}>Couldn&apos;t load the global board. Check your connection; your scores on this phone are below.</p>;
  if (!rows) return <p className={styles.note}>Loading the global board…</p>;

  const inTop = user && rows.some((r) => r.userId === user.id);
  return (
    <>
      {rows.length === 0 ? (
        <p className={styles.note}>Nobody has a score here yet. Play now and be first!</p>
      ) : (
        <ol className={styles.board}>
          {rows.map((r) => (
            <li key={r.userId} className={styles.row} data-you={user?.id === r.userId} data-top={r.rank <= 3}>
              <span className={`${styles.rank} tabular`}>{r.rank}</span>
              <Avatar name={r.name} color={r.avatar} size={38} />
              <span className={styles.who}>
                <strong>{user?.id === r.userId ? `${r.name} (you)` : r.name}</strong>
              </span>
              <span className={`${styles.score} tabular`}>{r.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
      {user && me && !inTop && (
        <ol className={styles.board}>
          <li className={styles.row} data-you>
            <span className={`${styles.rank} tabular`}>{me.rank}</span>
            <Avatar name={user.name} color={user.avatar} size={38} />
            <span className={styles.who}>
              <strong>{user.name} (you)</strong>
            </span>
            <span className={`${styles.score} tabular`}>{me.score.toLocaleString()}</span>
          </li>
        </ol>
      )}
      {!user && (
        <p className={styles.note}>
          You&apos;re playing as a guest. <Link href="/profile">Create an account</Link> to get your scores on the global board.
        </p>
      )}
    </>
  );
}
