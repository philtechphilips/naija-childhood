const BLOCKED = ["fuck", "shit", "bitch", "cunt", "nigger", "nigga", "pussy", "ashawo", "mumu"];

/**
 * Display names are public on leaderboards: strip markup and control
 * characters, collapse whitespace, cap length, and mask blocked words.
 */
export function sanitizeName(raw: string): string {
  let name = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>`"\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
  const lower = name.toLowerCase();
  for (const word of BLOCKED) {
    if (lower.includes(word)) {
      const i = lower.indexOf(word);
      name = name.slice(0, i) + "*".repeat(word.length) + name.slice(i + word.length);
    }
  }
  return name;
}

export function isValidName(raw: string): boolean {
  const name = sanitizeName(raw);
  return name.length >= 2 && !name.includes("*");
}

export const AVATAR_COLORS = ["#1fa463", "#ffb703", "#e4572e", "#3a86ff", "#8338ec", "#ff6fae"] as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}
