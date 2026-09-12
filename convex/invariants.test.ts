import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { prepareRegionOutlines, regionAtPlanePoint } from '../src/domain/region-crossing';
import { decodeRegionRaster, type RegionRasterAsset } from '../src/domain/region-raster';
import { buildGrid, countryAtPlanePoint, decodeGrid } from '../src/domain/routing';
import type { World } from '../src/domain/world';
import gridAsset from '../public/grid.json';
import rasterAsset from '../public/region-grid.json';
import regionsAsset from '../public/regions.json';
import worldAsset from '../public/world.json';
import {
  COST_BY_ROLE,
  HQ_LEVEL_AT_LAUNCH,
  MAX_HQ_LEVEL,
  ROLE_SITE_LEVEL,
  STARTING_ALLOY,
  TIER_2_HQ_LEVEL,
  buildCost,
  roleHqLevel,
  unlockLevel,
} from './constants';

/**
 * **Ce que la ligne de départ doit encore payer** (question 51, « le jour où l'on touche
 * `constants` »). Une facture de première projection est un produit de six nombres qui vivent
 * dans quatre paragraphes différents : personne ne la recalcule en changeant l'un d'eux, et la
 * partie de test au Japon a mesuré ce que ça coûte — 577 alliage pour la mer contre 500 de
 * dotation, un mur que rien n'annonçait.
 *
 * Ce fichier **lit les constantes et n'en recopie aucune** : il tombe le jour où la facture
 * repasse au-dessus de la dotation, quel que soit le nombre qu'on aura bougé.
 */

/** Ce que coûte la montée du quartier général du lancement jusqu'au niveau visé. */
const hqClimb = (target: number): number => {
  let alloy = 0;
  for (let level = HQ_LEVEL_AT_LAUNCH + 1; level <= target; level += 1) {
    alloy += buildCost('hq', level).alloy ?? 0;
  }
  return alloy;
};

const firstOf = (key: BuildingKey): number => buildCost(key, 1).alloy ?? 0;

describe('la première projection tient dans la dotation', () => {
  it('par voie de mer : fonderie, quartier général, port, caserne et un cargo', () => {
    const bill =
      firstOf('foundry') +
      hqClimb(unlockLevel('port')) +
      firstOf('barracks') +
      firstOf('port') +
      COST_BY_ROLE.cargo.alloy;

    expect(bill).toBeLessThanOrEqual(STARTING_ALLOY);
  });

  it('par voie de terre : fonderie, quartier général et caserne', () => {
    const bill = firstOf('foundry') + hqClimb(unlockLevel('barracks')) + firstOf('barracks');

    expect(bill).toBeLessThanOrEqual(STARTING_ALLOY);
  });
});

describe('les deux verrous d’un rôle', () => {
  /**
   * **L'arme et son contre arrivent ensemble** (`plan-progression-v1.md`, question 6c). Le
   * blindé passe par deux portes : celle de son site, et celle du quartier général qui arme
   * l'infanterie MK2. `cappedByHq` tient un site sous son quartier général, donc la première
   * suffit à impliquer un QG au niveau du site — la seconde le dit quand même, parce que c'est
   * elle qui ouvre le contre.
   */
  it('n’ouvre jamais le blindé avant le palier qui arme sa réponse', () => {
    expect(ROLE_SITE_LEVEL.armor).toBeGreaterThanOrEqual(TIER_2_HQ_LEVEL);
    expect(roleHqLevel('armor')).toBeGreaterThanOrEqual(TIER_2_HQ_LEVEL);
  });

  /** Un rôle écrit au-dessus du plafond des niveaux serait un rôle caché toute la saison. */
  it('ne demande à aucun site un niveau que rien n’atteint', () => {
    for (const [role, level] of Object.entries(ROLE_SITE_LEVEL) as ReadonlyArray<
      [UnitRole, number]
    >) {
      expect(level, role).toBeGreaterThanOrEqual(1);
      expect(level, role).toBeLessThanOrEqual(MAX_HQ_LEVEL);
    }
  });
});

/**
 * **Le runtime Convex refuse un tiret dans un chemin de module** : `npx convex deploy` s'arrête
 * sur `InvalidConfig` avant même de pousser, alors que `tsc`, `eslint` et `convex-test` ne
 * regardent pas le nom du fichier — le dépôt était vert et ne se déployait pas. Le tiret vient
 * de `src/domain/`, où il reste la règle ; il n'entre pas ici. Les `*.test.ts` sont exclus du
 * bundle par le CLI, donc hors de portée de cette règle.
 */
describe('les noms de modules de convex/', () => {
  const CONVEX_PATH_SEGMENT = /^[A-Za-z0-9_.]+$/;

  const modulePathsUnder = (directory: string, prefix = ''): ReadonlyArray<string> =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        return entry.name === '_generated'
          ? []
          : modulePathsUnder(join(directory, entry.name), relative);
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
      return [relative];
    });

  it('n’emploient que des lettres, des chiffres, des points et des tirets bas', () => {
    const offenders = modulePathsUnder(import.meta.dirname).filter((path) =>
      path.split('/').some((segment) => !CONVEX_PATH_SEGMENT.test(segment)),
    );

    expect(
      offenders,
      `Le runtime Convex refuse ces chemins : chaque segment sous convex/ ne peut porter que des caractères alphanumériques, des tirets bas ou des points. Renommer en camelCase.`,
    ).toEqual([]);
  });
});

/**
 * **Un module de `convex/` ne travaille pas à l'import.** Le déploiement charge chaque module
 * dans un isolat pour y découvrir les fonctions, avec quatre secondes pour l'ensemble : une
 * préparation de contours au niveau du module a suffi à faire refuser le push
 * (`InvalidModules — Function execution timed out`). Le modèle est celui de la grille de
 * `routes.ts` — `let grid = null` puis `grid ??= decodeGrid(gridAsset, world)`.
 *
 * La mesure porte sur l'**exécution** et non sur le premier import : celui-ci paie la
 * transformation de `public/regions.json` par Vite et la lecture de 2,6 Mo à travers le pont
 * WSL, deux coûts que le serveur ne paie pas. D'où la passe de chauffe, puis `resetModules` avant
 * chaque module — ce qui reste est le travail que l'isolat, lui, refera.
 */
describe('le travail à l’import des modules de convex/', () => {
  const IMPORT_BUDGET_MS = 300;

  it('ne dépasse jamais le budget d’un isolat de déploiement', async () => {
    const modules = import.meta.glob('./**/*.ts');
    const paths = Object.keys(modules).filter(
      (path) => !path.includes('/_generated/') && !path.endsWith('.test.ts'),
    );
    expect(paths.length).toBeGreaterThan(0);

    for (const path of paths) await modules[path]!();

    const overBudget: string[] = [];
    for (const path of paths) {
      vi.resetModules();
      const started = performance.now();
      await modules[path]!();
      const elapsed = performance.now() - started;
      if (elapsed > IMPORT_BUDGET_MS) overBudget.push(`${path} (${Math.round(elapsed)} ms)`);
    }

    expect(
      overBudget,
      `Ces modules travaillent à l’import : le déploiement a ${IMPORT_BUDGET_MS} ms par module, et une machine de développement est bien plus rapide que l’isolat qui évalue le push. Mettre le calcul derrière une mémoïsation, comme la grille de convex/routes.ts.`,
    ).toEqual([]);
  }, 120000);
});

/** Le monde tel que le serveur le montait avant la cuisson — la référence contre laquelle les
 *  deux rasters sont vérifiés, et la seule chose qui lise encore `world.json` ici. */
const worldOf = (asset: typeof worldAsset): World =>
  ({
    sphere: asset.meta.sphere,
    outline: asset.meta.outline,
    countries: asset.countries.map((country) => ({
      name: country.n,
      adm0: country.a,
      representativePoint: country.c,
      lonLat: country.ll,
      rings: country.p,
    })),
  }) as unknown as World;

/**
 * **Le raster de géographie est cuit, et la cuisson ne peut pas mentir** (ADR 0023) — le jumeau
 * du contrôle de la grille, et pour la même raison : `region-grid.json` porte la région admin-1 et
 * le pays hôte de chaque cellule, cuits hors ligne avec les fonctions polygonales elles-mêmes, et
 * le serveur ne lit plus un seul polygone. Un `regions.json` régénéré et un raster resté en place
 * laisseraient le jeu répondre sur une géographie périmée, en silence.
 *
 * Un recuit complet coûte quinze secondes : ce qui est vérifié ici est un **échantillon fixe** de
 * deux mille cellules — mille portant une région, mille portant un pays — où le raster et le
 * polygone doivent dire la même chose. On recuit (`node scripts/generate-region-grid.mjs`,
 * chaîné par `generate-world.mjs`) ou la CI refuse.
 */
describe('le raster de géographie cuit', () => {
  const world = worldOf(worldAsset);
  const raster = decodeRegionRaster(rasterAsset as unknown as RegionRasterAsset, world);

  /** Le même garde-fou que la géométrie du serveur : un anneau dégénéré que Natural Earth
   *  projette sur tout le cadre n'est pas un contour. */
  const isProjectionFrame = (ring: ReadonlyArray<readonly [number, number]>): boolean => {
    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    return (
      Math.max(...xs) - Math.min(...xs) > 400 * 0.9 &&
      Math.max(...ys) - Math.min(...ys) > worldAsset.meta.sphere.maxY * 0.9
    );
  };

  const outlines = prepareRegionOutlines(
    regionsAsset.regions.map((region) => ({
      id: region.id,
      rings: (
        region.p as unknown as ReadonlyArray<ReadonlyArray<readonly [number, number]>>
      ).filter((ring) => !isProjectionFrame(ring)),
    })),
  );

  const boxOf = (country: World['countries'][number]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ring of country.rings) {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return [minX, minY, maxX, maxY] as const;
  };
  const boxes = new Map(world.countries.map((country) => [country.adm0, boxOf(country)]));

  const centreOf = (cell: number): readonly [number, number] => [
    raster.sphere.minX + ((cell % raster.width) + 0.5) * raster.step,
    raster.sphere.minY + (Math.floor(cell / raster.width) + 0.5) * raster.step,
  ];

  /** Un échantillon **régulier** plutôt qu'aléatoire : le même à chaque exécution, donc un échec
   *  se rejoue. Pris parmi les cellules qui portent quelque chose — un océan d'aplats nuls ne
   *  dirait rien de la frontière. */
  const sample = (channel: Uint16Array, count: number): ReadonlyArray<number> => {
    const filled: number[] = [];
    for (let cell = 0; cell < channel.length; cell += 1) if (channel[cell] !== 0) filled.push(cell);
    const stride = Math.floor(filled.length / count);
    return Array.from({ length: count }, (_, rank) => filled[rank * stride]!);
  };

  /**
   * **Une cellule, un indice** : les buts servis par `goalCellsForRegions` sont donnés tels quels
   * à Dijkstra. Une maille qui divergerait de celle de `grid.json` ne ferait pas échouer un
   * calcul, elle enverrait les colonnes ailleurs.
   */
  it('partage la maille de la grille de routage, cellule pour cellule', () => {
    const grid = decodeGrid(gridAsset, world);
    expect([raster.width, raster.height, raster.step]).toEqual([
      grid.width,
      grid.height,
      grid.step,
    ]);
  });

  it('rend la région que le polygone rendait, sur mille cellules', () => {
    for (const cell of sample(raster.regions, 1000)) {
      const point = centreOf(cell);
      expect(
        regionAtPlanePoint(outlines, point, 400),
        `cellule ${cell} : public/region-grid.json ne correspond plus à public/regions.json — recuire avec node scripts/generate-region-grid.mjs.`,
      ).toBe(raster.ids[raster.regions[cell]! - 1] ?? null);
    }
  }, 120000);

  it('rend le pays que le polygone rendait, sur mille cellules', () => {
    for (const cell of sample(raster.countries, 1000)) {
      const point = centreOf(cell);
      /** Le filtre par boîte n'est pas une approximation : un polygone dont la boîte exclut le
       *  point ne peut pas le contenir, et l'ordre de la table — qui décide en cas de
       *  chevauchement — est conservé. */
      const candidates = world.countries.filter((country) => {
        const box = boxes.get(country.adm0)!;
        return point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3];
      });
      expect(
        countryAtPlanePoint(candidates, point),
        `cellule ${cell} : public/region-grid.json ne correspond plus à public/world.json — recuire avec node scripts/generate-region-grid.mjs.`,
      ).toBe(raster.hosts[raster.countries[cell]! - 1] ?? null);
    }
  }, 120000);

  /**
   * **Le chrono, parce que c'est tout l'objet de la cuisson** : une query a une seconde, et la
   * préparation des 4 589 contours qu'il remplace coûtait 41 ms à chaud sur une machine de
   * développement — des secondes à froid, sans JIT, dans l'isolat qui évalue le push.
   */
  it('se décode assez vite pour tenir dans le budget d’une query', () => {
    const started = performance.now();
    decodeRegionRaster(rasterAsset as unknown as RegionRasterAsset, world);
    const elapsed = performance.now() - started;

    console.log(`raster de géographie décodé en ${elapsed.toFixed(1)} ms`);
    expect(
      elapsed,
      `Le décodage du raster coûte ${Math.round(elapsed)} ms. Au-dessus de 50 ms, il n’a plus sa place dans une query, qui n’a qu’une seconde pour tout le reste.`,
    ).toBeLessThan(50);
  });
});

/**
 * **La grille de routage est cuite, et la cuisson ne peut pas mentir.** `buildGrid` reste la
 * référence — elle rasterise les polygones de `world.json` — mais aucune query ne l'appelle :
 * `public/grid.json` porte les mêmes cellules en plages et `convex/routes.ts` les décode. Les deux
 * chemins doivent rendre la même grille **octet pour octet**, sans quoi un `SEA_GATES` modifié ou
 * un `world.json` regénéré laisserait le serveur router sur une géographie périmée, en silence.
 * C'est le même esprit que le miroir du simulateur : on recuit (`node scripts/generate-grid.mjs`,
 * chaîné par `generate-world.mjs`) ou la CI refuse.
 *
 * Et le chrono, parce que c'est tout l'objet de la cuisson : une query a **une seconde**, et la
 * rasterisation à froid, sans JIT, la dépassait — d'où les « Function execution timed out » par
 * intermittence sur `view:playerView`, qui lit `afloat` et `coastal` sur cette grille.
 */
describe('la grille de routage cuite', () => {
  it('rend exactement la grille que rasteriserait le monde', () => {
    const world = worldOf(worldAsset);
    const built = buildGrid(world);
    const decoded = decodeGrid(gridAsset, world);

    expect([decoded.width, decoded.height, decoded.step]).toEqual([
      built.width,
      built.height,
      built.step,
    ]);
    expect(
      decoded.cells,
      `public/grid.json ne correspond plus à public/world.json : recuire avec node scripts/generate-grid.mjs.`,
    ).toEqual(built.cells);
    expect(decoded.edges).toEqual(built.edges);
  }, 120000);

  it('se décode assez vite pour tenir dans le budget d’une query', () => {
    const world = worldOf(worldAsset);
    const started = performance.now();
    decodeGrid(gridAsset, world);
    const elapsed = performance.now() - started;

    // Imprimé : c'est le chiffre qui dit si la cuisson tient encore sa promesse.
    console.log(`grille décodée en ${elapsed.toFixed(1)} ms`);
    expect(
      elapsed,
      `Le décodage de la grille coûte ${Math.round(elapsed)} ms. Au-dessus de 50 ms, il n’a plus sa place dans une query, qui n’a qu’une seconde pour tout le reste.`,
    ).toBeLessThan(50);
  });
});
