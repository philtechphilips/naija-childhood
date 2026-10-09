import type { Sfx } from "@/games/core/audio";

/** Space / ↑ / W all jump. Returns an unbind function. */
export function bindJumpKeys(jump: () => void) {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "arrowup" || k === "w" || k === "j") {
      e.preventDefault();
      jump();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

/** [start, duration] in public/audio/skipping-count.mp3 (scripts/chant/build_counts.py). */
const COUNT_SPRITE: Record<string, [number, number]> = {
  "1": [0.15, 0.3199],
  "2": [0.6198, 0.2814],
  "3": [1.0512, 0.3586],
  "4": [1.5598, 0.2568],
  "5": [1.9666, 0.3395],
  "6": [2.456, 0.5346],
  "7": [3.1406, 0.4636],
  "8": [3.7542, 0.2726],
  "9": [4.1768, 0.3398],
  "10": [4.6666, 0.2985],
  "11": [5.1151, 0.4104],
  "12": [5.6754, 0.4033],
  "13": [6.2287, 0.5029],
  "14": [6.8815, 0.4922],
  "15": [7.5238, 0.4943],
  "16": [8.1681, 0.5746],
  "17": [8.8927, 0.6352],
  "18": [9.6779, 0.4766],
  "19": [10.3045, 0.5405],
  "20": [10.9949, 0.3982],
  "30": [11.5431, 0.4112],
  "40": [12.1044, 0.438],
  "50": [12.6923, 0.3273],
  "60": [13.1696, 0.509],
  "70": [13.8286, 0.5016],
  "80": [14.4801, 0.3034],
  "90": [14.9335, 0.3713],
  "100": [15.4548, 0.5202],
  "pepper": [16.125, 0.1979],
};

/**
 * Friends counting your skips out loud ("one! two! three!"), up to twenty and
 * then on every ten, plus the "PEPPER!" shout. A few voices at different pitches.
 */
export function createCountVoice(sfx: Sfx) {
  let buf: AudioBuffer | null = null;
  let loading = false;
  const ctx = () => {
    if (!sfx.enabled) return null;
    const c = sfx.context();
    if (!c) return null;
    if (!buf && !loading) {
      loading = true;
      fetch("/audio/skipping-count.mp3")
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => c.decodeAudioData(b))
        .then((b) => {
          buf = b;
        })
        .catch(() => {});
    }
    return buf ? c : null;
  };
  const play = (word: string, voices: number, volume: number) => {
    const c = ctx();
    const s = COUNT_SPRITE[word];
    if (!c || !s) return;
    for (let v = 0; v < voices; v++) {
      const src = c.createBufferSource();
      src.buffer = buf;
      // Kids' voices: pitched up, a little apart.
      src.playbackRate.value = [1.22, 1.32, 1.14][v % 3]! * (s[1] > 0.45 ? 1.1 : 1);
      const g = c.createGain();
      g.gain.value = volume * (v ? 0.6 : 1);
      const p = c.createStereoPanner();
      p.pan.value = [0, -0.5, 0.5][v % 3]!;
      src.connect(p).connect(g).connect(sfx.output() ?? c.destination);
      src.start(c.currentTime + v * 0.018, s[0], s[1]);
    }
  };
  return {
    preload() {
      ctx();
    },
    count(n: number) {
      const word = n <= 20 ? String(n) : n % 10 === 0 && n <= 100 ? String(n) : null;
      if (word) play(word, 3, 0.55);
    },
    say(word: "pepper") {
      play(word, 3, 0.8);
    },
  };
}
