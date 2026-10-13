import depositsAsset from '../../public/deposits.json';
import type { LonLat } from './geo';
import type { DepositKey, RegionType } from './ids';

export type ProjectedCountry = {
  /** English, as Natural Earth writes it: a key for the map, never a label for a screen. */
  readonly name: string;
  /** The Natural Earth `adm0_a3` — what the server, the regions and every label key on. */
  readonly adm0: string;
  readonly representativePoint: readonly [x: number, y: number];
  readonly lonLat: LonLat;
  readonly rings: ReadonlyArray<ReadonlyArray<readonly [x: number, y: number]>>;
};

export type OutlineSample = readonly [latitude: number, westX: number, eastX: number, y: number];

export type World = {
  readonly sphere: { minX: number; maxX: number; minY: number; maxY: number };
  readonly outline: ReadonlyArray<OutlineSample>;
  readonly countries: ReadonlyArray<ProjectedCountry>;
};

export type RegionLine = ReadonlyArray<readonly [x: number, y: number]>;

/**
 * A region, as anything outside the map layer names it. The id travels with the name because
 * deposits and buildings are indexed by `adm1_code`: admin-1 names repeat from one country to
 * the next, ids do not, and a tooltip label cannot address a region.
 */
export type RegionIdentity = {
  readonly id: string;
  readonly country: string;
  readonly name: string;
};

/** La région sous le pointeur dit aussi son terrain : le survol est la seule lecture qui le
 *  demande, et `regionAtPoint` reste une identité. */
export type HoveredRegion = RegionIdentity & { readonly type: RegionType };

export type DisplayedRegion = RegionIdentity & {
  readonly type: RegionType;
  readonly rings: ReadonlyArray<ReadonlyArray<readonly [x: number, y: number]>>;
};

export type RegionsData = {
  readonly lines: ReadonlyArray<RegionLine>;
  readonly regions: ReadonlyArray<DisplayedRegion>;
};

/**
 * **La géologie est publique** (décision 65a du 01/09) : ce que le sol tient est fixe, identique
 * pour tout le monde et ne dit rien de ce que font les joueurs. Le brouillard couvre les
 * positions, les mouvements et les tenants — jamais la carte des ressources, qu'un atlas de 1940
 * donnait déjà. L'asset est le même que celui du serveur (`convex/regions.ts`), donc les deux
 * surfaces ne peuvent pas se contredire, et il pèse 4 ko : il est importé, pas récupéré.
 *
 * Il est **creux** : une région sans gisement n'y figure pas, et aucune n'en tient deux.
 */
const DEPOSIT_OF_REGION = depositsAsset as Readonly<Record<string, DepositKey | undefined>>;

export const depositOfRegion = (regionId: string): DepositKey | null =>
  DEPOSIT_OF_REGION[regionId] ?? null;

/** Les 229 régions à gisement, dans l'ordre de l'asset — ce que la bascule « gisements » pose
 *  sur la carte, sans qu'aucune donnée de joueur n'entre dans le compte. */
export const DEPOSIT_REGIONS: ReadonlyArray<readonly [regionId: string, deposit: DepositKey]> =
  Object.entries(DEPOSIT_OF_REGION).flatMap(([regionId, deposit]) =>
    deposit === undefined ? [] : [[regionId, deposit] as const],
  );

/**
 * **La côte est publique elle aussi, mais elle ne se bundle pas** : elle vit dans
 * `region-index.json`, 312 ko pour quatre faits dont un seul intéresse un écran. Elle se lit au
 * zoom où les régions se dessinent, et celles-ci pèsent déjà dix fois plus — un fetch de plus,
 * après le plateau, plutôt qu'un index entier dans le bundle de démarrage.
 *
 * Un échec est muet et non mémorisé : la ligne « côtière » manque, rien d'autre ne bouge.
 */
let coastal: Promise<ReadonlySet<string>> | null = null;

export function loadCoastalRegions(url = '/region-index.json'): Promise<ReadonlySet<string>> {
  coastal ??= fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`region index not found: ${url}`);
      return response.json() as Promise<{ coastal: ReadonlyArray<string> }>;
    })
    .then((raw): ReadonlySet<string> => new Set(raw.coastal))
    .catch((): ReadonlySet<string> => {
      coastal = null;
      return new Set();
    });
  return coastal;
}

/**
 * The admin-1 regions are a separate file: several times the weight of the world, purely
 * decorative, and invisible until you zoom in — the board must not wait for them.
 *
 * Fetched and parsed once for the lifetime of the tab, like the world: every return to the board
 * mounts a new engine, and each one used to pull and parse the 2.6 MB again. A failure is
 * forgotten, so the next mount tries afresh.
 */
let regions: Promise<RegionsData> | null = null;

export function loadRegions(
  url = '/regions.json',
  typesUrl = '/region-types.json',
): Promise<RegionsData> {
  regions ??= fetchRegions(url, typesUrl).catch((error: unknown) => {
    regions = null;
    throw error;
  });
  return regions;
}

/** The type is baked offline into its own asset (`generate-region-types.mjs`). A missing file or
 *  region reads as a plain: decoration only, no rule may read it. */
const REGION_TYPES: ReadonlyArray<RegionType> = [
  'plain',
  'forest',
  'jungle',
  'mountain',
  'desert',
  'tundra',
];

async function fetchRegionTypes(url: string): Promise<ReadonlyMap<string, RegionType>> {
  try {
    const response = await fetch(url);
    if (!response.ok) return new Map();
    const byType = (await response.json()) as Partial<Record<RegionType, string[]>>;
    // A key the client does not know would tint and sow with `undefined`: it falls back to plain.
    return new Map(
      REGION_TYPES.flatMap((type) => (byType[type] ?? []).map((id) => [id, type] as const)),
    );
  } catch {
    return new Map();
  }
}

async function fetchRegions(url: string, typesUrl: string): Promise<RegionsData> {
  const [response, types] = await Promise.all([fetch(url), fetchRegionTypes(typesUrl)]);
  if (!response.ok) throw new Error(`regions not found: ${url}`);
  const raw = (await response.json()) as {
    lines: RegionLine[];
    regions: Array<{ id: string; country: string; n: string; p: [number, number][][] }>;
  };
  return {
    lines: raw.lines,
    regions: raw.regions.map((region) => ({
      id: region.id,
      country: region.country,
      name: region.n,
      type: types.get(region.id) ?? 'plain',
      rings: region.p,
    })),
  };
}

type RawWorld = {
  meta: {
    sphere: { minX: number; maxX: number; minY: number; maxY: number };
    outline: OutlineSample[];
  };
  countries: Array<{
    n: string;
    a: string;
    c: [number, number];
    ll: [number, number];
    p: [number, number][][];
  }>;
};

export async function loadWorld(url = '/world.json'): Promise<World> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`world not found: ${url}`);
  const raw = (await response.json()) as RawWorld;
  return {
    sphere: raw.meta.sphere,
    outline: raw.meta.outline,
    countries: raw.countries.map((c) => ({
      name: c.n,
      adm0: c.a,
      representativePoint: c.c,
      lonLat: c.ll,
      rings: c.p,
    })),
  };
}
