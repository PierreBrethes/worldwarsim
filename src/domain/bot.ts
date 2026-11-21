import { MONDIALE_TROOP_BOUND } from '../../convex/constants';
import {
  aimVerdict,
  depositCalls,
  nearestDeposit,
  pledgedWork,
  reachesOf,
  tileBillOf,
  type Aim,
} from './construction';
import { decodeCoast, carriesBuilding, regionOf, type CoastAsset } from './coast';
import { distanceKm, type LonLat } from './geo';
import { RESOURCES, type BuildingKey, type ResourceKey, type UnitRole, type UnitTier } from './ids';
import { currentStock, type PlayerView } from './player-view';
import { decodeRegionRaster, type RegionRasterAsset } from './region-raster';
import { decodeGrid, type GridAsset } from './routing';
import { recruitRefusalOf } from './troops';
import type { Projection } from './world';

/**
 * **Le cerveau d'un bot facile** (ADR 0042) : des règles par priorités, chacune une petite
 * fonction qui rend des envies et leurs ordres. `decideTurn` ne lit que ce qu'un joueur voit (sa
 * vue, son atelier) et la géographie des fichiers cuits ; il ne propose qu'un ordre que le refus
 * du domaine accepte sur la même vue. Ajouter une règle, c'est l'ajouter à `RULES`.
 */

/** Un ordre par mutation, ids en `string` : la conversion vers `api[...]` est celle du pilote. */
export type BotOrder =
  | {
      readonly fn: 'constructions.start';
      readonly args: {
        readonly building: BuildingKey;
        readonly regionId: string;
        readonly point: { readonly lon: number; readonly lat: number };
      };
    }
  | {
      readonly fn: 'troops.recruit';
      readonly args: {
        readonly buildingId: string;
        readonly role: UnitRole;
        readonly tier: UnitTier;
      };
    };

/** Ce que `api.troops.workshop` sert, réduit à ce que le bot lit. */
export type BotWorkshop = {
  readonly troopsInService: number;
  readonly troopsQueued: number;
  readonly facilities: ReadonlyArray<{
    readonly id: string;
    readonly key: BuildingKey;
    readonly queue: ReadonlyArray<unknown>;
  }>;
  readonly roster: ReadonlyArray<{ readonly role: UnitRole; readonly count: number }>;
  readonly grid: ReadonlyArray<{
    readonly role: UnitRole;
    readonly unit: { readonly costs: Readonly<Partial<Record<ResourceKey, number>>> };
  }>;
};

/** La géographie injectée : les fonctions pures du domaine sur les fichiers cuits. */
export type BotWorld = {
  readonly carriesBuilding: (point: LonLat) => boolean;
  readonly regionAt: (point: LonLat) => { readonly id: string; readonly country: string } | null;
};

/** Le contenu des fichiers cuits (`public/*.json`) : le pilote les lit, `worldFrom` n'ouvre rien. */
export type BotWorldFiles = {
  readonly projection: Projection;
  readonly grid: GridAsset;
  readonly coast: CoastAsset;
  readonly regionGrid: RegionRasterAsset;
};

export function worldFrom(files: BotWorldFiles): BotWorld {
  const grid = decodeGrid(files.grid, files.projection);
  const coast = decodeCoast(files.coast, files.projection);
  const raster = decodeRegionRaster(files.regionGrid, files.projection);
  return {
    carriesBuilding: (point) => carriesBuilding(grid, coast, point),
    regionAt: (point) => regionOf(raster, coast, point),
  };
}

export type BotContext = {
  readonly view: PlayerView;
  readonly workshop: BotWorkshop;
  readonly world: BotWorld;
  readonly now: number;
};

/** Une envie : 0 rien, 100 normal, au-delà urgence. */
type Desire = { readonly want: number; readonly order: BotOrder };

/** @a-mesurer : combien d'ordres un passage garde ; peu, pour qu'un bot reste facile (ADR 0042 §5). */
const BOT_ORDERS_PER_TURN = 2;
/** @a-mesurer : les troupes, debout et en file, à partir desquelles le bot cesse de recruter. */
export const BOT_ARMY_TARGET = 6;

const WANT_HQ = 1000;
const WANT_FOUNDATION = 200;
const WANT_BARRACKS = 100;
const WANT_RECRUIT = 80;

const pointArg = ([lon, lat]: LonLat) => ({ lon, lat });

/** Une visée sur un point national ou d'un site, jamais un port. */
function aimAt(world: BotWorld, point: LonLat): Aim | null {
  const region = world.regionAt(point);
  if (region === null) return null;
  return {
    lonLat: point,
    region: { id: region.id, name: '', country: region.country },
    coastal: false,
    onLand: world.carriesBuilding(point),
  };
}

const placeHq = ({ view, world }: BotContext): Desire[] => {
  const { me } = view;
  if (me.hqLevel > 0 || me.capitalPoint === null) return [];
  const capital = me.capitalPoint;
  const row = me.regions.find((region) => distanceKm(region.point, capital) === 0);
  const aim = aimAt(world, capital);
  if (row === undefined || aim === null) return [];
  if (
    aimVerdict(
      view,
      'hq',
      aim,
      reachesOf(view, () => 0),
    ).refusal !== null
  )
    return [];
  return [
    {
      want: WANT_HQ,
      order: {
        fn: 'constructions.start',
        args: { building: 'hq', regionId: row.id, point: pointArg(capital) },
      },
    },
  ];
};

const placeFoundation = ({ view }: BotContext): Desire[] => {
  const { me } = view;
  if (me.hqLevel === 0 || me.capitalPoint === null) return [];
  const reaches = reachesOf(view, () => 0);
  const taken = new Set<string>();
  const desires: Desire[] = [];
  for (const due of me.foundation) {
    if (due.deposit === null) continue;
    const open = depositCalls(view, due.key, [due.deposit], reaches).filter(
      (call) => call.refusal === null && !taken.has(call.deposit.id),
    );
    const nearest = nearestDeposit(open, me.capitalPoint);
    if (nearest === null) continue;
    const { deposit } = nearest.call;
    taken.add(deposit.id);
    desires.push({
      want: WANT_FOUNDATION,
      order: {
        fn: 'constructions.start',
        args: { building: due.key, regionId: deposit.regionId, point: pointArg(deposit.lonLat) },
      },
    });
  }
  return desires;
};

const buildBarracks = ({ view, world, now }: BotContext): Desire[] => {
  const { me } = view;
  if (me.hqLevel === 0 || me.foundation.length > 0) return [];
  if (me.construction !== null || me.constructionQueue.length > 0) return [];
  if (me.buildings.some((building) => building.key === 'barracks')) return [];
  if (pledgedWork(view).some((work) => work.key === 'barracks')) return [];
  const bill = tileBillOf(
    view.buildCatalog.barracks.cost,
    (resource) => me.resources[resource],
    view.loadedAt,
    now,
  );
  if (bill.some((line) => line.missing > 0)) return [];
  const reaches = reachesOf(view, () => 0);
  const nearCapital = (region: { readonly point: LonLat }) =>
    me.capitalPoint === null ? 0 : distanceKm(region.point, me.capitalPoint);
  for (const region of [...me.regions].sort((a, b) => nearCapital(a) - nearCapital(b))) {
    if (region.site === null) continue;
    const aim = aimAt(world, region.point);
    if (aim === null || !aim.onLand) continue;
    if (aimVerdict(view, 'barracks', aim, reaches).refusal !== null) continue;
    return [
      {
        want: WANT_BARRACKS,
        order: {
          fn: 'constructions.start',
          args: { building: 'barracks', regionId: region.id, point: pointArg(region.point) },
        },
      },
    ];
  }
  return [];
};

const recruit = ({ view, workshop, now }: BotContext): Desire[] => {
  const site = workshop.facilities.find((facility) => facility.key === 'barracks');
  const army = workshop.troopsInService + workshop.troopsQueued;
  if (site === undefined || army >= BOT_ARMY_TARGET || army >= MONDIALE_TROOP_BOUND) return [];
  const trucks = workshop.roster.some((line) => line.role === 'landTransport');
  const role: UnitRole = trucks || army === 0 ? 'infantry' : 'landTransport';
  const unit = workshop.grid.find((line) => line.role === role)?.unit;
  if (unit === undefined) return [];
  const stocks = Object.fromEntries(
    RESOURCES.map((key) => [key, currentStock(view.me.resources[key], view.loadedAt, now)]),
  ) as Record<ResourceKey, number>;
  const refusal = recruitRefusalOf(role, 1, site, {
    researched: view.me.research.researched,
    army,
    siteQueue: site.queue.length,
    costs: unit.costs,
    stocks,
  });
  if (refusal !== null) return [];
  return [
    {
      want: WANT_RECRUIT,
      order: { fn: 'troops.recruit', args: { buildingId: site.id, role, tier: 1 } },
    },
  ];
};

/** Une règle : des envies et leurs ordres. #602 y ajoute défendre, avancer, fonder, ravitailler. */
const RULES: ReadonlyArray<(context: BotContext) => Desire[]> = [
  placeHq,
  placeFoundation,
  buildBarracks,
  recruit,
];

/** Les ordres du passage : les envies les plus fortes d'abord, `BOT_ORDERS_PER_TURN` au plus. */
export function decideTurn(context: BotContext): BotOrder[] {
  return RULES.flatMap((rule) => rule(context))
    .sort((a, b) => b.want - a.want)
    .slice(0, BOT_ORDERS_PER_TURN)
    .map((desire) => desire.order);
}
