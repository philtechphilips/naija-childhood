import type { Sfx } from "@/games/core/audio";

/**
 * Street crowd voices for the run: "Ole! Ole! Ole!" (Yoruba: thief!), "Hold am!",
 * "Catch am!". One short recording per word, layered into a crowd with different
 * pitches (men, women, kids), stereo spread and small offsets.
 */
export type Shout = "ole" | "ole2" | "holdam" | "catcham" | "thief";

/** [start, duration] in seconds inside public/audio/street-shouts.mp3 (scripts/chant/build_shouts.py). */
const SHOUT_SPRITE: Record<Shout, [number, number]> = {
  ole: [0.2, 0.3068],
  ole2: [0.7068, 0.4293],
  holdam: [1.336, 0.5629],
  catcham: [2.0989, 0.7744],
  thief: [3.0732, 0.199],
};

/** Words shown in speech bubbles alongside the audio. */
export const SHOUT_TEXT: Record<Shout, string> = {
  ole: "OLE!",
  ole2: "OLE!",
  holdam: "Hold am!",
  catcham: "Catch am!",
  thief: "Thief!",
};

export function createStreetVoices(sfx: Sfx) {
  let buf: AudioBuffer | null = null;
  let out: GainNode | null = null;
  let loading = false;

  const ctx = () => {
    if (!sfx.enabled) return null;
    const c = sfx.context();
    if (!c) return null;
    if (!out) {
      out = c.createGain();
      out.gain.value = 0.9;
      out.connect(sfx.output() ?? c.destination);
    }
    if (!buf && !loading) {
      loading = true;
      fetch("/audio/street-shouts.mp3")
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => c.decodeAudioData(b))
        .then((b) => {
          buf = b;
        })
        .catch(() => {});
    }
    return buf ? c : null;
  };

  function voice(c: AudioContext, word: Shout, at: number, rate: number, pan: number, gain: number) {
    const [start, dur] = SHOUT_SPRITE[word];
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    const g = c.createGain();
    g.gain.value = gain;
    // A touch of "outdoors": cut the very top so it sits in the street noise.
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    src.connect(lp).connect(p).connect(g).connect(out!);
    src.start(at, start, dur);
  }

  return {
    preload() {
      ctx();
    },
    /** One person shouting from a side of the street (-1 left, 1 right). */
    shout(word: Shout, side = 0, volume = 0.7) {
      const c = ctx();
      if (!c) return;
      const rate = [0.78, 0.86, 1.05, 1.18][Math.floor(Math.random() * 4)]!;
      voice(c, word, c.currentTime + 0.02, rate, side * 0.6, volume);
    },
    /** The whole street joining in: "Ole! Ole! Ole!" */
    chant(times = 3, volume = 0.55) {
      const c = ctx();
      if (!c) return;
      const t0 = c.currentTime + 0.05;
      for (let k = 0; k < times; k++) {
        for (let v = 0; v < 6; v++) {
          const rate = [0.76, 0.82, 0.9, 1.04, 1.16, 1.3][v]!;
          voice(c, k === times - 1 ? "ole2" : "ole", t0 + k * 0.46 + Math.random() * 0.05, rate * (0.98 + Math.random() * 0.04), (v / 5) * 1.6 - 0.8, volume * (0.6 + Math.random() * 0.4));
        }
      }
    },
  };
}

export type StreetVoices = ReturnType<typeof createStreetVoices>;
