/**
 * Regenerate the app icons and the Open Graph card from the SVG sources in
 * `scripts/assets/`.
 *
 * Run from the repo root:  node scripts/generate-icons.mjs
 *
 * Committed outputs:
 *   src/app/icon.svg            favicon (Next links it automatically)
 *   src/app/apple-icon.png      180px iOS touch icon
 *   public/icon-192.png         PWA manifest
 *   public/icon-512.png         PWA manifest
 *   public/icon-maskable-512.png
 *   public/og.png               1200x630 Open Graph card
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "assets");
const repo = path.join(here, "..");

const read = (name) => readFile(path.join(assets, name));
const png = (svg, size) => sharp(svg, { density: 384 }).resize(size, size).png();

const icon = await read("icon.svg");
const maskable = await read("icon-maskable.svg");
const og = await read("og.svg");

await writeFile(path.join(repo, "src/app/icon.svg"), icon);

await png(icon, 180).toFile(path.join(repo, "src/app/apple-icon.png"));
await png(icon, 192).toFile(path.join(repo, "public/icon-192.png"));
await png(icon, 512).toFile(path.join(repo, "public/icon-512.png"));
await png(maskable, 512).toFile(path.join(repo, "public/icon-maskable-512.png"));

await sharp(og, { density: 192 })
  .resize(1200, 630)
  .png()
  .toFile(path.join(repo, "public/og.png"));

console.log("icons regenerated");
