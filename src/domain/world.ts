import type { LonLat } from './geo';
import type { RegionType } from './ids';

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

export type DisplayedRegion = RegionIdentity & {
  readonly rings: ReadonlyArray<ReadonlyArray<readonly [x: number, y: number]>>;
};

export type RegionsData = {
  readonly lines: ReadonlyArray<RegionLine>;
  readonly regions: ReadonlyArray<DisplayedRegion>;
};

/**
 * The admin-1 regions are a separate file: several times the weight of the world, purely
 * decorative, and invisible until you zoom in — the board must not wait for them.
 */
export async function loadRegions(url = '/regions.json'): Promise<RegionsData> {
  const response = await fetch(url);
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
      rings: region.p,
    })),
  };
}

/**
 * Six hand-classified witness regions — one per type — to judge the rendering before the
 * real terrain pass (ETOPO + Köppen + landcover, baked into `regions.json`).
 * "Amazonas" exists in four countries: all jungle, the homonymy is harmless.
 */
const WITNESSES: ReadonlyMap<string, RegionType> = new Map([
  ['Oise', 'plain'],
  ['Landes', 'forest'],
  ['Amazonas', 'jungle'],
  ['Valais', 'mountain'],
  ['Tamanghasset', 'desert'],
  ['Chukchi Autonomous Okrug', 'tundra'],
]);

/**
 * **Placeholder type** outside the witnesses: a name hash, stable across reloads, to give the
 * hover tooltip something to say. No game rule may ever read it.
 */
export function regionType(name: string): RegionType {
  const witness = WITNESSES.get(name);
  if (witness !== undefined) return witness;
  const types: ReadonlyArray<RegionType> = [
    'plain',
    'forest',
    'jungle',
    'mountain',
    'desert',
    'tundra',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return types[hash % types.length]!;
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
