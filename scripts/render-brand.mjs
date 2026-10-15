// Renders Kanakku's icon, adaptive icon layers, favicon and splash marks from
// src/brand/mark.ts. Run after changing the mark: node scripts/render-brand.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { leafBody, leafStem, leafRib, palette } from "../src/brand/mark.ts";

const out = (name) =>
  fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
// Leaf bounding box centre is (49, 52) in the 100-unit box.
const leaf = (scale, fill, cut, x = 50, y = 50) => `
  <g transform="translate(${x - 49 * scale} ${y - 52 * scale}) scale(${scale})">
    <path d="${leafBody}" fill="${fill}"/>
    <path d="${leafStem}" stroke="${fill}" stroke-width="7" stroke-linecap="round"/>
    <path d="${leafRib}" fill="none" stroke="${cut}" stroke-width="5" stroke-linecap="round"/>
  </g>`;
const tile = (p, side) => {
  const o = 50 - side / 2;
  return `<rect x="${o}" y="${o}" width="${side}" height="${side}" rx="${side * 0.3}" fill="${p.tile}"/>${leaf(0.72 * (side / 100), p.leaf, p.tile)}`;
};
const svg = (body, bg = "none") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">${
    bg === "none" ? "" : `<rect width="100" height="100" fill="${bg}"/>`
  }${body}</svg>`;
const L = palette.light;
const D = palette.dark;
const assets = [
  // Platforms apply their own mask to the full-bleed icon.
  ["icon.png", 1024, svg(leaf(0.72, L.leaf, L.tile), L.tile)],
  ["favicon.png", 48, svg(tile(L, 100))],
  // Adaptive foreground keeps the leaf inside the 66/108 safe zone.
  ["android-icon-foreground.png", 1024, svg(leaf(0.52, L.leaf, L.tile))],
  // Monochrome: transparent rib so themed icons keep the ledger stroke.
  [
    "android-icon-monochrome.png",
    1024,
    svg(`<mask id="rib"><rect width="100" height="100" fill="#fff"/>${leaf(0.52, "none", "#000")}</mask>
      <g mask="url(#rib)">${leaf(0.52, "#fff", "#fff")}</g>`),
  ],
  // Android 12+ masks splash icons to a circle of two thirds of the image.
  ["splash-icon.png", 1024, svg(tile(L, 50))],
  ["splash-icon-dark.png", 1024, svg(tile(D, 50))],
];
const browser = await chromium.launch();
for (const [name, size, markup] of assets) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
  });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markup}</body></html>`,
  );
  await page.screenshot({ path: out(name), omitBackground: true });
  await page.close();
}
await browser.close();
console.log(`Rendered ${assets.length} brand assets.`);
