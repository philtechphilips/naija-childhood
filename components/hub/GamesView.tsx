"use client";

import { ROADMAP } from "@/games/registry";
import { useGames, useRemoteConfig } from "@/stores/remote-config";
import { useProfile } from "@/stores/profile-store";
import { Icon } from "@/components/ui/Icon";
import { GameCard } from "./GameCard";
import { Screen, ScreenSection } from "./Screen";
import styles from "./GamesView.module.css";

export function GamesView() {
  const favorites = useProfile((s) => s.favorites);
  const games = useGames();
  const roadmap = useRemoteConfig((s) => s.config?.roadmap) ?? ROADMAP;
  const ordered = [...games].sort((a, b) => Number(favorites.includes(b.slug)) - Number(favorites.includes(a.slug)));

  return (
    <Screen photo="school-friends" title="Pick a game" kicker={`${games.length} games ready`}>
      <div className={styles.grid}>
        {ordered.map((g, i) => (
          <GameCard key={g.slug} game={g} index={games.findIndex((x) => x.slug === g.slug)} badge={g.badge} priority={i === 0} />
        ))}
      </div>

      <ScreenSection id="soon" title="Coming to the compound">
        <ul className={styles.roadmap}>
          {roadmap.map((name) => (
            <li key={name} className={styles.locked}>
              <span className={styles.lock}>
                <Icon name="lock" size={20} />
              </span>
              <strong>{name}</strong>
              <span className={styles.soon}>Soon</span>
            </li>
          ))}
        </ul>
      </ScreenSection>
    </Screen>
  );
}
