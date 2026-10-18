import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import {
  addLoads,
  deliverRefusalOf,
  deliveryOf,
  emptyLoad,
  loadCapacityOf,
  loadRefusalOf,
  type Busy,
  type LoadingPlace,
} from '../src/domain/logistics';
import { canonicalBuildingKey } from '../src/domain/ids';
import { isStanding } from '../src/domain/outposts';
import { carrierIn } from '../src/domain/troops';
import { isBlitz } from './blitz';
import { depotCapacity } from './constants';
import { fail } from './errors';
import { forgetMovement, walkHome } from './movement/arrival';
import { movementsOf, pointOf, seatedOf } from './movement/forces';
import { aimOf, march, troopsAmong } from './movement/orders';
import { debit, economyOf } from './resources';
import { playerOf, requirePlayable } from './seats';
import { resupply, takeFromDepot } from './supplies';
import { MOVEMENT_ORIGIN, RESOURCE_KEY } from './validators';

/**
 * **La logistique passe par les pièces** (ADR 0028 §4, Mondiale seule) : on charge un transport
 * là où il se charge, on le lâche sur un de ses avant-postes, il décharge et rentre seul. Les
 * règles sont celles de `src/domain/logistics.ts`, que la main lit avant le lâcher.
 */

/** Là où se tient la troupe, pour charger : un de mes bâtiments, un de mes avant-postes debout. */
async function placeOf(
  ctx: QueryCtx,
  troop: Doc<'troops'>,
  now: number,
): Promise<
  | { readonly place: LoadingPlace & { kind: 'building' } }
  | { readonly place: LoadingPlace & { kind: 'outpost' }; readonly outpost: Doc<'outposts'> }
  | { readonly place: { kind: 'elsewhere' } }
> {
  const address = troop.stationedAt;
  if (typeof address === 'string') {
    const buildingId = ctx.db.normalizeId('buildings', address);
    const building = buildingId === null ? null : await ctx.db.get(buildingId);
    if (building !== null && building.playerId === troop.playerId)
      return { place: { kind: 'building', key: canonicalBuildingKey(building.key) } };
    const outpostId = ctx.db.normalizeId('outposts', address);
    const outpost = outpostId === null ? null : await ctx.db.get(outpostId);
    if (outpost !== null && outpost.playerId === troop.playerId && isStanding(outpost, now))
      return { place: { kind: 'outpost', level: outpost.level }, outpost };
  }
  return { place: { kind: 'elsewhere' } };
}

/** En route, ou en tournée : un transport occupé ne se charge pas à la main. */
export async function busyOf(ctx: QueryCtx, troop: Doc<'troops'>): Promise<Busy> {
  const marching = (await movementsOf(ctx, troop.playerId)).some((movement) =>
    movement.troopIds.includes(troop._id),
  );
  return marching ? 'underway' : null;
}

/**
 * **Charger** : des jetons glissés sur un transport. Sur le sol national ils viennent du plateau
 * personnel, à un avant-poste de son dépôt.
 */
export const load = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    troopId: v.id('troops'),
    resource: RESOURCE_KEY,
    amount: v.number(),
  },
  handler: async (ctx, { token, seasonId, troopId, resource, amount }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    if (await isBlitz(ctx, seasonId)) fail('NOT_IN_BLITZ');
    const troop = await ctx.db.get(troopId);
    if (troop === null || troop.playerId !== player._id) fail('UNKNOWN_TROOP', { troopId });
    const taken = Math.max(0, Math.floor(amount));
    const now = Date.now();
    const at = await placeOf(ctx, troop, now);
    const held = troop.load ?? emptyLoad();
    const key = resource as keyof typeof held;
    const store =
      'outpost' in at
        ? ((at.outpost.depot ?? emptyLoad())[key] ?? 0)
        : at.place.kind === 'building'
          ? (await economyOf(ctx, player._id, now)).stocks[resource]
          : 0;
    const refusal = loadRefusalOf({
      role: troop.role,
      place: at.place,
      busy: await busyOf(ctx, troop),
      held,
      resource,
      amount: taken,
      store,
    });
    if (refusal !== null) {
      const { code, ...details } = refusal;
      fail(code, details);
    }
    const cost = { ...emptyLoad(), [key]: taken };
    if ('outpost' in at) await takeFromDepot(ctx, at.outpost._id, cost);
    else await debit(ctx, player._id, cost, now);
    await ctx.db.patch(troopId, { load: addLoads(held, cost) });
    return { load: addLoads(held, cost) };
  },
});

/** Les transports d'une colonne, ceux qui ne sont pas à bord d'un autre. */
const carriersOf = (troops: ReadonlyArray<Doc<'troops'>>): Array<Doc<'troops'>> => {
  const column = troops.map(seatedOf);
  return troops.filter(
    (troop) => loadCapacityOf(troop.role) > 0 && carrierIn(seatedOf(troop), column) === null,
  );
};

/**
 * **Livrer** : le transport chargé part pour un de mes avant-postes. C'est un mouvement, qui
 * prend un slot et paie son plein ; ses passagers y restent en garnison.
 */
export const deliver = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    outpostId: v.id('outposts'),
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, outpostId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    if (await isBlitz(ctx, seasonId)) fail('NOT_IN_BLITZ');
    const outpost = await ctx.db.get(outpostId);
    if (outpost === null || outpost.playerId !== player._id) fail('UNKNOWN_OUTPOST', { outpostId });
    const refusal = deliverRefusalOf(carriersOf(await troopsAmong(ctx, player._id, troopIds)), {
      level: outpost.level,
      standing: isStanding(outpost, Date.now()),
      depot: outpost.depot ?? emptyLoad(),
      capacity: depotCapacity(outpost.level),
    });
    if (refusal !== null) {
      const { code, ...details } = refusal;
      fail(code, details);
    }
    return march(ctx, {
      playerId: player._id,
      season,
      type: 'march',
      origin,
      troopIds,
      aim: await aimOf(ctx, player._id, { kind: 'outpost', outpostId }),
      delivery: { outpostId },
    });
  },
});

/**
 * **À l'arrivée d'une livraison** : chaque transport décharge dans la limite du dépôt, dans
 * l'ordre des identifiants, garde à bord ce qui ne tient pas, et rentre seul — un retour, sans
 * slot ni plein. Ce qu'il portait d'autre reste en garnison. `false` : le point n'est plus à moi
 * ou n'est plus debout, et la colonne arrive comme une marche.
 */
export async function arriveToDeliver(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<boolean> {
  const outpost = await ctx.db.get(movement.delivery!.outpostId);
  if (outpost === null || outpost.playerId !== movement.playerId || !isStanding(outpost, now))
    return false;
  const troops = await troopsAmong(ctx, movement.playerId, movement.troopIds);
  const carriers = carriersOf(troops).sort((a, b) => (a._id < b._id ? -1 : 1));
  const capacity = depotCapacity(outpost.level);
  let depot = outpost.depot ?? emptyLoad();
  let delivered = emptyLoad();
  let kept = emptyLoad();
  for (const carrier of carriers) {
    const unloaded = deliveryOf(carrier.load ?? emptyLoad(), depot, capacity);
    depot = addLoads(depot, unloaded.moved);
    delivered = addLoads(delivered, unloaded.moved);
    kept = addLoads(kept, unloaded.kept);
    await ctx.db.patch(carrier._id, { load: unloaded.kept });
  }
  await ctx.db.patch(outpost._id, { depot });
  const riders = troops.filter((troop) => !carriers.some((carrier) => carrier._id === troop._id));
  for (const rider of riders)
    await ctx.db.patch(rider._id, { stationedAt: outpost._id, carriedBy: undefined });
  await ctx.db.insert('notices', {
    playerId: movement.playerId,
    at: now,
    kind: 'supplyDelivered',
    hostCountry: outpost.hostCountry,
    point: outpost.point,
    delivered,
    kept,
  });
  await forgetMovement(ctx, movement._id, now);
  await resupply(
    ctx,
    movement.playerId,
    await troopsAmong(
      ctx,
      movement.playerId,
      riders.map((one) => one._id),
    ),
    now,
  );
  await walkHome(
    ctx,
    {
      winners: await troopsAmong(
        ctx,
        movement.playerId,
        carriers.map((one) => one._id),
      ),
      beaten: [],
    },
    pointOf(movement.to),
    now,
  );
  return true;
}
