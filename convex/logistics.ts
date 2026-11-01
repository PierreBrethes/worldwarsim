import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import {
  addLoads,
  deliverRefusalOf,
  deliveryOf,
  airdropOnSquad,
  airdropRefusalOf,
  emptyLoad,
  carriersAmong,
  hullsAmong,
  squadTarget,
  takeAcross,
  loadRefusalOf,
  type Busy,
  type LoadingPlace,
  type SupplyLoad,
} from '../src/domain/logistics';
import { canonicalBuildingKey } from '../src/domain/ids';
import { suppliesOf } from '../src/domain/supplies';
import { isStanding } from '../src/domain/outposts';
import { isBlitz } from './blitz';
import { upkeepOf } from './upkeep';
import { depotCapacity } from './constants';
import { fail } from './errors';
import { forgetMovement, walkHome } from './movement/arrival';
import { movementsOf, pointOf, seatedOf, standingPile } from './movement/forces';
import { aimOf, march, troopsAmong } from './movement/orders';
import { debit, economyOf } from './resources';
import { playerOf, requirePlayable } from './seats';
import { resupply, takeFromDepot } from './supplies';
import { LON_LAT, MOVEMENT_ORIGIN, RESOURCE_KEY } from './validators';

/**
 * **La logistique passe par les pièces** (ADR 0028 §4, Mondiale seule) : on charge un transport
 * là où il se charge, on le lâche sur un de ses avant-postes, il décharge et rentre seul. Les
 * règles sont celles de `src/domain/logistics.ts`, que la main lit avant le lâcher.
 */

/** Là où se tient la troupe, pour charger : un de mes bâtiments, un de mes avant-postes debout. */
export async function placeOf(
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
  return troop.tour !== undefined ? 'touring' : marching ? 'underway' : null;
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
    const taken = Math.floor(amount);
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

/** **Le dépôt d'un de mes points**, tel que les refus de livraison et de tournée le lisent. */
export const depotOf = (outpost: Doc<'outposts'>, now: number) => ({
  level: outpost.level,
  standing: isStanding(outpost, now),
  depot: outpost.depot ?? emptyLoad(),
  capacity: depotCapacity(outpost.level),
});

/** **Les coques d'une colonne** : toute troupe qui n'est pas à bord d'une autre. Un largage
 *  n'en tolère que des avions de transport (`airdropRefusalOf`). */
const hullsOf = (troops: ReadonlyArray<Doc<'troops'>>): Array<Doc<'troops'>> => {
  const hulls = new Set(hullsAmong(troops.map(seatedOf)).map((troop) => troop.id));
  return troops.filter((troop) => hulls.has(troop._id));
};

/** Les transports d'une colonne, ceux qui ne sont pas à bord d'un autre. */
const carriersOf = (troops: ReadonlyArray<Doc<'troops'>>): Array<Doc<'troops'>> => {
  const hulls = new Set(carriersAmong(troops.map(seatedOf)).map((troop) => troop.id));
  return troops.filter((troop) => hulls.has(troop._id));
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
    const refusal = deliverRefusalOf(
      carriersOf(await troopsAmong(ctx, player._id, troopIds)),
      depotOf(outpost, Date.now()),
    );
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
 * **Décharger au dépôt** : chaque transport de la colonne dépose ce qui tient, dans l'ordre des
 * identifiants, et garde le reste à bord ; ce qu'il portait d'autre y reste en garnison et s'y
 * recharge. `null` : le point n'est plus à moi, ou n'est plus debout.
 */
export async function unloadAt(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<{
  readonly outpost: Doc<'outposts'>;
  readonly carriers: ReadonlyArray<Doc<'troops'>>;
  readonly delivered: SupplyLoad;
  readonly kept: SupplyLoad;
} | null> {
  const outpost = await ctx.db.get(movement.delivery!.outpostId);
  if (outpost === null || outpost.playerId !== movement.playerId || !isStanding(outpost, now))
    return null;
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
    await ctx.db.patch(rider._id, {
      stationedAt: outpost._id,
      carriedBy: undefined,
      facing: undefined,
    });
  await forgetMovement(ctx, movement._id, now);
  const ids = (list: ReadonlyArray<Doc<'troops'>>) => list.map((one) => one._id);
  await resupply(
    ctx,
    movement.playerId,
    await troopsAmong(ctx, movement.playerId, ids(riders)),
    now,
  );
  return {
    outpost,
    carriers: await troopsAmong(ctx, movement.playerId, ids(carriers)),
    delivered,
    kept,
  };
}

/**
 * **À l'arrivée d'une livraison** : décharger, le dire, et rentrer seul — un retour, sans slot ni
 * plein. `false` : le point est perdu ou tombé, et la colonne arrive comme une marche.
 */
export async function arriveToDeliver(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<boolean> {
  const unloaded = await unloadAt(ctx, movement, now);
  if (unloaded === null) return false;
  await ctx.db.insert('notices', {
    playerId: movement.playerId,
    at: now,
    kind: 'supplyDelivered',
    hostCountry: unloaded.outpost.hostCountry,
    point: unloaded.outpost.point,
    delivered: unloaded.delivered,
    kept: unloaded.kept,
  });
  await walkHome(ctx, { winners: unloaded.carriers, beaten: [] }, pointOf(movement.to), now);
  return true;
}

/** **Mes escouades posées en ce point**, telles que le largage les lit : ancrées ou non, et ce
 *  qu'elles portent de coups et de plein. Une troupe en marche n'y est plus. */
async function squadAt(
  ctx: QueryCtx,
  playerId: Doc<'players'>['_id'],
  point: { readonly lon: number; readonly lat: number },
  now: number,
) {
  const { storeOf } = await upkeepOf(ctx, playerId, now);
  const troops = await standingPile(ctx, playerId, point);
  return {
    troops,
    target: squadTarget(
      troops.map((troop) => ({
        id: troop._id as string,
        role: troop.role,
        supplies: suppliesOf(troop),
        anchored: storeOf[troop._id] !== undefined,
      })),
    ),
  };
}

/**
 * **Larguer** (ADR 0028 §4) : l'avion chargé ne se pose pas. Il part sur un de mes avant-postes,
 * escale ou non, ou sur une de mes escouades isolées ; il paie le plein de l'aller-retour, lâche
 * son paquet à l'arrivée et rentre seul. Un mouvement, avec son slot, que l'on relève et que l'on
 * intercepte comme un ravitaillement.
 */
export const airdrop = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    target: v.union(
      v.object({ kind: v.literal('outpost'), outpostId: v.id('outposts') }),
      v.object({ kind: v.literal('squad'), point: LON_LAT }),
    ),
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, target }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    if (await isBlitz(ctx, seasonId)) fail('NOT_IN_BLITZ');
    const now = Date.now();
    const hulls = hullsOf(await troopsAmong(ctx, player._id, troopIds));
    let refusal;
    if (target.kind === 'outpost') {
      const outpost = await ctx.db.get(target.outpostId);
      if (outpost === null || outpost.playerId !== player._id)
        fail('UNKNOWN_OUTPOST', { outpostId: target.outpostId });
      const { standing, depot, capacity } = depotOf(outpost, now);
      refusal = airdropRefusalOf(hulls, { kind: 'outpost', standing, depot, capacity });
    } else
      refusal = airdropRefusalOf(hulls, (await squadAt(ctx, player._id, target.point, now)).target);
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
      aim: await aimOf(
        ctx,
        player._id,
        target.kind === 'outpost'
          ? { kind: 'outpost', outpostId: target.outpostId }
          : { kind: 'point', point: target.point },
      ),
      airdrop:
        target.kind === 'outpost' ? { outpostId: target.outpostId } : { point: target.point },
    });
  },
});

/**
 * **À l'arrivée d'un largage** : le paquet descend sur le dépôt, ou sur l'escouade qui s'y tient
 * encore, et l'avion rentre seul sans s'être posé. Un point perdu, une escouade partie ou déjà
 * pleine : rien ne descend, la charge reste à bord, et la dépêche le dit.
 */
export async function arriveToAirdrop(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  const flight = movement.airdrop;
  if (flight === undefined || flight.leg !== 'out') return;
  const troops = await troopsAmong(ctx, movement.playerId, movement.troopIds);
  const carriers = carriersOf(troops).sort((a, b) => (a._id < b._id ? -1 : 1));
  const loads = carriers.map((carrier) => carrier.load ?? emptyLoad());
  const packet = loads.reduce(addLoads, emptyLoad());
  let delivered = emptyLoad();
  let hostCountry = movement.hostCountry;
  const outpost = 'outpostId' in flight ? await ctx.db.get(flight.outpostId) : null;
  const mine = outpost !== null && outpost.playerId === movement.playerId ? outpost : null;
  const squad = 'point' in flight ? await squadAt(ctx, movement.playerId, flight.point, now) : null;
  /** La règle de l'ordre, relue à l'arrivée : un point perdu, une escouade partie, ancrée ou
   *  pleine, et rien ne descend. */
  const refusal = airdropRefusalOf(
    hullsOf(troops),
    mine !== null ? { kind: 'outpost', ...depotOf(mine, now) } : (squad?.target ?? squadTarget([])),
  );
  if (refusal === null && mine !== null) {
    const { moved } = deliveryOf(packet, mine.depot ?? emptyLoad(), depotCapacity(mine.level));
    delivered = moved;
    await ctx.db.patch(mine._id, { depot: addLoads(mine.depot ?? emptyLoad(), moved) });
    hostCountry = mine.hostCountry;
  } else if (refusal === null && squad !== null) {
    const { taken, supplies } = airdropOnSquad(packet, squad.target.troops);
    delivered = taken;
    for (const troop of squad.troops) {
      const filled = supplies.get(troop._id);
      if (filled !== undefined)
        await ctx.db.patch(troop._id, { rounds: filled.rounds, fuel: filled.fuel });
    }
  }
  const left = takeAcross(loads, delivered);
  for (const [index, carrier] of carriers.entries())
    await ctx.db.patch(carrier._id, { load: left[index]! });
  await ctx.db.insert('notices', {
    playerId: movement.playerId,
    at: now,
    kind: 'airdropped',
    hostCountry,
    point: movement.to,
    delivered,
    kept: left.reduce(addLoads, emptyLoad()),
    ...(squad === null ? {} : { squad: true }),
  });
  await forgetMovement(ctx, movement._id, now);
  /** **L'avion ne se pose pas** : dont la base est tombée en son absence rentre à l'ancre la plus
   *  proche, comme une troupe en déroute, plutôt que de rester sur le point largué. */
  const flying = await troopsAmong(ctx, movement.playerId, movement.troopIds);
  const homeless = new Set<Id<'troops'>>();
  for (const troop of flying) {
    const id =
      typeof troop.stationedAt === 'string'
        ? ctx.db.normalizeId('buildings', troop.stationedAt)
        : null;
    const base = id === null ? null : await ctx.db.get(id);
    if (id !== null && (base === null || base.playerId !== movement.playerId))
      homeless.add(troop._id);
  }
  const back = await walkHome(
    ctx,
    {
      winners: flying.filter((troop) => !homeless.has(troop._id)),
      beaten: flying.filter((troop) => homeless.has(troop._id)),
    },
    pointOf(movement.to),
    now,
  );
  for (const movementId of back)
    await ctx.db.patch(movementId, { airdrop: { leg: 'back' as const } });
}
