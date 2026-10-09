import type { Sfx } from "./audio";

/**
 * Original Naija-style soundtracks, synthesised live with Web Audio: no files,
 * no samples, nothing licensed. Each game picks a style:
 *
 *  - "amapiano":  log-drum bass, shakers, jazzy piano chords (street run)
 *  - "highlife":  palm-wine guitar picking, bell pattern, walking bass (Suwe)
 *  - "afrobeats": bouncy kick, offbeat keys, a lead hook (sack race)
 *  - "fuji":      talking drum, sakara, agogo, shekere (skipping rope)
 *
 * A lookahead scheduler runs on the audio clock, so timing never depends on the
 * frame rate. Everything plays through the shared mix bus, so the sound toggle
 * mutes it. `setIntensity(0..1)` adds layers as the game heats up.
 */
export type MusicStyle = "amapiano" | "highlife" | "afrobeats" | "fuji";

const STYLE_BPM: Record<MusicStyle, number> = { amapiano: 113, highlife: 124, afrobeats: 104, fuji: 118 };
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Chord progressions (MIDI notes), one chord per bar.
const PROG: Record<MusicStyle, number[][]> = {
  // Fmaj9 – Em7 – Dm9 – Cmaj7 (A minor-ish, the classic piano-house drift)
  amapiano: [
    [53, 57, 60, 64, 67],
    [52, 55, 59, 62, 67],
    [50, 53, 57, 60, 64],
    [48, 52, 55, 59, 64],
  ],
  // G – C – D – G: bright highlife cycle
  highlife: [
    [55, 59, 62, 67],
    [48, 52, 55, 60],
    [50, 54, 57, 62],
    [55, 59, 62, 67],
  ],
  // Am – F – C – G: Afropop staple
  afrobeats: [
    [57, 60, 64],
    [53, 57, 60],
    [48, 52, 55],
    [55, 59, 62],
  ],
  // Fuji is mostly drums; a drone for the talking drum to speak over.
  fuji: [[50], [50], [53], [48]],
};

// Afrobeats hook: [step, midi, length in 16ths] across 2 bars, A minor pentatonic.
const HOOK: [number, number, number][] = [
  [0, 76, 2],
  [3, 74, 1],
  [4, 72, 2],
  [7, 69, 1],
  [8, 72, 3],
  [12, 74, 2],
  [14, 76, 2],
  [16, 79, 3],
  [20, 76, 2],
  [23, 74, 1],
  [24, 72, 4],
  [30, 69, 2],
];

export function createNaijaMusic(sfx: Sfx, style: MusicStyle, opts: { enabled?: boolean } = {}) {
  let ctx: AudioContext | null = null;
  let out: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let shaper: WaveShaperNode | null = null;
  const plucks = new Map<number, AudioBuffer>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let nextTime = 0;
  let step = 0;
  let intensity = 0;
  let volume = 1;
  let enabled = opts.enabled ?? true;
  let playing = false;
  const sixteenth = 60 / STYLE_BPM[style] / 4;

  function setup(): boolean {
    if (ctx) return true;
    const c = sfx.context();
    const bus = sfx.output();
    if (!c || !bus) return false;
    ctx = c;
    out = c.createGain();
    out.gain.value = 0;
    // Gentle glue so layers sit together.
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    out.connect(comp).connect(bus);
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Soft saturation for the log drum.
    shaper = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    shaper.connect(out);
    return true;
  }

  // ------------------------------------------------------------ instruments
  const env = (t: number, peak: number, attack: number, decay: number, dest: AudioNode = out!) => {
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  };

  const noiseHit = (t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, pan = 0) => {
    const c = ctx!;
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(p).connect(env(t, peak, 0.002, decay));
    src.start(t, Math.random() * 0.8);
    src.stop(t + decay + 0.05);
  };

  const kick = (t: number, v = 1) => {
    const o = ctx!.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
    o.connect(env(t, 0.9 * v, 0.003, 0.3));
    o.start(t);
    o.stop(t + 0.4);
  };

  /** Amapiano log drum: a pitched, gliding, slightly overdriven boom. */
  const logDrum = (t: number, midi: number, v = 1, len = 0.45) => {
    const c = ctx!;
    const o = c.createOscillator();
    o.type = "sine";
    const f = midiHz(midi);
    o.frequency.setValueAtTime(f * 1.9, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(f * 0.94, t + len);
    const o2 = c.createOscillator();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(f * 2, t);
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    o2.connect(g2);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + len);
    o.connect(lp);
    g2.connect(lp);
    lp.connect(env(t, 0.75 * v, 0.004, len, shaper!));
    o.start(t);
    o2.start(t);
    o.stop(t + len + 0.1);
    o2.stop(t + len + 0.1);
  };

  const bass = (t: number, midi: number, len: number, v = 1) => {
    const c = ctx!;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = midiHz(midi);
    const sub = c.createOscillator();
    sub.type = "sine";
    sub.frequency.value = midiHz(midi);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    lp.Q.value = 2;
    o.connect(lp);
    sub.connect(lp);
    lp.connect(env(t, 0.32 * v, 0.008, len));
    for (const n of [o, sub]) {
      n.start(t);
      n.stop(t + len + 0.1);
    }
  };

  /** Electric-piano chord: sine + a little FM bell, lowpassed. */
  const keys = (t: number, notes: number[], len: number, v = 1) => {
    const c = ctx!;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    lp.connect(env(t, 0.16 * v, 0.01, len));
    for (const m of notes) {
      const car = c.createOscillator();
      car.frequency.value = midiHz(m);
      const mod = c.createOscillator();
      mod.frequency.value = midiHz(m) * 2;
      const mg = c.createGain();
      mg.gain.setValueAtTime(midiHz(m) * 0.9, t);
      mg.gain.exponentialRampToValueAtTime(1, t + 0.4);
      mod.connect(mg).connect(car.frequency);
      car.connect(lp);
      car.start(t);
      mod.start(t);
      car.stop(t + len + 0.1);
      mod.stop(t + len + 0.1);
    }
  };

  /** Plucked guitar string (Karplus-Strong, rendered once per note and cached). */
  const pluckBuffer = (midi: number) => {
    let b = plucks.get(midi);
    if (b) return b;
    const c = ctx!;
    const sr = c.sampleRate;
    const n = Math.floor(sr * 1.4);
    b = c.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    const period = Math.max(2, Math.round(sr / midiHz(midi)));
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const next = (idx + 1) % period;
      const v = 0.5 * (ring[idx]! + ring[next]!) * 0.996;
      d[i] = ring[idx]!;
      ring[idx] = v;
      idx = next;
    }
    plucks.set(midi, b);
    return b;
  };

  const pluck = (t: number, midi: number, v = 1, pan = 0) => {
    const c = ctx!;
    const src = c.createBufferSource();
    src.buffer = pluckBuffer(midi);
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 160;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    const g = c.createGain();
    g.gain.value = 0.42 * v;
    src.connect(hp).connect(p).connect(g).connect(out!);
    src.start(t);
    src.stop(t + 1.3);
  };

  const bell = (t: number, high: boolean, v = 1) => {
    const c = ctx!;
    for (const ratio of [1, 2.76]) {
      const o = c.createOscillator();
      o.type = "square";
      const f = (high ? 880 : 660) * ratio;
      o.frequency.value = f;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = 8;
      o.connect(bp).connect(env(t, (ratio === 1 ? 0.11 : 0.035) * v, 0.002, 0.16));
      o.start(t);
      o.stop(t + 0.22);
    }
  };

  const talkingDrum = (t: number, f0: number, f1: number, v = 1) => {
    const c = ctx!;
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    o.connect(lp).connect(env(t, 0.36 * v, 0.003, 0.17));
    o.start(t);
    o.stop(t + 0.24);
    noiseHit(t, "bandpass", 1800, 1.5, 0.06 * v, 0.03);
  };

  /** Sakara: low frame drum thud. */
  const sakara = (t: number, v = 1) => {
    const o = ctx!.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    o.connect(env(t, 0.5 * v, 0.003, 0.22));
    o.start(t);
    o.stop(t + 0.3);
    noiseHit(t, "lowpass", 500, 0.7, 0.12 * v, 0.06);
  };

  const lead = (t: number, midi: number, len: number, v = 1) => {
    const c = ctx!;
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = midiHz(midi);
    const vib = c.createOscillator();
    vib.frequency.value = 5.2;
    const vg = c.createGain();
    vg.gain.value = midiHz(midi) * 0.01;
    vib.connect(vg).connect(o.frequency);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1900;
    o.connect(lp).connect(env(t, 0.07 * v, 0.02, len));
    o.start(t);
    vib.start(t);
    o.stop(t + len + 0.1);
    vib.stop(t + len + 0.1);
  };

  // ------------------------------------------------------------ patterns
  function schedule(s: number, t: number) {
    const pos = s % 16;
    const bar = Math.floor(s / 16);
    const chord = PROG[style][bar % PROG[style].length]!;
    const root = chord[0]!;
    const I = intensity;
    switch (style) {
      case "amapiano": {
        if (pos % 4 === 0) kick(t, 0.75);
        if (pos === 4 || pos === 12) noiseHit(t, "bandpass", 1500, 0.8, 0.35, 0.12); // clap
        noiseHit(t, "highpass", 7000, 0.7, pos % 2 ? 0.07 : 0.12, 0.04, 0.3); // shaker 16ths
        // Log drum bassline: syncopated, sliding.
        const ld: Record<number, number> = { 3: 0, 6: 0, 10: 7, 13: 5 };
        if (pos in ld) logDrum(t, root - 12 + ld[pos]!, 0.9);
        if (I > 0.45 && (pos === 15 || pos === 8)) logDrum(t, root - 12 + 12, 0.6, 0.25);
        if (pos === 0) keys(t, chord, sixteenth * 14, 0.9);
        if (I > 0.65 && pos % 8 === 6) bell(t, pos === 14, 0.6);
        break;
      }
      case "highlife": {
        // Bell (gankogui-like) and light clave.
        if ([0, 3, 6, 8, 11, 14].includes(pos)) bell(t, pos === 0 || pos === 8, 0.55);
        if (pos % 4 === 0) kick(t, pos === 0 ? 0.6 : 0.4);
        noiseHit(t, "highpass", 8000, 0.7, pos % 2 ? 0.04 : 0.07, 0.03, -0.2);
        // Palm-wine guitar: arpeggio over the chord, an octave up, alternating sides.
        const arp = [0, 2, 1, 3, 2, 1, 3, 2];
        if (pos % 2 === 0) pluck(t, chord[arp[(pos / 2) % arp.length]! % chord.length]! + 12, 0.9, pos % 4 ? 0.35 : -0.35);
        if (I > 0.4 && pos % 4 === 1) pluck(t, chord[(pos >> 2) % chord.length]! + 24, 0.45, 0.5);
        // Walking bass on the beat.
        if (pos % 4 === 0) bass(t, root - 12 + [0, 7, 4, 7][pos / 4]!, sixteenth * 3.5, 0.9);
        break;
      }
      case "afrobeats": {
        // Kick on 1, the "and" of 2, and 3; rim/clap on 2 and 4.
        if (pos === 0 || pos === 6 || pos === 8 || (I > 0.5 && pos === 14)) kick(t, 0.85);
        if (pos === 4 || pos === 12) noiseHit(t, "bandpass", 1800, 1, 0.3, 0.1);
        if ([3, 7, 10, 14].includes(pos)) noiseHit(t, "bandpass", 3500, 4, 0.12, 0.03, 0.4); // rim
        noiseHit(t, "highpass", 7500, 0.7, pos % 2 ? 0.06 : 0.1, 0.035, -0.3);
        // Offbeat keys stabs.
        if (pos % 4 === 2) keys(t, chord.map((m) => m + 12), sixteenth * 1.5, 0.8);
        if ([0, 3, 8, 11].includes(pos)) bass(t, root - 12 + (pos === 11 ? 7 : 0), sixteenth * 2.5, 1);
        if (I > 0.35) {
          const k = (bar % 2) * 16 + pos;
          for (const [p, m, l] of HOOK) if (p === k) lead(t, m - 12, l * sixteenth, 1);
        }
        break;
      }
      case "fuji": {
        // Sakara pulse, agogo, shekere and the talking drum "speaking".
        if (pos === 0 || pos === 6 || pos === 10) sakara(t, 1);
        if ([0, 3, 6, 10, 12].includes(pos)) bell(t, pos === 0 || pos === 6, 0.7);
        noiseHit(t, "highpass", 6500, 0.8, pos % 4 === 2 ? 0.16 : 0.07, pos % 4 === 2 ? 0.08 : 0.04, 0.2);
        const talk: Record<number, [number, number]> = { 1: [150, 210], 4: [220, 170], 7: [160, 240], 9: [150, 200], 13: [230, 160], 15: [180, 230] };
        if (pos in talk) talkingDrum(t, talk[pos]![0], talk[pos]![1], 1);
        if (I > 0.5 && pos % 2 === 1) talkingDrum(t, 260, 200, 0.5);
        if (pos === 0) bass(t, root - 12, sixteenth * 12, 0.7);
        break;
      }
    }
  }

  function tick() {
    if (!playing || !ctx) return;
    // Behind the scheduler (tab was hidden)? Jump ahead instead of a burst.
    if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.25) {
      // Afro swing: push the off-16ths a touch late.
      const swing = style === "afrobeats" || style === "amapiano" ? 0.12 : 0.05;
      schedule(step, nextTime + (step % 2 ? swing * sixteenth : 0));
      nextTime += sixteenth;
      step++;
    }
  }

  function begin() {
    if (playing || !enabled || !setup()) return;
    playing = true;
    nextTime = ctx!.currentTime + 0.12;
    out!.gain.cancelScheduledValues(ctx!.currentTime);
    out!.gain.setTargetAtTime(0.42 * volume, ctx!.currentTime, 0.4);
    timer = setInterval(tick, 50);
    tick();
  }

  function halt(fade = 0.3) {
    if (!playing) return;
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    if (ctx && out) out.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
  }

  // Sound switched on mid-game: start the music if it should be playing.
  let wanted = false;
  const unsubscribe = sfx.onChange((on) => {
    if (on && wanted) begin();
  });

  return {
    start() {
      wanted = true;
      begin();
    },
    stop(fade = 0.6) {
      wanted = false;
      halt(fade);
    },
    /** 0 = calm, 1 = everything going: adds layers. */
    setIntensity(v: number) {
      intensity = Math.max(0, Math.min(1, v));
    },
    /** Pause = 0, play = 1. */
    setVolume(v: number) {
      volume = v;
      if (ctx && out && playing) out.gain.setTargetAtTime(0.42 * v, ctx.currentTime, 0.15);
    },
    setEnabled(v: boolean) {
      enabled = v;
      if (!v) halt();
      else if (wanted) begin();
    },
    dispose() {
      unsubscribe();
      halt(0.1);
      setTimeout(() => out?.disconnect(), 400);
    },
    /**
     * Schedules a whole stretch up front instead of live, for offline rendering
     * (OfflineAudioContext), e.g. the launch trailer soundtrack.
     */
    prerender(from: number, to: number, intensityAt: (t: number) => number = () => intensity) {
      if (!setup()) return;
      out!.gain.setValueAtTime(0.42 * volume, from);
      let t = from;
      let i = 0;
      const swing = style === "afrobeats" || style === "amapiano" ? 0.12 : 0.05;
      while (t < to) {
        intensity = Math.max(0, Math.min(1, intensityAt(t)));
        schedule(i, t + (i % 2 ? swing * sixteenth : 0));
        t += sixteenth;
        i++;
      }
    },
  };
}

export type NaijaMusic = ReturnType<typeof createNaijaMusic>;
