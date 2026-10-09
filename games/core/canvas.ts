export interface Viewport {
  /** CSS pixel size. */
  w: number;
  h: number;
  /** Backing-store scale (device pixel ratio, capped for low-end GPUs). */
  dpr: number;
}

const MAX_DPR = 2;

/**
 * Keeps a canvas' backing store matched to its CSS size and device pixel ratio.
 * Calls onResize after every change so engines can rebuild cached layers.
 */
export function fitCanvas(canvas: HTMLCanvasElement, onResize: (vp: Viewport) => void): { vp: Viewport; dispose: () => void } {
  const vp: Viewport = { w: 1, h: 1, dpr: 1 };
  const apply = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === vp.w && h === vp.h && dpr === vp.dpr) return;
    vp.w = w;
    vp.h = h;
    vp.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    onResize(vp);
  };
  const ro = new ResizeObserver(apply);
  ro.observe(canvas);
  apply();
  return { vp, dispose: () => ro.disconnect() };
}

export function context2d(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { alpha: false }) as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Canvas 2D is not supported on this device");
  return ctx;
}

export function makeLayer(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not supported on this device");
  return { canvas, ctx };
}

/** Resolves the canvas HUD and body font stacks (set as CSS variables by next/font). */
export function fonts(): { display: string; body: string } {
  if (typeof document === "undefined") return { display: "sans-serif", body: "sans-serif" };
  const style = getComputedStyle(document.documentElement);
  return {
    display: style.getPropertyValue("--font-hud").trim() || "system-ui, sans-serif",
    body: style.getPropertyValue("--font-body").trim() || "system-ui, sans-serif",
  };
}
