import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

/**
 * Loads and caches the 3D asset pack in /public/3d (built by scripts/assets3d).
 * Avatars: Microsoft Rocketbox (MIT). Props + surfaces: Poly Haven (CC0).
 */
export interface AvatarInfo {
  id: string;
  name: string;
  kind: "child" | "adult";
  sex: "m" | "f";
  rig: string;
}

const BASE = "/3d";
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltfCache = new Map<string, Promise<GLTF>>();
const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
let manifest: Promise<{ avatars: AvatarInfo[] }> | null = null;

export function loadGltf(url: string): Promise<GLTF> {
  let p = gltfCache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    gltfCache.set(url, p);
    p.catch(() => gltfCache.delete(url));
  }
  return p;
}

export function getManifest() {
  manifest ??= fetch(`${BASE}/manifest.json`).then((r) => r.json());
  return manifest;
}

export async function avatarInfo(id: string): Promise<AvatarInfo> {
  const m = await getManifest();
  const a = m.avatars.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown avatar ${id}`);
  return a;
}

/** A fresh, independently animatable copy of an avatar. */
export async function instantiateAvatar(id: string): Promise<{ root: THREE.Object3D; info: AvatarInfo }> {
  const [gltf, info] = await Promise.all([loadGltf(`${BASE}/avatars/${id}.glb`), avatarInfo(id)]);
  const root = cloneSkinned(gltf.scene);
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      // Skinned bounds are computed in bind pose; animated limbs can leave them.
      m.frustumCulled = false;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const s = mat as THREE.MeshStandardMaterial;
        s.envMapIntensity = 0.9;
        if (s.map) s.map.anisotropy = 4;
      }
    }
  });
  return { root, info };
}

const clipCache = new Map<string, Promise<THREE.AnimationClip>>();

/**
 * Loads an animation clip and retargets it to a rig. All Rocketbox avatars share
 * the 3ds Max Biped skeleton; children use "Bip02" bone names instead of "Bip01".
 */
export function loadClip(name: string, rig: string): Promise<THREE.AnimationClip> {
  const key = `${name}:${rig}`;
  let p = clipCache.get(key);
  if (!p) {
    p = loadGltf(`${BASE}/anims/${name}.glb`).then((g) => {
      const src = g.animations[0];
      if (!src) throw new Error(`No animation in ${name}`);
      const clip = src.clone();
      clip.name = name;
      // The Biped "Footsteps" helper isn't part of the skinned rig.
      clip.tracks = clip.tracks.filter((t) => !t.name.includes("Footsteps"));
      if (rig !== "Bip01") {
        for (const t of clip.tracks) t.name = t.name.replace(/^Bip01/, rig);
      }
      return clip;
    });
    clipCache.set(key, p);
  }
  return p;
}

export async function instantiateProp(id: string): Promise<THREE.Object3D> {
  const gltf = await loadGltf(`${BASE}/props/${id}.glb`);
  const obj = gltf.scene.clone(true);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return obj;
}

export function texture(path: string, opts: { repeat?: [number, number]; srgb?: boolean; anisotropy?: number } = {}): THREE.Texture {
  const key = `${path}|${opts.repeat?.join(",") ?? ""}|${opts.srgb ? 1 : 0}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const t = texLoader.load(`${BASE}/textures/${path}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = opts.anisotropy ?? 8;
  texCache.set(key, t);
  return t;
}

/** Poly Haven PBR surface: diffuse, OpenGL normal, and ARM (AO/roughness/metal). */
export function pbrMaterial(
  id: string,
  opts: { repeat?: [number, number]; tint?: THREE.ColorRepresentation; normalScale?: number; roughness?: number } = {},
): THREE.MeshStandardMaterial {
  const repeat = opts.repeat ?? [1, 1];
  const arm = texture(`${id}_arm.webp`, { repeat });
  const mat = new THREE.MeshStandardMaterial({
    map: texture(`${id}_diff.webp`, { repeat, srgb: true }),
    normalMap: texture(`${id}_nor.webp`, { repeat }),
    roughnessMap: arm,
    metalnessMap: arm,
    aoMap: arm,
    aoMapIntensity: 0.8,
    roughness: opts.roughness ?? 1,
    metalness: 1,
    color: opts.tint ?? 0xffffff,
  });
  mat.normalScale.setScalar(opts.normalScale ?? 1);
  return mat;
}

/** Warms the GPU/HTTP caches so the first game frame doesn't hitch. */
export async function preload(urls: { avatars?: string[]; anims?: string[]; props?: string[] }, onProgress?: (p: number) => void) {
  const jobs: Promise<unknown>[] = [];
  for (const a of urls.avatars ?? []) jobs.push(loadGltf(`${BASE}/avatars/${a}.glb`));
  for (const a of urls.anims ?? []) jobs.push(loadGltf(`${BASE}/anims/${a}.glb`));
  for (const p of urls.props ?? []) jobs.push(loadGltf(`${BASE}/props/${p}.glb`));
  let done = 0;
  await Promise.all(
    jobs.map((j) =>
      j.then(() => {
        done++;
        onProgress?.(done / jobs.length);
      }),
    ),
  );
}
