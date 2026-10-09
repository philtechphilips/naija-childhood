"use client";

import type { GameDefinition } from "@/games/types";
import { GAMES } from "@/games/registry";
import { Photo } from "@/components/ui/Photo";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/bits";
import { Screen } from "@/components/hub/Screen";
import { useProfile } from "@/stores/profile-store";
import styles from "./PreGame.module.css";

const STARS = { Easy: 1, Medium: 2, Hard: 3 } as const;

function PlayButton({ game, onPlay, className }: { game: GameDefinition; onPlay: () => void; className?: string }) {
  return (
    <button type="button" className={`${styles.play} ${className ?? ""}`} onClick={onPlay} aria-label={`Play ${game.name}`}>
      <Icon name="play" size={30} />
      <span>
        PLAY
        <small>{game.name}</small>
      </span>
    </button>
  );
}

export function PreGame({
  game,
  mode,
  options,
  onMode,
  onOption,
  onPlay,
  dailyNote,
}: {
  game: GameDefinition;
  mode: string;
  options: Record<string, string>;
  onMode: (m: string) => void;
  onOption: (id: string, v: string) => void;
  onPlay: () => void;
  dailyNote: string | null;
}) {
  const best = useProfile((s) => s.bests[game.slug] ?? 0);
  const favorite = useProfile((s) => s.favorites.includes(game.slug));
  const toggleFavorite = useProfile((s) => s.toggleFavorite);
  const visibleOptions = game.options.filter((o) => !o.modes || o.modes.includes(mode));
  const number = GAMES.findIndex((g) => g.slug === game.slug) + 1;

  return (
    <Screen photo={game.photo === "suwe" ? "suwe-wide" : game.photo} accent={game.accent} back={{ href: "/games", label: "Back to games" }}>
      <div className={styles.layout}>
        <div className={styles.intro}>
          {/* Showcase: the game's art in a thick accent frame, title stamped on top. */}
          <div className={styles.showcase}>
            <div className={styles.art}>
              <Photo name={game.photo} alt={`${game.name} in Naija Childhood`} priority sizes="(min-width: 1000px) 640px, 100vw" className={styles.photo} />
              <span className={styles.artShade} />
              <span className={styles.number}>{String(number).padStart(2, "0")}</span>
              <button
                type="button"
                className={`${styles.fav} ${favorite ? styles.favOn : ""}`}
                aria-pressed={favorite}
                aria-label={favorite ? "Remove from favourites" : "Add to favourites"}
                onClick={() => toggleFavorite(game.slug)}
              >
                <Icon name="heart" size={22} fill={favorite ? "currentColor" : "none"} />
              </button>
              <div className={styles.titleWrap}>
                <h1 className={styles.title}>{game.name}</h1>
                <span className={styles.tagline}>{game.tagline}</span>
              </div>
            </div>

            <div className={styles.stats}>
              <span className={styles.stat}>
                <small>Difficulty</small>
                <span className={styles.stars} aria-label={game.difficulty}>
                  {[1, 2, 3].map((n) => (
                    <Icon key={n} name="star" size={18} fill={n <= STARS[game.difficulty] ? "currentColor" : "none"} />
                  ))}
                </span>
              </span>
              <span className={styles.stat}>
                <small>Players</small>
                <strong>{game.players}</strong>
              </span>
              <span className={styles.stat}>
                <small>Match</small>
                <strong>{game.sessionLength}</strong>
              </span>
              <span className={`${styles.stat} ${styles.statBest}`}>
                <small>
                  <Icon name="trophy" size={12} /> Best
                </small>
                <strong>{best > 0 ? best.toLocaleString() : "—"}</strong>
              </span>
            </div>
          </div>

          {dailyNote && (
            <div className={styles.daily}>
              <span className={styles.dailyIcon}>
                <Icon name="flag" size={20} />
              </span>
              <div>
                <strong>Daily quest</strong>
                <p>{dailyNote}</p>
              </div>
            </div>
          )}

          <section className={styles.panel} aria-labelledby="howto">
            <h2 id="howto" className={styles.panelTitle}>
              How to play
            </h2>
            <p className={styles.description}>{game.description}</p>
            <ol className={styles.steps}>
              {game.howTo.map((s, i) => (
                <li key={s.title} className={styles.step} style={{ animationDelay: `${i * 80}ms` }}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  <span>
                    <strong>{s.title}</strong>
                    <span>{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className={`${styles.panel} ${styles.setup}`} aria-label="Match setup">
          <h2 id="mode" className={styles.panelTitle}>
            Match setup
          </h2>
          <div className={styles.modes} role="radiogroup" aria-label="Mode">
            {game.modes.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                disabled={!m.available}
                className={`${styles.mode} ${mode === m.id ? styles.modeOn : ""}`}
                onClick={() => onMode(m.id)}
              >
                <span className={styles.check} aria-hidden="true">
                  {mode === m.id ? <Icon name="check" size={16} /> : !m.available ? <Icon name="lock" size={14} /> : null}
                </span>
                <span className={styles.modeText}>
                  <strong>
                    {m.label}
                    {m.badge && <em>{m.badge}</em>}
                  </strong>
                  <span>{m.description}</span>
                </span>
              </button>
            ))}
          </div>

          {visibleOptions.map((o) => (
            <div key={o.id} className={styles.option}>
              <h3 className={styles.optionLabel}>{o.label}</h3>
              <Segmented label={o.label} options={o.choices} value={options[o.id] ?? o.defaultValue} onChange={(v) => onOption(o.id, v)} />
            </div>
          ))}

          <p className={styles.controls}>
            <Icon name="info" size={16} /> {game.controlsHelp}
          </p>

        </aside>
      </div>

      {/* PLAY floats above the tab bar so it's always in reach. */}
      <div className={styles.playBar}>
        <PlayButton game={game} onPlay={onPlay} />
      </div>
    </Screen>
  );
}
