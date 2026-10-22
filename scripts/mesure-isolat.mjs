/**
 * **Ce qu'un isolat Convex porte, et ce qu'il a le droit de porter.** Mesure et garde-fou : le
 * miroir (`npm run verifier`) l'exécute, et il échoue si un module de `convex/` dépasse le budget
 * à l'import, ou s'il importe une géométrie que le serveur ne lit plus.
 *
 * Le diagnostic du 12/09/2026 a ouvert le chantier : la production recyclait l'isolat en boucle
 * (`TooMuchMemoryCarryOver("~64 MiB", "99 MiB")`) et chaque appel suivant payait un démarrage à
 * froid. Le coupable n'était pas un calcul mais deux `import` — les anciens `regions.json`
 * (22,6 Mio de tas) et `world.json` (11,5), retirés depuis l'atlas (ADR 0034) — payés par tout
 * module touchant une règle de carte, parce qu'un `import` s'évalue au chargement du module et
 * non au premier appel. La géométrie est cuite en raster depuis (ADR 0023) : `convex/messages.ts`
 * est passé de 35,9 Mio à 3,1.
 *
 * Il bundle avec **l'esbuild de `node_modules/convex`** — celui-là même que `convex deploy`
 * utilise — pour que les assets JSON soient inlinés en littéraux JS comme en production, et non
 * lus par `JSON.parse` depuis le disque.
 *
 *   node --expose-gc scripts/mesure-isolat.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (typeof globalThis.gc !== 'function') {
  console.error('Relancer avec --expose-gc :\n  node --expose-gc scripts/mesure-isolat.mjs');
  process.exit(1);
}

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireDepuisConvex = createRequire(path.join(racine, 'node_modules/convex/package.json'));
const esbuild = requireDepuisConvex('esbuild');

/**
 * **Le budget d'un module.** Dix mébioctets est le chiffre de la décision : le plafond de report
 * de Convex est de 99 Mio, la production en observait 64, et ce qu'un module porte à l'import est
 * retenu pour la vie de l'isolat. Au-dessus, c'est qu'un asset de géométrie est revenu.
 */
const BUDGET_MIO = 10;

/**
 * **Les assets de géométrie que le serveur ne lit plus** (ADR 0023, 0034). La côte de mer ouverte
 * (`public/coast.json`, #221) n'en est pas : c'est la seule géométrie de l'atlas qu'il garde.
 * L'espion est un grep et il suffit :
 * la seule façon de repasser au-dessus du budget est de réimporter l'un d'eux, et une lecture de
 * polygone qui reviendrait côté serveur serait une frontière de plus que le raster.
 */
const GEOMETRIE_INTERDITE = ['public/atlas.json', 'public/atlas-near.json'];

const abs = (relatif) => JSON.stringify(path.join(racine, relatif));

/** Les étapes, dans l'ordre où un isolat chaud finit par les payer toutes. */
const ETAPES = [
  {
    titre: '1. public/projection.json',
    source: `import asset from ${abs('public/projection.json')};
             export const retenu = asset;`,
  },
  {
    titre: '2. + decodeGrid(grid.json)',
    source: `import { decodeGrid } from ${abs('src/domain/routing.ts')};
             import gridAsset from ${abs('public/grid.json')};
             import projection from ${abs('public/projection.json')};
             export const retenu = decodeGrid(gridAsset, { ...projection, countries: [] });`,
  },
  {
    titre: '3. + decodeRegionRaster(region-grid.json)',
    source: `import { decodeRegionRaster } from ${abs('src/domain/region-raster.ts')};
             import rasterAsset from ${abs('public/region-grid.json')};
             import projection from ${abs('public/projection.json')};
             export const retenu = decodeRegionRaster(rasterAsset, { ...projection, countries: [] });`,
  },
  {
    titre: '4. + public/region-index.json',
    source: `import asset from ${abs('public/region-index.json')};
             export const retenu = asset;`,
  },
  {
    titre: '5. + caches de regions.ts',
    source: `import { allRegions, regionsOf } from ${abs('convex/regions.ts')};
             const toutes = allRegions();
             const pays = [...new Set(toutes.map((region) => region.country))];
             export const retenu = { toutes, pays: pays.map((code) => regionsOf(code)) };`,
  },
  {
    titre: '6. + decodeCoast(coast.json) et son index',
    source: `import { decodeCoast, groundOf } from ${abs('src/domain/coast.ts')};
             import { decodeGrid } from ${abs('src/domain/routing.ts')};
             import coastAsset from ${abs('public/coast.json')};
             import gridAsset from ${abs('public/grid.json')};
             import projection from ${abs('public/projection.json')};
             const coast = decodeCoast(coastAsset, projection);
             groundOf(decodeGrid(gridAsset, projection), coast, [14.4, 35.9]);
             export const retenu = coast;`,
  },
];

/** Trois passes : la première libère, les suivantes laissent les finaliseurs rendre la mémoire. */
async function collecter() {
  for (let passe = 0; passe < 3; passe += 1) {
    globalThis.gc();
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
}

/**
 * `heapUsed` ignore les tampons hors tas : les deux décodages rendent des tableaux typés qui
 * comptent dans `arrayBuffers`. Les deux colonnes sont servies, sans quoi la cuisson passerait
 * pour gratuite — c'est précisément là qu'elle met ce qu'elle sort du tas.
 */
const mesure = () => {
  const { heapUsed, rss, arrayBuffers } = process.memoryUsage();
  return { heapUsed, rss, arrayBuffers };
};

const mio = (octets) => octets / 1024 / 1024;
const signe = (valeur) => `${valeur >= 0 ? '+' : '−'}${Math.abs(valeur).toFixed(1)}`;

/**
 * Tout module de `convex/`, hors `_generated` et hors suites. Un nom à deux points n'est pas un
 * module du jeu — c'est la règle du dépôt (`test.setup.ts`, `seats.fixture.ts`), celle que le
 * glob de `convex-test` applique déjà.
 */
function modulesDeConvex(dossier = path.join(racine, 'convex'), prefixe = 'convex') {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const relatif = `${prefixe}/${entree.name}`;
    if (entree.isDirectory()) {
      return entree.name === '_generated'
        ? []
        : modulesDeConvex(path.join(dossier, entree.name), relatif);
    }
    if (!entree.name.endsWith('.ts') || entree.name.split('.').length > 2) return [];
    return [relatif];
  });
}

/**
 * **Ce que coûte le seul `import` d'un module, sans appeler aucune fonction.** Un chunk par
 * module, dépendances communes hoistées : le processus enfant charge exactement le graphe de son
 * module. Mesuré dans un processus neuf par module, faute de quoi le premier mesuré paierait pour
 * tous les suivants.
 */
async function sonderImport(paquet) {
  await collecter();
  const avant = process.memoryUsage().heapUsed;
  const chargé = await import(paquet);
  if (chargé.retenu === Symbol.for('jamais')) throw new Error('inatteignable');
  await collecter();
  process.stdout.write(String(process.memoryUsage().heapUsed - avant));
}

/**
 * Les actions `"use node"` qui chargent un paquet CommonJS (`web-push`) ne tournent pas dans
 * l'isolat V8 mais dans un runtime Node où `convex.json` (`node.externalPackages`) le garde hors du
 * paquet : le bundler ESM de la sonde ne saurait ni l'inliner, ni le retrouver dans `/tmp`.
 */
const HORS_ISOLAT = ['convex/pushSend.ts'];

async function phaseImports(atelier) {
  const modules = modulesDeConvex().filter((module) => !HORS_ISOLAT.includes(module));
  const entrees = [];
  for (const [rang, module] of modules.entries()) {
    const fichier = path.join(atelier, `sonde-${rang}.ts`);
    await writeFile(
      fichier,
      `import * as module from ${JSON.stringify(path.join(racine, module))};
       export const retenu = Object.keys(module).length;`,
    );
    entrees.push(fichier);
  }
  const sortie = path.join(atelier, 'sondes');
  await esbuild.build({
    entryPoints: entrees,
    outdir: sortie,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    logLevel: 'error',
  });

  const pesées = [];
  for (const [rang, module] of modules.entries()) {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--expose-gc',
        fileURLToPath(import.meta.url),
        '--import-seul',
        path.join(sortie, `sonde-${rang}.js`),
      ],
      { cwd: racine },
    );
    pesées.push({ module, octets: Number(stdout) });
  }
  pesées.sort((gauche, droite) => droite.octets - gauche.octets);

  const largeur = Math.max(...pesées.map((pesée) => pesée.module.length));
  console.log(`\n\nCoût du seul import, processus neuf par module — cinq plus lourds :\n`);
  for (const pesée of pesées.slice(0, 5)) {
    console.log(`  ${pesée.module.padEnd(largeur)}  ${mio(pesée.octets).toFixed(1)} Mio`);
  }
  return pesées;
}

/** L'espion : un import de géométrie depuis `convex/` est refusé avant même d'être pesé. */
async function phaseEspion() {
  const coupables = [];
  for (const module of modulesDeConvex()) {
    const source = await readFile(path.join(racine, module), 'utf8');
    for (const asset of GEOMETRIE_INTERDITE) {
      if (source.includes(asset)) coupables.push(`${module} → ${asset}`);
    }
  }
  return coupables;
}

async function principal() {
  const atelier = await mkdtemp(path.join(tmpdir(), 'mesure-isolat-'));
  try {
    const entrees = [];
    for (const [rang, etape] of ETAPES.entries()) {
      const fichier = path.join(atelier, `etape-${rang + 1}.ts`);
      await writeFile(fichier, etape.source);
      entrees.push(fichier);
    }

    const sortie = path.join(atelier, 'bundle');
    await esbuild.build({
      entryPoints: entrees,
      outdir: sortie,
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      logLevel: 'error',
    });

    await collecter();
    const depart = mesure();
    const lignes = [];
    let precedent = depart;

    for (const [rang, etape] of ETAPES.entries()) {
      const chemin = path.join(sortie, `etape-${rang + 1}.js`);
      const debut = performance.now();
      const module = await import(chemin);
      const ms = performance.now() - debut;
      /** Le namespace reste vivant par le registre ESM ; la lecture interdit juste l'élision. */
      if (module.retenu === Symbol.for('jamais')) throw new Error('inatteignable');

      await collecter();
      const apres = mesure();
      lignes.push({
        titre: etape.titre,
        ms,
        cumulHeap: apres.heapUsed - depart.heapUsed,
        deltaHeap: apres.heapUsed - precedent.heapUsed,
        cumulBuffers: apres.arrayBuffers - depart.arrayBuffers,
        deltaBuffers: apres.arrayBuffers - precedent.arrayBuffers,
        rss: apres.rss,
      });
      precedent = apres;
    }

    const largeur = Math.max(...lignes.map((ligne) => ligne.titre.length));
    const colonnes = [
      'étape'.padEnd(largeur),
      'tas cumulé'.padStart(11),
      'Δ tas'.padStart(9),
      'Δ buffers'.padStart(10),
      'temps'.padStart(9),
      'RSS'.padStart(9),
    ].join('  ');
    console.log(`\ntas au départ : ${mio(depart.heapUsed).toFixed(1)} Mio\n`);
    console.log(colonnes);
    console.log('─'.repeat(colonnes.length));
    for (const ligne of lignes) {
      console.log(
        [
          ligne.titre.padEnd(largeur),
          `${mio(ligne.cumulHeap).toFixed(1)} Mio`.padStart(11),
          signe(mio(ligne.deltaHeap)).padStart(9),
          signe(mio(ligne.deltaBuffers)).padStart(10),
          `${ligne.ms.toFixed(0)} ms`.padStart(9),
          `${mio(ligne.rss).toFixed(0)} Mio`.padStart(9),
        ].join('  '),
      );
    }

    const total = lignes.at(-1);
    console.log(
      `\nTotal retenu : ${mio(total.cumulHeap).toFixed(1)} Mio de tas ` +
        `+ ${mio(total.cumulBuffers).toFixed(1)} Mio hors tas ` +
        `(plafond de report Convex : 99 Mio, prod observée ~64 Mio).`,
    );

    const pesées = await phaseImports(atelier);
    const coupables = await phaseEspion();
    const trop = pesées.filter((pesée) => mio(pesée.octets) > BUDGET_MIO);

    if (coupables.length > 0) {
      console.error(
        `\n✗ Géométrie importée depuis convex/ — le serveur lit le raster cuit (ADR 0023) :\n` +
          coupables.map((ligne) => `    ${ligne}`).join('\n'),
      );
    }
    if (trop.length > 0) {
      console.error(
        `\n✗ ${trop.length} module(s) au-dessus du budget de ${BUDGET_MIO} Mio à l'import :\n` +
          trop
            .map((pesée) => `    ${pesée.module} — ${mio(pesée.octets).toFixed(1)} Mio`)
            .join('\n'),
      );
    }
    if (coupables.length > 0 || trop.length > 0) process.exitCode = 1;
    else {
      console.log(
        `\n${pesées.length} modules de convex/ sous le budget de ${BUDGET_MIO} Mio à l'import ` +
          `(le plus lourd : ${mio(pesées[0].octets).toFixed(1)} Mio).`,
      );
    }
  } finally {
    await rm(atelier, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--import-seul') await sonderImport(process.argv[3]);
else await principal();
