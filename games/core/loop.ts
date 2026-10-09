/**
 * Fixed-timestep game loop driven by requestAnimationFrame.
 * Simulation runs at 60Hz regardless of display rate; rendering happens once per frame.
 */
export interface Loop {
  start(): void;
  stop(): void;
  setPaused(paused: boolean): void;
  readonly paused: boolean;
}

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

export function createLoop(update: (dt: number) => void, render: (alpha: number) => void): Loop {
  let raf = 0;
  let last = 0;
  let acc = 0;
  let running = false;
  let paused = false;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (!paused) {
      acc += elapsed;
      while (acc >= STEP) {
        update(STEP);
        acc -= STEP;
      }
    }
    render(acc / STEP);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    setPaused(p: boolean) {
      paused = p;
      acc = 0;
    },
    get paused() {
      return paused;
    },
  };
}
