import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NATIONS, type BuildingKey, type ResourceKey } from '../src/domain/ids';
import { decodeAtlas, type AtlasFile, type NearFile } from '../src/domain/atlas';
import { atlasWorld } from '../src/domain/atlas-world';
import {
  cellAt,
  cellsOfRegion,
  decodeRegionRaster,
  goalCellsOfRegions,
  regionAt,
  type RegionRasterAsset,
} from '../src/domain/region-raster';
import {
  buildGrid,
  computeRoute,
  decodeGrid,
  isCoastCell,
  isLandCell,
  lonLatAtProjected,
  projectLonLat,
} from '../src/domain/routing';
import type { LonLat } from '../src/domain/geo';
import type { World } from '../src/domain/world';
import atlasAsset from '../public/atlas.json';
import atlasNearAsset from '../public/atlas-near.json';
import projectionAsset from '../public/projection.json';
import depositsAsset from '../public/deposits.json';
import gridAsset from '../public/grid.json';
import rasterAsset from '../public/region-grid.json';
import indexAsset from '../public/region-index.json';
import regionsAsset from '../public/regions.json';
import { STARTING_KIT, buildCost, recruitmentCost } from './constants';
import { capitalRegionOf, regionFacts } from './regions';
import { coastAtPoint, pointInRegion } from './routes';

/**
 * **Ce que la ligne de départ doit encore payer** (question 51, « le jour où l'on touche
 * `constants` »). Une facture de première projection est un produit de six nombres qui vivent
 * dans quatre paragraphes différents : personne ne la recalcule en changeant l'un d'eux, et la
 * partie de test au Japon a mesuré ce que ça coûte — 577 acier pour la mer contre 500 de
 * dotation, un mur que rien n'annonçait.
 *
 * Ce fichier **lit les constantes et n'en recopie aucune** : il tombe le jour où la facture
 * repasse au-dessus de la dotation, quel que soit le nombre qu'on aura bougé.
 */

type Bill = Partial<Record<ResourceKey, number>>;

const sum = (...bills: ReadonlyArray<Bill>): Bill => {
  const total: Bill = {};
  for (const bill of bills) {
    for (const [key, amount] of Object.entries(bill) as ReadonlyArray<[ResourceKey, number]>) {
      total[key] = (total[key] ?? 0) + amount;
    }
  }
  return total;
};

const firstOf = (key: BuildingKey): Bill => buildCost(key, 1);

/** Chaque ressource de la facture tient dans la dotation, nommée quand elle ne tient pas. */
const fitsTheKit = (bill: Bill) => {
  for (const [key, amount] of Object.entries(bill) as ReadonlyArray<[ResourceKey, number]>) {
    expect(amount, key).toBeLessThanOrEqual(STARTING_KIT[key]);
  }
};

describe('la première projection tient dans la dotation', () => {
  // La mine sur du fer, offerte au socle, rend l'acier : rien d'autre à bâtir avant la caserne.
  it('par voie de mer : port, caserne et un cargo, dans toutes leurs ressources', () => {
    fitsTheKit(sum(firstOf('barracks'), firstOf('port'), recruitmentCost('cargo', 1).costs));
  });

  it('par voie de terre : caserne et une première troupe, dans toutes leurs ressources', () => {
    fitsTheKit(sum(firstOf('barracks'), recruitmentCost('infantry', 1).costs));
  });

  it('laisse former au moins un blindé', () => {
    fitsTheKit(recruitmentCost('armor', 1).costs);
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

/** Le monde tel que la cuisson le lit : l'atlas (ADR 0034), les pays fusionnés au niveau près.
 *  La référence contre laquelle la grille et les rasters sont vérifiés. */
const atlas = decodeAtlas(atlasAsset as unknown as AtlasFile, atlasNearAsset as NearFile);
const worldOf = (): World => atlasWorld(atlas, projectionAsset as unknown as World);
/** La région de l'atlas sous un lon/lat, au niveau près : ce que le survol nomme là. */
const atlasRegionAt = (lonLat: LonLat): string | null =>
  atlas.regionAt(
    projectLonLat(projectionAsset.outline as never, projectionAsset.sphere, lonLat),
    'near',
  )?.id ?? null;

/**
 * **Le cadre de la projection n'est pas un contour, et c'est l'actif qui doit le dire.** Natural
 * Earth projette de loin en loin un îlot dégénéré sur tout le cadre — quarante-deux points de
 * `[0,0]` à `[400,208]`. `generate-regions.mjs` les filtre depuis le 09/09, mais
 * `public/regions.json` datait du 15/08 : le Maryland a porté ce cadre en troisième anneau
 * pendant cinq jours, et la carte le remplissait dès qu'une encre lui arrivait — un voile sur
 * le monde entier, mer comprise.
 *
 * Le script pouvait donc être juste et l'actif faux. C'est l'actif que la CI lit.
 *
 * **Les deux dimensions, pas l'une ou l'autre** : l'Antarctique s'étend légitimement sur les
 * deux tiers du monde en x, et sur un dixième en y. Ce qui n'existe pas, c'est un anneau qui
 * couvre la moitié du monde dans les deux sens à la fois.
 */
describe('les contours de public/regions.json', () => {
  it('ne portent aucun cadre de projection', () => {
    const frames: string[] = [];
    for (const region of regionsAsset.regions) {
      region.p.forEach((ring, rank) => {
        const xs = ring.map(([x]) => x!);
        const ys = ring.map(([, y]) => y!);
        const spanX = Math.max(...xs) - Math.min(...xs);
        const spanY = Math.max(...ys) - Math.min(...ys);
        if (spanX > 400 / 2 && spanY > projectionAsset.sphere.maxY / 2)
          frames.push(`${region.id} (${region.n}), anneau ${rank + 1}/${region.p.length}`);
      });
    }

    expect(
      frames,
      `Ces anneaux sont le cadre de la projection, pas une région : la carte les remplit et repeint le monde. Recuire avec node scripts/generate-regions.mjs <ne_10m_admin_1_states_provinces.geojson>, puis generate-region-index.mjs et generate-region-grid.mjs.`,
    ).toEqual([]);
  });
});

/**
 * **Le raster de géographie est cuit, et la cuisson ne peut pas mentir** (ADR 0023) — le jumeau
 * du contrôle de la grille, et pour la même raison : `region-grid.json` porte la région admin-1 et
 * le pays hôte de chaque cellule, cuits hors ligne avec les fonctions polygonales elles-mêmes, et
 * le serveur ne lit plus un seul polygone. Un atlas régénéré et un raster resté en place
 * laisseraient le jeu répondre sur une géographie périmée, en silence.
 *
 * Un recuit complet coûte quinze secondes : ce qui est vérifié ici est un **échantillon fixe** de
 * deux mille cellules — mille portant une région, mille portant un pays — où le raster et le
 * polygone doivent dire la même chose. On recuit (`node scripts/generate-region-grid.mjs`) ou la CI refuse.
 */
describe('le raster de géographie cuit', () => {
  const world = worldOf();
  const raster = decodeRegionRaster(rasterAsset as unknown as RegionRasterAsset, world);

  const centreOf = (cell: number): readonly [number, number] => [
    raster.sphere.minX + ((cell % raster.width) + 0.5) * raster.step,
    raster.sphere.minY + (Math.floor(cell / raster.width) + 0.5) * raster.step,
  ];

  /** Un échantillon **régulier** plutôt qu'aléatoire : le même à chaque exécution, donc un échec
   *  se rejoue. `filled` prend les cellules qui portent quelque chose, sinon celles qui ne
   *  portent rien : la frontière se joue des deux côtés. */
  const sample = (channel: Uint16Array, count: number, filled = true): ReadonlyArray<number> => {
    const cells: number[] = [];
    for (let cell = 0; cell < channel.length; cell += 1)
      if ((channel[cell] !== 0) === filled) cells.push(cell);
    const stride = Math.floor(cells.length / count);
    return Array.from({ length: count }, (_, rank) => cells[rank * stride]!);
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

  /** La région d'une cellule est celle que `regionAt` de l'atlas rend au centre : la fonction du
   *  survol, au niveau près. */
  const regionOf = (cell: number) => atlas.regionAt(centreOf(cell), 'near')?.id ?? null;

  it('rend la région que regionAt rend, sur deux mille cellules', () => {
    for (const cell of [...sample(raster.regions, 1000), ...sample(raster.regions, 1000, false)]) {
      expect(
        regionOf(cell),
        `cellule ${cell} : public/region-grid.json ne correspond plus à public/atlas.json — recuire avec node scripts/generate-region-grid.mjs.`,
      ).toBe(raster.ids[raster.regions[cell]! - 1] ?? null);
    }
  }, 120000);

  it('rend pour pays celui de la région, sur mille cellules', () => {
    const countryOfRegion = new Map(atlas.regions.map((region) => [region.id, region.country]));
    for (const cell of sample(raster.countries, 1000)) {
      expect(
        raster.hosts[raster.countries[cell]! - 1],
        `cellule ${cell} : public/region-grid.json ne correspond plus à public/atlas.json — recuire avec node scripts/generate-region-grid.mjs.`,
      ).toBe(countryOfRegion.get(regionOf(cell)!));
    }
  }, 120000);

  /**
   * **La direction région → cellules est totale, et c'est le garde-fou** (ADR 0023). Les 971
   * régions plus petites qu'une cellule sont ancrées ; les autres sont dans le canal ; aucune
   * n'est dans les deux, et aucune n'est dans ni l'un ni l'autre. Une table d'ancrage qui
   * dériverait du canal — un recuit partiel, une région qui gagne ou perd sa cellule — laisserait
   * un retour chargé sans destination, des heures après sa cause.
   */
  const points = indexAsset.point as unknown as Readonly<Record<string, LonLat | undefined>>;

  it('ancre exactement les régions qu’aucune cellule ne porte', () => {
    const inChannel = new Set(raster.regions);
    const withoutCells = raster.ids.filter((_, rank) => !inChannel.has(rank + 1));

    expect(
      [...raster.anchorOfRegion.keys()].sort(),
      `La table d’ancrage de public/region-grid.json ne correspond plus à son canal de régions — recuire avec node scripts/generate-region-grid.mjs.`,
    ).toEqual([...withoutCells].sort());
  });

  /**
   * La cuisson refait l'arithmétique de cellule au lieu de l'importer — le déshabillage de types
   * de Node ne charge pas `region-raster.ts` — donc c'est ici que les deux se rejoignent : un
   * ancrage doit être la cellule où **le lecteur du serveur** fait tomber le point intérieur.
   */
  it('ancre chaque région sur la cellule où son point intérieur tombe', () => {
    for (const [regionId, cell] of raster.anchorOfRegion) {
      const point = points[regionId];
      expect(point, regionId).toBeDefined();
      expect(cellAt(raster, point!), regionId).toBe(cell);
    }
  });

  /**
   * Les trois tailles de région, sur la même fonction : un pays entier, une région d'une seule
   * cellule, une région qui n'en a aucune. `cellsOfRegion` répond pour les trois — c'est ce que
   * « totale » veut dire, et c'est la seule bascule du dépôt.
   */
  it.each([
    ['FRA-5333', 'Paris'],
    ['GBR-2080', 'Westminster, une seule cellule'],
    ['MLT-5950', 'une région maltaise, aucune cellule'],
  ])('rend au moins une cellule pour %s (%s)', (regionId) => {
    expect(cellsOfRegion(raster, regionId).length).toBeGreaterThan(0);
  });

  /**
   * **Et aucune ne perd son but à l'arrivée d'une autre.** Le départage au plus petit
   * identifiant en laissait 646 sans aucun but — 588 ancrées qui s'écrasaient entre elles, et 58
   * qui n'ont qu'une seule cellule, Westminster comprise, dont l'ancrage d'une voisine prenait la
   * place. Un ancrage s'ajoute désormais ; ce test est la raison pour laquelle il ne peut plus
   * redevenir un remplacement.
   */
  it('sert un but à chacune des 4 589 régions, ancrages compris', () => {
    const regions = raster.ids.map((id) => ({ id, point: points[id]! }));
    const served = new Set(
      [...goalCellsOfRegions(raster, regions).values()].flatMap((goals) =>
        goals.map((goal) => goal.regionId),
      ),
    );
    const lost = raster.ids.filter((id) => !served.has(id));

    expect(
      lost,
      `Ces régions n’ont aucun but de route : un retour chargé ne peut pas y aller.`,
    ).toEqual([]);
  });

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
 * référence — elle rasterise les pays de l'atlas — mais aucune query ne l'appelle :
 * `public/grid.json` porte les mêmes cellules en plages et `convex/routes.ts` les décode. Les deux
 * chemins doivent rendre la même grille **octet pour octet**, sans quoi un `SEA_GATES` modifié ou
 * un atlas regénéré laisserait le serveur router sur une géographie périmée, en silence.
 * C'est le même esprit que le miroir du simulateur : on recuit (`node scripts/generate-grid.mjs`) ou la CI refuse.
 *
 * Et le chrono, parce que c'est tout l'objet de la cuisson : une query a **une seconde**, et la
 * rasterisation à froid, sans JIT, la dépassait — d'où les « Function execution timed out » par
 * intermittence sur `view:playerView`, qui lit `afloat` et `coastal` sur cette grille.
 */
describe('la grille de routage cuite', () => {
  it('rend exactement la grille que rasteriserait le monde', () => {
    const world = worldOf();
    const built = buildGrid(world);
    const decoded = decodeGrid(gridAsset, world);

    expect([decoded.width, decoded.height, decoded.step]).toEqual([
      built.width,
      built.height,
      built.step,
    ]);
    expect(
      decoded.cells,
      `public/grid.json ne correspond plus à public/atlas.json : recuire avec node scripts/generate-grid.mjs.`,
    ).toEqual(built.cells);
    expect(decoded.edges).toEqual(built.edges);
  }, 120000);

  it('se décode assez vite pour tenir dans le budget d’une query', () => {
    const world = worldOf();
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

/**
 * **Les tests tournent à l'heure du serveur, qui est UTC.** Seize fichiers bâtissent leurs dates
 * avec `new Date(a, m, j, h)`, c'est-à-dire à l'heure locale du poste : vert à Paris et sur la
 * CI, rouge sous un autre fuseau (`plunder.test.ts` échouait deux fois à Tokyo). `vite.config.ts`
 * fixe donc `TZ` ; ce garde dit pourquoi si quelqu'un l'enlève.
 */
describe('le fuseau des tests', () => {
  it('est UTC, quel que soit celui du poste', () => {
    expect(new Date(2026, 7, 17, 12).getTimezoneOffset()).toBe(0);
  });
});

/**
 * **Un id écrit en dur survit à l'atlas** (ADR 0034). Les capitales et les gisements nomment une
 * région par son `adm1_code` : un atlas régénéré sur une autre version de Natural Earth pourrait
 * en retirer un sans que rien ne casse avant la première saison.
 */
describe('les régions nommées en dur', () => {
  const inAtlas = new Set(atlasAsset.objects.regions.geometries.map(({ id }) => id));

  it.each(NATIONS)('la capitale de %s est une région de l’atlas', (nation) => {
    expect(inAtlas.has(capitalRegionOf(nation))).toBe(true);
  });

  it('chaque gisement tombe sur une région de l’atlas', () => {
    expect(depositsAsset.filter(({ regionId }) => !inAtlas.has(regionId))).toEqual([]);
  });

  /** Le point d'un gisement est dans la région qu'il nomme, lue comme le serveur la lit : par la
   *  cellule de `region-grid.json`, cuite depuis l'atlas. */
  it('chaque gisement est dans sa région sur l’atlas', () => {
    expect(
      depositsAsset
        .filter(({ lon, lat, regionId }) => atlasRegionAt([lon, lat]) !== regionId)
        .map(({ id }) => id),
    ).toEqual([]);
  });

  it('chaque gisement est dans la cellule de sa région', () => {
    const world = { ...projectionAsset, countries: [] } as unknown as World;
    const raster = decodeRegionRaster(rasterAsset as unknown as RegionRasterAsset, world);
    expect(
      depositsAsset
        .filter(({ lon, lat, regionId }) => regionAt(raster, [lon, lat]) !== regionId)
        .map(({ id }) => id),
    ).toEqual([]);
  });
});

/**
 * **Un lac n'est pas la mer** (Pierre, 21/10 : « la Caspienne est un lac, pas de quais »). À la
 * maille de 0,25 u, un lac à moins d'une cellule de la côte se fondait dans la mer ouverte : le
 * Nicaragua, l'IJsselmeer recevaient des navires et des quais. Ses cellules sont de lac, et
 * aucune route navale n'y mène depuis la mer du Nord.
 */
describe('les lacs de la grille', () => {
  const grid = decodeGrid(gridAsset, projectionAsset as unknown as World);
  it.each([
    ['la Caspienne', 50.5, 42],
    ['le Nicaragua', -85.4, 11.6],
    ["l'IJsselmeer", 5.35, 52.75],
    ['la Mirim', -52.9, -32.6],
    ['le Sivash', 34.9, 45.8],
    ["l'Iliamna", -155, 59.6],
    ['le Victoria', 33, -1],
    ['le Supérieur', -87.5, 47.7],
  ])('%s n’est ni terre ni mer navigable', (_, lon, lat) => {
    expect(isLandCell(grid, [lon, lat])).toBe(false);
    expect(computeRoute(grid, [3, 54], [lon, lat], 'naval')).toBeNull();
  });

  it('n’a aucun quai sur une rive de lac : San Carlos, au bord du Nicaragua', () => {
    expect(isCoastCell(grid, [-84.78, 11.12])).toBe(false);
  });
});

/**
 * **Le point d'une région qui a de la terre est sur sa terre** : dans sa région sur l'atlas, et
 * sur une de ses cellules de terre de `region-grid.json`. Posé sur une cellule d'eau, une force
 * y serait lue à flot (`view.ts`, `upkeep.ts`) — Kalangala et Mayuge, au bord du lac Victoria.
 * Les exceptions sont des régions plus étroites que l'arrondi du point (0,001°) : le Vatican, deux
 * districts de Nauru, l'île Howland.
 */
describe('le point de chaque région', () => {
  const NARROW = ['VAT+00?', 'NRU-4975', 'NRU-4976', 'UMI-5172'];
  const grid = decodeGrid(gridAsset, projectionAsset as unknown as World);
  const raster = decodeRegionRaster(rasterAsset as unknown as RegionRasterAsset, worldOf());
  const points = indexAsset.point as unknown as Readonly<Record<string, LonLat>>;

  it('est dans sa région sur l’atlas', () => {
    expect(
      Object.entries(points)
        .filter(([id, point]) => !NARROW.includes(id) && atlasRegionAt(point) !== id)
        .map(([id]) => id),
    ).toEqual([]);
  });

  it('est sur une de ses cellules de terre quand elle en a', () => {
    const landOf = new Map<number, Set<number>>();
    raster.regions.forEach((code, cell) => {
      if (code !== 0 && grid.cells[cell] === 1)
        (landOf.get(code) ?? landOf.set(code, new Set()).get(code)!).add(cell);
    });
    expect(
      Object.entries(points)
        .filter(([id, point]) => {
          const land = landOf.get(raster.codeOfRegion.get(id)!);
          return land !== undefined && !land.has(cellAt(raster, point));
        })
        .map(([id]) => id),
    ).toEqual([]);
  });
});

/**
 * **« Côtière » dit ce que le serveur accepte** : une région de l'index est côtière exactement
 * quand un point quelque part prend un quai pour elle — `coastAtPoint` et `pointInRegion`, les
 * deux contrôles d'un port. Le point est cherché sur les cellules de côte à portée de la région,
 * en 5 × 5 points par cellule. Malte n'a pas de port et Saint-Marin en a un : défauts anciens de
 * la maille (#221), que l'index dit tels quels.
 */
describe('le drapeau côtier de l’index', () => {
  const grid = decodeGrid(gridAsset, projectionAsset as unknown as World);
  const raster = decodeRegionRaster(rasterAsset as unknown as RegionRasterAsset, worldOf());
  const coastal = new Set(indexAsset.coastal);
  const ids = Object.keys(indexAsset.point);
  const sample = [
    ...['SGP-4871', 'HKG-5153', 'IRL-5575', 'GBR-2023', 'NOR-921', 'MLT-5949', 'SMR-4884'],
    ...['ITA-5441', 'EGY-1533', 'AZE-1689', 'RUS-2417', 'FRA-5333', 'DEU-1578', 'CHE-3426'],
    ...ids.filter((_, rank) => rank % 60 === 0),
  ];
  const OFFSETS = [-0.49, -0.245, 0, 0.245, 0.49];

  const acceptsAQuay = (id: string): boolean => {
    const facts = regionFacts(id)!;
    const near = new Set<number>();
    const add = (cell: number, reach: number) => {
      const [column, row] = [cell % raster.width, Math.floor(cell / raster.width)];
      for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++) {
          const r = row + dy;
          if (r >= 0 && r < raster.height)
            near.add(r * raster.width + ((column + dx + raster.width) % raster.width));
        }
    };
    for (const cell of cellsOfRegion(raster, id)) add(cell, 2);
    add(cellAt(raster, facts.point), 6);
    for (const cell of near) {
      const [cx, cy] = [
        raster.sphere.minX + ((cell % raster.width) + 0.5) * raster.step,
        raster.sphere.minY + (Math.floor(cell / raster.width) + 0.5) * raster.step,
      ];
      for (const dx of OFFSETS)
        for (const dy of OFFSETS) {
          const lonLat = lonLatAtProjected(raster.outline, raster.sphere, [
            cx + dx * raster.step,
            cy + dy * raster.step,
          ]);
          if (coastAtPoint(lonLat) && pointInRegion(lonLat, facts)) return true;
        }
    }
    return false;
  };

  it('concorde avec le serveur sur un échantillon de régions', () => {
    expect(grid.width).toBe(raster.width);
    expect(sample.filter((id) => acceptsAQuay(id) !== coastal.has(id))).toEqual([]);
  });
});
