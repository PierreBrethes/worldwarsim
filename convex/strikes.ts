import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { emptyStocks } from '../src/domain/economy';
import { RESOURCES, type ResourceKey } from '../src/domain/ids';
import { integrityOf, shelteredFromStrike, struckOf } from '../src/domain/integrity';
import { raidsStock, sparedPerResourceOf } from '../src/domain/loot';
import { resolveContact } from './combat';
import { movementsOf, pointOf, troopsCarriedBy, troopsStationedAt } from './movement/forces';
import { forgetMovement, walkHome } from './movement/arrival';
import { clipToStorage } from './resources';
import { scheduleRestore, settleBeforeChange } from './production';
import { takeHeap } from './heaps';
import { freezeQueue } from './troops';
import { dakarSparedAt } from './strategicPoints';

/**
 * **La frappe à son arrivée** (ADR 0046 §4). La cible se relit ici : l'ordre est parti sur le
 * relevé, et c'est le terrain qui dit qu'elle a été rasée, prise, désactivée ou mise à l'abri.
 * Puis la garnison tire la première, et si un bombardier tient encore, le bâtiment perd un cran.
 * La colonne rentre à son aérodrome dans tous les cas. Rend les joueurs dont le plateau a bougé.
 */
export async function arriveForStrike(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<ReadonlyArray<Id<'players'>>> {
  const strike = movement.strike!;
  const troops = await troopsCarriedBy(ctx, movement);
  const player = await ctx.db.get(movement.playerId);
  const target = player === null ? null : await standingTarget(ctx, player, strike.buildingId);
  const missed =
    target === null
      ? ('gone' as const)
      : integrityOf(target, now) === 'disabled'
        ? ('disabled' as const)
        : shelteredFromStrike(target, now)
          ? ('immune' as const)
          : null;
  if (target === null || missed !== null) {
    await ctx.db.insert('notices', {
      playerId: movement.playerId,
      at: now,
      kind: 'strikeFoundNothing',
      building: target?.key ?? strike.surveyed.key,
      regionId: target?.regionId ?? strike.surveyed.regionId,
      reason: missed ?? 'gone',
    });
    await flyHome(ctx, movement, troops, [], now);
    return [];
  }

  const garrison = await garrisonOf(ctx, target);
  let standing = troops;
  let survivors = troops;
  let routed: ReadonlyArray<Doc<'troops'>> = [];
  let routedCargo: Parameters<typeof walkHome>[4] = [];
  let combatId: Id<'engagements'> | null = null;
  if (garrison.length > 0) {
    const pass = await resolveContact(ctx, {
      seasonId: movement.seasonId,
      attacker: { playerId: movement.playerId, troops },
      defender: { playerId: target.playerId, troops: garrison },
      cause: 'arrival',
      point: movement.to,
      hostCountry: movement.hostCountry,
      outpostId: null,
      disabledUntil: null,
      at: now,
      mode: 'defence',
    });
    combatId = pass.engagementId;
    const stateOf = new Map(pass.engagement.outcomes.map((one) => [one.id, one.state]));
    standing = troops.filter((troop) => stateOf.get(troop._id) === 'standing');
    survivors = troops.filter((troop) => stateOf.get(troop._id) !== 'destroyed');
    routed = pass.routed;
    routedCargo = pass.routedCargo;
  }

  const struck = standing.some((troop) => troop.role === 'bomber')
    ? await strikeBuilding(ctx, target, now)
    : null;
  await ctx.db.insert('notices', {
    playerId: movement.playerId,
    at: now,
    kind: 'strikeDelivered',
    building: target.key,
    regionId: target.regionId,
    notch: struck?.integrity ?? null,
    destroyed: troops.length - survivors.length,
    combatId,
  });
  if (struck !== null)
    await ctx.db.insert('notices', {
      playerId: target.playerId,
      at: now,
      kind: 'buildingStruck',
      building: target.key,
      regionId: target.regionId,
      integrity: struck.integrity,
      restoresAt: struck.restoresAt,
      ...(struck.storageLost === null ? {} : { storageLost: struck.storageLost }),
    });

  await flyHome(
    ctx,
    movement,
    survivors.filter((troop) => !routed.some((one) => one._id === troop._id)),
    routed,
    now,
    routedCargo,
  );
  return garrison.length > 0 ? [target.playerId] : [];
}

/** **Encore debout, et encore à un autre** : rasé ou pris par le frappeur lui-même, il n'y a plus
 *  rien à frapper (`gone`). Son état, lui, se lit à part : la dépêche dit pourquoi. */
async function standingTarget(
  ctx: MutationCtx,
  player: Doc<'players'>,
  buildingId: Id<'buildings'>,
): Promise<Doc<'buildings'> | null> {
  const building = await ctx.db.get(buildingId);
  return building === null ||
    building.seasonId !== player.seasonId ||
    building.playerId === player._id
    ? null
    : building;
}

/** **Les troupes posées sur le bâtiment**, et elles seules : ni un camp voisin, ni une colonne
 *  partie de là, qui garde son adresse en marchant. */
async function garrisonOf(
  ctx: MutationCtx,
  target: Doc<'buildings'>,
): Promise<Array<Doc<'troops'>>> {
  const marching = new Set(
    (await movementsOf(ctx, target.playerId)).flatMap((movement) => movement.troopIds),
  );
  return (await troopsStationedAt(ctx, target._id)).filter(
    (troop) => troop.playerId === target.playerId && !marching.has(troop._id),
  );
}

/**
 * **Un cran de moins** (ADR 0046 §4). Endommagé ne change rien à ce que le bâtiment fait ; désactivé,
 * il cesse de produire et de stocker, comme sous le sabotage : les stocks se règlent d'abord à
 * l'ancienne forme, le tas s'écrit à l'instant où son débit tombe, et le retour se planifie.
 */
async function strikeBuilding(
  ctx: MutationCtx,
  target: Doc<'buildings'>,
  now: number,
): Promise<{
  readonly integrity: 'damaged' | 'disabled';
  readonly restoresAt: number;
  readonly storageLost: Record<ResourceKey, number> | null;
} | null> {
  const dates = struckOf(target, now);
  if (dates === null) return null;
  if (!('disabledUntil' in dates)) {
    await ctx.db.patch(target._id, dates);
    return { integrity: 'damaged', restoresAt: dates.damagedUntil, storageLost: null };
  }

  const before = await settleBeforeChange(ctx, target.seasonId, now);
  const heap = before.heaps[target._id];
  if (heap !== undefined) await takeHeap(ctx, target, heap, 0, now);
  await ctx.db.patch(target._id, dates);
  /** **Dakar** : ce que le rognage laisse au teneur, la même lecture que le pillage (`completePresence`). */
  const spared = (await dakarSparedAt(ctx, target)) ?? sparedPerResourceOf(false);
  const storageLost = raidsStock(target.key)
    ? await clipToStorage(ctx, target.playerId, now, spared)
    : emptyStocks();
  if (target.key === 'barracks') await freezeQueue(ctx, target._id, now);
  await scheduleRestore(ctx, target.seasonId, dates.disabledUntil);
  return {
    integrity: 'disabled',
    restoresAt: dates.disabledUntil,
    storageLost: RESOURCES.some((key) => storageLost[key] > 0) ? storageLost : null,
  };
}

async function flyHome(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  winners: ReadonlyArray<Doc<'troops'>>,
  beaten: ReadonlyArray<Doc<'troops'>>,
  now: number,
  cargo: Parameters<typeof walkHome>[4] = [],
): Promise<void> {
  await walkHome(ctx, { winners, beaten }, pointOf(movement.to), now, cargo);
  await forgetMovement(ctx, movement._id);
}
