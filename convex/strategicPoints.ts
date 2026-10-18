import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  RACE_HOLD_HOURS,
  STRATEGIC_POINTS,
  STRATEGIC_POINT_KEYS,
  raceLeaderOf,
} from '../src/domain/strategic-points';
import { regionAtRoutePoint } from './regionGeometry';
import { seatsOf } from './seats';

/**
 * **Les sept, posés neutres au lancement d'une Mondiale** (P11), et annoncés à toute la table —
 * la une des Sept au jour 0. Chacun sur la région de son lieu, lue sur la même grille que la
 * route : c'est elle que la prise colore.
 */
export async function layOut(ctx: MutationCtx, seasonId: Id<'seasons'>, at: number): Promise<void> {
  for (const seat of await seatsOf(ctx, seasonId)) {
    await ctx.db.insert('notices', { playerId: seat._id, at, kind: 'pointsDrawn' });
  }
  for (const key of STRATEGIC_POINT_KEYS) {
    const [lon, lat] = STRATEGIC_POINTS[key];
    const regionId = regionAtRoutePoint([lon, lat]);
    if (regionId === null) continue;
    await ctx.db.insert('strategicPoints', {
      seasonId,
      key,
      regionId,
      point: { lon, lat },
      holderId: null,
      heldSince: null,
    });
  }
}

export const seasonPoints = (
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<ReadonlyArray<Doc<'strategicPoints'>>> =>
  ctx.db
    .query('strategicPoints')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();

/**
 * **Ce que tout le monde lit d'un point** (P2) : son teneur et depuis quand, et s'il est contesté
 * — jamais par qui. La table est publique : la lire ne perce aucun brouillard.
 */
export async function pointsView(ctx: QueryCtx, seasonId: Id<'seasons'>) {
  const contested = new Set(
    (
      await ctx.db
        .query('captures')
        .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
        .collect()
    ).flatMap((capture) =>
      capture.target.kind === 'point' && capture.stoppedAt === undefined
        ? [capture.target.pointId as string]
        : [],
    ),
  );
  const points = await seasonPoints(ctx, seasonId);
  const holders = new Map<string, Doc<'players'> | null>();
  for (const point of points) {
    if (point.holderId !== null && !holders.has(point.holderId)) {
      holders.set(point.holderId, await ctx.db.get(point.holderId));
    }
  }
  return points.map((point) => {
    const holder = point.holderId === null ? null : (holders.get(point.holderId) ?? null);
    return {
      id: point._id,
      key: point.key,
      regionId: point.regionId,
      point: [point.point.lon, point.point.lat] as const,
      holder: holder === null ? null : { nation: holder.nation ?? holder.nickname },
      heldSince: point.heldSince,
      contested: contested.has(point._id),
    };
  });
}

/**
 * **Un point change de teneur** (P1-P3) : les heures de l'ancien teneur se rangent dans son cumul
 * (M12), le nouveau le tient dès maintenant — ou personne, quand son teneur est éliminé — et la
 * course se recompte.
 */
export async function handOver(
  ctx: MutationCtx,
  point: Doc<'strategicPoints'>,
  holderId: Id<'players'> | null,
  now: number,
): Promise<void> {
  if (point.holderId !== null && point.heldSince !== null) {
    const former = await ctx.db.get(point.holderId);
    if (former !== null) {
      await ctx.db.patch(former._id, {
        pointMs: (former.pointMs ?? 0) + (now - point.heldSince),
      });
    }
  }
  await ctx.db.patch(point._id, { holderId, heldSince: holderId === null ? null : now });
  await tallyRace(ctx, point.seasonId, now);
}

/**
 * **Le compte à rebours des 24 h** (M1, P3) : il part quand un joueur atteint quatre points,
 * repart à zéro s'il passe sous la barre, et `race.closeRace` le relit à l'échéance — un seul
 * meneur à la fois, donc un seul compte à rebours.
 */
async function tallyRace(ctx: MutationCtx, seasonId: Id<'seasons'>, now: number): Promise<void> {
  const counts = new Map<Id<'players'>, number>();
  for (const point of await seasonPoints(ctx, seasonId)) {
    if (point.holderId !== null) counts.set(point.holderId, (counts.get(point.holderId) ?? 0) + 1);
  }
  const leader = raceLeaderOf(counts);
  const season = await ctx.db.get(seasonId);
  if (season === null || leader === (season.raceLeaderId ?? null)) return;
  if (leader === null) {
    await ctx.db.patch(seasonId, { raceLeaderId: undefined, raceSince: undefined });
    return;
  }
  await ctx.db.patch(seasonId, { raceLeaderId: leader, raceSince: now });
  await ctx.scheduler.runAt(now + RACE_HOLD_HOURS * 3_600_000, internal.race.closeRace, {
    seasonId,
    since: now,
  });
}

/** Les heures de points qu'un joueur a tenues jusqu'à `now`, cumul et points tenus encore. */
export const heldMsOf = (
  player: Doc<'players'>,
  points: ReadonlyArray<Doc<'strategicPoints'>>,
  now: number,
): number =>
  (player.pointMs ?? 0) +
  points.reduce(
    (sum, point) =>
      point.holderId === player._id && point.heldSince !== null
        ? sum + (now - point.heldSince)
        : sum,
    0,
  );
