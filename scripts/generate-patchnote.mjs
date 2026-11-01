/* global Image, document, FileReader -- ceux de la page rendue par Chromium (page.evaluate) */
/**
 * **Rend le bulletin des mises à jour** : un contenu JSON (cf. `patchnote.mjs`, exemple
 * `patchnote-exemple/2026-11-01.json`) devient la feuille A4 paysage en WebP, 2800 × 1980.
 *
 *     PLAYWRIGHT_DIR=/chemin/vers/pw node scripts/generate-patchnote.mjs <contenu.json>
 *     PLAYWRIGHT_DIR=… node scripts/generate-patchnote.mjs <contenu.json> --a-blanc <feuille.webp>
 *
 * Écrit `public/patchnotes/<date>.webp`, `<date>-thumb.webp` (400 px de large) et ajoute ou
 * remplace la ligne de `public/patchnotes/index.json`. `--a-blanc` n'écrit que la feuille, au
 * chemin donné, sans toucher `public/`. Les polices viennent de Google Fonts : il faut le réseau.
 * `PLAYWRIGHT_DIR` : comme pour `capture.mjs`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRowOf, sheetHtml, withRow } from './patchnote.mjs';

const args = process.argv.slice(2);
const blank = args.indexOf('--a-blanc');
const blankPath = blank < 0 ? null : args[blank + 1];
const contentPath = args.find((arg, k) => !arg.startsWith('--') && k !== blank + 1);
if (!contentPath || (blank >= 0 && !blankPath)) {
  console.error('Usage : generate-patchnote.mjs <contenu.json> [--a-blanc <feuille.webp>]');
  process.exit(2);
}

const dir = process.env.PLAYWRIGHT_DIR;
if (!dir)
  throw new Error('PLAYWRIGHT_DIR absent : dossier hors dépôt où `npm i playwright-core@1.58`');
const { chromium } = createRequire(`${dir}/`)('playwright-core');

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const content = JSON.parse(readFileSync(contentPath, 'utf8'));
const base = dirname(resolve(contentPath));

/** Chaque image du contenu, lue à côté du JSON et glissée dans la page en `data:`. */
const imagesOf = () => {
  const paths = [
    ...content.lead.images,
    ...content.dispatches.map((d) => d.image),
    ...(content.bench.image ? [content.bench.image] : []),
  ].map((i) => i.src);
  const mime = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp' };
  return Object.fromEntries(
    paths.map((src) => [
      src,
      `data:image/${mime[src.split('.').pop()]};base64,${readFileSync(resolve(base, src)).toString('base64')}`,
    ]),
  );
};

const cache = `${homedir()}/Library/Caches/ms-playwright/chromium-1243`;
const app = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const executablePath = existsSync(`${cache}/chrome-mac-arm64/${app}`)
  ? `${cache}/chrome-mac-arm64/${app}`
  : `${cache}/chrome-mac/${app}`;

const browser = await chromium.launch({ executablePath });
try {
  // 1400 × 990 px CSS à densité 2 : 2800 × 1980, le A4 paysage (297 × 210).
  const page = await browser.newPage({
    viewport: { width: 1400, height: 990 },
    deviceScaleFactor: 2,
  });
  await page.setContent(
    sheetHtml(content, readFileSync(here('./patchnote.css'), 'utf8'), imagesOf()),
    {
      waitUntil: 'networkidle',
    },
  );
  await page.evaluate(() => document.fonts.ready);
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  // Le WebP sort du canvas de Chromium (comme `render-unit-sprite.mjs`) : aucune dépendance de plus.
  const [sheet, thumb] = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const webp = async (width) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round((img.naturalHeight * width) / img.naturalWidth);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/webp', 0.88));
      const url = await new Promise((done) => {
        const reader = new FileReader();
        reader.onload = () => done(reader.result);
        reader.readAsDataURL(blob);
      });
      return url.split(',')[1];
    };
    return [await webp(img.naturalWidth), await webp(400)];
  }, png);

  if (blankPath) {
    mkdirSync(dirname(resolve(blankPath)), { recursive: true });
    writeFileSync(blankPath, Buffer.from(sheet, 'base64'));
    console.log(`À blanc : ${resolve(blankPath)}`);
  } else {
    const out = here('../public/patchnotes/');
    const indexFile = `${out}index.json`;
    writeFileSync(`${out}${content.date}.webp`, Buffer.from(sheet, 'base64'));
    writeFileSync(`${out}${content.date}-thumb.webp`, Buffer.from(thumb, 'base64'));
    const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];
    writeFileSync(indexFile, `${JSON.stringify(withRow(index, indexRowOf(content)), null, 2)}\n`);
    console.log(`Bulletin du ${content.date} écrit dans public/patchnotes/`);
  }
} finally {
  await browser.close();
}
