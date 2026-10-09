// Builds responsive WebP key art (rendered from the 3D game, see /dev/keyart) and PWA icons.
// Run with `npm run images` after adding or changing a source file.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const PHOTOS = [
  // name, source render, crop aspect (w/h), focus position
  { name: "ten-ten", src: "ten-ten.png", aspect: 4 / 3, position: "centre" },
  { name: "police-thief", src: "police-thief.png", aspect: 4 / 3, position: "centre" },
  { name: "suwe", src: "suwe.png", aspect: 3 / 4, position: "centre" },
  { name: "suwe-wide", src: "suwe.png", aspect: 4 / 3, position: "centre" },
  { name: "school-friends", src: "school-friends.png", aspect: 16 / 10, position: "centre" },
  { name: "school-yard", src: "school-yard.png", aspect: 16 / 9, position: "centre" },
  { name: "intensity", src: "intensity.png", aspect: 16 / 9, position: "centre" },
  { name: "playground", src: "playground.png", aspect: 1, position: "centre" },
  { name: "sack-race", src: "sack-race.png", aspect: 4 / 3, position: "right top" },
  { name: "skipping", src: "skipping.png", aspect: 4 / 3, position: "centre" },
];
const WIDTHS = [480, 960, 1600];

await mkdir("public/images", { recursive: true });
await mkdir("public/icons", { recursive: true });

const cropped = (p, w, h) =>
  sharp(`assets/renders/${p.src}`).rotate().resize(w, h, { fit: "cover", position: p.position });

const manifest = {};
for (const p of PHOTOS) {
  const meta = await sharp(`assets/renders/${p.src}`).rotate().metadata();
  let w = meta.width;
  let h = meta.height;
  if (w / h > p.aspect) w = Math.round(h * p.aspect);
  else h = Math.round(w / p.aspect);

  const widths = [];
  for (const target of WIDTHS) {
    const outW = Math.min(target, w);
    if (widths.includes(outW)) continue;
    widths.push(outW);
    const buf = await cropped(p, w, h).toBuffer();
    await sharp(buf)
      .resize(outW)
      .modulate({ saturation: 1.06 })
      .sharpen({ sigma: 0.6 })
      .webp({ quality: 80 })
      .toFile(`public/images/${p.name}-${outW}.webp`);
  }
  // Tiny placeholder, inlined as a data URI and blurred by CSS while the photo loads.
  const blur = await sharp(await cropped(p, w, h).toBuffer()).resize(16).webp({ quality: 40 }).toBuffer();
  manifest[p.name] = { width: w, height: h, widths, blur: `data:image/webp;base64,${blur.toString("base64")}` };
  console.log(`${p.name}: ${w}x${h} -> ${widths.join(", ")}`);
}
await writeFile("lib/photos.generated.json", JSON.stringify(manifest, null, 2) + "\n");

// Icons come from the brand renders in assets/brand (exported from /dev/brand).
const B = "assets/brand";
for (const size of [192, 512]) {
  await sharp(`${B}/icon.png`).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
  await sharp(`${B}/maskable.png`).resize(size, size).png().toFile(`public/icons/maskable-${size}.png`);
}
// iOS rounds the corners itself, so it gets the full-bleed square.
await sharp(`${B}/square.png`).resize(180, 180).png().toFile("public/icons/apple-touch-icon.png");
for (const size of [16, 32, 48]) await sharp(`${B}/icon.png`).resize(size, size, { kernel: "lanczos3" }).png().toFile(`public/icons/favicon-${size}.png`);
await mkdir("public/brand", { recursive: true });
await sharp(`${B}/logo.png`).resize(1040).webp({ quality: 90 }).toFile("public/brand/logo.webp");
await sharp(`${B}/logo.png`).resize(1040).png().toFile("public/brand/logo.png");
console.log("icons done");
