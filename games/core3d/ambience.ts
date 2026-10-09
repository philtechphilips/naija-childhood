import type { Sfx } from "@/games/core/audio";

/**
 * Synthesised Lagos street ambience: crowd murmur, a neighbour's generator,
 * distant traffic, and the odd danfo horn. No recordings needed.
 *
 * Plays through the game's shared audio (so the sound toggle mutes it), and
 * starts up later if sound is switched on mid-game.
 */
export function createAmbience(sfx: Sfx) {
  if (typeof window === "undefined") return { resume() {}, setVolume() {}, dispose() {} };
  let master: GainNode | null = null;
  let ctx: AudioContext | null = null;
  const nodes: AudioScheduledSourceNode[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let volume = 1;
  let disposed = false;

  function build() {
    if (master || disposed) return;
    const c = sfx.context();
    const out = sfx.output();
    if (!c || !out) return;
    ctx = c;
    master = c.createGain();
    master.gain.value = 0;
    master.connect(out);
    master.gain.linearRampToValueAtTime(0.32 * volume, c.currentTime + 2.5);
    const m = master;

    // Brown noise buffer
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const noise = (gain: number, type: BiquadFilterType, freq: number, q = 0.7) => {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(m);
      src.start(0, Math.random() * 3);
      nodes.push(src);
      return { src, f, g };
    };
    // Crowd chatter: band-limited noise with a slow swell.
    const crowd = noise(0.9, "bandpass", 600, 0.6);
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain).connect(crowd.g.gain);
    lfo.start();
    nodes.push(lfo);
    // Traffic rumble
    noise(0.7, "lowpass", 180);
    // Generator hum: low sawtooth through a lowpass, slightly unsteady.
    const gen = c.createOscillator();
    gen.type = "sawtooth";
    gen.frequency.value = 49;
    const genF = c.createBiquadFilter();
    genF.type = "lowpass";
    genF.frequency.value = 220;
    const genG = c.createGain();
    genG.gain.value = 0.05;
    gen.connect(genF).connect(genG).connect(m);
    gen.start();
    nodes.push(gen);

    const horn = () => {
      if (disposed) return;
      // Two-tone danfo horn, a few beeps.
      const t0 = c.currentTime + 0.05;
      const beeps = 1 + Math.floor(Math.random() * 3);
      const pan = c.createStereoPanner();
      pan.pan.value = Math.random() * 2 - 1;
      const g = c.createGain();
      g.gain.value = 0.0;
      pan.connect(m);
      g.connect(pan);
      for (const f of [410, 520]) {
        const o = c.createOscillator();
        o.type = "square";
        o.frequency.value = f * (0.95 + Math.random() * 0.1);
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1600;
        o.connect(lp).connect(g);
        o.start(t0);
        o.stop(t0 + beeps * 0.32);
      }
      for (let b = 0; b < beeps; b++) {
        g.gain.setValueAtTime(0, t0 + b * 0.32);
        g.gain.linearRampToValueAtTime(0.05, t0 + b * 0.32 + 0.02);
        g.gain.setValueAtTime(0.05, t0 + b * 0.32 + 0.2);
        g.gain.linearRampToValueAtTime(0, t0 + b * 0.32 + 0.24);
      }
      timer = setTimeout(horn, 3500 + Math.random() * 9000);
    };
    timer = setTimeout(horn, 2500);
  }

  build();
  // Sound switched on later (or the context wasn't ready yet): start then.
  const unsubscribe = sfx.onChange((on) => {
    if (on) build();
  });

  return {
    resume() {
      build();
      if (ctx?.state === "suspended") void ctx.resume();
    },
    setVolume(v: number) {
      volume = v;
      if (master && ctx) master.gain.setTargetAtTime(0.32 * v, ctx.currentTime, 0.3);
    },
    dispose() {
      disposed = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          // already stopped
        }
      }
      master?.disconnect();
    },
  };
}
