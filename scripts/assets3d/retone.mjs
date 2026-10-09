// Pixel operations used to adapt Rocketbox textures: deepen skin tones,
// darken hair and recolour clothing, while keeping the original shading.

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const inHue = (h, [a, b]) => (a <= b ? h >= a && h <= b : h >= a || h <= b);
const inRegion = (x, y, regions) => !regions || regions.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

/**
 * Remaps pixels matching a predicate to a target colour, scaling by each
 * pixel's luminance relative to the group's mean so folds, pores and
 * shading survive. Pixels already claimed by an earlier pass are skipped.
 */
function remap(img, match, target, { contrast = 1, keepHue = 0, claimed } = {}) {
  const { width, height, data } = img;
  const [th, ts, tl] = rgbToHsl(...hex(target));
  let sum = 0;
  let count = 0;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (claimed && claimed[i]) continue;
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      if (match(rgbToHsl(r, g, b), x / width, y / height)) {
        mask[i] = 1;
        sum += luma(r, g, b);
        count++;
      }
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    if (claimed) claimed[i] = 1;
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const [h0, s0] = rgbToHsl(r, g, b);
    const rel = Math.pow(luma(r, g, b) / mean, contrast);
    const l = Math.max(0, Math.min(1, tl * rel));
    const dh = (((h0 - th + 540) % 360) - 180) * keepHue;
    const sat = Math.min(1, ts * (0.85 + 0.3 * Math.min(1, s0 / 0.5)));
    const [nr, ng, nb] = hslToRgb(th + dh, sat, l);
    data[i * 4] = Math.round(nr);
    data[i * 4 + 1] = Math.round(ng);
    data[i * 4 + 2] = Math.round(nb);
  }
  return count;
}

export const isSkin = ([h, s, l]) => (h <= 50 || h >= 340) && s >= 0.1 && s <= 0.9 && l >= 0.14 && l <= 0.93;

/** Median skin colour sampled from the centre of the face in a head texture. */
export function sampleSkin(img) {
  const { width, height, data } = img;
  const hs = [];
  const ss = [];
  const ls = [];
  for (let y = Math.floor(height * 0.36); y < height * 0.56; y += 2) {
    for (let x = Math.floor(width * 0.38); x < width * 0.62; x += 2) {
      const i = (y * width + x) * 4;
      const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (!isSkin(hsl)) continue;
      hs.push(hsl[0] > 180 ? hsl[0] - 360 : hsl[0]);
      ss.push(hsl[1]);
      ls.push(hsl[2]);
    }
  }
  const med = (a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)] ?? 0;
  return { h: med(hs), s: med(ss), l: med(ls) };
}

/** Applies an avatar's retone spec to a decoded texture (in place). */
export function applyRetone(img, spec, part, skinRef) {
  if (!spec) return;
  const claimed = new Uint8Array(img.width * img.height);
  const nearSkin = ([h, s]) => skinRef && Math.abs(((h - skinRef.h + 540) % 360) - 180) <= 20 && Math.abs(s - skinRef.s) <= 0.25;
  for (const c of spec.cloth?.[part] ?? []) {
    remap(
      img,
      (hsl, x, y) => {
        const [h, s, l] = hsl;
        if (c.keepSkin && nearSkin(hsl) && l > 0.12) return false;
        return inHue(h, c.hue) && s >= (c.minSat ?? 0.15) && l >= (c.minL ?? 0.03) && l <= (c.maxL ?? 0.97) && inRegion(x, y, c.regions);
      },
      c.to,
      { contrast: c.contrast ?? 1, claimed },
    );
  }
  if (spec.hair && part === "head") {
    const { hue = [28, 60], minSat = 0.18, maxL = 0.95, regions, target = "#17110d" } = spec.hair;
    remap(img, ([h, s, l], x, y) => inHue(h, hue) && s >= minSat && l > 0.04 && l <= maxL && inRegion(x, y, regions), target, { contrast: 0.9, claimed });
  }
  // Head: one pass so every skin pixel shares the same luminance reference (no seams across the face).
  // Body: hands/arms are separate UV islands, so region sweeps get their own reference.
  let regions = spec.skinRegions?.[part];
  if (spec.skin && regions && part === "body") {
    const r = regions;
    remap(img, ([h, s, l], x, y) => inRegion(x, y, r) && (h <= 55 || h >= 330) && s >= 0.04 && l >= 0.1 && l <= 0.99, spec.skin, { contrast: 1.05, keepHue: 0.2, claimed });
    regions = undefined;
  }
  if (spec.skin && (skinRef || regions)) {
    const tol = spec.skinTolerance ?? { h: 14, s: 0.22 };
    remap(
      img,
      ([h, s, l], x, y) => {
        if (regions && inRegion(x, y, regions) && (h <= 55 || h >= 330) && s >= 0.04 && l >= 0.1 && l <= 0.99) return true;
        if (!skinRef) return false;
        const dh = Math.abs(((h - skinRef.h + 540) % 360) - 180);
        return dh <= tol.h && Math.abs(s - skinRef.s) <= tol.s && l >= 0.06 && l <= 0.96;
      },
      spec.skin,
      { contrast: 1.05, keepHue: 0.2, claimed },
    );
  }
}

/** Rocketbox specular maps -> glTF metallicRoughness (G = roughness, B = metalness 0). */
export function specToRoughness(img, { min = 0.35, max = 0.95 } = {}) {
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    const spec = luma(data[i], data[i + 1], data[i + 2]);
    const rough = max - (max - min) * Math.min(1, spec * 1.6);
    data[i] = 255;
    data[i + 1] = Math.round(rough * 255);
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
}
