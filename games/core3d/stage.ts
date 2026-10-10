import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

export type Quality = "high" | "medium" | "low";

export function detectQuality(): Quality {
  if (typeof navigator === "undefined") return "medium";
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mem <= 2 || cores <= 4) return "low";
  if (mobile && mem <= 4) return "medium";
  return mobile ? "medium" : "high";
}

export const QUALITY = {
  high: { dpr: 2, shadow: 2048, npcs: 30, traffic: 8, fog: 1 },
  medium: { dpr: 1.5, shadow: 1024, npcs: 16, traffic: 6, fog: 1 },
  low: { dpr: 1, shadow: 512, npcs: 6, traffic: 3, fog: 1.2 },
} as const;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  quality: Quality;
  size: { w: number; h: number };
  /** Moves the shadow-casting area to follow the action. */
  focusShadows(target: THREE.Vector3): void;
  /** Call once per frame with the real frame time: drops resolution/shadows if the phone can't keep up. */
  adapt(frameDt: number): void;
  render(): void;
  dispose(): void;
}

/**
 * Renderer, sky, sunlight and haze for an outdoor Lagos afternoon.
 * Physically based: ACES tone mapping, sky-derived image-based lighting, soft shadows.
 */
export type LightPreset = "day" | "evening" | "overcast";

const PRESETS: Record<LightPreset, { elevation: number; azimuth: number; turbidity: number; rayleigh: number; sun: number; sunColor: number; fog: number; fogNear: number; fogFar: number; exposure: number; env: number; hemi: number }> = {
  day: { elevation: 38, azimuth: 135, turbidity: 2.4, rayleigh: 3.2, sun: 3.6, sunColor: 0xffeccc, fog: 0xbccbd6, fogNear: 50, fogFar: 200, exposure: 0.85, env: 0.55, hemi: 0.4 },
  evening: { elevation: 9, azimuth: 250, turbidity: 6, rayleigh: 3, sun: 3.2, sunColor: 0xffb070, fog: 0xd6a57e, fogNear: 30, fogFar: 170, exposure: 0.95, env: 0.45, hemi: 0.3 },
  overcast: { elevation: 50, azimuth: 160, turbidity: 18, rayleigh: 0.6, sun: 0.9, sunColor: 0xdfe6ee, fog: 0x8d969b, fogNear: 12, fogFar: 95, exposure: 1.05, env: 0.9, hemi: 0.75 },
};

export function createStage(canvas: HTMLCanvasElement, opts: { quality?: Quality; preset?: LightPreset } = {}): Stage {
  const P = PRESETS[opts.preset ?? "day"];
  const quality = opts.quality ?? detectQuality();
  const q = QUALITY[quality];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", powerPreference: "high-performance", stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = P.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality === "low" ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

  // Sky dome with a slightly dusty, harmattan-tinted atmosphere.
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const u = sky.material.uniforms;
  u.turbidity!.value = P.turbidity;
  u.rayleigh!.value = P.rayleigh;
  u.mieCoefficient!.value = 0.006;
  u.mieDirectionalG!.value = 0.82;
  const elevation = P.elevation;
  const azimuth = P.azimuth;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));
  u.sunPosition!.value.copy(sunDir);
  scene.add(sky);

  // Image-based lighting from the same sky so materials pick up a believable ambient.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  const env = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = P.env;

  const sun = new THREE.DirectionalLight(P.sunColor, P.sun);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = opts.preset !== "overcast";
  sun.shadow.mapSize.set(q.shadow, q.shadow);
  const sc = sun.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 1;
  sc.far = 160;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // Warm bounce light off the red earth.
  scene.add(new THREE.HemisphereLight(0xbcd6f2, 0x8a4f2e, P.hemi));
  scene.fog = new THREE.Fog(P.fog, P.fogNear / q.fog, P.fogFar / q.fog);

  const size = { w: 1, h: 1 };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    size.w = Math.max(1, Math.round(r.width));
    size.h = Math.max(1, Math.round(r.height));
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // Adaptive resolution: if frames run slow for a while, render fewer pixels (never goes back up mid-game).
  let ema = 1 / 60;
  let slowFor = 0;
  let pixelRatio = renderer.getPixelRatio();
  let shadowsHalved = false;

  // Dev only: lets performance checks read draw calls / triangles per frame.
  if (process.env.NODE_ENV !== "production") Object.assign(window, { __renderer: renderer, __scene: scene });
  return {
    renderer,
    scene,
    camera,
    sun,
    quality,
    size,
    adapt(frameDt) {
      if (frameDt <= 0 || frameDt > 0.25) return;
      ema += (frameDt - ema) * 0.08;
      slowFor = ema > 1 / 45 ? slowFor + frameDt : 0;
      if (slowFor < 1.2) return;
      slowFor = 0;
      if (pixelRatio > 0.75) {
        pixelRatio = Math.max(0.75, pixelRatio - 0.25);
        renderer.setPixelRatio(pixelRatio);
        resize();
      } else if (!shadowsHalved && sun.castShadow) {
        shadowsHalved = true;
        const sz = Math.max(256, sun.shadow.mapSize.x / 2);
        sun.shadow.mapSize.set(sz, sz);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },
    focusShadows(target) {
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(sunDir, 60);
      // Snap to texel grid to stop shadow shimmer as the camera moves.
      const texel = (sc.right - sc.left) / q.shadow;
      sun.position.x = Math.round(sun.position.x / texel) * texel;
      sun.position.z = Math.round(sun.position.z / texel) * texel;
    },
    render() {
      // The sky box is 1 km across: keep it centred on the camera so long runs never leave it.
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
    },
    dispose() {
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
        }
      });
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

export { webglAvailable } from "./support";
