"use client";

import { useState } from "react";
import Link from "next/link";
import { useProfile } from "@/stores/profile-store";
import { useSettings } from "@/stores/settings-store";
import { ACHIEVEMENTS, levelInfo } from "@/lib/progression";
import { AVATAR_COLORS, isValidName } from "@/lib/names";
import { Avatar, ProgressBar, Segmented, Stat } from "@/components/ui/bits";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { InstallCard } from "./InstallCard";
import { AccountCard } from "./AccountCard";
import { useAccount } from "@/stores/account-store";
import page from "./page.module.css";
import { Screen } from "./Screen";
import styles from "./ProfileView.module.css";

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.toggleRow}>
      <span>
        <strong>{label}</strong>
        <span>{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className={styles.switch} />
    </label>
  );
}

export function ProfileView() {
  const p = useProfile();
  const settings = useSettings();
  const lvl = levelInfo(p.xp);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);
  const [draftColor, setDraftColor] = useState(p.avatar);
  const [confirmReset, setConfirmReset] = useState(false);
  const totalGames = Object.values(p.gamesPlayed).reduce((a, b) => a + b, 0);
  const totalWins = Object.values(p.wins).reduce((a, b) => a + b, 0);
  const unlocked = ACHIEVEMENTS.filter((a) => p.achievements[a.code]).length;

  return (
    <Screen photo="school-yard" title="Your profile" kicker={`Level ${lvl.level} · ${lvl.title}`}>
      <section className={styles.hero}>
        <Avatar name={p.name} color={p.avatar} size={84} />
        {editing ? (
          <form
            className={styles.editForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (!isValidName(draft)) return;
              p.setProfile(draft, draftColor);
              void useAccount.getState().saveProfile(draft, draftColor).catch(() => {});
              setEditing(false);
            }}
          >
            <input className={styles.nameInput} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={18} aria-label="Display name" autoFocus />
            <div className={styles.colors} role="radiogroup" aria-label="Avatar colour">
              {AVATAR_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={draftColor === i}
                  aria-label={`Colour ${i + 1}`}
                  className={styles.colorBtn}
                  style={{ background: c, boxShadow: draftColor === i ? "0 0 0 3px var(--bg), 0 0 0 5px var(--text)" : undefined }}
                  onClick={() => setDraftColor(i)}
                />
              ))}
            </div>
            <div className={styles.editActions}>
              <Button type="submit" size="sm" disabled={!isValidName(draft)}>
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className={styles.identity}>
            <h1 className={styles.name}>{p.name}</h1>
            <p className={styles.levelLine}>
              Level {lvl.level} · <b>{lvl.title}</b>
            </p>
            <button
              type="button"
              className={styles.editBtn}
              onClick={() => {
                setDraft(p.name);
                setDraftColor(p.avatar);
                setEditing(true);
              }}
            >
              <Icon name="edit" size={14} /> Edit profile
            </button>
          </div>
        )}
      </section>

      <AccountCard />

      <section className={page.card}>
        <div className={styles.xpHead}>
          <span>{p.xp.toLocaleString()} XP total</span>
          <span className="tabular">
            {lvl.span - lvl.into} XP to level {lvl.level + 1}
          </span>
        </div>
        <ProgressBar value={lvl.progress} label="Level progress" />
        <div className={styles.stats}>
          <Stat label="Games played" value={totalGames} />
          <Stat label="Wins" value={totalWins} accent="var(--sun)" />
          <Stat label="Best streak" value={`${p.streak.best}d`} accent="#ff9f43" />
          <Stat label="Achievements" value={`${unlocked}/${ACHIEVEMENTS.length}`} accent="var(--green-bright)" />
        </div>
      </section>

      <section className={page.section} aria-labelledby="ach">
        <h2 id="ach" className={page.h2}>
          Achievements
        </h2>
        <ul className={styles.achievements}>
          {ACHIEVEMENTS.map((a) => {
            const at = p.achievements[a.code];
            return (
              <li key={a.code} className={styles.achievement} data-unlocked={Boolean(at)}>
                <span className={styles.medal}>
                  <Icon name={at ? "star" : "lock"} size={18} />
                </span>
                <span>
                  <strong>{a.name}</strong>
                  <span>{a.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={page.section} aria-labelledby="settings">
        <h2 id="settings" className={page.h2}>
          Settings
        </h2>
        <div className={`${page.card} ${styles.settings}`}>
          <Toggle label="Sound" hint="Everything: effects, voices, street noise and music" checked={settings.sound} onChange={(v) => settings.set({ sound: v })} />
          <Toggle label="Music" hint="Original Naija beats while you play (Amapiano, Highlife, Afrobeats, Fuji)" checked={settings.music} onChange={(v) => settings.set({ music: v })} />
          <Toggle label="Vibration" hint="Haptic taps on supported phones" checked={settings.haptics} onChange={(v) => settings.set({ haptics: v })} />
          <div className={styles.toggleRow}>
            <span>
              <strong>Graphics</strong>
              <span>Realistic 3D street, or the lighter 2D version for older phones</span>
            </span>
          </div>
          <Segmented
            label="Graphics"
            value={settings.graphics}
            onChange={(v) => settings.set({ graphics: v })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "3d", label: "Realistic 3D" },
              { value: "2d", label: "Lite 2D" },
            ]}
          />
          <div className={styles.toggleRow}>
            <span>
              <strong>Reduced motion</strong>
              <span>Calmer animations in menus and games</span>
            </span>
          </div>
          <Segmented
            label="Reduced motion"
            value={settings.reducedMotion === null ? "auto" : settings.reducedMotion ? "on" : "off"}
            onChange={(v) => settings.set({ reducedMotion: v === "auto" ? null : v === "on" })}
            options={[
              { value: "auto", label: "Match phone" },
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </div>
      </section>

      <InstallCard force />

      <section className={page.section}>
        <div className={`${page.card} ${styles.danger}`}>
          <div>
            <strong>Reset progress</strong>
            <p>Deletes your scores, XP and achievements from this phone.</p>
          </div>
          {confirmReset ? (
            <div className={styles.editActions}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  p.reset();
                  setConfirmReset(false);
                }}
              >
                Yes, delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirmReset(true)}>
              Reset
            </Button>
          )}
        </div>
      </section>

      <footer className={page.footer}>
        <Link href="/credits">Credits</Link>
        <span>Naija Childhood v0.1</span>
      </footer>
    </Screen>
  );
}
