// Builds the 3D asset pack in public/3d from free, openly licensed sources:
//  - Microsoft Rocketbox avatars + animations (MIT)   github.com/microsoft/Microsoft-Rocketbox
//  - Poly Haven textures + props (CC0)                 polyhaven.com
// Usage: node scripts/assets3d/build.mjs [avatars|anims|props|textures|all]
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { decodeTga } from "./tga.mjs";
import { applyRetone, sampleSkin, specToRoughness } from "./retone.mjs";
import { ANIMS, AVATARS } from "./avatars.mjs";
import { PROPS, TEXTURES } from "./polyhaven.mjs";

const run = promisify(execFile);
const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".cache/assets3d");
const OUT = path.join(ROOT, "public/3d");
const RB = "https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets";
const FBX2GLTF = path.join(ROOT, "node_modules/fbx2gltf/bin", process.platform === "win32" ? "Windows_NT" : process.platform === "darwin" ? "Darwin" : "Linux", process.platform === "win32" ? "FBX2glTF.exe" : "FBX2glTF");

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

async function fetchCached(url, file) {
  if (existsSync(file)) return readFile(file);
  await mkdir(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "naija-childhood-asset-build" } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(file, buf);
      return buf;
    }
    if (res.status === 404) throw new Error(`404 ${url}`);
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`Failed to download ${url}`);
}

async function fetchJson(url, file) {
  return JSON.parse((await fetchCached(url, file)).toString());
}

const webp = (rgba, w, h, size, quality = 82) =>
  sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width: w, height: h, channels: 4 } })
    .resize(size, size, { kernel: "lanczos3" })
    .removeAlpha()
    .webp({ quality })
    .toBuffer();

// ---------------------------------------------------------------- avatars
async function buildAvatars() {
  await mkdir(path.join(OUT, "avatars"), { recursive: true });
  await mkdir(path.join(CACHE, "previews"), { recursive: true });
  const manifest = [];
  for (const a of AVATARS) {
    const name = a.src.split("/")[1];
    const dir = path.join(CACHE, "rocketbox", name);
    const listing = await fetchJson(`https://api.github.com/repos/microsoft/Microsoft-Rocketbox/contents/Assets/Avatars/${a.src}/Textures`, path.join(dir, "textures.json"));
    const files = listing.map((f) => f.name);
    const code = files.find((f) => f.endsWith("_head_color.tga")).replace("_head_color.tga", "");
    const fbx = path.join(dir, `${name}.fbx`);
    await fetchCached(`${RB}/Avatars/${a.src}/Export/${name}.fbx`, fbx);

    const tex = {};
    const headColor = decodeTga(await fetchCached(`${RB}/Avatars/${a.src}/Textures/${code}_head_color.tga`, path.join(dir, `${code}_head_color.tga`)));
    const skinRef = sampleSkin(headColor);
    for (const part of ["head", "body"]) {
      for (const kind of ["color", "normal", "specular"]) {
        const file = `${code}_${part}_${kind}.tga`;
        if (!files.includes(file)) continue;
        const buf = await fetchCached(`${RB}/Avatars/${a.src}/Textures/${file}`, path.join(dir, file));
        const img = decodeTga(buf);
        if (kind === "color") {
          applyRetone(img, a.spec, part, skinRef);
          tex[`${part}_color`] = await webp(img.data, img.width, img.height, 1024, 84);
          await sharp(tex[`${part}_color`]).resize(512).toFile(path.join(CACHE, "previews", `${a.id}_${part}.jpg`));
        } else if (kind === "normal") {
          tex[`${part}_normal`] = await webp(img.data, img.width, img.height, 1024, 90);
        } else {
          specToRoughness(img);
          tex[`${part}_rough`] = await webp(img.data, img.width, img.height, 512, 80);
        }
      }
    }

    const tmp = path.join(CACHE, "tmp", a.id);
    await mkdir(path.dirname(tmp), { recursive: true });
    await run(FBX2GLTF, ["-b", "-i", fbx, "-o", tmp], { maxBuffer: 1 << 26 });
    const doc = await io.read(`${tmp}.glb`);
    doc.createExtension(EXTTextureWebP).setRequired(true);
    const root = doc.getRoot();
    root.listTextures().forEach((t) => t.dispose());
    for (const mat of root.listMaterials()) {
      const part = mat.getName().includes("head") ? "head" : "body";
      const mk = (key) => (tex[key] ? doc.createTexture(`${a.id}_${key}`).setImage(new Uint8Array(tex[key])).setMimeType("image/webp") : null);
      mat.setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1).setAlphaMode("OPAQUE").setDoubleSided(false);
      mat.setBaseColorTexture(mk(`${part}_color`));
      mat.setNormalTexture(mk(`${part}_normal`));
      mat.setMetallicRoughnessTexture(mk(`${part}_rough`));
      mat.setEmissiveTexture(null).setOcclusionTexture(null);
    }
    await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    await io.write(path.join(OUT, "avatars", `${a.id}.glb`), doc);

    // Rig naming differs between avatar sets (Bip01 / Bip02); record it for retargeting.
    const bones = root.listNodes().map((n) => n.getName());
    const rig = bones.find((b) => /^Bip0\d$/.test(b)) ?? "Bip01";
    manifest.push({ id: a.id, name: a.name, kind: a.kind, sex: a.sex, rig });
    console.log(`avatar ${a.id} (${name}) rig=${rig}`);
  }
  return manifest;
}

// ---------------------------------------------------------------- animations
async function buildAnims() {
  await mkdir(path.join(OUT, "anims"), { recursive: true });
  for (const [out, folder, stem] of ANIMS) {
    const fbx = path.join(CACHE, "anims", `${stem}.fbx`);
    await fetchCached(`${RB}/Animations/${folder}/${stem}.max.fbx`, fbx);
    const tmp = path.join(CACHE, "tmp", `anim_${out}`);
    await run(FBX2GLTF, ["-b", "--anim-framerate", "bake30", "-i", fbx, "-o", tmp], { maxBuffer: 1 << 26 });
    const doc = await io.read(`${tmp}.glb`);
    for (const anim of doc.getRoot().listAnimations()) {
      anim.setName(out);
      for (const ch of anim.listChannels()) {
        const node = ch.getTargetNode()?.getName() ?? "";
        const p = ch.getTargetPath();
        // Rotations drive the pose; keep translation only on the pelvis for the vertical bob.
        const keep = p === "rotation" || (p === "translation" && / Pelvis$/.test(node));
        if (!keep) {
          ch.getSampler()?.dispose();
          ch.dispose();
        }
      }
    }
    await doc.transform(resample({ tolerance: 0.0008 }), prune({ keepLeaves: true, keepAttributes: true }));
    await io.write(path.join(OUT, "anims", `${out}.glb`), doc);
    console.log(`anim ${out}`);
  }
}

// ---------------------------------------------------------------- Poly Haven
async function buildProps() {
  await mkdir(path.join(OUT, "props"), { recursive: true });
  for (const p of PROPS) {
    const files = await fetchJson(`https://api.polyhaven.com/files/${p.id}`, path.join(CACHE, "polyhaven", p.id, "files.json"));
    const g = files.gltf["1k"].gltf;
    const dir = path.join(CACHE, "polyhaven", p.id);
    await fetchCached(g.url, path.join(dir, `${p.id}.gltf`));
    for (const [rel, f] of Object.entries(g.include)) await fetchCached(f.url, path.join(dir, rel));
    const doc = await io.read(path.join(dir, `${p.id}.gltf`));
    const steps = [prune(), dedup(), weld()];
    if (p.simplify) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: p.simplify, error: 0.002 }));
    steps.push(textureCompress({ encoder: sharp, targetFormat: "webp", resize: [p.tex ?? 512, p.tex ?? 512], quality: 80 }));
    steps.push(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    await doc.transform(...steps);
    await io.write(path.join(OUT, "props", `${p.id}.glb`), doc);
    console.log(`prop ${p.id}`);
  }
}

async function buildTextures() {
  await mkdir(path.join(OUT, "textures"), { recursive: true });
  for (const t of TEXTURES) {
    const files = await fetchJson(`https://api.polyhaven.com/files/${t.id}`, path.join(CACHE, "polyhaven", t.id, "files.json"));
    const size = t.size ?? 1024;
    for (const [key, out, q] of [["Diffuse", "diff", 82], ["nor_gl", "nor", 88], ["arm", "arm", 80]]) {
      const url = files[key]?.["1k"]?.jpg?.url ?? files[key]?.["2k"]?.jpg?.url;
      if (!url) continue;
      const buf = await fetchCached(url, path.join(CACHE, "polyhaven", t.id, `${out}.jpg`));
      await sharp(buf).resize(size, size).webp({ quality: q }).toFile(path.join(OUT, "textures", `${t.id}_${out}.webp`));
    }
    console.log(`texture ${t.id}`);
  }
}

const stage = process.argv[2] ?? "all";
await mkdir(OUT, { recursive: true });
const manifestPath = path.join(OUT, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {};
if (stage === "avatars" || stage === "all") manifest.avatars = await buildAvatars();
if (stage === "anims" || stage === "all") {
  await buildAnims();
  manifest.anims = ANIMS.map(([n]) => n);
}
if (stage === "props" || stage === "all") {
  await buildProps();
  manifest.props = PROPS.map((p) => p.id);
}
if (stage === "textures" || stage === "all") {
  await buildTextures();
  manifest.textures = TEXTURES.map((t) => t.id);
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("done");
