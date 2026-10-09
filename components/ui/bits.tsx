import { AVATAR_COLORS, initials } from "@/lib/names";
import styles from "./bits.module.css";
import { Emblem, LogoLockup } from "@/components/brand/Brand";

export function Avatar({ name, color, size = 44 }: { name: string; color: number; size?: number }) {
  const bg = AVATAR_COLORS[color % AVATAR_COLORS.length];
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.38, background: bg }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return compact ? <Emblem size={34} /> : <LogoLockup size={38} />;
}

export function ProgressBar({ value, color = "var(--sun)", label }: { value: number; color?: string; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={styles.progress} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={styles.progressFill} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; disabled?: boolean; badge?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          className={`${styles.segment} ${value === o.value ? styles.segmentOn : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.badge && <span className={styles.badge}>{o.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statValue} tabular`} style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
