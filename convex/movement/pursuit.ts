/**
 * **La poursuite d'une Blitz** (B18, lot 5) : l'attaque vise une unité, la colonne la suit et
 * frappe au contact. Aucune horloge globale : chaque poursuite tient **un** rendez-vous daté
 * (`movements.pursuit.checkAt`) — le contact prévu s'il tombe avant le pas, sinon le pas — et à
 * chaque regard elle frappe, abandonne, ou recourbe sa route vers la position de la cible.
 */

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { contactAt, passModeOf, pursuitVerdict } from '../../src/domain/blitz';
import { distanceKm, type LonLat } from '../../src/domain/geo';
import { positionAt, type MarchingForce } from '../../src/domain/interception';
import { landCostOf, routeModeOf } from '../../src/domain/movement-orders';
import {
  ARRIVAL_RADIUS_KM,
  PURSUIT_STEP_SECONDS,
  RELOAD_SECONDS_BY_ROLE,
  detectionRangeOf,
} from '../constants';
import { resolveContact } from '../combat';
import { fail } from '../errors';
import { hostAtPoint, routeBetween } from '../routes';
import { forgetMovement, standAt } from './arrival';
import { marchingForce, reassessDetection } from './detection';
import { asPoint, movementsOf, pointOf, stanceOf, troopsCarriedBy } from './forces';
import { pacedMinutes } from './pace';

/** Where the hunted troop stands now, and the thread it walks if it walks. */
type Quarry = {
  readonly troop: Doc<'troops'>;
  readonly point: LonLat;
  readonly force: MarchingForce;
  readonly movement: Doc<'movements'> | null;
};

async function quarryNow(
  ctx: QueryCtx,
  troopId: Id<'troops'>,
  now: number,
): Promise<Quarry | null> {
  const troop = await ctx.db.get(troopId);
  if (troop === null) return null;
  const movement =
    (await movementsOf(ctx, troop.playerId)).find((one) => one.troopIds.includes(troopId)) ?? null;
  if (movement !== null) {
    const force = marchingForce(movement);
    return { troop, point: positionAt(force, now), force, movement };
  }
  const stance = await stanceOf(ctx, troop.stationedAt);
  if (stance === null) return null;
  return {
    troop,
    point: stance.point,
    force: { id: troop._id, points: [stance.point], departedAt: now, arrivesAt: now },
    movement: null,
  };
}

/** **Ce que le joueur voit, et rien de plus** : la fenêtre de son relevé sur le fil, ou le camp
 *  qu'il tient pour présent. Le brouillard décide de l'abandon, pas une portée inventée ici. */
async function inSight(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  quarry: Quarry,
  now: number,
): Promise<boolean> {
  if (quarry.movement !== null) {
    const movementId = quarry.movement._id;
    return (
      await ctx.db
        .query('sightings')
        .withIndex('byMovement', (q) => q.eq('movementId', movementId))
        .collect()
    ).some(
      (row) =>
        row.playerId === playerId && row.frozen === undefined && row.from <= now && now <= row.to,
    );
  }
  return (
    await ctx.db
      .query('campSightings')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect()
  ).some(
    (row) =>
      row.ownerId === quarry.troop.playerId &&
      row.until === null &&
      distanceKm(pointOf(row.point), quarry.point) <= 1,
  );
}

/**
 * **La troupe qu'un ordre de Blitz vise**, lue sur le relevé du joueur : un camp encore en vue,
 * ou un fil dont la fenêtre est ouverte. Un souvenir n'est pas une cible — on poursuit ce qu'on
 * voit.
 */
export async function quarryOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  target:
    | { readonly kind: 'camp'; readonly campId: Id<'campSightings'> }
    | { readonly kind: 'sighting'; readonly sightingId: Id<'sightings'> },
  now: number,
): Promise<{ readonly troopId: Id<'troops'>; readonly point: LonLat }> {
  if (target.kind === 'sighting') {
    const row = await ctx.db.get(target.sightingId);
    const movement = row === null ? null : await ctx.db.get(row.movementId);
    const troopId = movement?.troopIds[0];
    if (
      row === null ||
      row.playerId !== playerId ||
      row.frozen !== undefined ||
      row.from > now ||
      row.to < now ||
      movement === null ||
      troopId === undefined
    )
      fail('NOTHING_TO_ATTACK');
    return { troopId, point: positionAt(marchingForce(movement), now) };
  }
  const camp = await ctx.db.get(target.campId);
  if (camp === null || camp.playerId !== playerId || camp.until !== null) fail('NOTHING_TO_ATTACK');
  const marching = new Set(
    (await movementsOf(ctx, camp.ownerId)).flatMap((movement) => movement.troopIds),
  );
  for (const troop of await ctx.db
    .query('troops')
    .withIndex('byPlayer', (q) => q.eq('playerId', camp.ownerId))
    .collect()) {
    if (marching.has(troop._id)) continue;
    const stance = await stanceOf(ctx, troop.stationedAt);
    if (stance !== null && distanceKm(stance.point, pointOf(camp.point)) <= 1)
      return { troopId: troop._id, point: stance.point };
  }
  fail('NOTHING_TO_ATTACK');
}

/** Le prochain regard : le contact s'il tombe avant le pas, le pas sinon — et jamais deux. */
export async function schedulePursuit(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  if (movement.pursuit === undefined) return;
  const quarry = await quarryNow(ctx, movement.pursuit.troopId, now);
  const step = Math.min(movement.arrivesAt, now + PURSUIT_STEP_SECONDS * 1000);
  const contact =
    quarry === null
      ? null
      : contactAt(
          marchingForce(movement),
          quarry.force,
          ARRIVAL_RADIUS_KM,
          now,
          Math.max(now, step),
        );
  /** Une seconde au moins : une colonne déjà au bout de sa route ne se réveille pas en boucle. */
  const checkAt = Math.max(now + 1000, contact ?? step);
  await ctx.db.patch(movement._id, { pursuit: { ...movement.pursuit, checkAt } });
  await ctx.scheduler.runAt(checkAt, internal.movements.pursue, {
    movementId: movement._id,
    expectedAt: checkAt,
  });
}

export async function pursue(
  ctx: MutationCtx,
  movementId: Id<'movements'>,
  expectedAt: number,
): Promise<void> {
  const movement = await ctx.db.get(movementId);
  if (movement?.pursuit === undefined || movement.pursuit.checkAt !== expectedAt) return;
  const now = Date.now();
  const hunters = await troopsCarriedBy(ctx, movement);
  if (hunters.length === 0) {
    await forgetMovement(ctx, movement._id, now);
    return;
  }
  const at = positionAt(marchingForce(movement), now);
  const quarry = await quarryNow(ctx, movement.pursuit.troopId, now);
  const gapKm = quarry === null ? Infinity : distanceKm(at, quarry.point);
  const seen =
    quarry !== null &&
    (gapKm <= detectionRangeOf(hunters.map((troop) => troop.role)) ||
      (await inSight(ctx, movement.playerId, quarry, now)));
  const verdict =
    quarry === null ? 'lost' : pursuitVerdict({ gapKm, seen, reachKm: ARRIVAL_RADIUS_KM });

  if (verdict === 'strike') await strike(ctx, movement, hunters, quarry!, at, now);
  else if (verdict === 'lost') await loseSight(ctx, movement, now);
  else {
    if (distanceKm(quarry!.point, pointOf(movement.to)) > ARRIVAL_RADIUS_KM) {
      if (!(await bendTowards(ctx, movement, hunters, at, quarry!.point, now))) {
        await loseSight(ctx, movement, now);
        return;
      }
      await reassessDetection(ctx, movement.seasonId, now);
    }
    await schedulePursuit(ctx, (await ctx.db.get(movement._id))!, now);
  }
}

/** **Le fil se recourbe** : la route repart d'où la colonne est, vers où la cible est. */
async function bendTowards(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  hunters: ReadonlyArray<Doc<'troops'>>,
  from: LonLat,
  to: LonLat,
  now: number,
): Promise<boolean> {
  const roles = hunters.map((troop) => troop.role);
  const route = routeBetween(from, to, routeModeOf(roles), landCostOf(roles));
  if (route === null) return false;
  const minutes = await pacedMinutes(ctx, movement.playerId, route, now);
  await ctx.db.patch(movement._id, {
    from: asPoint(from),
    to: asPoint(to),
    target: { kind: 'point', point: asPoint(to) },
    hostCountry: hostAtPoint(to),
    points: route.points.map(asPoint),
    legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
    distanceUnits: route.distanceUnits,
    costUnits: route.costUnits,
    landCost: route.landCost,
    departedAt: now,
    arrivesAt: now + minutes * 60_000,
  });
  return true;
}

/** **Perdue de vue** : la colonne finit sa route jusqu'à la dernière position connue, et s'y
 *  pose comme une marche. */
async function loseSight(ctx: MutationCtx, movement: Doc<'movements'>, now: number): Promise<void> {
  await ctx.db.patch(movement._id, { type: 'march', pursuit: undefined });
  await ctx.scheduler.runAt(Math.max(now, movement.arrivesAt), internal.movements.arrive, {
    movementId: movement._id,
  });
  await ctx.db.insert('notices', {
    playerId: movement.playerId,
    at: now,
    kind: 'pursuitLost',
    hostCountry: movement.hostCountry,
    point: movement.to,
  });
}

/**
 * **Au contact, une passe** : à l'initiative, ou en **choc** si la cible chargeait le poursuivant
 * (B17). Chacun se pose où il est, et qui a frappé sur ordre recharge (B19) ; la riposte non.
 */
async function strike(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  hunters: ReadonlyArray<Doc<'troops'>>,
  quarry: Quarry,
  at: LonLat,
  now: number,
): Promise<void> {
  const mode = passModeOf(movement.troopIds, quarry.movement?.pursuit?.troopId ?? null);
  const { engagement } = await resolveContact(ctx, {
    seasonId: movement.seasonId,
    attacker: { playerId: movement.playerId, troops: hunters },
    defender: { playerId: quarry.troop.playerId, troops: [quarry.troop] },
    cause: 'arrival',
    point: asPoint(at),
    hostCountry: hostAtPoint(at),
    outpostId: null,
    disabledUntil: null,
    at: now,
    mode,
    blitz: true,
  });
  const standing = new Set(
    engagement.outcomes
      .filter((outcome) => outcome.state !== 'destroyed')
      .map((outcome) => outcome.id),
  );
  const reload = async (troop: Doc<'troops'>) => {
    if (standing.has(troop._id))
      await ctx.db.patch(troop._id, {
        reloadUntil: now + RELOAD_SECONDS_BY_ROLE[troop.role] * 1000,
      });
  };

  await standAt(ctx, (await ctx.db.get(movement._id))!, asPoint(at));
  for (const troop of hunters) await reload(troop);
  await forgetMovement(ctx, movement._id, now);

  const theirs = quarry.movement === null ? null : await ctx.db.get(quarry.movement._id);
  if (theirs !== null) {
    if (mode === 'shock') {
      await standAt(ctx, theirs, asPoint(quarry.point));
      await reload(quarry.troop);
      await forgetMovement(ctx, theirs._id, now);
    } else if (!theirs.troopIds.some((troopId) => standing.has(troopId))) {
      await forgetMovement(ctx, theirs._id, now);
    }
  }
  await reassessDetection(ctx, movement.seasonId, now);
}
