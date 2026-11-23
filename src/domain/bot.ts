import { MONDIALE_TROOP_BOUND } from '../../convex/constants';
import { armedColumn } from './armed-column';
import {
  aimVerdict,
  depositCalls,
  foundationHold,
  nearestDeposit,
  pledgedWork,
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
  regionOf,
  type CoastAsset,
} from './coast';
import { distanceKm, type LonLat } from './geo';
import { RESOURCES, type BuildingKey, type ResourceKey, type UnitRole, type UnitTier } from './ids';
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
  captureOrderRefusalOf,
  foundingRefusal,
  freeSlotsOf,
  landCostOf,
  refusalOf,
  routeModeOf,
} from './movement-orders';
import type { MovementAim } from './movement-orders';
import { ADM0_BY_NATION, isNation } from './nations';
import { currentStock, type PlayerView, type TroopView } from './player-view';
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
      readonly fn: 'logistics.load';
      readonly args: {
        readonly troopId: string;
        readonly resource: ResourceKey;
        readonly amount: number;
      };
    }
  | {
      readonly fn: 'tours.start';
      readonly args: { readonly troopId: string; readonly stops: ReadonlyArray<string> };
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
};

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
      const route = computeRoute(grid, from, to, routeModeOf(roles), landCostOf(roles));
      return route === null ? null : { km: kmOf(route.distanceUnits) };
    },
    regions,
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

const WANT_HQ = 1000;
const WANT_DEFEND = 500;
const WANT_FOUNDATION = 200;
const WANT_FOUND = 150;
const WANT_SUPPLY = 130;
const WANT_POINT = 120;
const WANT_BARRACKS = 100;
const WANT_ADVANCE = 90;
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

const recruit = ({ view, workshop, now }: BotContext): Desire[] => {
  const site = workshop.facilities.find((facility) => facility.key === 'barracks');
  const total = workshop.troopsInService + workshop.troopsQueued;
  // La garnison d'un avant-poste ne repartira jamais : seule l'armée libre se compte contre la cible.
  const holding = view.me.troops.filter((troop) => troop.stationedAt.kind === 'outpost').length;
  const army = total - holding;
  if (site === undefined || army >= BOT_ARMY_TARGET || total >= MONDIALE_TROOP_BOUND) return [];
  const trucks =
    workshop.roster.some((line) => line.role === 'landTransport') ||
    workshop.facilities.some((facility) =>
      facility.queue.some((batch) => batch.role === 'landTransport'),
    );
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
    const call = foundingCall(context, squad);
    return call === 'refused' || call === 'short' ? [] : [call];
  });

const advance = (context: BotContext): Desire[] => {
  const { view, world } = context;
  const hq = hqOf(view);
  if (hq === undefined || freeSlotsOf(view.me.slots) <= 0 || threatsOf(view, world).length > 0)
    return [];
  const home = isNation(view.me.nation) ? ADM0_BY_NATION[view.me.nation] : null;
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

/**
 * Capturer le point neutre le plus proche que la route atteint, avec toute l'escouade quand elle a
 * de quoi vaincre sa garnison (`BOT_POINT_COLUMN`). Les neutres seuls : le bot ne voit pas la garde
 * d'un point tenu. Même porte que la rose (`captureOrderRefusalOf`, qui dit aussi la faim) et même
 * garde qu'`advance` : jamais pendant qu'un camp menace le QG.
 */
const takePoint = (context: BotContext): Desire[] => {
  const { view, world } = context;
  const neutral = view.strategicPoints.filter((point) => point.holder === null && !point.mine);
  if (neutral.length === 0 || freeSlotsOf(view.me.slots) <= 0 || threatsOf(view, world).length > 0)
    return [];
  return squadsOf(view, 'infantry')
    .filter((squad) => squad.troops.length >= BOT_POINT_COLUMN)
    .flatMap((squad) => {
      const target = [...neutral]
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

/** Une règle : des envies et leurs ordres, du plus pressé au plus calme. */
const RULES: ReadonlyArray<(context: BotContext) => Desire[]> = [
  placeHq,
  placeFoundation,
  buildBarracks,
  recruit,
  defendHq,
  foundOutpost,
  takePoint,
  advance,
  supply,
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
  const home = isNation(view.me.nation) ? ADM0_BY_NATION[view.me.nation] : null;
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
  const desires = RULES.flatMap((rule) => rule(context)).sort((a, b) => b.want - a.want);
  for (const { order } of desires) {
    if (chosen.length === BOT_ORDERS_PER_TURN) break;
    const troops = troopsOf(order);
    if (troops.some((id) => engaged.has(id))) continue;
    if (claimsSlot(context, order)) {
      if (slots <= 0) continue;
      slots -= 1;
    }
    for (const id of troops) engaged.add(id);
    chosen.push(order);
  }
  return chosen;
}
