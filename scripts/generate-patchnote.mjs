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
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumPath } from './chromium.mjs';
import {
  FONT_FAMILIES,
  argsOf,
  contentRefusalOf,
  indexRowOf,
  sheetHtml,
  withRow,
} from './patchnote.mjs';

/** Un échec dit sa cause et sort non nul ; rien n'est écrit avant que tout soit rendu. */
const refuse = (message, code = 1) => {
  console.error(`generate-patchnote : ${message}`);
  process.exit(code);
};

const parsed = argsOf(process.argv.slice(2));
if (parsed.refusal) refuse(parsed.refusal, 2);
const { contentPath, blankPath } = parsed;

const dir = process.env.PLAYWRIGHT_DIR;
if (!dir)
  refuse('PLAYWRIGHT_DIR absent : dossier hors dépôt où `npm i playwright-core@1.58` a été fait');
const { chromium } = createRequire(`${dir}/`)('playwright-core');

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
if (!existsSync(contentPath)) refuse(`contenu introuvable : ${contentPath}`, 2);
let content;
try {
  content = JSON.parse(readFileSync(contentPath, 'utf8'));
} catch (error) {
  refuse(`${contentPath} n'est pas du JSON : ${error.message}`, 2);
}
const base = dirname(resolve(contentPath));
const contentRefusal = contentRefusalOf(content, (src) => existsSync(resolve(base, src)));
if (contentRefusal) refuse(`contenu refusé, ${contentRefusal}`, 2);

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

const out = here('../public/patchnotes/');
const indexFile = `${out}index.json`;
/** Tout est lu et calculé avant le navigateur : une ligne d'index illisible ne coûte pas un rendu. */
const index =
  blankPath || !existsSync(indexFile) ? [] : JSON.parse(readFileSync(indexFile, 'utf8'));
const nextIndex = withRow(index, indexRowOf(content));

const browser = await chromium.launch({ executablePath: chromiumPath() });
let sheet, thumb;
try {
  // 1400 × 990 px CSS à densité 2 : 2800 × 1980, le A4 paysage (297 × 210).
  const page = await browser.newPage({
    viewport: { width: 1400, height: 990 },
    deviceScaleFactor: 2,
  });
  await page.setContent(
    sheetHtml(content, readFileSync(here('./patchnote.css'), 'utf8'), imagesOf()),
    { waitUntil: 'networkidle' },
  );
  await page.evaluate(() => document.fonts.ready);
  // `fonts.check()` est vrai sans police déclarée : seule une réponse vide de `fonts.load` dit qu'elle manque.
  const missing = await page.evaluate(
    async (families) =>
      (
        await Promise.all(
          families.map(async (family) => [
            family,
            (await document.fonts.load(`16px "${family}"`)).length,
          ]),
        )
      )
        .filter(([, loaded]) => loaded === 0)
        .map(([family]) => family),
    FONT_FAMILIES,
  );
  if (missing.length)
    refuse(`polices non chargées (Google Fonts injoignable ?) : ${missing.join(', ')}`);
  const broken = await page.evaluate(
    () => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
  );
  if (broken) refuse(`${broken} image(s) du contenu illisible(s) par le navigateur`);
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  // Le WebP sort du canvas de Chromium (comme `render-unit-sprite.mjs`) : aucune dépendance de plus.
  [sheet, thumb] = await page.evaluate(async (data) => {
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
} catch (error) {
  refuse(`rendu échoué : ${error.message}`);
} finally {
  await browser.close();
}

/** Écrit chaque fichier en `.tmp` dans son dossier, puis les renomme : tout, ou rien. */
const writeAll = (files) => {
  const temps = files.map(([path, data]) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.tmp`, data);
    return [`${path}.tmp`, path];
  });
  for (const [temp, path] of temps) renameSync(temp, path);
};

if (blankPath) {
  writeAll([[resolve(blankPath), Buffer.from(sheet, 'base64')]]);
  console.log(`À blanc : ${resolve(blankPath)}`);
} else {
  writeAll([
    [`${out}${content.date}.webp`, Buffer.from(sheet, 'base64')],
    [`${out}${content.date}-thumb.webp`, Buffer.from(thumb, 'base64')],
    [indexFile, `${JSON.stringify(nextIndex, null, 2)}\n`],
  ]);
  console.log(`Bulletin du ${content.date} écrit dans public/patchnotes/`);
}
