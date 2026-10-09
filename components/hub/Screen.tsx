"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { PhotoName } from "@/lib/photos";
import { Photo } from "@/components/ui/Photo";
import { Icon } from "@/components/ui/Icon";
import { PlayerHud } from "./PlayerHud";
import styles from "./Screen.module.css";

/**
 * A full-screen game menu: key art behind everything, the player HUD on top,
 * and a big outlined title with a ribbon. Every hub page sits inside one.
 */
export function Screen({
  photo,
  accent = "#ffc53d",
  title,
  kicker,
  back,
  hud = true,
  children,
}: {
  photo: PhotoName;
  accent?: string;
  title?: ReactNode;
  kicker?: ReactNode;
  back?: { href: string; label: string };
  hud?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.screen} style={{ ["--accent" as string]: accent }}>
      <div className={styles.bg} aria-hidden="true">
        <Photo name={photo} alt="" className={styles.bgPhoto} sizes="100vw" priority />
        <div className={styles.bgRays} />
        <div className={styles.bgShade} />
        <div className={styles.bgDots} />
      </div>

      {hud && (
        <PlayerHud
          className={styles.hud}
          left={
            back ? (
              <Link href={back.href} className={styles.back} aria-label={back.label}>
                <Icon name="back" size={24} />
              </Link>
            ) : undefined
          }
        />
      )}

      {title && (
        <div className={styles.heading}>
          {kicker && <span className={styles.kicker}>{kicker}</span>}
          <h1 className={styles.title}>{title}</h1>
        </div>
      )}

      <div className={styles.content}>{children}</div>
    </div>
  );
}

/** Section heading that reads like a game menu tab: a coloured tag and a rule. */
export function ScreenSection({ id, title, aside, children }: { id: string; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHead}>
        <h2 id={id} className={styles.sectionTitle}>
          {title}
        </h2>
        <span className={styles.sectionRule} />
        {aside}
      </div>
      {children}
    </section>
  );
}
