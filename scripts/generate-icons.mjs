// ============================================================
// generate-icons.mjs — Génère les icônes et écrans de démarrage
// Android d'EuroPilot à partir de assets/icon.svg, avec sharp.
//
// Produits (dans android/app/src/main/res/) :
//   mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png          48/72/96/144/192 px
//   mipmap-{…}/ic_launcher_round.png                                 (masque circulaire)
//   mipmap-{…}/ic_launcher_foreground.png                            108/162/216/324/432 px
//       → couche « foreground » des icônes adaptatives (API 26+) :
//         glyphe « € » blanc seul, fond transparent, dimensionné pour
//         la zone sûre de 66 dp du canevas 108 dp.
//   drawable{,-port,-land}-{mdpi,…}/splash.png                       écran de lancement bleu #2563eb + « € »
//   values/ic_launcher_background.xml                                → #2563eb
//
// Le rendu est fait par librsvg (fourni avec sharp) : aucune dépendance
// système supplémentaire. Le script vérifie après coup que le glyphe a
// bien été dessiné (pixels blancs présents), pour échouer bruyamment si
// une machine ne dispose d'aucune police contenant « € ».
//
// Usage : npm run icons
// ============================================================

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const BRAND = '#2563eb';
const SRC_SVG = path.join(ROOT, 'assets', 'icon.svg');
const VIEW = 64; // viewBox du SVG source (0 0 64 64)

// Densités Android : mdpi = 1x. ic_launcher = 48 dp, icône adaptative = 108 dp.
const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];
const launcherSize = (d) => Math.round(48 * d);   // 48/72/96/144/192
const foregroundSize = (d) => Math.round(108 * d); // 108/162/216/324/432

// Dimensions des écrans de démarrage du template Capacitor (à conserver).
const SPLASH = {
  'drawable/splash.png': [480, 320],
  'drawable-port-mdpi/splash.png': [320, 480],
  'drawable-port-hdpi/splash.png': [480, 800],
  'drawable-port-xhdpi/splash.png': [720, 1280],
  'drawable-port-xxhdpi/splash.png': [960, 1600],
  'drawable-port-xxxhdpi/splash.png': [1280, 1920],
  'drawable-land-mdpi/splash.png': [480, 320],
  'drawable-land-hdpi/splash.png': [800, 480],
  'drawable-land-xhdpi/splash.png': [1280, 720],
  'drawable-land-xxhdpi/splash.png': [1600, 960],
  'drawable-land-xxxhdpi/splash.png': [1920, 1280],
};

/** Impose des dimensions explicites au SVG (attributs width/height), sans les dupliquer. */
function setSize(svgText, w, h) {
  return svgText.replace(/<svg\b[^>]*>/, (tag) => tag
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '')
    .replace('<svg', `<svg width="${w}" height="${h}"`));
}

/** Rasterise un SVG en PNG, avec sur-échantillonnage pour un anti-crénelage propre. */
async function rasterize(svgText, w, h, supersample = 4) {
  const buf = await sharp(Buffer.from(setSize(svgText, w, h)), { density: 96 * supersample })
    .png()
    .toBuffer();
  return sharp(buf).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
}

/** Boîte englobante des pixels « presque blancs » d'un tampon RGBA. */
function whiteBBox(raw, w, h) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (raw[o] > 240 && raw[o + 1] > 240 && raw[o + 2] > 240 && raw[o + 3] > 200) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function countWhite(raw, w, h) {
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (raw[o] > 240 && raw[o + 1] > 240 && raw[o + 2] > 240 && raw[o + 3] > 200) n++;
  }
  return n;
}

// ---------------------------------------------------------------- principal
const srcText = await readFile(SRC_SVG, 'utf8');
if (!srcText.includes(BRAND)) {
  console.warn(`⚠ assets/icon.svg ne contient pas ${BRAND} — vérifiez la couleur de marque.`);
}

// 1. Géométrie réelle du glyphe « € » (rendu une fois à haute résolution).
const PROBE = 512;
const probeBuf = await sharp(Buffer.from(setSize(srcText, PROBE, PROBE))).png().toBuffer();
const { data: probeRaw, info: probeInfo } = await sharp(probeBuf).raw().toBuffer({ resolveWithObject: true });
if (countWhite(probeRaw, probeInfo.width, probeInfo.height) < 50) {
  throw new Error(
    'Le glyphe « € » n\'a pas été rendu par librsvg (aucune police disponible ?).\n' +
    'Installez une police contenant « € » (ex. fonts-dejavu) puis relancez `npm run icons`.'
  );
}
const box = whiteBBox(probeRaw, probeInfo.width, probeInfo.height);
const k = PROBE / VIEW; // px par unité SVG
const glyph = {
  cx: (box.x0 + box.x1 + 1) / 2 / k,
  cy: (box.y0 + box.y1 + 1) / 2 / k,
  h: (box.y1 - box.y0 + 1) / k,
};
console.log(`Glyphe « € » : centre (${glyph.cx.toFixed(2)}, ${glyph.cy.toFixed(2)}) · hauteur ${glyph.h.toFixed(2)} unités`);

// Élément <text> du SVG source, réutilisé tel quel (police, graisse, ancrage).
const textEl = srcText.match(/<text[\s\S]*?<\/text>/)[0];
/** Même glyphe, centré sur (0,0) et mis à l'échelle `scale`. */
const glyphAt = (scale) =>
  `<g transform="scale(${scale.toFixed(6)}) translate(${(-glyph.cx).toFixed(4)},${(-glyph.cy).toFixed(4)})">${textEl}</g>`;

// 2. SVG dérivés.
/** Icône adaptative : glyphe blanc seul sur fond transparent, dans la zone sûre (66 dp / 108 dp). */
function foregroundSvg() {
  // 108 dp de canevas ↔ 64 unités ; zone sûre 66 dp → 39 unités de haut pour le glyphe.
  const scale = (66 / 108) * VIEW / glyph.h;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}">` +
    `<g transform="translate(${VIEW / 2},${VIEW / 2})">${glyphAt(scale)}</g></svg>`;
}
/** Écran de démarrage : aplat bleu + glyphe blanc centré (30 % du petit côté). */
function splashSvg(w, h) {
  const scale = (0.3 * Math.min(w, h)) / glyph.h;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${BRAND}"/>` +
    `<g transform="translate(${w / 2},${h / 2})">${glyphAt(scale)}</g></svg>`;
}
/** Masque circulaire pour ic_launcher_round.png. */
const circleMask = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
  `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`;

// 3. Génération des mipmaps.
const written = [];
for (const [name, d] of DENSITIES) {
  const dir = path.join(RES, `mipmap-${name}`);

  const size = launcherSize(d);
  const launcher = await rasterize(srcText, size, size);
  await writeFile(path.join(dir, 'ic_launcher.png'), launcher);

  const round = await sharp(launcher)
    .composite([{ input: await sharp(Buffer.from(circleMask(size))).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();
  await writeFile(path.join(dir, 'ic_launcher_round.png'), round);

  const fgSize = foregroundSize(d);
  const fg = await rasterize(foregroundSvg(), fgSize, fgSize);
  await writeFile(path.join(dir, 'ic_launcher_foreground.png'), fg);

  written.push(`mipmap-${name}/ic_launcher.png (${launcherSize(d)}px)`, `mipmap-${name}/ic_launcher_round.png`, `mipmap-${name}/ic_launcher_foreground.png (${fgSize}px)`);
}

// 4. Écrans de démarrage (remplacent le splash « logo Capacitor » du template).
for (const [rel, [w, h]] of Object.entries(SPLASH)) {
  const target = path.join(RES, rel);
  if (!existsSync(target)) continue; // ne crée rien qui n'existe pas déjà dans le template
  await writeFile(target, await rasterize(splashSvg(w, h), w, h, 2));
  written.push(rel);
}

// 5. Fond des icônes adaptatives = couleur de marque.
const bgXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND}</color>\n</resources>\n`;
await writeFile(path.join(RES, 'values', 'ic_launcher_background.xml'), bgXml);
written.push('values/ic_launcher_background.xml');

// 6. Contrôles qualité sur la plus grande icône générée.
const check = await sharp(path.join(RES, 'mipmap-xxxhdpi', 'ic_launcher.png')).raw().toBuffer({ resolveWithObject: true });
const whites = countWhite(check.data, check.info.width, check.info.height);
if (whites < check.info.width * check.info.height * 0.01) {
  throw new Error('Contrôle qualité : le glyphe « € » est absent de ic_launcher.png.');
}
const fgCheck = await sharp(path.join(RES, 'mipmap-xxxhdpi', 'ic_launcher_foreground.png')).raw().toBuffer({ resolveWithObject: true });
const fgBox = whiteBBox(fgCheck.data, fgCheck.info.width, fgCheck.info.height);
const fgCorner = fgCheck.data[3]; // alpha du pixel (0,0) : doit rester transparent
if (!fgBox || fgCorner > 8) {
  throw new Error('Contrôle qualité : ic_launcher_foreground.png invalide (fond non transparent ou glyphe absent).');
}
console.log(`✓ ${written.length} fichiers écrits dans android/app/src/main/res/`);
for (const w of written) console.log('  -', w);
