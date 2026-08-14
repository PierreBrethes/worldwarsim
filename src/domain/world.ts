import type { LonLat } from './geo';
import type { RegionType } from './ids';

export type ProjectedCountry = {
  readonly name: string;
  readonly representativePoint: readonly [x: number, y: number];
  readonly lonLat: LonLat;
  readonly rings: ReadonlyArray<ReadonlyArray<readonly [x: number, y: number]>>;
};

export type OutlineSample = readonly [
  latitude: number,
  westX: number,
  eastX: number,
  y: number,
];

export type World = {
  readonly sphere: { minX: number; maxX: number; minY: number; maxY: number };
  readonly outline: ReadonlyArray<OutlineSample>;
  readonly countries: ReadonlyArray<ProjectedCountry>;
};

export type RegionLine = ReadonlyArray<readonly [x: number, y: number]>;

export type DisplayedRegion = {
  readonly name: string;
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
  const raw = (await response.json()) as { lignes: RegionLine[]; regions: Array<{ n: string; p: [number, number][][] }> };
  return {
    lines: raw.lignes,
    regions: raw.regions.map((region) => ({ name: region.n, rings: region.p })),
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
  const types: ReadonlyArray<RegionType> = ['plain', 'forest', 'jungle', 'mountain', 'desert', 'tundra'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return types[hash % types.length]!;
}

type RawWorld = {
  meta: {
    sphere: { minX: number; maxX: number; minY: number; maxY: number };
    outline: OutlineSample[];
  };
  countries: Array<{ n: string; c: [number, number]; ll: [number, number]; p: [number, number][][] }>;
};

export async function loadWorld(url = '/monde.json'): Promise<World> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`world not found: ${url}`);
  const raw = (await response.json()) as RawWorld;
  return {
    sphere: raw.meta.sphere,
    outline: raw.meta.outline,
    countries: raw.countries.map((c) => ({
      name: c.n,
      representativePoint: c.c,
      lonLat: c.ll,
      rings: c.p,
    })),
  };
}
