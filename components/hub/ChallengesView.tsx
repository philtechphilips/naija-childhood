"use client";

import { useProfile } from "@/stores/profile-store";
import { dailyChallenge, dayKey, shiftDay } from "@/lib/daily";
import { getGame } from "@/games/registry";
import { Icon } from "@/components/ui/Icon";
import { Stat } from "@/components/ui/bits";
import { DailyCard } from "./DailyCard";
import page from "./page.module.css";
import { Screen } from "./Screen";
import styles from "./ChallengesView.module.css";

const WEEKDAY = new Intl.DateTimeFormat("en-NG", { weekday: "short" });
const SHORT: Record<string, string> = { "ten-ten": "Ten-Ten", "police-thief": "P&T", suwe: "Suwe", "sack-race": "Sack", skipping: "Rope", "hide-seek": "Hide" };

export function ChallengesView() {
  const daily = useProfile((s) => s.daily);
  const streak = useProfile((s) => s.streak);
  const today = dayKey();
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));
  const doneCount = Object.values(daily).filter((d) => d.completed).length;

  return (
    <Screen photo="playground" title="Daily quest" kicker="New one every day">

      <DailyCard large />

      <section className={`${page.card} ${styles.stats}`} aria-label="Your challenge stats">
        <Stat label="Day streak" value={streak.current} accent="#ff9f43" />
        <Stat label="Best streak" value={streak.best} />
        <Stat label="Challenges done" value={doneCount} accent="var(--green-bright)" />
      </section>

      <section className={page.section} aria-labelledby="week">
        <h2 id="week" className={page.h2}>
          This week
        </h2>
        <ol className={styles.week}>
          {days.map((key) => {
            const c = dailyChallenge(key);
            const game = getGame(c.game);
            const done = daily[key]?.completed;
            const isToday = key === today;
            const [y, m, d] = key.split("-").map(Number);
            const date = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
            return (
              <li key={key} className={styles.day} data-done={done} data-today={isToday}>
                <span className={styles.dow}>{isToday ? "Today" : WEEKDAY.format(date)}</span>
                <span className={styles.mark} aria-label={done ? "Completed" : "Not completed"}>
                  {done ? <Icon name="check" size={18} /> : <span className={styles.dot} style={{ background: game?.accent }} />}
                </span>
                <span className={styles.gameName} title={game?.name}>
                  {SHORT[c.game]}
                </span>
              </li>
            );
          })}
        </ol>
        <p className={styles.note}>
          <Icon name="info" size={14} /> Missing a day just restarts your streak — no penalties, no wahala.
        </p>
      </section>
    </Screen>
  );
}
