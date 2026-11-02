/**
 * **Le Fort retient, il ne bloque pas** (ADR 0037 §6). Une colonne adverse qui entre dans la vigie
 * d'un Fort voit son arrivée rechiffrée à cet instant, et repart de là plus lente sur tout le reste
 * de sa route (la reprise, décision du 02/11). Le départ n'en sait rien : le rendez-vous à l'entrée
 * se tient sur la ligne du mouvement, et chaque réévaluation du brouillard le replace.
 */

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { distanceKm } from '../../src/domain/geo';
import {
  distanceProgressAt,
  positionAt,
  timeShareAt,
  type MarchingForce,
  type Watcher,
} from '../../src/domain/interception';
import { fortWatches, lookoutKmOf } from '../../src/domain/outposts';
import { fortEntryOf, heldMinutes } from '../../src/domain/route-timing';
import { COST_BY_MEDIUM } from '../../src/domain/routing';
import { seenSegment } from '../../src/domain/sighting-segment';
import { isRangoonColumn } from '../../src/domain/strategic-points';
import { journalUrl, push } from '../../src/domain/push';
import { sightingReachKm } from '../constants';
import { notifyPlayer } from '../notifications';
import { hostAtPoint } from '../routes';
import { cancelJob } from '../scheduledJobs';
import { seasonStillPlays } from '../seats';
import { holdsPoint } from '../strategicPoints';
import { marchingForce, reassessDetection } from './detection';
import { asPoint, pointOf, seasonOutposts } from './forces';
import { liaisonRelaysOf } from './pace';

export type Fort = Watcher & { readonly playerId: Id<'players'> };

/**
 * **Le rendez-vous de chaque colonne à l'entrée d'un Fort adverse**, relu sur le plateau que la
 * réévaluation vient de lire : ses Forts qui guettent (un Fort sans charbon ne retient rien), à
 * la portée où ils relèvent cette colonne. Une ligne qui ne change pas ne s'écrit pas ; un job
 * remplacé s'annule d'abord (#146). Une colonne reprise ou arrêtée à la frontière n'est plus
 * retenue.
 */
export async function reassessForts(
  ctx: MutationCtx,
  board: {
    readonly mobileById: ReadonlyMap<
      Id<'movements'>,
      {
        readonly movement: Doc<'movements'>;
        readonly force: MarchingForce;
        readonly rangoonTour: boolean;
      }
    >;
    readonly forts: ReadonlyArray<Fort>;
  },
  now: number,
): Promise<void> {
  for (const { movement, force, rangoonTour } of board.mobileById.values()) {
    if (movement.resumed !== undefined) continue;
    /** Arrêtée à la frontière par un repos, la colonne ne marche plus : rien ne l'attend. */
    if (movement.heldAt !== undefined) {
      if (movement.fortEntry === undefined) continue;
      await cancelJob(ctx, movement.fortEntry.jobId);
      await ctx.db.patch(movement._id, { fortEntry: undefined });
      continue;
    }
    const forts = board.forts
      .filter((fort) => fort.playerId !== movement.playerId)
      .map((fort) => ({ ...fort, radiusKm: sightingReachKm(fort.radiusKm, rangoonTour) }));
    const at = fortEntryOf(force, forts, now);
    if (at === (movement.fortEntry?.at ?? null)) continue;
    if (movement.fortEntry !== undefined) await cancelJob(ctx, movement.fortEntry.jobId);
    await ctx.db.patch(movement._id, {
      fortEntry:
        at === null
          ? undefined
          : {
              at,
              jobId: await ctx.scheduler.runAt(at, internal.movements.holdAtFort, {
                movementId: movement._id,
                expectedAt: at,
              }),
            },
    });
  }
}

/**
 * **À l'entrée, la règle se relit** (invariant « Échéance ») : les Forts qui guettent encore
 * couvrent-ils la colonne ? Si oui, l'arrivée est repoussée de ce que tous les Forts adverses
 * ajoutent au reste de la route, ses liaisons lues à l'instant ; la colonne reprend de là, l'arrivée
 * se replanifie (l'ancien job passe sans rien faire, `arrive`), et chacun reçoit sa dépêche.
 */
export async function holdAtFort(
  ctx: MutationCtx,
  movementId: Id<'movements'>,
  expectedAt: number,
): Promise<void> {
  const movement = await ctx.db.get(movementId);
  if (movement?.fortEntry?.at !== expectedAt) return;
  const now = Date.now();
  if (now < expectedAt || !(await seasonStillPlays(ctx, movement.playerId))) return;

  const force = marchingForce(movement);
  const here = positionAt(force, now);
  const forts = await fortsOnWatch(ctx, movement, now);
  const holders = forts.filter((fort) => distanceKm(here, fort.point) <= fort.radiusKm);
  if (holders.length === 0 || now >= movement.arrivesAt) {
    await ctx.db.patch(movementId, { fortEntry: undefined });
    /** Un Fort plus loin sur la route prend le rendez-vous suivant. */
    await reassessDetection(ctx, movement.seasonId, now, movement.playerId);
    return;
  }

  const minutes = heldMinutes({
    route: {
      points: force.points,
      legs: movement.legs,
      landCost: movement.landCost ?? COST_BY_MEDIUM.land,
    },
    forts,
    relays: await liaisonRelaysOf(ctx, movement.playerId, now),
    fromShare: distanceProgressAt(force, now),
  });
  const arrivesAt = movement.arrivesAt + minutes * 60_000;
  await ctx.db.patch(movementId, {
    arrivesAt,
    resumed: { at: now, share: timeShareAt(force, now) },
    fortEntry: undefined,
  });
  /** Le plein se compte depuis l'arrêt, comme au départ. */
  for (const troopId of movement.troopIds) await ctx.db.patch(troopId, { fuelAt: arrivesAt });
  await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  /** **L'attaquant apprend le point d'entrée, jamais celui du Fort.** */
  await ctx.db.insert('notices', {
    playerId: movement.playerId,
    at: now,
    kind: 'fortSlowed',
    hostCountry: hostAtPoint(here),
    point: asPoint(here),
    arrivesAt,
  });
  await reassessDetection(ctx, movement.seasonId, now, movement.playerId);

  const held = marchingForce((await ctx.db.get(movementId))!);
  const rows = await ctx.db
    .query('sightings')
    .withIndex('byMovement', (q) => q.eq('movementId', movementId))
    .collect();
  for (const owner of new Set(holders.map((fort) => fort.playerId))) {
    const row = rows.find((sighting) => sighting.playerId === owner);
    const seen = seenSegment(held, row?.from ?? now, row?.to ?? arrivesAt);
    await ctx.db.insert('notices', {
      playerId: owner,
      at: now,
      kind: 'fortHeld',
      hostCountry: holders.find((fort) => fort.playerId === owner)!.hostCountry,
      point: asPoint(here),
      headingDegrees: seen.headingDegrees,
      arrivesAt,
    });
    if (row !== undefined && row.noticeFiled !== true) {
      if (row.revealJobId !== undefined) await cancelJob(ctx, row.revealJobId);
      await ctx.db.patch(row._id, { noticeFiled: true, revealJobId: undefined });
    }
    await notifyPlayer(ctx, owner, {
      type: 'sighting',
      phrase: push.sighting,
      url: journalUrl,
      at: now,
    });
  }
}

/** Les Forts adverses qui guettent à cet instant, à la portée où ils relèvent cette colonne. */
async function fortsOnWatch(ctx: MutationCtx, movement: Doc<'movements'>, now: number) {
  const rangoonTour = await onRangoonTour(ctx, movement);
  const silent = new Map<Id<'players'>, boolean>();
  const forts: Array<Fort & { readonly hostCountry: string }> = [];
  for (const outpost of await seasonOutposts(ctx, movement.seasonId)) {
    if (outpost.playerId === movement.playerId) continue;
    if (!silent.has(outpost.playerId)) {
      const player = await ctx.db.get(outpost.playerId);
      silent.set(outpost.playerId, player?.irregular === true || player?.listeningSilent === true);
    }
    if (!fortWatches(outpost, now, silent.get(outpost.playerId)!)) continue;
    forts.push({
      id: outpost._id,
      point: pointOf(outpost.point),
      radiusKm: sightingReachKm(lookoutKmOf(outpost), rangoonTour),
      playerId: outpost.playerId,
      hostCountry: outpost.hostCountry,
    });
  }
  return forts;
}

/** **Rangoun** : une tournée de son teneur ne se relève qu'à une part de portée, comme sur le
 *  plateau du brouillard (`allOnRangoonTour`). */
async function onRangoonTour(ctx: MutationCtx, movement: Doc<'movements'>): Promise<boolean> {
  const troops = await Promise.all(movement.troopIds.map((troopId) => ctx.db.get(troopId)));
  return (
    isRangoonColumn(troops, (troop) => troop?.tour !== undefined) &&
    (await holdsPoint(ctx, { _id: movement.playerId, seasonId: movement.seasonId }, 'rangoon'))
  );
}
