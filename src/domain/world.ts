import depositsAsset from '../../public/deposits.json';
import { distanceKm, type LonLat } from './geo';
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

/** What the sheet is drawn in: its box and its outline, `public/projection.json`. */
export type Projection = Pick<World, 'sphere' | 'outline'>;

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

/**
 * **Un gisement est un point** (ADR 0029 §3), visible de tous, et il porte une seule
 * exploitation. **La géologie est publique** (décision 65a du 01/09) : ce que le sol tient est
 * fixe, identique pour tout le monde et ne dit rien de ce que font les joueurs. L'asset est le
 * même que celui du serveur, donc les deux surfaces ne peuvent pas se contredire, et il est
 * importé, pas récupéré.
 *
 * `regionId` est la région où le point se trouve — un fait de carte cuit avec lui, jamais une
 * règle : ce que le point vaut est le gisement, et ce qui porte la couleur est la région.
 */
export type DepositPoint = {
  readonly id: string;
  readonly deposit: DepositKey;
  readonly regionId: string;
  /** L'`adm0_a3` de la région du point : le sol national se lit sans géométrie. */
  readonly country: string;
  readonly lonLat: LonLat;
};

type RawDeposit = {
  id: string;
  deposit: DepositKey;
  regionId: string;
  country: string;
  lon: number;
  lat: number;
};

export const DEPOSIT_POINTS: ReadonlyArray<DepositPoint> = (
  depositsAsset as ReadonlyArray<RawDeposit>
).map(({ lon, lat, ...rest }) => ({ ...rest, lonLat: [lon, lat] as const }));

/**
 * **Le gisement sous ce point**, ou aucun. Une exploitation s'aimante sur le point exact du
 * gisement, et c'est ce point qu'elle écrit : la tolérance n'absorbe que l'aller-retour d'un
 * flottant, jamais un bâtiment posé « à côté ».
 */
const DEPOSIT_MATCH_KM = 1;

export const depositAt = (lonLat: LonLat): DepositPoint | null =>
  DEPOSIT_POINTS.find((point) => distanceKm(point.lonLat, lonLat) <= DEPOSIT_MATCH_KM) ?? null;

/**
 * **Le point et la côte de chaque région** vivent dans `region-index.json` (312 ko), que le
 * serveur importe et que le client lit après le plateau, au zoom où les régions se dessinent :
 * un fetch de plus plutôt qu'un index entier dans le bundle de démarrage. Le point est celui où
 * tout ce qui est posé sur la région se tient (`convex/regions.ts`) ; la carte y ancre ses
 * bâtiments et leurs étiquettes, si bien qu'aucun des deux côtés n'en calcule un autre.
 *
 * Un échec est muet et non mémorisé : la ligne « côtière » et les ancres manquent, rien d'autre
 * ne bouge.
 */
type RegionIndex = {
  readonly coastal: ReadonlySet<string>;
  readonly point: ReadonlyMap<string, LonLat>;
};

let regionIndex: Promise<RegionIndex> | null = null;

export function loadRegionIndex(url = '/region-index.json'): Promise<RegionIndex> {
  regionIndex ??= fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`region index not found: ${url}`);
      return response.json() as Promise<{
        coastal: ReadonlyArray<string>;
        point: Record<string, LonLat>;
      }>;
    })
    .then((raw): RegionIndex => ({
      coastal: new Set(raw.coastal),
      point: new Map(Object.entries(raw.point)),
    }))
    .catch((): RegionIndex => {
      regionIndex = null;
      return { coastal: new Set(), point: new Map() };
    });
  return regionIndex;
}

export const loadCoastalRegions = (): Promise<ReadonlySet<string>> =>
  loadRegionIndex().then(({ coastal }) => coastal);

/**
 * The terrain of each region, baked offline into its own asset (`generate-region-types.mjs`).
 * Decoration only, no rule may read it: a missing file reads as an empty map, asked for again on
 * the next mount, and a region it does not name as a plain (`?? 'plain'` where it is read). A key
 * the client does not know would tint and sow with `undefined`: it is left out, so it falls back
 * to plain too.
 */
const REGION_TYPES: ReadonlyArray<RegionType> = [
  'plain',
  'forest',
  'jungle',
  'mountain',
  'desert',
  'tundra',
];

let regionTypes: Promise<ReadonlyMap<string, RegionType>> | null = null;

export function loadRegionTypes(
  url = '/region-types.json',
): Promise<ReadonlyMap<string, RegionType>> {
  regionTypes ??= fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`region types not found: ${url}`);
      const byType = (await response.json()) as Partial<Record<RegionType, string[]>>;
      return new Map(
        REGION_TYPES.flatMap((type) => (byType[type] ?? []).map((id) => [id, type] as const)),
      );
    })
    .catch(() => {
      regionTypes = null;
      return new Map<string, RegionType>();
    });
  return regionTypes;
}
