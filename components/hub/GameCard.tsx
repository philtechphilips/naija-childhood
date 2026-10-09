"use client";

import Link from "next/link";
import type { GameDefinition } from "@/games/types";
import { Photo } from "@/components/ui/Photo";
import { Icon } from "@/components/ui/Icon";
import { useProfile } from "@/stores/profile-store";
import styles from "./GameCard.module.css";

const STARS = { Easy: 1, Medium: 2, Hard: 3 } as const;

/** Character-select style card: framed key art, number plate, stars and a big PLAY. */
export function GameCard({ game, index = 0, priority = false, badge = null }: { game: GameDefinition; index?: number; priority?: boolean; badge?: string | null }) {
  const best = useProfile((s) => s.bests[game.slug] ?? 0);
  const played = useProfile((s) => s.gamesPlayed[game.slug] ?? 0);
  const favorite = useProfile((s) => s.favorites.includes(game.slug));

  return (
    <Link href={`/games/${game.slug}`} className={styles.card} style={{ ["--accent" as string]: game.accent, animationDelay: `${index * 90}ms` }}>
      <div className={styles.art}>
        <Photo name={game.photo} alt={`${game.name} in Naija Childhood`} sizes="(min-width: 1000px) 380px, (min-width: 640px) 50vw, 92vw" className={styles.photo} priority={priority} />
        <span className={styles.scrim} />
        <span className={styles.shine} />
        <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
        {badge && <span className={styles.badge}>{badge}</span>}
        <span className={styles.stars} aria-label={`${game.difficulty} difficulty`}>
          {[1, 2, 3].map((n) => (
            <Icon key={n} name="star" size={16} fill={n <= STARS[game.difficulty] ? "currentColor" : "none"} />
          ))}
        </span>
        {favorite && (
          <span className={styles.fav} aria-label="Favourite">
            <Icon name="heart" size={16} fill="currentColor" />
          </span>
        )}
        <div className={styles.titleWrap}>
          <h3 className={styles.name}>{game.name}</h3>
          <span className={styles.tagline}>{game.tagline}</span>
        </div>
      </div>

      <div className={styles.panel}>
        <span className={styles.meta}>
          <span>
            <Icon name="users" size={15} /> {game.players}
          </span>
          <span>
            <Icon name="clock" size={15} /> {game.sessionLength}
          </span>
        </span>
        <span className={styles.footer}>
          <span className={styles.best}>
            {best > 0 ? (
              <>
                <Icon name="trophy" size={18} />
                <span>
                  <small>Best</small>
                  {best.toLocaleString()}
                </span>
              </>
            ) : (
              <span>
                <small>{played > 0 ? "Played" : "New"}</small>
                {played > 0 ? `${played}×` : "Try it!"}
              </span>
            )}
          </span>
          <span className={styles.play}>
            <Icon name="play" size={22} />
            PLAY
          </span>
        </span>
      </div>
    </Link>
  );
}
