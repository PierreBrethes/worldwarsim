import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { carryCapacityOf, lootFromSurplus } from '../src/domain/loot';
import {
  BASE_CAP,
  CARRY_CAPACITY_BY_ROLE,
  PLUNDER_DISABLED_HOURS,
  PLUNDER_HOURS_PRESENT,
} from './constants';
import { resolveContact } from './combat';
import { plunderTargetAt } from './movement/orders';
import { defenceOf, pointOf, troopsCarriedBy } from './movement/forces';
import { forgetMovement, walkHome } from './movement/arrival';
import { clipToStorage, debit, economyOf } from './resources';
import { scheduleRestore, settleBeforeChange } from './production';
import { regionFacts } from './regions';
import { seasonStillPlays } from './seasons';

const targetAt = async (
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<Doc<'buildings'> | null> => {
  const buildingId = movement.plunder?.buildingId;
  if (buildingId === undefined) return null;
  const player = await ctx.db.get(movement.playerId);
  return player === null ? null : plunderTargetAt(ctx, player, buildingId, now);
};

const returnEmpty = async (
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  now: number,
) => {
  await walkHome(ctx, { winners: troops, beaten: [] }, pointOf(movement.to), now);
  await forgetMovement(ctx, movement._id);
};

async function startPresence(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  troopIds: ReadonlyArray<Id<'troops'>>,
  now: number,
  engagementId: Id<'engagements'> | null,
): Promise<void> {
  const until = now + PLUNDER_HOURS_PRESENT * 3_600_000;
  await ctx.db.patch(movement._id, {
    troopIds: [...troopIds],
    from: movement.to,
    points: [movement.to],
    legs: [],
    distanceUnits: 0,
    costUnits: 0,
    departedAt: now,
    arrivesAt: until,
    plunder: {
      phase: 'presence',
      buildingId: movement.plunder!.buildingId,
      until,
      engagementId,
    },
  });
  await ctx.scheduler.runAt(until, internal.movements.completePlunderPresence, {
    movementId: movement._id,
    expectedAt: until,
  });
}

export async function arriveForPlunder(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  if (movement.plunder?.phase !== 'outbound') return;
  const target = await targetAt(ctx, movement, now);
  const troops = await troopsCarriedBy(ctx, movement);
  if (target === null || !troops.some((troop) => troop.role === 'infantry')) {
    await returnEmpty(ctx, movement, troops, now);
    return;
  }

  const defence = await defenceOf(ctx, movement);
  if (defence !== null) {
    const { engagementId, engagement, routed } = await resolveContact(ctx, {
      seasonId: movement.seasonId,
      attacker: { playerId: movement.playerId, troops },
      defender: { playerId: defence.playerId, troops: defence.troops },
      cause: 'arrival',
      point: movement.to,
      hostCountry: movement.hostCountry,
      outpostId: defence.outpostId,
      disabledUntil: null,
      at: now,
    });
    void engagementId;
    const stateOf = new Map(engagement.outcomes.map((outcome) => [outcome.id, outcome.state]));
    const standing = troops.filter((troop) => stateOf.get(troop._id) === 'standing');
    if (engagement.winner === 'attacker' && standing.some((troop) => troop.role === 'infantry')) {
      await walkHome(ctx, { winners: [], beaten: routed }, pointOf(movement.to), now);
      await startPresence(
        ctx,
        movement,
        standing.map((troop) => troop._id),
        now,
        engagementId,
      );
      return;
    }
    const survivors = troops.filter((troop) => stateOf.get(troop._id) !== 'destroyed');
    await walkHome(ctx, { winners: survivors, beaten: routed }, pointOf(movement.to), now);
    await forgetMovement(ctx, movement._id);
    return;
  }

  await startPresence(
    ctx,
    movement,
    troops.map((troop) => troop._id),
    now,
    null,
  );
}

export async function completePresence(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  expectedAt: number,
): Promise<void> {
  if (
    movement.plunder?.phase !== 'presence' ||
    movement.plunder.until !== expectedAt ||
    !(await seasonStillPlays(ctx, movement.playerId))
  ) {
    return;
  }

  const now = expectedAt;
  const troops = await troopsCarriedBy(ctx, movement);
  const target = await targetAt(ctx, movement, now);
  if (target === null || !troops.some((troop) => troop.role === 'infantry')) {
    await returnEmpty(ctx, movement, troops, now);
    return;
  }

  await settleBeforeChange(ctx, movement.seasonId, now);
  const victim = await economyOf(ctx, target.playerId, now);
  const taken = lootFromSurplus(
    victim.stocks,
    BASE_CAP,
    carryCapacityOf(
      troops.map((troop) => ({
        role: troop.role,
        strength: troop.currentStrength,
        nominalStrength: troop.nominalStrength,
      })),
      CARRY_CAPACITY_BY_ROLE,
    ),
  );
  await debit(ctx, target.playerId, taken, now);

  const disabledUntil = now + PLUNDER_DISABLED_HOURS * 3_600_000;
  await ctx.db.patch(target._id, { disabledUntil });
  const storageLost = await clipToStorage(ctx, target.playerId, now);
  const reportId = await ctx.db.insert('plunderReports', {
    seasonId: movement.seasonId,
    attackerId: movement.playerId,
    defenderId: target.playerId,
    buildingId: target._id,
    building: target.key,
    regionId: target.regionId,
    hostCountry: regionFacts(target.regionId)?.country ?? movement.hostCountry,
    at: now,
    disabledUntil,
    engagementId: movement.plunder.engagementId,
    taken,
    storageLost,
  });
  const [returnMovementId] = await walkHome(
    ctx,
    { winners: troops, beaten: [] },
    pointOf(movement.to),
    now,
    { playerId: movement.playerId, loot: taken, plunderReportId: reportId },
  );
  if (returnMovementId !== undefined) await ctx.db.patch(reportId, { returnMovementId });
  await forgetMovement(ctx, movement._id);
  await scheduleRestore(ctx, movement.seasonId, disabledUntil);
}
