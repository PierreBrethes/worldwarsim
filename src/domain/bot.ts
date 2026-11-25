import { MONDIALE_TROOP_BOUND } from '../../convex/constants';
import { armedColumn } from './armed-column';
import {
  aimVerdict,
  depositCalls,
  foundationHold,
  hqDisabledOf,
  nearestDeposit,
  outpostRaiseHold,
  pledgedOutposts,
  pledgedWork,
  raiseChoosesSpecialty,
  upgradeHold,
  reachesOf,
  tileBillOf,
  type Aim,
} from './construction';
import { BUILDING_SPACING_KM } from './economy';
import {
  decodeCoast,
  carriesBuilding,
  groundOf,
  isLandingShore,
  nearestCoast,
  regionOf,
  type CoastAsset,
} from './coast';
import { destinationPoint, distanceKm, type LonLat } from './geo';
import {
  CHOSEN_SPECIALTIES,
  RESOURCES,
  type BuildingKey,
  type ChosenSpecialty,
  type ResourceKey,
  type UnitRole,
  type UnitTier,
} from './ids';
import {
  deliverRefusalOf,
  loadCapacityOf,
  loadRefusalOf,
  loadTotal,
  roomAboard,
  SUPPLY_KEYS,
  tourRefusalOf,
} from './logistics';
import {
  boardingRefusalOf,
  captureOrderRefusalOf,
  disembarkRefusalOf,
  foundingRefusal,
  freeSlotsOf,
  landCostOf,
  refusalOf,
  routeModeOf,
} from './movement-orders';
import type { MovementAim } from './movement-orders';
import { ADM0_BY_NATION, isNation } from './nations';
import { currentStock, type Building, type PlayerView, type TroopView } from './player-view';
import { decodeRegionRaster, type RegionRasterAsset } from './region-raster';
import {
  computeRoute,
  decodeGrid,
  isWalkableCell,
  kmOf,
  type GridAsset,
  type Ground,
} from './routing';
import { fuelRefusalOf } from './supplies';
import { tourHoldsSlot } from './tour-slot';
import {
  marchingTroopIds,
  recruitRefusalOf,
  seatsLeft,
  stationKeyOf,
  stationPointOf,
  type MarchStation,
} from './troops';
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
      readonly fn: 'constructions.raiseOutpost';
      readonly args: { readonly outpostId: string; readonly specialty?: ChosenSpecialty };
    }
  | {
      readonly fn: 'troops.recruit';
      readonly args: {
        readonly buildingId: string;
        readonly role: UnitRole;
        readonly tier: UnitTier;
      };
    }
  | {
      readonly fn: 'movements.attack';
      readonly args: BotColumn & { readonly target: BotCampTarget };
    }
  | {
      readonly fn: 'movements.capture';
      readonly args: BotColumn & {
        readonly target: { readonly kind: 'point'; readonly pointId: string };
      };
    }
  | {
      readonly fn: 'movements.marchTo';
      readonly args: BotColumn & { readonly point: BotPoint };
    }
  | {
      readonly fn: 'movements.enterGarrison';
      readonly args: BotColumn & { readonly buildingId: string };
    }
  | {
      readonly fn: 'movements.foundOutpostHere';
      readonly args: {
        readonly point: BotPoint;
        readonly regionId: string | null;
        readonly troopIds: ReadonlyArray<string>;
      };
    }
  | {
      readonly fn: 'movements.board';
      readonly args: {
        readonly troopIds: ReadonlyArray<string>;
        readonly carrierId: string;
      };
    }
  | {
      readonly fn: 'movements.disembark';
      readonly args: { readonly troopIds: ReadonlyArray<string> };
    }
  | {
      readonly fn: 'logistics.load';
      readonly args: {
        readonly troopId: string;
        readonly resource: ResourceKey;
        readonly amount: number;
      };
    }
  | {
      readonly fn: 'tours.start';
      readonly args: {
        readonly troopId: string;
        /** Un dépôt d'avant-poste par son id, une exploitation à ramasser par `{ kind: 'site' }`. */
        readonly stops: ReadonlyArray<string | { readonly kind: 'site'; readonly id: string }>;
      };
    };

type BotPoint = { readonly lon: number; readonly lat: number };
type BotCampTarget = { readonly kind: 'camp'; readonly campId: string };
/** D'où part une colonne : jamais un avant-poste, dont la garnison tient le point. */
type BotOrigin =
  | { readonly kind: 'building'; readonly buildingId: string }
  | { readonly kind: 'point'; readonly point: BotPoint };
type BotColumn = { readonly origin: BotOrigin; readonly troopIds: ReadonlyArray<string> };

/** Ce que `api.troops.workshop` sert, réduit à ce que le bot lit. */
export type BotWorkshop = {
  readonly troopsInService: number;
  readonly troopsQueued: number;
  readonly facilities: ReadonlyArray<{
    readonly id: string;
    readonly key: BuildingKey;
    readonly queue: ReadonlyArray<{ readonly role: UnitRole }>;
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
  /** Les trois sondes de la grille de routage que lit une visée (`MovementAim`). */
  readonly groundAt: (point: LonLat) => Ground;
  readonly coastalAt: (point: LonLat) => boolean;
  readonly walkableAt: (point: LonLat) => boolean;
  /** La route que le serveur calcule (`routeBetween`) : sa longueur, ou `null` sans route. */
  readonly landRoute: (
    from: LonLat,
    to: LonLat,
    roles: ReadonlyArray<UnitRole>,
  ) => { readonly km: number } | null;
  /** Toutes les régions de `region-index.json`, pour viser une région étrangère. */
  readonly regions: ReadonlyArray<{
    readonly id: string;
    readonly country: string;
    readonly point: LonLat;
  }>;
  /** La région au pôle le plus proche : le sol que le serveur tient sous un avant-poste fondé. */
  readonly nearestRegionId: (point: LonLat) => string | null;
  /** Le point de la côte de mer ouverte de cette région le plus proche d'un point, à `withinKm` près. */
  readonly coastNear: (point: LonLat, withinKm: number, regionId: string) => LonLat | null;
};

/** Un plafond de mémoire, pas une règle de jeu : les routes gardées par monde ; au-delà, la mémoire repart de zéro. */
const ROUTE_MEMO = 5000;

/** Le contenu des fichiers cuits (`public/*.json`) : le pilote les lit, `worldFrom` n'ouvre rien. */
export type BotWorldFiles = {
  readonly projection: Projection;
  readonly grid: GridAsset;
  readonly coast: CoastAsset;
  readonly regionGrid: RegionRasterAsset;
  readonly regionIndex: {
    readonly country: Readonly<Record<string, string>>;
    readonly point: Readonly<Record<string, LonLat>>;
  };
};

export function worldFrom(files: BotWorldFiles): BotWorld {
  const grid = decodeGrid(files.grid, files.projection);
  const coast = decodeCoast(files.coast, files.projection);
  const raster = decodeRegionRaster(files.regionGrid, files.projection);
  const { country, point: pole } = files.regionIndex;
  const routes = new Map<string, { readonly km: number } | null>();
  const regions = Object.keys(pole).flatMap((id) =>
    country[id] === undefined ? [] : [{ id, country: country[id]!, point: pole[id]! }],
  );
  return {
    carriesBuilding: (point) => carriesBuilding(grid, coast, point),
    regionAt: (point) => regionOf(raster, coast, point),
    groundAt: (point) => groundOf(grid, coast, point),
    coastalAt: (point) => isLandingShore(grid, coast, point),
    walkableAt: (point) => isWalkableCell(grid, point),
    landRoute: (from, to, roles) => {
      // La grille ne change pas : une route déjà cherchée se relit (un échec explore toute la grille, une traversée coûte des dizaines de ms).
      const key = `${from.join(',')}>${to.join(',')}|${routeModeOf(roles)}|${landCostOf(roles)}`;
      const known = routes.get(key);
      if (known !== undefined) return known;
      const route = computeRoute(grid, from, to, routeModeOf(roles), landCostOf(roles));
      const found = route === null ? null : { km: kmOf(route.distanceUnits) };
      if (routes.size >= ROUTE_MEMO) routes.clear();
      routes.set(key, found);
      return found;
    },
    regions,
    coastNear: (point, withinKm, regionId) =>
      nearestCoast(coast, point, withinKm, regionId)?.lonLat ?? null,
    nearestRegionId: (point) =>
      regions.reduce<{ id: string; km: number } | null>((best, region) => {
        const km = distanceKm(point, region.point);
        return best === null || km < best.km ? { id: region.id, km } : best;
      }, null)?.id ?? null,
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
/**
 * @a-mesurer : les infanteries d'une colonne qui prend un point neutre. Au banc de `convex` (ADR 0043),
 * neuf infanteries de palier 1 battent la garnison de trois en une passe et huit non : la colonne
 * ne part pas avant d'avoir de quoi vaincre.
 */
export const BOT_POINT_COLUMN = 9;
/**
 * @a-mesurer : l'armée libre (sans la garnison des avant-postes), debout et en file, à partir de
 * laquelle le bot cesse de recruter : une colonne, un camion, et deux fantassins que l'avance laisse.
 */
export const BOT_ARMY_TARGET = BOT_POINT_COLUMN + 3;
/**
 * @a-mesurer : le bot nourrit son armée (#652) quand ses vivres tomberont à zéro dans moins de ces
 * heures, ou quand ils sont bas sans rien qui rentre : la série de bots montrait toutes les
 * nations affamées avant H48, captures suspendues (ADR 0044).
 */
const BOT_FOOD_HORIZON_HOURS = 12;
/** @a-mesurer : sous ce tas, un camion ne part pas le ramasser (ADR 0041) : le trajet coûterait plus. */
const BOT_HARVEST_MIN = 40;
const BOT_FOOD_LOW = 60;
/**
 * @a-mesurer : la part de son plafond d'acier que le bot garde après une élévation. Il n'élève
 * qu'avec de l'acier qui dort, pour que l'élévation ne prenne pas le prix d'une fondation (#652).
 */
const BOT_RAISE_RESERVE = 0.5;
/** @a-mesurer : les points neutres essayés par escouade, du plus proche ; chaque essai coûte une route. */
const BOT_POINT_CANDIDATES = 3;

/** @a-mesurer : à moins de ce rayon du QG, un camp relevé est une menace (ADR 0042 §2, urgence). */
const BOT_HQ_ALERT_KM = 400;
/** @a-mesurer : l'escouade qui avance ; le reste de la garnison tient le QG. */
const BOT_SQUAD_SIZE = 2;
/** @a-mesurer : les régions étrangères essayées par passage, de la plus proche ; chaque essai coûte une route. */
const BOT_ADVANCE_CANDIDATES = 5;
/** @a-mesurer : ce qu'un camion charge d'un coup, sous sa capacité et le stock. */
const BOT_CONVOY_LOAD = 100;

/** @a-mesurer : le port se cherche dans les régions nationales à ce rayon du QG, et sur leur côte à ce rayon de leur pôle. */
const BOT_PORT_KM = 300;
/** @a-mesurer : jusqu'où d'un point neutre on cherche une plage, de demi-maille (la grille fait 25 km) en demi-maille. */
const BOT_LANDING_KM = 200;
const BOT_LANDING_STEP_KM = 12.5;
const BOT_LANDING_BEARINGS = 16;
/** @a-mesurer : les plages essayées par point neutre, de la plus proche : la plus proche est souvent hors de portée du plein du cargo. */
const BOT_LANDING_CANDIDATES = 80;
/** @a-mesurer : les routes à pied cherchées par point neutre ; un échec explore toute la grille. */
const BOT_LANDING_FOOT_TRIES = 6;

const WANT_HQ = 1000;
const WANT_DEFEND = 500;
const WANT_FOUNDATION = 200;
const WANT_FOUND = 150;
const WANT_SUPPLY = 130;
const WANT_POINT = 120;
const WANT_BOARD = 125;
const WANT_SAIL = 125;
const WANT_DISEMBARK = 125;
const WANT_GATHER = 110;
const WANT_PORT = 95;
const WANT_CARGO = 85;
const WANT_BARRACKS = 100;
const WANT_ADVANCE = 90;
const WANT_RECRUIT = 80;
const WANT_FEED = 140;
const WANT_HARVEST_HUNGRY = 135;
const WANT_HARVEST = 75;
const WANT_RAISE = 70;

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
  const aim = aimAt(world, capital);
  if (aim?.region == null) return [];
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
        args: { building: 'hq', regionId: aim.region.id, point: pointArg(capital) },
      },
    },
  ];
};

const placeFoundation = ({ view }: BotContext): Desire[] => {
  const { me } = view;
  if (me.hqLevel === 0 || me.capitalPoint === null) return [];
  const reaches = reachesOf(view, () => 0);
  const taken: LonLat[] = [];
  const desires: Desire[] = [];
  for (const due of me.foundation) {
    if (due.deposit === null) continue;
    const open = depositCalls(view, due.key, [due.deposit], reaches).filter(
      (call) =>
        call.refusal === null &&
        !taken.some((point) => distanceKm(point, call.deposit.lonLat) < BUILDING_SPACING_KM),
    );
    const nearest = nearestDeposit(open, me.capitalPoint);
    if (nearest === null) continue;
    const { deposit } = nearest.call;
    taken.push(deposit.lonLat);
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

/** Rien en chantier ni en file : une pose ou une élévation de plus attendrait derrière, payée d'avance. */
const workIdle = (view: PlayerView): boolean =>
  view.me.construction === null && view.me.constructionQueue.length === 0;

const stocksAt = (view: PlayerView, now: number) =>
  Object.fromEntries(
    RESOURCES.map((key) => [key, currentStock(view.me.resources[key], view.loadedAt, now)]),
  ) as Record<ResourceKey, number>;

/** Les vivres baissent ou manquent : la famine suspend les captures (ADR 0044). */
const hungry = (view: PlayerView, now: number): boolean => {
  const food = view.me.resources.food;
  const stock = currentStock(food, view.loadedAt, now);
  if (food.ratePerHour >= 0) return stock < BOT_FOOD_LOW && food.ratePerHour === 0;
  return stock / -food.ratePerHour < BOT_FOOD_HORIZON_HOURS;
};

/** Monter un bâtiment debout : `constructions.start` sur son propre point. */
const raiseBuilding = (building: Building): Desire => ({
  want: WANT_FEED,
  order: {
    fn: 'constructions.start',
    args: {
      building: building.key,
      regionId: building.regionId,
      point: pointArg(building.point),
    },
  },
});

/**
 * **Nourrir l'armée** (#652) : monter une ferme, sinon en poser une sur un gisement de vivres libre,
 * sinon monter le QG qui plafonne les fermes. Chaque geste par la règle du joueur (`upgradeHold`,
 * `depositCalls`).
 */
const feedArmy = ({ view, now }: BotContext): Desire[] => {
  const { me } = view;
  if (me.hqLevel === 0 || me.foundation.length > 0 || !workIdle(view)) return [];
  if (!hungry(view, now)) return [];
  const farms = me.buildings.filter((building) => building.key === 'farm' && !building.captured);
  const raisable = farms.find((farm) => upgradeHold(farm, view, now) === null);
  if (raisable !== undefined) return [raiseBuilding(raisable)];

  const bill = tileBillOf(
    view.buildCatalog.farm.cost,
    (resource) => me.resources[resource],
    view.loadedAt,
    now,
  );
  if (me.capitalPoint !== null && !bill.some((line) => line.missing > 0)) {
    const open = depositCalls(
      view,
      'farm',
      ['food'],
      reachesOf(view, () => 0),
    ).filter((call) => call.refusal === null);
    const nearest = nearestDeposit(open, me.capitalPoint);
    if (nearest !== null) {
      const { deposit } = nearest.call;
      return [
        {
          want: WANT_FEED,
          order: {
            fn: 'constructions.start',
            args: { building: 'farm', regionId: deposit.regionId, point: pointArg(deposit.lonLat) },
          },
        },
      ];
    }
  }

  if (farms.some((farm) => upgradeHold(farm, view, now)?.kind === 'cappedByHq')) {
    const hq = me.buildings.find((building) => building.key === 'hq' && !building.captured);
    if (hq !== undefined && upgradeHold(hq, view, now) === null) return [raiseBuilding(hq)];
  }
  return [];
};

/**
 * **Élever un avant-poste** (#652) : le plus bas d'abord, avec de l'acier qui dort
 * (`BOT_RAISE_RESERVE`), jamais en famine, par `outpostRaiseHold`. La spécialisation tourne sur
 * les trois, dans l'ordre des points : le bot n'a pas d'avis, il ne mesure que le prix.
 */
const raiseOutpost = ({ view, now }: BotContext): Desire[] => {
  const { me } = view;
  if (me.hqLevel === 0 || me.foundation.length > 0 || !workIdle(view) || hungry(view, now))
    return [];
  const stocks = stocksAt(view, now);
  const pledged = pledgedOutposts(view);
  const standing = me.outposts.filter(
    (outpost) => outpost.isMine && outpost.standsAt === null && !outpost.atMaxLevel,
  );
  for (const outpost of [...standing].sort((a, b) => a.level - b.level)) {
    const hold = outpostRaiseHold(
      {
        level: outpost.level,
        disabled: outpost.disabledMinutesLeft !== null,
        queued: pledged.has(outpost.id),
        stocks,
        hqDisabled: hqDisabledOf(view, now),
      },
      outpost.nextLevelCost,
      outpost.level + 1,
    );
    if (hold !== null) continue;
    const left = stocks.steel - (outpost.nextLevelCost.steel ?? 0);
    if (left < me.resources.steel.cap * BOT_RAISE_RESERVE) continue;
    const specialty = raiseChoosesSpecialty(outpost.level)
      ? CHOSEN_SPECIALTIES[standing.indexOf(outpost) % CHOSEN_SPECIALTIES.length]
      : undefined;
    return [
      {
        want: WANT_RAISE,
        order: {
          fn: 'constructions.raiseOutpost',
          args: { outpostId: outpost.id, ...(specialty === undefined ? {} : { specialty }) },
        },
      },
    ];
  }
  return [];
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
          args: { building: 'barracks', regionId: aim.region!.id, point: pointArg(region.point) },
        },
      },
    ];
  }
  return [];
};

/** L'armée libre : les troupes en service et en file, sans la garnison des avant-postes, qui ne repartira jamais. */
const freeArmyOf = (view: PlayerView, workshop: BotWorkshop): number =>
  workshop.troopsInService +
  workshop.troopsQueued -
  view.me.troops.filter((troop) => troop.stationedAt.kind === 'outpost').length -
  cargoCount(view, workshop);

/** Les coques de transport, debout et en file : elles portent l'armée, elles n'en sont pas, et un cargo ne retient pas le recrutement des fusiliers qu'il emporte. */
const cargoCount = (view: PlayerView, workshop: BotWorkshop): number =>
  view.me.troops.filter((troop) => troop.role === 'cargo').length +
  workshop.facilities.reduce(
    (sum, facility) => sum + facility.queue.filter((batch) => batch.role === 'cargo').length,
    0,
  );

/** Former une pièce à ce site : l'envie, ou le refus que le domaine dit. */
function recruitCall(
  { view, workshop, now }: BotContext,
  site: BotWorkshop['facilities'][number],
  role: UnitRole,
  want: number,
): Desire | { readonly refused: string } | null {
  const unit = workshop.grid.find((line) => line.role === role)?.unit;
  if (unit === undefined) return null;
  const stocks = Object.fromEntries(
    RESOURCES.map((key) => [key, currentStock(view.me.resources[key], view.loadedAt, now)]),
  ) as Record<ResourceKey, number>;
  const refusal = recruitRefusalOf(role, 1, site, {
    researched: view.me.research.researched,
    army: freeArmyOf(view, workshop),
    siteQueue: site.queue.length,
    costs: unit.costs,
    stocks,
  });
  if (refusal !== null) return { refused: refusal.code };
  return { want, order: { fn: 'troops.recruit', args: { buildingId: site.id, role, tier: 1 } } };
}

const recruit = (context: BotContext): Desire[] => {
  const { view, workshop } = context;
  const site = workshop.facilities.find((facility) => facility.key === 'barracks');
  const total = workshop.troopsInService + workshop.troopsQueued;
  // Seule l'armée libre se compte contre la cible ; la borne du serveur compte tout.
  const army = freeArmyOf(view, workshop);
  if (site === undefined || army >= BOT_ARMY_TARGET || total >= MONDIALE_TROOP_BOUND) return [];
  const trucks =
    workshop.roster.some((line) => line.role === 'landTransport') ||
    workshop.facilities.some((facility) =>
      facility.queue.some((batch) => batch.role === 'landTransport'),
    );
  const role: UnitRole = trucks || army === 0 ? 'infantry' : 'landTransport';
  const call = recruitCall(context, site, role, WANT_RECRUIT);
  return call === null || 'refused' in call ? [] : [call];
};

/** Des troupes libres d'un même rôle, posées à une même adresse que le bot sait quitter. */
type Squad = {
  readonly station: Exclude<MarchStation, { readonly kind: 'outpost' }>;
  readonly at: LonLat;
  readonly troops: ReadonlyArray<TroopView>;
};

/** Une troupe libre n'est pas en marche (`marchingTroopIds`) et n'a ni tournée, ni ronde, ni transport. */
const isFree = (troop: TroopView, marching: ReadonlySet<string>): boolean =>
  !marching.has(troop.id) &&
  troop.tour === undefined &&
  troop.patrol === undefined &&
  troop.carriedBy === undefined;

/**
 * Les troupes libres d'un rôle, par adresse. **Jamais la garnison d'un avant-poste** : un point qui
 * perd toute sa garnison s'effondre s'il est en chantier (`collapseIfAbandoned`), et il perd de toute
 * façon ce qui le tient. `home` n'est pas une adresse d'où l'on part.
 */
function squadsOf(view: PlayerView, role: UnitRole): Squad[] {
  const marching = marchingTroopIds(view.arcs);
  const groups = new Map<string, { station: Squad['station']; troops: TroopView[] }>();
  for (const troop of view.me.troops) {
    const { stationedAt: station } = troop;
    if (troop.role !== role || !isFree(troop, marching)) continue;
    if (station.kind === 'outpost' || station.kind === 'home') continue;
    const key = stationKeyOf(station);
    const group = groups.get(key) ?? { station, troops: [] };
    group.troops.push(troop);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap(({ station, troops }) => {
    const at = stationPointOf(view.me, station);
    return at === null ? [] : [{ station, at, troops }];
  });
}

const originOf = (station: Squad['station']): BotOrigin =>
  station.kind === 'building'
    ? { kind: 'building', buildingId: station.buildingId }
    : { kind: 'point', point: pointArg(station.lonLat) };

const idsOf = (troops: ReadonlyArray<TroopView>) => troops.map((troop) => troop.id);

/** Le pays d'origine de la nation, `null` quand on ne sait pas la lire. */
const homeOf = (view: PlayerView): string | null =>
  isNation(view.me.nation) ? ADM0_BY_NATION[view.me.nation] : null;

const hqOf = (view: PlayerView) => view.me.buildings.find((building) => building.key === 'hq');

/**
 * Les camps relevés à moins de `BOT_HQ_ALERT_KM` du QG que la défense peut frapper (camp à terre,
 * route à pied), le plus proche d'abord : un camp naval ou coupé du QG ne retient ni l'avance ni la
 * garnison. Un camp perdu de vue n'est qu'une dernière position, gardée `LAST_KNOWN_HOURS` : il
 * ne retient plus rien (#625).
 */
function threatsOf(view: PlayerView, world: BotWorld) {
  const hq = hqOf(view);
  if (hq === undefined) return [];
  return view.camps
    .filter(
      (camp) =>
        !camp.lastKnown &&
        camp.medium === 'land' &&
        world.landRoute(hq.point, camp.point, ['infantry']) !== null,
    )
    .map((camp) => ({ camp, km: distanceKm(camp.point, hq.point) }))
    .filter(({ km }) => km <= BOT_HQ_ALERT_KM)
    .sort((a, b) => a.km - b.km)
    .map(({ camp }) => camp);
}

/** Une visée de point, telle que le serveur la remplit sur la grille ; jamais surveillée par le bot. */
const pointAim = (world: BotWorld, at: LonLat): MovementAim => ({
  kind: 'point',
  lon: at[0],
  lat: at[1],
  ground: world.groundAt(at),
  surveyed: false,
  coastal: world.coastalAt(at),
  walkable: world.walkableAt(at),
});

/** Le refus d'une marche, du domaine puis de la route que le serveur calcule (`NO_LAND_ROUTE`). */
function marchRefused(
  { view, world }: BotContext,
  squad: Squad,
  troops: ReadonlyArray<TroopView>,
  type: 'march' | 'attack' | 'capture',
  aim: MovementAim,
  to: LonLat,
): boolean {
  const column = armedColumn(view, squad.station, idsOf(troops));
  const refused =
    type === 'capture'
      ? captureOrderRefusalOf(aim, column.rule, false)
      : refusalOf(type, aim, column.rule);
  if (refused !== null) return true;
  const route = world.landRoute(squad.at, to, column.rule.roles);
  if (route === null) return true;
  const drivers = troops.map((troop) => ({ role: troop.role, ...troop.supplies }));
  return fuelRefusalOf(drivers, route.km) !== null;
}

const defendHq = (context: BotContext): Desire[] => {
  const { view, world } = context;
  const threats = threatsOf(view, world);
  if (threats.length === 0) return [];
  const hq = hqOf(view)!;
  const squads = squadsOf(view, 'infantry');
  for (const camp of threats) {
    const aim: MovementAim = {
      kind: 'camp',
      campId: camp.id,
      lon: camp.point[0],
      lat: camp.point[1],
      hostCountry: world.regionAt(camp.point)?.country ?? '',
      ground: world.groundAt(camp.point),
      coastal: world.coastalAt(camp.point),
      walkable: world.walkableAt(camp.point),
    };
    const strikes = squads
      .filter((squad) => !marchRefused(context, squad, squad.troops, 'attack', aim, camp.point))
      .sort((a, b) => distanceKm(a.at, camp.point) - distanceKm(b.at, camp.point));
    if (strikes.length > 0)
      return strikes.map((squad) => ({
        want: WANT_DEFEND,
        order: {
          fn: 'movements.attack',
          args: {
            origin: originOf(squad.station),
            troopIds: idsOf(squad.troops),
            target: { kind: 'camp', campId: camp.id },
          },
        },
      }));
  }
  const home: MovementAim = { kind: 'building', buildingId: hq.id, key: 'hq' };
  return squads.flatMap((squad) =>
    (squad.station.kind === 'building' && squad.station.buildingId === hq.id) ||
    marchRefused(context, squad, squad.troops, 'march', home, hq.point)
      ? []
      : [
          {
            want: WANT_DEFEND,
            order: {
              fn: 'movements.enterGarrison',
              args: {
                origin: originOf(squad.station),
                troopIds: idsOf(squad.troops),
                buildingId: hq.id,
              },
            },
          },
        ],
  );
};

/** Les régions où le bot tient déjà quelque chose : bâtiment, avant-poste, disque couvert. */
const heldRegionIds = (view: PlayerView): ReadonlySet<string> =>
  new Set([
    ...view.me.regions.map((region) => region.id),
    ...view.me.buildings.map((building) => building.regionId),
    ...view.me.outposts.flatMap((outpost) => (outpost.regionId === null ? [] : [outpost.regionId])),
  ]);

/** Fonder, ou ce qui l'en empêche : `null` quand l'escouade posée peut planter son point. */
function foundingCall(
  { view, world, now }: BotContext,
  squad: Squad,
): Desire | 'refused' | 'short' {
  if (squad.station.kind !== 'point') return 'refused';
  const point = squad.station.lonLat;
  const here = world.nearestRegionId(point);
  const onMyGround =
    here !== null && view.me.buildings.some((building) => building.regionId === here);
  const roles = squad.troops.map((troop) => troop.role);
  if (foundingRefusal(roles, onMyGround, world.groundAt(point) === 'land') !== null)
    return 'refused';
  // Le serveur ne regarde que les bâtiments ; le bot ne double pas non plus un avant-poste de la région.
  if (view.me.outposts.some((outpost) => outpost.regionId === here)) return 'refused';
  // Faute de matière l'escouade attend sur place : la matière revient, un autre refus ne reviendra pas.
  if (foundationHold(view, now) !== null) return 'short';
  return {
    want: WANT_FOUND,
    order: {
      fn: 'movements.foundOutpostHere',
      args: {
        point: pointArg(point),
        regionId: world.regionAt(point)?.id ?? null,
        troopIds: idsOf(squad.troops),
      },
    },
  };
}

const foundOutpost = (context: BotContext): Desire[] =>
  squadsOf(context.view, 'infantry').flatMap((squad) => {
    // La colonne qu'un insulaire vient de débarquer (#631) va sur son point plutôt que de se faire garnison ; un bot continental garde sa règle.
    if (
      squad.troops.length >= BOT_POINT_COLUMN &&
      wantsSea(context) &&
      reachablePoint(context, squad) !== undefined
    )
      return [];
    const call = foundingCall(context, squad);
    return call === 'refused' || call === 'short' ? [] : [call];
  });

const advance = (context: BotContext): Desire[] => {
  const { view, world } = context;
  const hq = hqOf(view);
  if (hq === undefined || freeSlotsOf(view.me.slots) <= 0 || threatsOf(view, world).length > 0)
    return [];
  const home = homeOf(view);
  const held = heldRegionIds(view);
  const targets = world.regions
    .filter((region) => region.country !== home && !held.has(region.id))
    .sort((a, b) => distanceKm(a.point, hq.point) - distanceKm(b.point, hq.point))
    .slice(0, BOT_ADVANCE_CANDIDATES);
  // Une escouade posée en terre étrangère attend sa fondation ; elle ne repart que si fonder lui est refusé pour de bon.
  const squads = squadsOf(view, 'infantry')
    .filter(
      (squad) => squad.station.kind === 'building' || foundingCall(context, squad) === 'refused',
    )
    .sort(
      (a, b) =>
        b.troops.length - a.troops.length ||
        distanceKm(a.at, hq.point) - distanceKm(b.at, hq.point),
    )
    // Une colonne se forme : tant que l'armée libre n'est pas à la cible et qu'un point est joignable, l'escouade attend de pouvoir le prendre.
    .filter(
      (squad) =>
        squad.troops.length >= BOT_POINT_COLUMN ||
        freeArmyOf(view, context.workshop) >= BOT_ARMY_TARGET ||
        reachablePoint(context, squad) === undefined,
    );
  for (const target of targets) {
    for (const squad of squads) {
      // Elle laisse un fantassin à son adresse (une colonne vide est refusée) ; la région où elle se tient est tenue ou attend sa fondation, jamais visée.
      const troops = squad.troops.slice(0, Math.min(BOT_SQUAD_SIZE, squad.troops.length - 1));
      if (
        marchRefused(context, squad, troops, 'march', pointAim(world, target.point), target.point)
      )
        continue;
      return [
        {
          want: WANT_ADVANCE,
          order: {
            fn: 'movements.marchTo',
            args: {
              origin: originOf(squad.station),
              troopIds: idsOf(troops),
              point: pointArg(target.point),
            },
          },
        },
      ];
    }
  }
  return [];
};

/** Le point neutre le plus proche de l'escouade que sa route atteint, parmi `BOT_POINT_CANDIDATES`. */
function reachablePoint(context: BotContext, squad: Squad) {
  const { view, world } = context;
  return view.strategicPoints
    .filter((point) => point.holder === null && !point.mine && !point.contested)
    .sort((a, b) => distanceKm(a.point, squad.at) - distanceKm(b.point, squad.at))
    .slice(0, BOT_POINT_CANDIDATES)
    .find((point) => {
      const aim: MovementAim = {
        kind: 'strategic',
        pointId: point.id,
        lon: point.point[0],
        lat: point.point[1],
        hostCountry: world.regionAt(point.point)?.country ?? '',
      };
      return !marchRefused(context, squad, squad.troops, 'capture', aim, point.point);
    });
}

/**
 * Capturer le point neutre le plus proche que la route atteint, avec toute l'escouade quand elle a
 * de quoi vaincre sa garnison (`BOT_POINT_COLUMN`). Les neutres seuls : le bot ne voit pas la garde
 * d'un point tenu. Même porte que la rose (`captureOrderRefusalOf`, qui dit aussi la faim) et même
 * garde qu'`advance` : jamais pendant qu'un camp menace le QG.
 */
const takePoint = (context: BotContext): Desire[] => {
  const { view, world } = context;
  if (freeSlotsOf(view.me.slots) <= 0 || threatsOf(view, world).length > 0) return [];
  return squadsOf(view, 'infantry')
    .filter((squad) => squad.troops.length >= BOT_POINT_COLUMN)
    .flatMap((squad) => {
      const target = reachablePoint(context, squad);
      return target === undefined
        ? []
        : [
            {
              want: WANT_POINT,
              order: {
                fn: 'movements.capture' as const,
                args: {
                  origin: originOf(squad.station),
                  troopIds: idsOf(squad.troops),
                  target: { kind: 'point' as const, pointId: target.id },
                },
              },
            },
          ];
    });
};

/** Un de mes avant-postes debout et en service dont le dépôt est sous la moitié de sa place. */
const hungryDepots = (view: PlayerView, now: number) =>
  view.me.outposts.filter(
    (outpost) =>
      (outpost.standsAt === null || outpost.standsAt <= now) &&
      outpost.disabledMinutesLeft === null &&
      loadTotal(outpost.depot) < outpost.depotCapacity / 2,
  );

const supply = (context: BotContext): Desire[] => {
  const { view, now } = context;
  const hq = hqOf(view);
  if (hq === undefined) return [];
  const [depot] = hungryDepots(view, now).sort(
    (a, b) => distanceKm(a.lonLat, hq.point) - distanceKm(b.lonLat, hq.point),
  );
  if (depot === undefined) return [];
  const lorry = squadsOf(view, 'landTransport').flatMap((squad) =>
    squad.troops.map((troop) => ({ squad, troop })),
  );
  const atHq = lorry.filter(
    ({ squad }) => squad.station.kind === 'building' && squad.station.buildingId === hq.id,
  );
  if (atHq.length > 0) {
    const place = { kind: 'building', key: 'hq' } as const;
    // Le premier camion que les refus laissent faire ; les autres attendent le passage suivant.
    for (const { troop } of atHq) {
      if (loadTotal(troop.load) > 0) {
        const outpost = {
          level: depot.level,
          standing: true,
          depot: depot.depot,
          capacity: depot.depotCapacity,
        };
        const stops = [{ kind: 'depot', id: depot.id }] as const;
        if (
          tourRefusalOf({ role: troop.role, place, busy: null, load: troop.load, stops }) ===
            null &&
          deliverRefusalOf([troop], outpost, true) === null
        )
          return [
            {
              want: WANT_SUPPLY,
              order: { fn: 'tours.start', args: { troopId: troop.id, stops: [depot.id] } },
            },
          ];
        continue;
      }
      const room = roomAboard(loadCapacityOf(troop.role), troop.load, troop.harvest);
      for (const resource of SUPPLY_KEYS) {
        const stock = Math.floor(currentStock(view.me.resources[resource], view.loadedAt, now));
        const amount = Math.min(room, stock, BOT_CONVOY_LOAD);
        const refusal = loadRefusalOf({
          role: troop.role,
          place,
          busy: null,
          held: troop.load ?? { ammunition: 0, oil: 0, coal: 0 },
          harvest: troop.harvest,
          resource,
          amount,
          store: stock,
        });
        if (refusal === null)
          return [
            {
              want: WANT_SUPPLY,
              order: { fn: 'logistics.load', args: { troopId: troop.id, resource, amount } },
            },
          ];
      }
    }
    return [];
  }
  // Un camion libre posé ailleurs (la caserne) rejoint le QG, où il se charge.
  const home: MovementAim = { kind: 'building', buildingId: hq.id, key: 'hq' };
  return lorry.flatMap(({ squad, troop }) =>
    marchRefused(context, squad, [troop], 'march', home, hq.point)
      ? []
      : [
          {
            want: WANT_SUPPLY,
            order: {
              fn: 'movements.enterGarrison',
              args: { origin: originOf(squad.station), troopIds: [troop.id], buildingId: hq.id },
            },
          },
        ],
  );
};

/**
 * **Pourquoi un bot insulaire attend** (#631), en codes que le pilote traduit : ce qui manque à la
 * traversée, le premier maillon de la chaîne port, cargo, colonne, plage.
 */
export type SeaWait =
  | 'NO_BARRACKS'
  | 'PORT_PENDING'
  | 'PORT_BUSY'
  | 'PORT_BILL'
  | 'PORT_SITE'
  | 'CARGO_PENDING'
  | 'CARGO_REFUSED'
  | 'SHORT_COLUMN'
  | 'NO_PORT_ROUTE'
  | 'NO_LANDING';

const neutralPoints = (view: PlayerView) =>
  view.strategicPoints.filter((point) => point.holder === null && !point.mine && !point.contested);

const insularCache = new WeakMap<BotWorld, Map<string, boolean>>();

/**
 * Une nation insulaire : de son QG, aucune des `BOT_ADVANCE_CANDIDATES` régions étrangères les plus
 * proches ne se joint à pied. La géographie ne bouge pas : la réponse se garde par monde et par QG.
 */
function isInsular({ view, world }: BotContext): boolean {
  const hq = hqOf(view);
  const home = homeOf(view);
  if (hq === undefined || home === null) return false;
  const key = `${home}@${hq.point.join(',')}`;
  const known = insularCache.get(world) ?? new Map<string, boolean>();
  insularCache.set(world, known);
  const cached = known.get(key);
  if (cached !== undefined) return cached;
  const targets = world.regions
    .filter((region) => region.country !== home)
    .sort((a, b) => distanceKm(a.point, hq.point) - distanceKm(b.point, hq.point))
    .slice(0, BOT_ADVANCE_CANDIDATES);
  const insular =
    targets.length > 0 &&
    targets.every((region) => world.landRoute(hq.point, region.point, ['infantry']) === null);
  known.set(key, insular);
  return insular;
}

/** Le bot prend la mer : une île, et un point neutre que nul chemin à pied n'atteint. */
const wantsSea = (context: BotContext): boolean =>
  neutralPoints(context.view).length > 0 && isInsular(context);

/** Les plages d'une côte près d'un point, de la plus proche : une cellule de côte où l'on marche. */
function landingsNear(world: BotWorld, center: LonLat): LonLat[] {
  const spots: LonLat[] = [];
  for (let km = 0; km <= BOT_LANDING_KM; km += BOT_LANDING_STEP_KM)
    for (let k = 0; k < (km === 0 ? 1 : BOT_LANDING_BEARINGS); k += 1) {
      const at = km === 0 ? center : destinationPoint(center, km, (360 * k) / BOT_LANDING_BEARINGS);
      if (
        world.coastalAt(at) &&
        world.groundAt(at) === 'land' &&
        world.walkableAt(at) &&
        world.regionAt(at) !== null
      )
        spots.push(at);
    }
  return spots;
}

/**
 * Le port : parmi les côtes nationales à portée du QG que la pose accepte (par la même visée que le
 * joueur), celle qui rapproche le plus d'un point neutre. Le plein d'un cargo borne la traversée
 * (`FUEL_STEP_KM`) : un quai du mauvais côté de l'île la rend impossible.
 */
function portSite({ view, world }: BotContext): { regionId: string; point: LonLat } | null {
  const hq = hqOf(view);
  const home = homeOf(view);
  if (hq === undefined || home === null) return null;
  const reaches = reachesOf(view, () => 0);
  const goals = neutralPoints(view);
  // La mer n'est pas la ligne droite : une île a sa bonne côte, que la route de mer du cargo dit.
  const gap = (point: LonLat) =>
    goals.length === 0
      ? distanceKm(point, hq.point)
      : Math.min(
          ...goals.map(
            (goal) =>
              world.landRoute(point, goal.point, ['cargo', 'infantry'])?.km ??
              distanceKm(point, goal.point) * 2,
          ),
        );
  let best: { regionId: string; point: LonLat; km: number } | null = null;
  for (const region of world.regions.filter(
    (candidate) =>
      candidate.country === home && distanceKm(candidate.point, hq.point) <= BOT_PORT_KM,
  )) {
    const shore = world.coastNear(region.point, BOT_PORT_KM, region.id);
    // Un quai où l'infanterie ne marche pas ne serait jamais chargé : la garnison doit pouvoir y venir à pied.
    if (shore === null || !world.walkableAt(shore) || !world.carriesBuilding(shore)) continue;
    const km = gap(shore);
    if (best !== null && km >= best.km) continue;
    const aim: Aim = {
      lonLat: shore,
      region: { id: region.id, name: '', country: region.country },
      coastal: true,
      onLand: true,
    };
    if (
      aimVerdict(view, 'port', aim, reaches).refusal === null &&
      world.landRoute(hq.point, shore, ['infantry']) !== null
    )
      best = { regionId: region.id, point: shore, km };
  }
  return best === null ? null : { regionId: best.regionId, point: best.point };
}

function portDesire(context: BotContext): Desire | SeaWait {
  const { view, now } = context;
  const { me } = view;
  if (me.hqLevel === 0 || !me.buildings.some((building) => building.key === 'barracks'))
    return 'NO_BARRACKS';
  if (pledgedWork(view).some((work) => work.key === 'port')) return 'PORT_PENDING';
  if (me.foundation.length > 0 || me.construction !== null || me.constructionQueue.length > 0)
    return 'PORT_BUSY';
  const bill = tileBillOf(
    view.buildCatalog.port.cost,
    (resource) => me.resources[resource],
    view.loadedAt,
    now,
  );
  if (bill.some((line) => line.missing > 0)) return 'PORT_BILL';
  const site = portSite(context);
  if (site === null) return 'PORT_SITE';
  return {
    want: WANT_PORT,
    order: {
      fn: 'constructions.start',
      args: { building: 'port', regionId: site.regionId, point: pointArg(site.point) },
    },
  };
}

/**
 * **La traversée, aller simple** (#631) : un port, un cargo, une colonne qui y monte, une plage
 * près d'un point neutre, puis le débarquement (`disembarkLanded`) et la prise comme les autres
 * bots. Chaque maillon passe par les refus du joueur ; le premier qui manque se dit (`waiting`).
 */
function seaTurn(context: BotContext): { desires: Desire[]; waiting: SeaWait | null } {
  const { view, workshop } = context;
  const none = (waiting: SeaWait) => ({ desires: [], waiting });
  if (!wantsSea(context)) return { desires: [], waiting: null };
  const port = view.me.buildings.find((b) => b.key === 'port' && b.captured !== true);
  if (port === undefined) {
    const step = portDesire(context);
    return typeof step === 'string' ? none(step) : { desires: [step], waiting: null };
  }
  const marching = marchingTroopIds(view.arcs);
  const stationKey = stationKeyOf({ kind: 'building', buildingId: port.id });
  const atPort = (troop: TroopView) => stationKeyOf(troop.stationedAt) === stationKey;
  const cargo = view.me.troops.find(
    (troop) => troop.role === 'cargo' && isFree(troop, marching) && atPort(troop),
  );
  if (cargo === undefined) {
    // Un cargo ne se forme que pour une colonne prête, et pas tant qu'un autre est en mer.
    const columnReady = squadsOf(view, 'infantry').some(
      (squad) => squad.troops.length >= BOT_POINT_COLUMN,
    );
    const sailing = view.me.troops.some(
      (troop) => troop.role === 'cargo' && marching.has(troop.id),
    );
    if (!columnReady || sailing) return none('SHORT_COLUMN');
    const site = workshop.facilities.find((facility) => facility.key === 'port');
    if (
      site === undefined ||
      workshop.facilities.some((f) => f.queue.some((b) => b.role === 'cargo'))
    )
      return none('CARGO_PENDING');
    const call = recruitCall(context, site, 'cargo', WANT_CARGO);
    if (call === null || 'refused' in call) return none('CARGO_REFUSED');
    return { desires: [call], waiting: null };
  }
  const aboard = view.me.troops.filter(
    (troop) => troop.carriedBy === cargo.id && !marching.has(troop.id),
  );
  const station = { kind: 'building', buildingId: port.id } as const;
  if (aboard.length >= BOT_POINT_COLUMN) {
    const squad: Squad = { station, at: port.point, troops: [cargo, ...aboard] };
    const landing = landingFor(context, squad);
    return landing === null
      ? none('NO_LANDING')
      : {
          desires: [
            {
              want: WANT_SAIL,
              order: {
                fn: 'movements.marchTo',
                args: {
                  origin: originOf(station),
                  troopIds: [cargo.id],
                  point: pointArg(landing),
                },
              },
            },
          ],
          waiting: null,
        };
  }
  const infantry = squadsOf(view, 'infantry');
  const waiting = infantry
    .filter((squad) => stationKeyOf(squad.station) === stationKey)
    .flatMap((squad) => squad.troops);
  const pile = view.me.troops.filter(atPort);
  const riders = waiting.slice(0, Math.max(0, seatsLeft(cargo, pile)));
  if (aboard.length + riders.length >= BOT_POINT_COLUMN) {
    return boardingRefusalOf({ riders, carrier: cargo, pile, atAirfield: false }) === null
      ? {
          desires: [
            {
              want: WANT_BOARD,
              order: {
                fn: 'movements.board',
                args: { troopIds: idsOf(riders), carrierId: cargo.id },
              },
            },
          ],
          waiting: null,
        }
      : none('SHORT_COLUMN');
  }
  const home: MovementAim = { kind: 'building', buildingId: port.id, key: 'port' };
  const columns = infantry.filter(
    (squad) =>
      stationKeyOf(squad.station) !== stationKey && squad.troops.length >= BOT_POINT_COLUMN,
  );
  if (columns.length === 0) return none('SHORT_COLUMN');
  const gather = columns.filter(
    (squad) => !marchRefused(context, squad, squad.troops, 'march', home, port.point),
  );
  if (gather.length === 0) return none('NO_PORT_ROUTE');
  return {
    desires: gather.map((squad) => ({
      want: WANT_GATHER,
      order: {
        fn: 'movements.enterGarrison' as const,
        args: {
          origin: originOf(squad.station),
          troopIds: idsOf(squad.troops),
          buildingId: port.id,
        },
      },
    })),
    waiting: null,
  };
}

/**
 * La plage où le cargo débarque : près du point neutre le plus proche du port, de la plus proche
 * du point ; elle se joint à pied jusqu'à lui, et la traversée que le serveur facture (route de mer,
 * plein du cargo) ne lui est pas refusée.
 */
function landingFor(context: BotContext, squad: Squad): LonLat | null {
  const { world } = context;
  for (const target of neutralPoints(context.view)
    .sort((a, b) => distanceKm(a.point, squad.at) - distanceKm(b.point, squad.at))
    .slice(0, BOT_POINT_CANDIDATES)) {
    // Un point où nulle botte ne se pose (une île que la grille noie) se prend d'une plage voisine, sans route à pied à lui demander.
    const onFoot = world.walkableAt(target.point);
    let tried = 0;
    let footTried = 0;
    for (const beach of landingsNear(world, target.point)) {
      if (tried >= BOT_LANDING_CANDIDATES) break;
      if (onFoot) {
        if (footTried >= BOT_LANDING_FOOT_TRIES) break;
        footTried += 1;
        if (!world.landRoute(beach, target.point, ['infantry'])) continue;
      }
      tried += 1;
      if (!marchRefused(context, squad, squad.troops, 'march', pointAim(world, beach), beach))
        return beach;
    }
  }
  return null;
}

/** Le pilote dit ce que la traversée attend : `null` quand elle avance ou que le bot n'a pas à la faire. */
export const seaWaiting = (context: BotContext): SeaWait | null => seaTurn(context).waiting;

/** Un cargo posé à terre, hors de l'eau, y met ses fusiliers à pied : ils prennent ensuite le point comme les autres colonnes. */
const disembarkLanded = ({ view }: BotContext): Desire[] => {
  const marching = marchingTroopIds(view.arcs);
  return view.me.troops.flatMap((cargo) => {
    if (cargo.role !== 'cargo' || marching.has(cargo.id) || cargo.stationedAt.kind !== 'point')
      return [];
    const riders = view.me.troops.filter(
      (troop) => troop.carriedBy === cargo.id && !marching.has(troop.id),
    );
    const ashore =
      disembarkRefusalOf({
        carrier: cargo.role,
        afloat: cargo.stationedAt.afloat === true,
        atAirfield: false,
      }) === null;
    return riders.length === 0 || !ashore
      ? []
      : [
          {
            want: WANT_DISEMBARK,
            order: { fn: 'movements.disembark' as const, args: { troopIds: idsOf(riders) } },
          },
        ];
  });
};

/** Une règle : des envies et leurs ordres, du plus pressé au plus calme. */

/**
 * **Rapporter un tas** (ADR 0041, #652) : la production d'une exploitation hors du socle
 * s'entasse à son pied et ne nourrit personne tant qu'un transport ne la rapporte pas. Un camion
 * vide au QG part ramasser le tas le plus utile, les vivres d'abord quand l'armée a faim, par
 * `tourRefusalOf`.
 */
const harvest = (context: BotContext): Desire[] => {
  const { view, world, now } = context;
  const hq = hqOf(view);
  if (hq === undefined) return [];
  const starving = hungry(view, now);
  const heaps = view.me.buildings
    .filter(
      (building) =>
        !building.captured &&
        building.heap !== undefined &&
        building.heap.amount >= BOT_HARVEST_MIN &&
        world.landRoute(hq.point, building.point, ['landTransport']) !== null,
    )
    .sort(
      (a, b) =>
        Number(starving && b.heap!.resource === 'food') -
          Number(starving && a.heap!.resource === 'food') || b.heap!.amount - a.heap!.amount,
    );
  const [heap] = heaps;
  if (heap === undefined) return [];
  const place = { kind: 'building', key: 'hq' } as const;
  const sites = new Map([
    [heap.id, { ours: true, exploitation: true, hasQuay: false, routed: true }],
  ]);
  for (const squad of squadsOf(view, 'landTransport')) {
    if (squad.station.kind !== 'building' || squad.station.buildingId !== hq.id) continue;
    for (const troop of squad.troops) {
      // Un camion chargé pour un dépôt qui n'a plus faim dort au QG : il ramasse quand même.
      const refusal = tourRefusalOf({
        role: troop.role,
        place,
        busy: null,
        load: troop.load,
        stops: [{ kind: 'site', id: heap.id }],
        sites,
      });
      if (refusal !== null) continue;
      return [
        {
          want: starving ? WANT_HARVEST_HUNGRY : WANT_HARVEST,
          order: {
            fn: 'tours.start',
            args: { troopId: troop.id, stops: [{ kind: 'site', id: heap.id }] },
          },
        },
      ];
    }
  }
  // Aucun camion au QG : un camion posé ailleurs (la caserne) y rentre.
  const home: MovementAim = { kind: 'building', buildingId: hq.id, key: 'hq' };
  for (const squad of squadsOf(view, 'landTransport')) {
    if (squad.station.kind === 'building' && squad.station.buildingId === hq.id) continue;
    const [troop] = squad.troops;
    if (troop === undefined) continue;
    if (marchRefused(context, squad, [troop], 'march', home, hq.point)) continue;
    return [
      {
        want: starving ? WANT_HARVEST_HUNGRY : WANT_HARVEST,
        order: {
          fn: 'movements.enterGarrison',
          args: { origin: originOf(squad.station), troopIds: [troop.id], buildingId: hq.id },
        },
      },
    ];
  }
  return [];
};

const RULES: ReadonlyArray<(context: BotContext) => Desire[]> = [
  placeHq,
  placeFoundation,
  buildBarracks,
  feedArmy,
  raiseOutpost,
  recruit,
  defendHq,
  foundOutpost,
  takePoint,
  advance,
  supply,
  harvest,
  (context) => seaTurn(context).desires,
  disembarkLanded,
];

/** Les troupes qu'un ordre met en mouvement ; un second ordre du passage ne les reprend pas. */
const troopsOf = ({ args }: BotOrder): ReadonlyArray<string> =>
  'troopIds' in args ? args.troopIds : 'troopId' in args ? [args.troopId] : [];

/** Les ordres qui prennent toujours un slot de mouvement (la tournée, selon son pays : `claimsSlot`). */
const CLAIMS_A_SLOT: ReadonlySet<BotOrder['fn']> = new Set([
  'movements.attack',
  'movements.capture',
  'movements.marchTo',
  'movements.enterGarrison',
]);

/**
 * Cet ordre prend-il un slot ? Une tournée qui reste au pays n'en prend pas (`tourHoldsSlot`, #618) :
 * le chargement est au QG et l'arrêt dans un dépôt dont le pays est celui de la nation ; un pays
 * qu'on ne sait pas lire en prend un, comme le serveur.
 */
function claimsSlot({ view, world }: BotContext, order: BotOrder): boolean {
  if (order.fn !== 'tours.start') return CLAIMS_A_SLOT.has(order.fn);
  const hq = hqOf(view);
  const depots = order.args.stops.map((id) =>
    view.me.outposts.find((outpost) => outpost.id === id),
  );
  const home = homeOf(view);
  return tourHoldsSlot(
    [
      hq === undefined ? null : (world.regionAt(hq.point)?.country ?? null),
      ...depots.map((depot) => depot?.hostCountry ?? null),
    ],
    home,
  );
}

/**
 * Les ordres du passage : les envies les plus fortes d'abord, `BOT_ORDERS_PER_TURN` au plus, sans
 * dépasser les slots libres, ni reprendre une troupe déjà engagée : le serveur refuserait le suivant
 * (une escouade posée en terre étrangère est voulue par la fondation comme par la défense).
 */
export function decideTurn(context: BotContext): BotOrder[] {
  const chosen: BotOrder[] = [];
  const engaged = new Set<string>();
  let slots = freeSlotsOf(context.view.me.slots);
  const budget = stocksAt(context.view, context.now);
  const desires = RULES.flatMap((rule) => rule(context)).sort((a, b) => b.want - a.want);
  for (const { order } of desires) {
    if (chosen.length === BOT_ORDERS_PER_TURN) break;
    const troops = troopsOf(order);
    if (troops.some((id) => engaged.has(id))) continue;
    // Chaque règle lit le stock entier : le second ordre d'un passage paie sur ce qui reste.
    const bill = billOf(context, order);
    if (RESOURCES.some((key) => (bill[key] ?? 0) > budget[key])) continue;
    if (claimsSlot(context, order)) {
      if (slots <= 0) continue;
      slots -= 1;
    }
    for (const key of RESOURCES) budget[key] -= bill[key] ?? 0;
    for (const id of troops) engaged.add(id);
    chosen.push(order);
  }
  return chosen;
}

/** Ce qu'un ordre prend au stock national : la facture que le serveur débitera. */
function billOf(
  { view, workshop }: BotContext,
  order: BotOrder,
): Partial<Record<ResourceKey, number>> {
  const { me } = view;
  switch (order.fn) {
    case 'constructions.start': {
      const { building, point } = order.args;
      if (me.foundation.some((due) => due.key === building)) return {};
      const standing = me.buildings.find(
        (b) => b.key === building && b.point[0] === point.lon && b.point[1] === point.lat,
      );
      return standing?.nextLevelCost ?? view.buildCatalog[building].cost;
    }
    case 'constructions.raiseOutpost':
      return (
        me.outposts.find((outpost) => outpost.id === order.args.outpostId)?.nextLevelCost ?? {}
      );
    case 'movements.foundOutpostHere':
      return view.outpostFoundation.cost;
    case 'troops.recruit':
      return workshop.grid.find((line) => line.role === order.args.role)?.unit.costs ?? {};
    case 'logistics.load':
      return { [order.args.resource]: order.args.amount };
    default:
      return {};
  }
}
