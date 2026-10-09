"use client";

import { useState } from "react";
import { Photo } from "@/components/ui/Photo";
import { Avatar } from "@/components/ui/bits";
import { GameLogo } from "@/components/brand/Brand";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { AVATAR_COLORS, isValidName, sanitizeName } from "@/lib/names";
import { useProfile } from "@/stores/profile-store";
import styles from "./Onboarding.module.css";

export function Onboarding() {
  const setProfile = useProfile((s) => s.setProfile);
  const [name, setName] = useState("");
  const [color, setColor] = useState(0);
  const valid = isValidName(name);
  const masked = sanitizeName(name).includes("*");

  return (
    <div className={styles.wrap}>
      <Photo name="school-friends" alt="Tunde, Ada, Aisha and Emeka outside the shops on their street" priority className={styles.photo} position="50% 40%" />
      <div className={styles.scrim} />
      <form
        className={styles.panel}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) setProfile(name, color);
        }}
      >
        <GameLogo width={300} className={styles.logo} />
        <h1 className={styles.title}>
          The games you grew up playing.
          <span> Now on your phone.</span>
        </h1>
        <p className={styles.sub}>Ten-Ten, Police &amp; Thief and Suwe — play solo, challenge your people, top the leaderboard.</p>

        <label className={styles.field}>
          <span className={styles.label}>What should we call you?</span>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chidinma"
            autoComplete="nickname"
            maxLength={18}
            enterKeyHint="go"
            aria-invalid={masked}
          />
          {masked && <span className={styles.error}>Abeg, pick another name.</span>}
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Pick your colour</span>
          <div className={styles.colors} role="radiogroup" aria-label="Avatar colour">
            {AVATAR_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === i}
                aria-label={`Colour ${i + 1}`}
                className={`${styles.color} ${color === i ? styles.colorOn : ""}`}
                onClick={() => setColor(i)}
              >
                <Avatar name={name || "You"} color={i} size={42} />
              </button>
            ))}
          </div>
        </div>

        <Button type="submit" size="lg" block disabled={!valid} iconRight="chevron">
          Oya, let&apos;s play
        </Button>
        <p className={styles.note}>
          <Icon name="lock" size={14} /> No sign-up needed. You play as a guest and your progress stays on this phone.
        </p>
      </form>
    </div>
  );
}
