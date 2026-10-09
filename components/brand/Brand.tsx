import { useId } from "react";

/**
 * Naija Childhood brand marks, drawn as SVG so they stay crisp at any size.
 * The lettering uses the game font (Lilita One) via the --font-display variable.
 */

const FONT = "var(--font-display), 'Lilita One', 'Arial Black', sans-serif";

/** App emblem: a big chunky "N" on a Nigerian-green sunburst with a chalk hopscotch behind. */
export function Emblem({ size = 48, rounded = true, title }: { size?: number; rounded?: boolean; title?: string }) {
  const id = useId().replace(/:/g, "");
  const rays = Array.from({ length: 16 }, (_, i) => i);
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <radialGradient id={`${id}bg`} cx="50%" cy="42%" r="70%">
          <stop offset="0" stopColor="#2fd27f" />
          <stop offset="0.55" stopColor="#139a52" />
          <stop offset="1" stopColor="#07502b" />
        </radialGradient>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="0.45" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#ff9f1c" />
        </linearGradient>
        <clipPath id={`${id}clip`}>
          <rect width="512" height="512" rx={rounded ? 116 : 0} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}clip)`}>
        <rect width="512" height="512" fill={`url(#${id}bg)`} />
        {rays.map((i) => (
          <path
            key={i}
            d="M256 236 L236 -60 L276 -60 Z"
            fill="#ffffff"
            opacity={i % 2 ? 0.07 : 0.13}
            transform={`rotate(${i * 22.5} 256 236)`}
          />
        ))}
        {/* Chalk hopscotch behind the letter */}
        <g fill="none" stroke="#f6f1e6" strokeWidth="10" strokeLinejoin="round" opacity="0.35" transform="translate(0 6)">
          <path d="M206 470h100v-70H206z" />
          <path d="M160 400h192v-70H160zM256 400v-70" />
          <path d="M206 330h100v-70H206z" />
        </g>
        {/* Glossy top highlight */}
        <ellipse cx="256" cy="40" rx="300" ry="120" fill="#ffffff" opacity="0.08" />
      </g>
      {/* 3D "N": extrusion, outline, face */}
      <g fontFamily={FONT} fontSize="330" textAnchor="middle">
        <text x="256" y="372" fill="#4a2306" stroke="#2a1203" strokeWidth="34" strokeLinejoin="round" transform="translate(0 16)">
          N
        </text>
        <text x="256" y="372" fill="#7a3a06" stroke="#3a1a04" strokeWidth="26" strokeLinejoin="round" transform="translate(0 8)">
          N
        </text>
        <text x="256" y="372" fill={`url(#${id}gold)`} stroke="#3a1a04" strokeWidth="20" strokeLinejoin="round" paintOrder="stroke">
          N
        </text>
      </g>
      {/* The stone */}
      <ellipse cx="388" cy="398" rx="40" ry="28" fill="#3a1a04" />
      <ellipse cx="386" cy="392" rx="34" ry="23" fill="#d9d2c4" />
      <ellipse cx="376" cy="384" rx="14" ry="7" fill="#ffffff" opacity="0.7" />
    </svg>
  );
}

/** Stacked game wordmark: "NAIJA" over a big 3D "CHILDHOOD". */
export function GameLogo({ width = 320, className }: { width?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const big = (dy: number, fill: string, stroke: string, sw: number) => (
    <text x="260" y={176 + dy} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" paintOrder="stroke" fontSize="98" textLength="456" lengthAdjust="spacingAndGlyphs">
      CHILDHOOD
    </text>
  );
  return (
    <svg className={className} width={width} height={(width * 220) / 520} viewBox="0 0 520 220" role="img" aria-label="Naija Childhood">
      <defs>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.4" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#ff8c1a" />
        </linearGradient>
        <linearGradient id={`${id}white`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dff5e8" />
        </linearGradient>
      </defs>
      <g fontFamily={FONT} textAnchor="middle" transform="rotate(-4 260 110)">
        {/* NAIJA ribbon */}
        <g transform="translate(0 4)">
          <path d="M150 34 L370 34 L382 58 L370 82 L150 82 L138 58 Z" fill="#0f7a43" stroke="#062c18" strokeWidth="7" strokeLinejoin="round" />
          <path d="M150 34 L370 34 L376 46 L144 46 Z" fill="#ffffff" opacity="0.18" />
          <text x="260" y="73" fontSize="44" letterSpacing="8" fill={`url(#${id}white)`} stroke="#062c18" strokeWidth="6" paintOrder="stroke">
            NAIJA
          </text>
        </g>
        {/* CHILDHOOD with a chunky 3D extrusion */}
        {big(14, "#5a2a06", "#2a1203", 22)}
        {big(9, "#8a4407", "#2a1203", 20)}
        {big(4, "#b85e0c", "#2a1203", 18)}
        {big(0, `url(#${id}gold)`, "#2a1203", 16)}
      </g>
    </svg>
  );
}

/** Compact horizontal lockup for headers: emblem + one-line wordmark. */
export function LogoLockup({ size = 40 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Emblem size={size} />
      <span
        style={{
          fontFamily: FONT,
          fontSize: size * 0.52,
          lineHeight: 1,
          letterSpacing: "0.01em",
          color: "#fff",
          textShadow: "0 2px 0 #062c18, 0 3px 8px rgba(0,0,0,0.4)",
        }}
      >
        NAIJA <span style={{ color: "#ffd23f" }}>CHILDHOOD</span>
      </span>
    </span>
  );
}
