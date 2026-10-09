import * as THREE from "three";
import { fonts } from "@/games/core/canvas";

/**
 * A 2D canvas layered over the WebGL canvas for HUD text, timers, the minimap
 * and name tags. Pointer events pass through to the game controls.
 */
export function createOverlay(glCanvas: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block";
  glCanvas.parentElement?.appendChild(c);
  const g = c.getContext("2d")!;
  let w = 1;
  let h = 1;
  let dpr = 1;
  const resize = () => {
    const r = glCanvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(glCanvas);
  resize();
  const font = fonts();
  const v = new THREE.Vector3();
  return {
    g,
    font,
    get w() {
      return w;
    },
    get h() {
      return h;
    },
    begin() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
    },
    /** World position -> overlay pixels (null when behind the camera). */
    project(p: THREE.Vector3, camera: THREE.Camera): { x: number; y: number } | null {
      v.copy(p).project(camera);
      if (v.z > 1) return null;
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    },
    dispose() {
      ro.disconnect();
      c.remove();
    },
  };
}

export type Overlay = ReturnType<typeof createOverlay>;

export function drawLoading(o: Overlay, label: string, progress: number) {
  const { g, w, h, font } = o;
  g.fillStyle = "#0b100d";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#f4f1ea";
  g.font = `800 20px ${font.display}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, w / 2, h / 2 - 26);
  const bw = Math.min(260, w * 0.6);
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(w / 2 - bw / 2, h / 2, bw, 6);
  g.fillStyle = "#ffc53d";
  g.fillRect(w / 2 - bw / 2, h / 2, bw * Math.max(0.03, Math.min(1, progress)), 6);
  g.font = `600 13px ${font.body}`;
  g.fillStyle = "rgba(244,241,234,0.6)";
  g.fillText("First load downloads the 3D street. After that it's cached.", w / 2, h / 2 + 30);
}
