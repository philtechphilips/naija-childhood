"use client";

import { useMemo, useState } from "react";
import { GAMES } from "@/games/registry";
import type { GameSlug } from "@/games/types";
import { useProfile } from "@/stores/profile-store";
import { RIVALS } from "@/lib/rivals";
import { Avatar, Segmented } from "@/components/ui/bits";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/Button";
import { apiEnabled } from "@/lib/api";
import { useGames } from "@/stores/remote-config";
import { GlobalBoard } from "./GlobalBoard";
import page from "./page.module.css";
import { Screen } from "./Screen";
import styles from "./LeaderboardView.module.css";

const WEEK = 7 * 24 * 3600 * 1000;
const DATE = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" });

interface Row {
  key: string;
  name: string;
  score: number;
  you: boolean;
  sub: string;
}

export function LeaderboardView() {
  const [game, setGame] = useState<GameSlug>("ten-ten");
  const [period, setPeriod] = useState<"week" | "all">("all");
  const [scope, setScope] = useState<"global" | "phone">(apiEnabled ? "global" : "phone");
  const games = useGames();
  const sessions = useProfile((s) => s.sessions);
  const name = useProfile((s) => s.name);
  const avatar = useProfile((s) => s.avatar);

  const rows = useMemo<Row[]>(() => {
    const since = period === "week" ? Date.now() - WEEK : 0;
    const mine = sessions
      .filter((s) => s.game === game && s.ranked && s.at >= since && s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map<Row>((s) => ({
        key: s.id,
        name,
        score: s.score,
        you: true,
        sub: `${DATE.format(s.at)}${s.difficulty ? ` · ${s.difficulty}` : ""}${s.role ? ` · ${s.role}` : ""}`,
      }));
    const rivals = RIVALS[game].map<Row>((r) => ({ key: r.name, name: r.name, score: r.score, you: false, sub: "CPU rival" }));
    return [...mine, ...rivals].sort((a, b) => b.score - a.score);
  }, [sessions, game, period, name]);

  const def = GAMES.find((g) => g.slug === game)!;
  const hasMine = rows.some((r) => r.you);

  return (
    <Screen photo="intensity" title="Leaderboards" kicker="Beat the street rivals">

      <div className={styles.controls}>
        {apiEnabled && (
          <Segmented
            label="Scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: "global", label: "🌍 Global" },
              { value: "phone", label: "📱 This phone" },
            ]}
          />
        )}
        <Segmented label="Game" value={game} onChange={setGame} options={games.map((g) => ({ value: g.slug, label: g.name }))} />
        <Segmented
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: "This week" },
            { value: "all", label: "All time" },
          ]}
        />
      </div>

      {scope === "global" && <GlobalBoard game={game} period={period} />}

      {scope === "phone" && (
      <ol className={styles.board}>
        {rows.map((r, i) => (
          <li key={r.key} className={styles.row} data-you={r.you} data-top={i < 3}>
            <span className={`${styles.rank} tabular`}>{i + 1}</span>
            {r.you ? (
              <Avatar name={name} color={avatar} size={38} />
            ) : (
              <span className={styles.cpu} aria-hidden="true">
                CPU
              </span>
            )}
            <span className={styles.who}>
              <strong>{r.you ? `${r.name} (you)` : r.name}</strong>
              <span>{r.sub}</span>
            </span>
            <span className={`${styles.score} tabular`}>{r.score.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      )}

      {scope === "phone" && !hasMine && (
        <div className={`${page.card} ${styles.empty}`}>
          <p>No ranked {def.name} scores yet{period === "week" ? " this week" : ""}. Play a match to get on the board.</p>
          <ButtonLink href={`/games/${game}`} icon="play">
            Play {def.name}
          </ButtonLink>
        </div>
      )}

      <p className={styles.note}>
        <Icon name="info" size={14} /> Practice and pass-and-play games aren&apos;t ranked. Scores are checked for tampering before they count
        {apiEnabled ? ", on this phone and again on the server." : ". Global leaderboards arrive with online accounts."}
      </p>
    </Screen>
  );
}
