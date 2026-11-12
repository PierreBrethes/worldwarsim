import { ConvexError, v, type Infer } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import {
  SUPPLY_KEYS,
  addLoads,
  crawlsOn,
  deliverRefusalOf,
  emptyLoad,
  fitToRoom,
  loadCapacityOf,
  loadTotal,
  loadsHere,
  missingOf,
  roomAboard,
  takeFromHeap,
  tourRefusalOf,
  visitPlan,
  type PickupFacts,
  type SupplyLoad,
  type TourStop,
} from '../src/domain/logistics';
import { emptyStocks } from '../src/domain/economy';
import { RESOURCES } from '../src/domain/ids';
import { inService } from '../src/domain/loot';
import { isStanding } from '../src/domain/outposts';
import { refuelAtHeap, suppliesOf } from '../src/domain/supplies';
import { landCostOf, routeModeOf } from '../src/domain/movement-orders';
import { isBlitz } from './blitz';
import { TOUR_ROAD_WAITS, TOUR_RETRY_MINUTES } from './constants';
import { fail } from './errors';
import { isExploitation, takeHeap } from './heaps';
import { regionNameAt } from './placeNames';
import { quayOfRegion, routeBetween } from './routes';
import type { TOUR_END, TOUR_WAIT } from './validators';
import { TOUR_STOP } from './validators';
import { busyOf, depotOf, placeOf, unloadAt } from './logistics';
import { playerBuildings } from './buildingReads';
import { forgetMovement, standAt, walkHome } from './movement/arrival';
import { movementsOf, pointOf } from './movement/forces';
import { aimOf, claimSlot, march, troopsAmong, type MarchOrigin } from './movement/orders';
import { reassessDetection } from './movement/detection';
import { creditToStorage, debit, economyOf } from './resources';
import { cancelJob } from './scheduledJobs';
import { playerOf, requirePlayable, seasonStillPlays } from './seats';
import { resupply, takeFromDepot } from './supplies';
import { pointOfBuilding } from './regions';
import type { LonLat } from '../src/domain/geo';

/**
 * **La tournée de ravitaillement** (ADR 0028, précision du 18/10) : un transport tourne en boucle
 * depuis son point de chargement par quatre dépôts au plus. À chaque tour il recharge sa
 * consigne, dépose à chaque dépôt ce qui y tient, saute un dépôt plein, revient, recommence. Si
 * le plateau personnel manque, il attend au chargement, et une dépêche le dit. Il garde son slot
 * tant qu'il tourne : chaque pas est une marche qui ne le reprend pas (`keepsSlot`), et à l'arrêt
 * la tournée le tient encore (`slotsTaken`). On le rappelle quand on veut.
 */

type Tour = NonNullable<Doc<'troops'>['tour']>;
type TourEnd = Infer<typeof TOUR_END>;
type StoredStop = Infer<typeof TOUR_STOP>;
type Stop = TourStop<Id<'outposts'>, Id<'buildings'>>;

/** **Un arrêt, tel que la tournée le stocke** : l'id d'un avant-poste seul (les tournées d'avant le
 *  ramassage restent valides), ou `{ kind: 'site', id }` pour une exploitation. */
const stopOf = (stored: StoredStop): Stop =>
  typeof stored === 'string' ? { kind: 'depot', id: stored } : stored;
const storedOf = (stop: Stop): StoredStop => (stop.kind === 'depot' ? stop.id : stop);
const indexOfStop = (tour: Tour, stop: Stop): number =>
  tour.stops.findIndex((stored) => {
    const one = stopOf(stored);
    return one.kind === stop.kind && one.id === stop.id;
  });

/** **Une exploitation qu'on peut ramasser** : encore à soi, en service. */
const isPickable = (building: Doc<'buildings'> | null, playerId: Id<'players'>, now: number) =>
  building !== null &&
  building.playerId === playerId &&
  isExploitation(building) &&
  inService(building.disabledUntil, now);

const harvestTotal = (harvest: Doc<'troops'>['harvest']): number =>
  harvest === undefined ? 0 : RESOURCES.reduce((sum, key) => sum + harvest[key], 0);

/**
 * **Lancer une tournée** : le transport chargé, à son point de chargement, et ses arrêts dans
 * l'ordre où la main les a tracés. Ce qu'il porte devient la consigne.
 */
export const start = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    troopId: v.id('troops'),
    stops: v.array(TOUR_STOP),
  },
  handler: async (ctx, { token, seasonId, troopId, stops: stored }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    if (await isBlitz(ctx, seasonId)) fail('NOT_IN_BLITZ');
    const troop = await ctx.db.get(troopId);
    if (troop === null || troop.playerId !== player._id) fail('UNKNOWN_TROOP', { troopId });
    const now = Date.now();
    const at = await placeOf(ctx, troop, now);
    const stops = stored.map(stopOf);
    /** **Ce que le serveur sait d'une exploitation visée** : le client ne lui dit rien. Celle d'un
     *  autre se lit « pas à vous », comme un bâtiment qui n'existe pas. */
    const sites = new Map<string, PickupFacts>();
    for (const stop of stops) {
      if (stop.kind !== 'site') continue;
      const building = await ctx.db.get(stop.id);
      if (building === null) continue;
      sites.set(stop.id, {
        ours: building.playerId === player._id,
        exploitation: isExploitation(building),
        hasQuay: quayOfRegion(building.regionId, pointOfBuilding(building)) !== null,
        routed: await isRouted(ctx, troop, building),
      });
    }
    const refusal = tourRefusalOf({
      role: troop.role,
      place: at.place,
      busy: await busyOf(ctx, troop),
      load: troop.load,
      stops,
      sites,
      baseOutpostId: 'outpost' in at ? at.outpost._id : null,
    });
    if (refusal !== null) {
      if (refusal.code === 'TOUR_PICKUP_NO_ROUTE')
        fail(
          refusal.code,
          await noRouteDetails(ctx, troop, ctx.db.normalizeId('buildings', refusal.id)!),
        );
      const { code, ...details } = refusal;
      fail(code, details);
    }
    for (const stop of stops) {
      if (stop.kind === 'site') continue;
      const outpost = await ctx.db.get(stop.id);
      if (outpost === null || outpost.playerId !== player._id)
        fail('UNKNOWN_OUTPOST', { outpostId: stop.id });
      const refused = deliverRefusalOf([troop], depotOf(outpost, now), true);
      if (refused !== null) {
        const { code, ...details } = refused;
        fail(code, details);
      }
    }
    await claimSlot(ctx, player._id, [troopId]);
    await ctx.db.patch(troopId, {
      tour: {
        base: troop.stationedAt as Tour['base'],
        stops: stored,
        consigne: troop.load ?? emptyLoad(),
        next: 0,
      },
    });
    await atBase(ctx, troopId, now);
    await reassessDetection(ctx, seasonId, now, player._id);
    return null;
  },
});

/**
 * **Rappeler** : à l'arrêt, la tournée finit sur-le-champ et rend son slot ; en route, elle finit
 * le pas en cours, puis revient au chargement et s'y arrête.
 */
export const recall = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), troopId: v.id('troops') },
  handler: async (ctx, { token, seasonId, troopId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    const troop = await ctx.db.get(troopId);
    if (troop === null || troop.playerId !== player._id) fail('UNKNOWN_TROOP', { troopId });
    if (troop.tour === undefined) fail('NOT_ON_TOUR');
    const underway = (await movementsOf(ctx, player._id)).some((movement) =>
      movement.troopIds.includes(troopId),
    );
    if (underway) await ctx.db.patch(troopId, { tour: { ...troop.tour, recalled: true } });
    else {
      await endTour(ctx, troop, Date.now(), 'recalled');
      /** Sans tournée, le camion se relève de nouveau à portée entière, Rangoun ou non (#145). */
      await reassessDetection(ctx, seasonId, Date.now(), player._id);
    }
    return null;
  },
});

/** **Une tournée qui attend** regarde de nouveau à son heure. */
export const retry = internalMutation({
  args: { troopId: v.id('troops') },
  handler: async (ctx, { troopId }) => {
    const troop = await ctx.db.get(troopId);
    if (troop?.tour?.waiting === undefined) return;
    if (!(await seasonStillPlays(ctx, troop.playerId))) return;
    const now = Date.now();
    const was = troop.tour.waiting;
    await atBase(ctx, troopId, now);
    /** **Un regard qui retrouve la même attente ne change rien au plateau** (#146) : la
     *  réévaluation ne part que si la tournée a bougé ou fini. Elle ne touche que son joueur :
     *  ses dépôts, ses stocks, son camion. */
    const waiting = (await ctx.db.get(troopId))?.tour?.waiting;
    if (waiting !== undefined && waiting.why === was.why && waiting.resource === was.resource)
      return;
    await reassessDetection(ctx, troop.seasonId, now, troop.playerId);
  },
});

/** Un arrêt encore à elle et debout, avec ce que son plan lit de lui. */
type Standing =
  | { readonly kind: 'depot'; readonly outpost: Doc<'outposts'> }
  | { readonly kind: 'site'; readonly building: Doc<'buildings'> };

const stopOfStanding = (standing: Standing): Stop =>
  standing.kind === 'depot'
    ? { kind: 'depot', id: standing.outpost._id }
    : { kind: 'site', id: standing.building._id };

/** Ses arrêts encore à elle et debout, dans l'ordre du tracé : un dépôt perdu ou démantelé, une
 *  exploitation perdue, rasée ou désactivée sont sautés (invariant « Échéance »). */
async function stopsOf(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  tour: Tour,
  now: number,
): Promise<Standing[]> {
  const stops: Standing[] = [];
  for (const stored of tour.stops) {
    const stop = stopOf(stored);
    if (stop.kind === 'depot') {
      const outpost = await ctx.db.get(stop.id);
      if (outpost !== null && outpost.playerId === troop.playerId && isStanding(outpost, now))
        stops.push({ kind: 'depot', outpost });
      continue;
    }
    const building = await ctx.db.get(stop.id);
    if (building !== null && isPickable(building, troop.playerId, now))
      stops.push({ kind: 'site', building });
  }
  return stops;
}

/**
 * **Le plan d'une tournée** (`visitPlan`), en ids : ce que la tournée stocke. Un dépôt se lit à
 * sa place, un site au tas qu'il a à `now`.
 */
async function planOf(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  load: SupplyLoad,
  stops: ReadonlyArray<Standing>,
  now: number,
) {
  const heaps = stops.some((stop) => stop.kind === 'site')
    ? (await economyOf(ctx, troop.playerId, now)).heaps
    : {};
  const plan = visitPlan(
    {
      load,
      harvest: troop.harvest ?? emptyStocks(),
      capacity: loadCapacityOf(troop.role),
    },
    stops.map((stop) =>
      stop.kind === 'depot'
        ? ({ kind: 'depot', id: stop.outpost._id, ...depotOf(stop.outpost, now) } as const)
        : ({
            kind: 'site',
            id: stop.building._id,
            heap: heaps[stop.building._id]?.amount ?? 0,
          } as const),
    ),
  );
  return { visit: plan.visit, skipped: plan.skipped.map(storedOf) };
}

/** L'adresse d'où part le pas suivant, dans la forme qu'une marche prend. */
async function departureOf(
  ctx: MutationCtx,
  address: Doc<'troops'>['stationedAt'],
): Promise<MarchOrigin | null> {
  if (address === null) return null;
  if (typeof address !== 'string') return { kind: 'point', point: address };
  const buildingId = ctx.db.normalizeId('buildings', address);
  if (buildingId !== null) return { kind: 'building', buildingId };
  const outpostId = ctx.db.normalizeId('outposts', address);
  return outpostId === null ? null : { kind: 'outpost', outpostId };
}

/** **Où le transport va, pour ramasser** : le tas lui-même, ou le quai de la région pour un cargo,
 *  qui prend le tas à distance. `null` : un cargo dont la région n'a plus de quai. */
function pickupPointOf(role: Doc<'troops'>['role'], building: Doc<'buildings'>): LonLat | null {
  const point = pointOfBuilding(building);
  return role === 'cargo' ? quayOfRegion(building.regionId, point) : point;
}

/** **La route du point de chargement au point où le transport ramasse** (#546) : la donnée que
 *  `pickupRefusalOf` lit. Un cargo sans quai n'en a pas, et le refus du quai passe avant. */
async function isRouted(
  ctx: QueryCtx,
  troop: Doc<'troops'>,
  building: Doc<'buildings'>,
): Promise<boolean> {
  const from = await pointOfAddress(ctx, troop.stationedAt);
  const to = pickupPointOf(troop.role, building);
  return (
    from !== null &&
    to !== null &&
    routeBetween(from, to, routeModeOf([troop.role]), landCostOf([troop.role])) !== null
  );
}

/**
 * **Ce que la feuille de route ne sait pas lire seule** (#551) : pour un transport à moi, ses
 * exploitations à moi, avec le point où il irait ramasser, le quai de leur région, et si une route
 * les relie depuis son point de chargement. Le client n'a ni la grille ni les quais ; la lecture est
 * celle du refus de `start` (`isRouted`, `pickupPointOf`). Rien d'un bâtiment adverse ; vide en
 * Blitz, où la feuille ne s'ouvre pas.
 */
export const pickups = query({
  args: { token: v.string(), seasonId: v.id('seasons'), troopId: v.id('troops') },
  handler: async (ctx, { token, seasonId, troopId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    if (await isBlitz(ctx, seasonId)) return [];
    const troop = await ctx.db.get(troopId);
    if (troop === null || troop.playerId !== player._id) return [];
    const sites = [];
    for (const building of await playerBuildings(ctx, player._id)) {
      if (!isExploitation(building)) continue;
      const stopPoint = pickupPointOf(troop.role, building);
      sites.push({
        buildingId: building._id,
        routed: await isRouted(ctx, troop, building),
        hasQuay: quayOfRegion(building.regionId, pointOfBuilding(building)) !== null,
        stopPoint: stopPoint === null ? null : { lon: stopPoint[0], lat: stopPoint[1] },
      });
    }
    return sites;
  },
});

/** Les régions que le refus dit, pour le texte. */
async function noRouteDetails(ctx: MutationCtx, troop: Doc<'troops'>, buildingId: Id<'buildings'>) {
  const building = (await ctx.db.get(buildingId))!;
  const from = await pointOfAddress(ctx, troop.stationedAt);
  return {
    from: from === null ? '' : (regionNameAt(from) ?? ''),
    to: regionNameAt(pointOfBuilding(building)) ?? building.regionId,
  };
}

/** **Un pas** : une marche qui garde le slot de la tournée. `false` : la route le refuse. */
async function leg(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  to: { readonly kind: 'stop'; readonly stop: Stop } | { readonly kind: 'base' },
): Promise<boolean> {
  const origin = await departureOf(ctx, troop.stationedAt);
  const season = await ctx.db.get(troop.seasonId);
  if (origin === null || season === null) return false;
  const base = troop.tour!.base;
  let target: Parameters<typeof aimOf>[2];
  let mission:
    | { delivery: { outpostId: Id<'outposts'> } }
    | { pickup: { buildingId: Id<'buildings'> } }
    | null = null;
  if (to.kind === 'base')
    target =
      ctx.db.normalizeId('buildings', base) !== null
        ? { kind: 'building', buildingId: base as Id<'buildings'> }
        : { kind: 'outpost', outpostId: base as Id<'outposts'> };
  else if (to.stop.kind === 'depot') {
    target = { kind: 'outpost', outpostId: to.stop.id };
    mission = { delivery: { outpostId: to.stop.id } };
  } else {
    const building = await ctx.db.get(to.stop.id);
    const point = building === null ? null : pickupPointOf(troop.role, building);
    if (point === null) return false;
    target = { kind: 'point', point: { lon: point[0], lat: point[1] } };
    mission = { pickup: { buildingId: to.stop.id } };
  }
  const aim = await aimOf(ctx, troop.playerId, target);
  const go = async (crawl: boolean) => {
    const { movementId } = await march(ctx, {
      playerId: troop.playerId,
      season,
      type: 'march',
      origin,
      troopIds: [troop._id],
      aim,
      keepsSlot: true,
      /** D'un tas, d'un point d'arrêt : ni aérodrome ni port n'y sont, et la tournée n'en demande
       *  pas. Posé à un dépôt ou au chargement, il repart par sa porte comme une marche. */
      anyDoor: typeof troop.stationedAt !== 'string',
      crawl,
      ...mission,
    });
    await ctx.db.patch(movementId, { tourLeg: to.kind });
  };
  /** **Le plein seul ne l'arrête pas** (ADR 0041 §4) : refusé pour lui, un camion ou un cargo
   *  repart au pas, gratuitement ; à la prochaine marche il retente son allure ordinaire. */
  try {
    await go(false);
    return true;
  } catch (refused) {
    if (!(refused instanceof ConvexError)) throw refused;
    if (!crawlsOn(troop.role, (refused.data as { code?: string }).code ?? '')) return false;
  }
  try {
    await go(true);
  } catch (refused) {
    if (refused instanceof ConvexError) return false;
    throw refused;
  }
  const crawling = (await ctx.db.get(troop._id))!.tour!;
  if (crawling.crawled !== true) {
    await ctx.db.patch(troop._id, { tour: { ...crawling, crawled: true } });
    await ctx.db.insert('notices', {
      playerId: troop.playerId,
      at: Date.now(),
      kind: 'tourCrawling',
      role: troop.role,
    });
  }
  return true;
}

/**
 * **Verser la récolte à bord au stock national**, quel que soit le point de chargement, dans la
 * place libre de l'entrepôt (ADR 0041 §2). Rien ne se perd : ce que l'entrepôt ne prend pas reste
 * à bord, et occupe la place. Une dépêche dit ce qui est versé et ce qui reste ; `announce` la
 * fait aussi quand rien n'entre (un retour), sinon seul un versement la mérite (une tournée qui
 * regarde de nouveau n'écrit pas toutes les demi-heures).
 */
async function bankHarvest(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  now: number,
  announce: boolean,
  skipped = 0,
): Promise<void> {
  const aboard = troop.harvest;
  if (aboard === undefined || harvestTotal(aboard) === 0) return;
  const { delivered, lost } = await creditToStorage(ctx, troop.playerId, aboard, now);
  await ctx.db.patch(troop._id, { harvest: harvestTotal(lost) === 0 ? undefined : lost });
  if (!announce && harvestTotal(delivered) === 0) return;
  await ctx.db.insert('notices', {
    playerId: troop.playerId,
    at: now,
    kind: 'harvestReturned',
    delivered,
    kept: lost,
    skipped,
  });
}

/** **Le transport qui se pose à un point de chargement à soi y verse sa récolte** (ADR 0041 §2) :
 *  la tournée finie ou coupée qui rentre seule, une marche qui s'y arrête. */
export async function bankWhereLoaded(
  ctx: MutationCtx,
  troops: ReadonlyArray<Doc<'troops'>>,
  now: number,
): Promise<void> {
  for (const troop of troops) {
    if (troop.harvest === undefined || troop.tour !== undefined) continue;
    const at = await placeOf(ctx, troop, now);
    if (at.place.kind !== 'elsewhere' && loadsHere(troop.role, at.place) === null)
      await bankHarvest(ctx, troop, now, true);
  }
}

/** **Les exploitations que la tournée a trouvées perdues, rasées ou désactivées** depuis l'arrêt
 *  `from` du tracé : celles qu'elle saute, et nulles autres. Ajoutées à ce que le tour en compte
 *  déjà, sans doublon, pour que la dépêche du retour dise ce qui a été sauté et non ce qui est
 *  tombé depuis une visite. */
async function lostSites(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  tour: Tour,
  known: ReadonlyArray<Id<'buildings'>>,
  from: number,
  now: number,
): Promise<Array<Id<'buildings'>>> {
  const lost = new Set(known);
  for (const stored of tour.stops.slice(from)) {
    const stop = stopOf(stored);
    if (stop.kind === 'site' && !isPickable(await ctx.db.get(stop.id), troop.playerId, now))
      lost.add(stop.id);
  }
  return [...lost];
}

/**
 * **Au point de chargement** : verser la récolte, recharger la consigne dans la place qui reste,
 * voir quels arrêts prendraient ou donneraient quelque chose, partir pour le premier. Sinon
 * attendre — le plateau personnel manque, rien à livrer ni à ramasser, ou la route est refusée
 * (le plein manque). `arrived` : on vient de rentrer d'un tour.
 */
async function atBase(
  ctx: MutationCtx,
  troopId: Id<'troops'>,
  now: number,
  arrived = false,
): Promise<void> {
  const fresh = await ctx.db.get(troopId);
  const counted = fresh?.tour;
  if (fresh === null || counted === undefined) return;
  /** La récolte se verse **avant** tout : une tournée rappelée finit sans plus rien lui devoir.
   *  Mais au chargement seulement : une base perdue en route renvoie le transport par `walkHome`,
   *  qui verse à l'arrivée (`bankWhereLoaded`), et rien ne se verse sur un point nu. */
  const where = await placeOf(ctx, fresh, now);
  if (fresh.stationedAt === counted.base && where.place.kind !== 'elsewhere')
    await bankHarvest(ctx, fresh, now, arrived, (counted.lost ?? []).length);
  const troop = (await ctx.db.get(troopId))!;
  if (counted.recalled === true) return endTour(ctx, troop, now, 'recalled');
  const at = await placeOf(ctx, troop, now);
  if (troop.stationedAt !== counted.base || at.place.kind === 'elsewhere')
    return endTour(ctx, troop, now, 'cut');
  /** Un nouveau tour : ce qu'il trouve déjà tombé, il le saute. */
  const tour = { ...counted, lost: await lostSites(ctx, troop, counted, [], 0, now) };
  const stops = await stopsOf(ctx, troop, tour, now);
  if (stops.length === 0) return endTour(ctx, troop, now, 'cut');

  const held = troop.load ?? emptyLoad();
  /** La place à bord est celle que la récolte laisse : ce qui ne tient pas se recharge au tour
   *  suivant, et la tournée n'attend pas pour ça. */
  const need = fitToRoom(
    missingOf(tour.consigne, held),
    roomAboard(loadCapacityOf(troop.role), held, troop.harvest),
  );
  const store =
    'outpost' in at
      ? (at.outpost.depot ?? emptyLoad())
      : (await economyOf(ctx, troop.playerId, now)).stocks;
  const short = SUPPLY_KEYS.find((key) => need[key] > store[key]);
  if (short !== undefined) return wait(ctx, troop, now, { why: 'stock', resource: short });
  if (loadTotal(need) > 0) {
    if ('outpost' in at) await takeFromDepot(ctx, at.outpost._id, need);
    else await debit(ctx, troop.playerId, need, now);
  }
  const loaded = addLoads(held, need);
  await ctx.db.patch(troopId, { load: loaded });

  const plan = await planOf(ctx, troop, loaded, stops, now);
  const first = plan.visit[0];
  if (first === undefined)
    return wait(ctx, { ...troop, tour: { ...tour, skipped: [...plan.skipped] } }, now, {
      why: 'full',
    });
  const next = indexOfStop(tour, first) + 1;
  const ready = { ...(await ctx.db.get(troopId))!, tour: { ...tour, next } };
  if (!(await leg(ctx, ready, { kind: 'stop', stop: first })))
    return wait(ctx, ready, now, { why: 'road' });
  const { waiting: _waiting, retryJobId: _job, ...rolling } = tour;
  /** Le pas a pu poser `crawled` sur la tournée : on le garde. */
  const crawled = (await ctx.db.get(troopId))?.tour?.crawled;
  await ctx.db.patch(troopId, {
    tour: {
      ...rolling,
      next,
      skipped: [...plan.skipped],
      ...(crawled === true ? { crawled } : {}),
    },
  });
}

/** **Prendre le tas d'une exploitation** dans la place à bord (ADR 0041 §2). Perdue, rasée ou
 *  désactivée depuis l'ordre, elle ne donne rien : l'arrivée relit sa règle. */
async function pickUp(
  ctx: MutationCtx,
  carrier: Doc<'troops'>,
  buildingId: Id<'buildings'>,
  now: number,
): Promise<void> {
  const building = await ctx.db.get(buildingId);
  if (building === null || !isPickable(building, carrier.playerId, now)) return;
  const reading = (await economyOf(ctx, carrier.playerId, now)).heaps[building._id];
  if (reading === undefined) return;
  /** **Le plein d'abord** (ADR 0041 §4) : ce que le moteur brûle ne se rapporte pas, et ne prend
   *  donc pas la place de la récolte. */
  const fuel = refuelAtHeap(carrier.role, suppliesOf(carrier).fuel, reading);
  const { taken } = takeFromHeap(
    reading.amount - fuel.cost,
    roomAboard(loadCapacityOf(carrier.role), carrier.load, carrier.harvest),
  );
  if (fuel.steps === 0 && taken === 0) return;
  await takeHeap(ctx, building, reading, fuel.cost + taken, now);
  const aboard = carrier.harvest ?? emptyStocks();
  await ctx.db.patch(carrier._id, {
    ...(fuel.steps === 0 ? {} : { fuel: suppliesOf(carrier).fuel + fuel.steps }),
    ...(taken === 0
      ? {}
      : { harvest: { ...aboard, [reading.resource]: aboard[reading.resource] + taken } }),
  });
}

/**
 * **À un arrêt de la tournée** : décharger au dépôt ou prendre le tas, puis le prochain arrêt qui
 * donnerait ou prendrait quelque chose, ou le retour au chargement. Un arrêt perdu ou tombé en
 * route est sauté, comme au chargement ; la tournée finit, et le transport rentre seul, s'il ne
 * lui reste aucun arrêt ou que la route est refusée.
 */
export async function arriveOnTour(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  const pickup = movement.pickup;
  const unloaded = pickup === undefined ? await unloadAt(ctx, movement, now) : null;
  if (unloaded === null) {
    await standAt(ctx, movement, movement.to);
    await forgetMovement(ctx, movement._id, now);
  }
  const carriers =
    unloaded?.carriers ?? (await troopsAmong(ctx, movement.playerId, movement.troopIds));
  for (const carrier of carriers) {
    const stored = carrier.tour;
    if (stored === undefined) {
      await walkHome(ctx, { winners: [carrier], beaten: [] }, pointOf(movement.to), now);
      continue;
    }
    /** Il se tient au point, d'où il repart : un point côtier est une côte pour un cargo. */
    const stationedAt = unloaded === null ? carrier.stationedAt : unloaded.outpost._id;
    await ctx.db.patch(carrier._id, { stationedAt });
    if (pickup !== undefined)
      await pickUp(ctx, { ...carrier, stationedAt }, pickup.buildingId, now);
    const here = (await ctx.db.get(carrier._id))!;
    /** Ce qui tombe devant lui, ou à l'arrêt qu'il vient de manquer, est sauté ce tour. */
    const tour = {
      ...stored,
      lost: await lostSites(
        ctx,
        here,
        stored,
        stored.lost ?? [],
        pickup === undefined
          ? stored.next
          : Math.max(0, indexOfStop(stored, { kind: 'site', id: pickup.buildingId })),
        now,
      ),
    };
    await ctx.db.patch(carrier._id, { tour });
    const stops = await stopsOf(ctx, here, tour, now);
    if (stops.length === 0) {
      await endTour(ctx, here, now, 'cut');
      continue;
    }
    const ahead = stops.filter((stop) => indexOfStop(tour, stopOfStanding(stop)) >= tour.next);
    const plan = await planOf(ctx, here, here.load ?? emptyLoad(), ahead, now);
    const next = tour.recalled === true ? undefined : plan.visit[0];
    const moved =
      next === undefined
        ? await leg(ctx, here, { kind: 'base' })
        : await (async () => {
            await ctx.db.patch(carrier._id, {
              tour: { ...tour, next: indexOfStop(tour, next) + 1 },
            });
            return leg(ctx, here, { kind: 'stop', stop: next });
          })();
    if (!moved) await endTour(ctx, (await ctx.db.get(carrier._id))!, now, 'cut');
  }
}

/**
 * **De retour au chargement** : elle s'y pose, y verse sa récolte, s'y recharge et repart — ou s'y
 * arrête, rappelée. Perdu entre-temps, le chargement la laisse au point atteint, et la tournée
 * finit.
 */
export async function arriveAtBase(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  const target = movement.target;
  const base =
    target.kind === 'building'
      ? await ctx.db.get(target.buildingId)
      : target.kind === 'outpost'
        ? await ctx.db.get(target.outpostId)
        : null;
  await standAt(ctx, movement, base?.playerId === movement.playerId ? base._id : movement.to);
  await forgetMovement(ctx, movement._id, now);
  await resupply(
    ctx,
    movement.playerId,
    await troopsAmong(ctx, movement.playerId, movement.troopIds),
    now,
  );
  for (const troopId of movement.troopIds) await atBase(ctx, troopId, now, true);
}

async function wait(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  now: number,
  reason: Infer<typeof TOUR_WAIT>,
): Promise<void> {
  const tour = troop.tour!;
  const was = tour.waiting;
  /** **Une route refusée ne revient pas seule** : passé quelques regards, la tournée s'arrête ;
   *  un plateau à sec ou des dépôts pleins, eux, se remplissent ou se vident d'eux-mêmes. */
  const roads = reason.why === 'road' ? (was?.why === 'road' ? (was.roads ?? 1) : 0) + 1 : 0;
  if (roads >= TOUR_ROAD_WAITS) return endTour(ctx, troop, now, 'road');
  if (tour.retryJobId !== undefined) await cancelJob(ctx, tour.retryJobId);
  const retryJobId = await ctx.scheduler.runAfter(
    TOUR_RETRY_MINUTES * 60_000,
    internal.tours.retry,
    { troopId: troop._id },
  );
  await ctx.db.patch(troop._id, {
    tour: {
      ...tour,
      waiting: { since: was?.since ?? now, ...reason, ...(roads > 0 ? { roads } : {}) },
      retryJobId,
    },
  });
  /** Une dépêche quand elle se met à attendre, ou pour une autre raison — pas à chaque regard. */
  if (was?.why === reason.why && was.resource === reason.resource) return;
  await ctx.db.insert('notices', {
    playerId: troop.playerId,
    at: now,
    kind: 'tourWaiting',
    role: troop.role,
    ...reason,
  });
}

/**
 * **La tournée finit**, et la dépêche le dit : rappelée, coupée — chargement ou dépôts perdus,
 * déroute, chute —, ou sa route refusée trop longtemps. La seule fonction qui finit une tournée :
 * son prochain regard est annulé avec elle.
 */
export async function stopTour(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  now: number,
  why: TourEnd,
): Promise<void> {
  const jobId = troop.tour?.retryJobId;
  if (jobId !== undefined) await cancelJob(ctx, jobId);
  await ctx.db.patch(troop._id, { tour: undefined });
  await ctx.db.insert('notices', {
    playerId: troop.playerId,
    at: now,
    kind: 'tourEnded',
    role: troop.role,
    why,
  });
}

/** **Finir, et rentrer** : rappelée, elle s'arrête où elle est ; sinon le transport rentre seul
 *  à son chargement. */
async function endTour(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  now: number,
  why: TourEnd,
): Promise<void> {
  await stopTour(ctx, troop, now, why);
  const base = troop.tour?.base;
  if (why === 'recalled' || base === undefined || troop.stationedAt === base) return;
  const from = await pointOfAddress(ctx, troop.stationedAt);
  if (from !== null)
    await walkHome(
      ctx,
      { winners: [{ ...withoutTour(troop), stationedAt: base }], beaten: [] },
      from,
      now,
    );
}

/** Où se tient l'adresse : un point, un avant-poste, un bâtiment. */
async function pointOfAddress(
  ctx: QueryCtx,
  address: Doc<'troops'>['stationedAt'],
): Promise<LonLat | null> {
  if (address === null) return null;
  if (typeof address !== 'string') return pointOf(address);
  const outpostId = ctx.db.normalizeId('outposts', address);
  const outpost = outpostId === null ? null : await ctx.db.get(outpostId);
  if (outpost !== null) return pointOf(outpost.point);
  const buildingId = ctx.db.normalizeId('buildings', address);
  const building = buildingId === null ? null : await ctx.db.get(buildingId);
  return building === null ? null : pointOfBuilding(building);
}

const withoutTour = ({ tour: _tour, ...troop }: Doc<'troops'>): Doc<'troops'> => troop;
