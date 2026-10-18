import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { STRATEGIC_POINTS, STRATEGIC_POINT_KEYS } from '../src/domain/strategic-points';
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
