import type { Sfx } from "@/games/core/audio";
import { CHANT_SPRITE, CHANT_URL, chantWord } from "./chant";

/**
 * Original Ten-Ten playground groove, synthesised and scheduled bar-by-bar on the
 * game's beat clock: log drum, talking drum, shekere, agogo bell, the two hand-claps
 * of "CLAP, CLAP", a stamp on THROW, and the counting chant on top: a little crowd
 * of kids calling "TEN! TEN! TEN! PLAY!", then twenty, thirty... up to a hundred.
 * Tempo follows the match, so the song speeds up as the game does.
 */

type Note = [pos16: number, midi: number, len16: number];

// Call-and-response chant in C major pentatonic (C D E G A), four bars that loop.
const PHRASES: Note[][] = [
  [
    [0, 67, 2],
    [2, 67, 2],
    [4, 69, 2],
    [6, 67, 2],
    [8, 64, 4],
  ],
  [
    [0, 64, 2],
    [2, 67, 2],
    [4, 69, 2],
    [6, 69, 2],
    [8, 67, 2],
    [10, 64, 2],
  ],
  [
    [0, 72, 2],
    [2, 69, 2],
    [4, 67, 2],
    [6, 69, 2],
    [8, 72, 4],
  ],
  [
    [0, 69, 2],
    [2, 67, 2],
    [4, 64, 2],
    [6, 62, 2],
    [8, 60, 4],
  ],
];

// Talking-drum figure: [pos16, start Hz, end Hz] — the pitch bends like speech.
const TALKING: [number, number, number][] = [
  [0, 150, 210],
  [3, 220, 170],
  [6, 160, 240],
  [8, 150, 200],
  [10, 230, 160],
  [11, 180, 220],
  [14, 170, 250],
];

const AGOGO: [number, number][] = [
  [0, 1],
  [3, 0],
  [6, 1],
  [10, 0],
  [12, 1],
];

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function createTenTenMusic(sfx: Sfx) {
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let chant: AudioBuffer | null = null;
  let chantLoading = false;

  function loadChant(c: AudioContext) {
    if (chantLoading) return;
    chantLoading = true;
    fetch(CHANT_URL)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => c.decodeAudioData(b))
      .then((buf) => {
        chant = buf;
      })
      .catch(() => {
        // Offline before the file was cached: the synth melody stands in.
      });
  }

  const ctx = () => {
    const c = sfx.context();
    if (!c) return null;
    if (!master) {
      master = c.createGain();
      master.gain.value = 0.55;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      master.connect(comp).connect(sfx.output() ?? c.destination);
      noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loadChant(c);
    }
    return c;
  };

  function env(c: AudioContext, t: number, peak: number, attack: number, decay: number) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(master!);
    return g;
  }

  function noiseHit(c: AudioContext, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number) {
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(env(c, t, peak, 0.002, decay));
    src.start(t, Math.random() * 0.8);
    src.stop(t + decay + 0.05);
  }

  function logDrum(c: AudioContext, t: number, v: number) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.22);
    o.connect(env(c, t, 0.9 * v, 0.004, 0.28));
    o.start(t);
    o.stop(t + 0.35);
  }

  function talking(c: AudioContext, t: number, f0: number, f1: number, v: number) {
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.11);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    o.connect(lp).connect(env(c, t, 0.45 * v, 0.003, 0.16));
    o.start(t);
    o.stop(t + 0.22);
    noiseHit(c, t, "bandpass", 1800, 1.5, 0.08 * v, 0.03);
  }

  function shekere(c: AudioContext, t: number, accent: boolean, v: number) {
    noiseHit(c, t, "highpass", 6500, 0.8, (accent ? 0.22 : 0.1) * v, accent ? 0.09 : 0.05);
  }

  function clap(c: AudioContext, t: number, v: number) {
    for (const [dt, p] of [
      [0, 0.55],
      [0.011, 0.45],
      [0.022, 0.6],
    ] as const) noiseHit(c, t + dt, "bandpass", 1300, 1.1, p * v, dt === 0.022 ? 0.13 : 0.03);
  }

  function agogo(c: AudioContext, t: number, high: boolean, v: number) {
    for (const ratio of [1, 2.76]) {
      const o = c.createOscillator();
      o.type = "square";
      o.frequency.value = (high ? 880 : 660) * ratio;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = (high ? 880 : 660) * ratio;
      bp.Q.value = 8;
      o.connect(bp).connect(env(c, t, (ratio === 1 ? 0.16 : 0.05) * v, 0.002, 0.18));
      o.start(t);
      o.stop(t + 0.25);
    }
  }

  /** A sing-song "voice": sawtooth through two vowel formants, with a little vibrato. */
  function voice(c: AudioContext, t: number, midi: number, dur: number, v: number) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(midiHz(midi) * 0.985, t);
    o.frequency.linearRampToValueAtTime(midiHz(midi), t + 0.04);
    const vib = c.createOscillator();
    const vibG = c.createGain();
    vib.frequency.value = 5.5;
    vibG.gain.value = midiHz(midi) * 0.012;
    vib.connect(vibG).connect(o.frequency);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.03);
    out.gain.setValueAtTime(0.16 * v, t + Math.max(0.05, dur - 0.06));
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, q, g] of [
      [820, 6, 1],
      [1250, 7, 0.6],
      [2700, 9, 0.25],
    ] as const) {
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = c.createGain();
      gg.gain.value = g;
      o.connect(bp).connect(gg).connect(out);
    }
    out.connect(master!);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  /**
   * One chanted word from a small crowd of kids: three copies of the recording,
   * pitched up a little, spread across the stereo field and a few ms apart.
   * The word is sped up if it would spill into the next beat.
   */
  function chantVoice(c: AudioContext, t: number, word: keyof typeof CHANT_SPRITE, beat: number, v: number) {
    const [start, dur] = CHANT_SPRITE[word];
    const fit = Math.min(1.7, Math.max(1, dur / (beat * 0.92)));
    for (const [rate, delay, pan, gain] of [
      [1.2, 0, -0.35, 0.8],
      [1.27, 0.014, 0.35, 0.65],
      [1.13, 0.026, 0, 0.55],
    ] as const) {
      const src = c.createBufferSource();
      src.buffer = chant;
      src.playbackRate.value = rate * fit;
      const p = c.createStereoPanner();
      p.pan.value = pan;
      const g = c.createGain();
      g.gain.value = gain * v;
      src.connect(p).connect(g).connect(master!);
      // Start a touch early so the stressed syllable lands on the beat.
      src.start(Math.max(c.currentTime, t - 0.03 + delay), start, dur);
    }
  }

  return {
    /**
     * Schedules one 4-beat bar starting `delay` seconds from now.
     * The recorded chant runs from the first bar; if it hasn't loaded, a synth
     * melody comes in from bar 2 instead.
     */
    scheduleBar(delay: number, beat: number, barIndex: number, intensity = 0) {
      if (!sfx.enabled) return;
      const c = ctx();
      if (!c) return;
      // Start sounds slightly early so what you hear lines up with what you see.
      const latency = (c.outputLatency || 0) + (c.baseLatency || 0);
      const t0 = c.currentTime + Math.max(0, delay - latency);
      const s16 = beat / 4;
      const at = (pos: number) => t0 + pos * s16;

      logDrum(c, at(0), 1);
      logDrum(c, at(8), 0.8);
      if (intensity > 0.3) logDrum(c, at(11), 0.5);
      clap(c, at(0), 1);
      clap(c, at(4), 1);
      // THROW: a hard stamp on beat 4
      logDrum(c, at(12), 0.9);
      noiseHit(c, at(12), "lowpass", 400, 0.7, 0.5, 0.12);
      for (let p = 0; p < 16; p += 2) shekere(c, at(p), p % 4 === 2, 1);
      if (intensity > 0.5) for (let p = 1; p < 16; p += 4) shekere(c, at(p), false, 0.7);
      for (const [p, f0, f1] of TALKING) talking(c, at(p), f0, f1, 1);
      for (const [p, high] of AGOGO) agogo(c, at(p), high === 1, 0.9);
      if (chant) {
        // "TEN! TEN! TEN! PLAY!" on CLAP, CLAP, JUMP, THROW.
        for (let b = 0; b < 4; b++) chantVoice(c, at(b * 4), chantWord(barIndex, b), beat, b === 3 ? 1.15 : 1);
      } else if (barIndex >= 2) {
        const phrase = PHRASES[(barIndex - 2) % PHRASES.length]!;
        for (const [p, midi, len] of phrase) voice(c, at(p), midi, len * s16 * 0.95, 1);
      }
    },
    /** Start fetching the chant recording (call when the match screen opens). */
    preload() {
      if (sfx.enabled) ctx();
    },
    setVolume(v: number) {
      const c = sfx.context();
      if (master && c) master.gain.setTargetAtTime(0.55 * v, c.currentTime, 0.05);
    },
  };
}

export type TenTenMusic = ReturnType<typeof createTenTenMusic>;

/**
 * Keeps the band in time with a match: schedules each bar just before it starts,
 * using the bar's actual tempo (which rises as the match goes on).
 */
export function createMusicSync(music: TenTenMusic, m: { state: { phase: string; clock: number; barStart: number; beat: number; barIndex: number }; throwTime: () => number }) {
  let scheduled = -1;
  return {
    update() {
      const s = m.state;
      if (s.phase !== "play") return;
      if (scheduled < s.barIndex) {
        // First bar of the match (or after a pause): play whatever is left of it from now.
        if (s.barStart - s.clock > -0.05) music.scheduleBar(Math.max(0, s.barStart - s.clock), s.beat, s.barIndex, intensity(s.beat));
        scheduled = s.barIndex;
      }
      const next = s.barStart + 4 * s.beat;
      if (scheduled === s.barIndex && next - s.clock < 0.12) {
        music.scheduleBar(next - s.clock, s.beat, s.barIndex + 1, intensity(s.beat));
        scheduled = s.barIndex + 1;
      }
    },
    /** Forget what's queued (e.g. after a pause) so the next bar is scheduled fresh. */
    reset() {
      scheduled = m.state.barIndex + 1;
    },
  };
}

/** 0 at a relaxed 100 bpm, 1 at the 172 bpm top speed. */
const intensity = (beat: number) => Math.max(0, Math.min(1, (60 / beat - 100) / 72));
