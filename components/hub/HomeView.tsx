"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GAMES } from "@/games/registry";
import { useProfile } from "@/stores/profile-store";
import { dailyChallenge, dayKey } from "@/lib/daily";
import { Photo } from "@/components/ui/Photo";
import { Icon } from "@/components/ui/Icon";
import { GameLogo } from "@/components/brand/Brand";
import { InstallCard } from "./InstallCard";
import { PlayerHud } from "./PlayerHud";
import { useAnnouncement, useGames, useRemoteConfig } from "@/stores/remote-config";
import styles from "./HomeView.module.css";

const STARS = { Easy: 1, Medium: 2, Hard: 3 } as const;

function useTimeLeft() {
  const [left, setLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(24, 0, 0, 0);
      const ms = end.getTime() - now.getTime();
      setLeft(`${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return left;
}

/** The lobby: pick a game from the carousel and hit PLAY. */
export function HomeView() {
  const bests = useProfile((s) => s.bests);
  const lastPlayed = useProfile((s) => s.lastPlayed);
  const doneToday = useProfile((s) => s.daily[dayKey()]?.completed ?? false);
  const challenge = dailyChallenge();
  const quest = GAMES.find((g) => g.slug === challenge.game)!;
  const left = useTimeLeft();

  const games = useGames();
  const announcement = useAnnouncement();
  const dismiss = useRemoteConfig((s) => s.dismiss);
  const [initial] = useState(() => Math.max(0, games.findIndex((g) => g.slug === (lastPlayed ?? "ten-ten"))));
  const [sel, setSel] = useState(initial);
  const game = games[Math.min(sel, games.length - 1)]!;
  const railRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // On phones the carousel swipes; whichever card is centred becomes the selection.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.7 && rail.scrollWidth > rail.clientWidth + 4) {
            const i = tileRefs.current.indexOf(e.target as HTMLButtonElement);
            if (i >= 0) setSel(i);
          }
        }
      },
      { root: rail, threshold: [0.7] },
    );
    tileRefs.current.forEach((t) => t && io.observe(t));
    const t = tileRefs.current[initial];
    if (t && rail.scrollWidth > rail.clientWidth + 4) rail.scrollLeft = t.offsetLeft - (rail.clientWidth - t.clientWidth) / 2;
    return () => io.disconnect();
  }, [initial]);

  const choose = (i: number) => {
    setSel(i);
    const rail = railRef.current;
    const t = tileRefs.current[i];
    if (rail && t) rail.scrollTo({ left: t.offsetLeft - (rail.clientWidth - t.clientWidth) / 2, behavior: "smooth" });
  };

  return (
    <div className={styles.lobby} style={{ ["--accent" as string]: game.accent }}>
      {/* The selected game's art fills the lobby. */}
      <div className={styles.bg} aria-hidden="true">
        {games.map((g, i) => (
          <Photo key={g.slug} name={g.photo === "suwe" ? "suwe-wide" : g.photo} alt="" className={`${styles.bgPhoto} ${i === sel ? styles.bgOn : ""}`} priority={i === initial} sizes="100vw" />
        ))}
        <div className={styles.bgShade} />
      </div>

      <PlayerHud className={styles.hud} />

      <div className={styles.logoWrap}>
        <GameLogo className={styles.logo} width={460} />
        <p className={styles.tagline}>The games you grew up playing</p>
      </div>

      {announcement && (
        <div className={styles.announce} role="status">
          {announcement.href ? (
            <Link href={announcement.href} className={styles.announceText}>
              {announcement.text}
            </Link>
          ) : (
            <span className={styles.announceText}>{announcement.text}</span>
          )}
          <button type="button" className={styles.announceClose} aria-label="Dismiss" onClick={() => dismiss(announcement.id)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <section className={styles.select} aria-label="Choose a game">
        <div className={styles.rail} ref={railRef} role="radiogroup" aria-label="Games">
          {games.map((g, i) => (
            <button
              key={g.slug}
              ref={(el) => {
                tileRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={i === sel}
              className={`${styles.tile} ${i === sel ? styles.tileOn : ""}`}
              style={{ ["--c" as string]: g.accent }}
              onClick={() => choose(i)}
            >
              <Photo name={g.photo} alt="" className={styles.tileArt} sizes="(min-width: 960px) 320px, 66vw" />
              <span className={styles.tileShade} />
              {bests[g.slug] ? (
                <span className={styles.tileBest}>
                  <Icon name="trophy" size={13} /> {bests[g.slug]!.toLocaleString()}
                </span>
              ) : (
                <span className={styles.tileNew}>NEW</span>
              )}
              <span className={styles.tileBody}>
                <span className={styles.tileName}>{g.name}</span>
                <span className={styles.tileMeta}>
                  <span className={styles.stars} aria-label={`${g.difficulty} difficulty`}>
                    {[1, 2, 3].map((n) => (
                      <Icon key={n} name="star" size={14} fill={n <= STARS[g.difficulty] ? "currentColor" : "none"} />
                    ))}
                  </span>
                  <span>{g.players}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className={styles.dots} aria-hidden="true">
          {games.map((g, i) => (
            <span key={g.slug} className={i === sel ? styles.dotOn : ""} />
          ))}
        </div>

        <p className={styles.pitch}>{game.tagline}</p>
        <Link href={`/games/${game.slug}`} className={styles.play}>
          <Icon name="play" size={30} />
          <span>PLAY</span>
        </Link>
      </section>

      <section className={styles.panels}>
        <Link href={`/games/${quest.slug}?daily=1`} className={styles.quest} data-done={doneToday}>
          <span className={styles.questRibbon}>
            <Icon name="flag" size={14} /> Daily quest
          </span>
          <span className={styles.questTimer}>
            <Icon name="clock" size={13} /> {left}
          </span>
          <Photo name={quest.photo} alt="" className={styles.questArt} sizes="96px" />
          <span className={styles.questText}>
            <strong>{challenge.title}</strong>
            <span>{challenge.description}</span>
          </span>
          <span className={styles.reward}>
            {doneToday ? (
              <>
                <Icon name="check" size={18} /> Done
              </>
            ) : (
              <>
                <span className={styles.coin}>XP</span>+100
              </>
            )}
          </span>
        </Link>

        <div className={styles.records}>
          <span className={styles.recordsTitle}>Your records</span>
          {games.map((g) => (
            <Link key={g.slug} href={`/games/${g.slug}`} className={styles.record} style={{ ["--c" as string]: g.accent }}>
              <span className={styles.recordName}>{g.name}</span>
              <span className={styles.recordScore}>{bests[g.slug] ? bests[g.slug]!.toLocaleString() : "—"}</span>
            </Link>
          ))}
          <Link href="/leaderboard" className={styles.recordsMore}>
            See ranks <Icon name="chevron" size={14} />
          </Link>
        </div>

        <InstallCard />
      </section>

      <footer className={styles.footer}>
        <Link href="/credits">Credits</Link>
      </footer>
    </div>
  );
}
