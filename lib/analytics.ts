"use client";

/**
 * Product analytics with no personal data: an anonymous profile id, event
 * name and small numeric/string props. Events queue in memory and flush to
 * the API when one is configured; otherwise they stay on the device.
 */
export type AnalyticsEvent =
  | "game_opened"
  | "game_started"
  | "game_completed"
  | "challenge_started"
  | "challenge_completed"
  | "install_prompt_shown"
  | "pwa_installed"
  | "tutorial_completed"
  | "tutorial_skipped"
  | "rematch_clicked"
  | "share_clicked"
  | "error";

type Props = Record<string, string | number | boolean | null>;

interface QueuedEvent {
  name: AnalyticsEvent;
  props: Props;
  at: number;
}

const queue: QueuedEvent[] = [];
const API = process.env.NEXT_PUBLIC_API_URL;
let timer: ReturnType<typeof setTimeout> | null = null;

export function track(name: AnalyticsEvent, props: Props = {}) {
  queue.push({ name, props, at: Date.now() });
  if (queue.length > 200) queue.splice(0, queue.length - 200);
  if (process.env.NODE_ENV === "development") console.debug("[analytics]", name, props);
  if (API && !timer) timer = setTimeout(flush, 5000);
}

function flush() {
  timer = null;
  if (!API || queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  const body = JSON.stringify({ events: batch });
  // Analytics must never block or break gameplay.
  try {
    if (!navigator.sendBeacon?.(`${API}/events`, body)) {
      void fetch(`${API}/events`, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
}
