import { ConvexError, v, type Infer } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, type MutationCtx } from './_generated/server';
import {
  SUPPLY_KEYS,
  addLoads,
  deliverRefusalOf,
  emptyLoad,
  loadTotal,
  missingOf,
  tourRefusalOf,
  visitPlan,
} from '../src/domain/logistics';
import { isStanding } from '../src/domain/outposts';
import { isBlitz } from './blitz';
import { TOUR_ROAD_WAITS, TOUR_RETRY_MINUTES } from './constants';
import { fail } from './errors';
import type { TOUR_END, TOUR_WAIT } from './validators';
import { busyOf, depotOf, placeOf, unloadAt } from './logistics';
import { forgetMovement, standAt, walkHome } from './movement/arrival';
import { movementsOf, pointOf } from './movement/forces';
import { aimOf, claimSlot, march, troopsAmong, type MarchOrigin } from './movement/orders';
import { reassessDetection } from './movement/detection';
import { debit, economyOf } from './resources';
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

/**
 * **Lancer une tournée** : le transport chargé, à son point de chargement, et ses arrêts dans
 * l'ordre où la main les a tracés. Ce qu'il porte devient la consigne.
 */
export const start = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    troopId: v.id('troops'),
    stops: v.array(v.id('outposts')),
  },
  handler: async (ctx, { token, seasonId, troopId, stops }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    if (await isBlitz(ctx, seasonId)) fail('NOT_IN_BLITZ');
    const troop = await ctx.db.get(troopId);
    if (troop === null || troop.playerId !== player._id) fail('UNKNOWN_TROOP', { troopId });
    const now = Date.now();
    const at = await placeOf(ctx, troop, now);
    const refusal = tourRefusalOf({
      role: troop.role,
      place: at.place,
      busy: await busyOf(ctx, troop),
      load: troop.load,
      stops,
      baseOutpostId: 'outpost' in at ? at.outpost._id : null,
    });
    if (refusal !== null) {
      const { code, ...details } = refusal;
      fail(code, details);
    }
    for (const stopId of stops) {
      const stop = await ctx.db.get(stopId);
      if (stop === null || stop.playerId !== player._id)
        fail('UNKNOWN_OUTPOST', { outpostId: stopId });
      const refused = deliverRefusalOf([troop], depotOf(stop, now), true);
      if (refused !== null) {
        const { code, ...details } = refused;
        fail(code, details);
      }
    }
    await claimSlot(ctx, player._id, [troopId]);
    await ctx.db.patch(troopId, {
      tour: {
        base: troop.stationedAt as Tour['base'],
        stops,
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
      /** Sans tournée, le camion n'est plus voilé par Rangoun (#145). */
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
    await atBase(ctx, troopId, now);
    /** Une tournée ne touche que son joueur : ses dépôts, ses stocks, son camion. */
    await reassessDetection(ctx, troop.seasonId, now, troop.playerId);
  },
});

/** Ses arrêts encore à elle et debout, dans l'ordre du tracé. */
async function stopsOf(ctx: MutationCtx, troop: Doc<'troops'>, tour: Tour, now: number) {
  const stops: Array<Doc<'outposts'>> = [];
  for (const stopId of tour.stops) {
    const stop = await ctx.db.get(stopId);
    if (stop !== null && stop.playerId === troop.playerId && isStanding(stop, now))
      stops.push(stop);
  }
  return stops;
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

/** **Un pas** : une marche qui garde le slot de la tournée. `false` : la route le refuse. */
async function leg(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  to: { readonly kind: 'stop'; readonly outpostId: Id<'outposts'> } | { readonly kind: 'base' },
): Promise<boolean> {
  const origin = await departureOf(ctx, troop.stationedAt);
  const season = await ctx.db.get(troop.seasonId);
  if (origin === null || season === null) return false;
  const base = troop.tour!.base;
  const target =
    to.kind === 'stop'
      ? ({ kind: 'outpost', outpostId: to.outpostId } as const)
      : ctx.db.normalizeId('buildings', base) !== null
        ? ({ kind: 'building', buildingId: base as Id<'buildings'> } as const)
        : ({ kind: 'outpost', outpostId: base as Id<'outposts'> } as const);
  try {
    const { movementId } = await march(ctx, {
      playerId: troop.playerId,
      season,
      type: 'march',
      origin,
      troopIds: [troop._id],
      aim: await aimOf(ctx, troop.playerId, target),
      keepsSlot: true,
      ...(to.kind === 'stop' ? { delivery: { outpostId: to.outpostId } } : {}),
    });
    await ctx.db.patch(movementId, { tourLeg: to.kind });
    return true;
  } catch (refused) {
    if (refused instanceof ConvexError) return false;
    throw refused;
  }
}

/**
 * **Au point de chargement** : recharger la consigne, voir quels dépôts prendraient quelque
 * chose, partir pour le premier. Sinon attendre — le plateau personnel manque, tous les dépôts
 * sont pleins, ou la route est refusée (le plein manque).
 */
async function atBase(ctx: MutationCtx, troopId: Id<'troops'>, now: number): Promise<void> {
  const troop = await ctx.db.get(troopId);
  const tour = troop?.tour;
  if (troop === null || tour === undefined) return;
  if (tour.recalled === true) return endTour(ctx, troop, now, 'recalled');
  const at = await placeOf(ctx, troop, now);
  if (troop.stationedAt !== tour.base || at.place.kind === 'elsewhere')
    return endTour(ctx, troop, now, 'cut');
  const stops = await stopsOf(ctx, troop, tour, now);
  if (stops.length === 0) return endTour(ctx, troop, now, 'cut');

  const held = troop.load ?? emptyLoad();
  const need = missingOf(tour.consigne, held);
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

  const plan = visitPlan(
    loaded,
    stops.map((stop) => ({ id: stop._id, ...depotOf(stop, now) })),
  );
  const first = plan.visit[0];
  if (first === undefined)
    return wait(ctx, { ...troop, tour: { ...tour, skipped: [...plan.skipped] } }, now, {
      why: 'full',
    });
  const next = tour.stops.indexOf(first) + 1;
  const ready = { ...(await ctx.db.get(troopId))!, tour: { ...tour, next } };
  if (!(await leg(ctx, ready, { kind: 'stop', outpostId: first })))
    return wait(ctx, ready, now, { why: 'road' });
  const { waiting: _waiting, retryJobId: _job, ...rolling } = tour;
  await ctx.db.patch(troopId, { tour: { ...rolling, next, skipped: [...plan.skipped] } });
}

/**
 * **À un arrêt de la tournée** : décharger, puis le prochain dépôt qui prendrait quelque chose,
 * ou le retour au chargement. Un arrêt perdu ou tombé en route est sauté, comme au chargement ;
 * la tournée finit, et le transport rentre seul, s'il ne lui reste aucun arrêt ou que la route
 * est refusée.
 */
export async function arriveOnTour(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  const unloaded = await unloadAt(ctx, movement, now);
  if (unloaded === null) {
    await standAt(ctx, movement, movement.to);
    await forgetMovement(ctx, movement._id, now);
  }
  const carriers =
    unloaded?.carriers ?? (await troopsAmong(ctx, movement.playerId, movement.troopIds));
  for (const carrier of carriers) {
    const tour = carrier.tour;
    if (tour === undefined) {
      await walkHome(ctx, { winners: [carrier], beaten: [] }, pointOf(movement.to), now);
      continue;
    }
    /** Il se tient au point, d'où il repart : un point côtier est une côte pour un cargo. */
    const stationedAt = unloaded === null ? carrier.stationedAt : unloaded.outpost._id;
    await ctx.db.patch(carrier._id, { stationedAt });
    const here = { ...carrier, stationedAt };
    const stops = await stopsOf(ctx, here, tour, now);
    if (stops.length === 0) {
      await endTour(ctx, here, now, 'cut');
      continue;
    }
    const ahead = stops.filter((stop) => tour.stops.indexOf(stop._id) >= tour.next);
    const plan = visitPlan(
      here.load ?? emptyLoad(),
      ahead.map((stop) => ({ id: stop._id, ...depotOf(stop, now) })),
    );
    const next = tour.recalled === true ? undefined : plan.visit[0];
    const moved =
      next === undefined
        ? await leg(ctx, here, { kind: 'base' })
        : await (async () => {
            await ctx.db.patch(carrier._id, {
              tour: { ...tour, next: tour.stops.indexOf(next) + 1 },
            });
            return leg(ctx, here, { kind: 'stop', outpostId: next });
          })();
    if (!moved) await endTour(ctx, (await ctx.db.get(carrier._id))!, now, 'cut');
  }
}

/**
 * **De retour au chargement** : elle s'y pose, s'y recharge et repart — ou s'y arrête, rappelée.
 * Perdu entre-temps, le chargement la laisse au point atteint, et la tournée finit.
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
  for (const troopId of movement.troopIds) await atBase(ctx, troopId, now);
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
  if (jobId !== undefined) {
    try {
      await ctx.scheduler.cancel(jobId);
    } catch {
      // A running retry reads the tour again before acting.
    }
  }
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
  ctx: MutationCtx,
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
