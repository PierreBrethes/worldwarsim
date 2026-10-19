import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { canonicalBuildingKey, type BuildingKey } from '../src/domain/ids';

// A completed legacy queue entry changes its building key, never its paid tariff.
export const buildingCostKey = (building: Doc<'buildings'>): BuildingKey =>
  building.costKey ?? building.key;

/** A raided site is out of service until its date has passed: the one bound every reading uses. */
export const inService = (disabledUntil: number | null | undefined, now: number): boolean =>
  disabledUntil == null || disabledUntil < now;

export const activeBuildings = (
  buildings: ReadonlyArray<Doc<'buildings'>>,
  now: number,
): Array<Doc<'buildings'>> =>
  buildings.filter((building) => inService(building.disabledUntil, now));

export async function playerBuildings(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'buildings'>>> {
  return ctx.db
    .query('buildings')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

/**
 * **Every building of one season, and of no other.** The single door for the readings that are
 * not about a player — the ground a defence answers from, the stations that listen — so that the
 * season filter is written once instead of at each call site. Several seasons stand at the same
 * time (`schema.ts`), and an unfiltered sweep here is a nation of another game defending this one.
 */
export async function seasonBuildings(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'buildings'>>> {
  return ctx.db
    .query('buildings')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
}

/**
 * **Level 0 means absent.** A building is put up on a region or it does not exist (ADR 0015) —
 * the old floor of 1, which made every building exist from the launch, is gone. A key held on
 * several regions answers with its best instance: the headquarters cap and the tier gates read
 * the strongest one, never a sum of unrelated sites.
 */
export const levelOf = (buildings: ReadonlyArray<Doc<'buildings'>>, key: BuildingKey): number =>
  buildings.reduce(
    (best, building) =>
      canonicalBuildingKey(building.key) === canonicalBuildingKey(key)
        ? Math.max(best, building.level)
        : best,
    0,
  );

/**
 * What a family of buildings is worth altogether. **A ceiling adds up over sites** — storage
 * reads this. What reads the best instance
 * alone is `levelOf`: the headquarters cap and the tier gates, which are gates, not ceilings.
 *
 * The comment used to claim the opposite while `resources.ts` already summed. Summing is the
 * decision: it is what makes a second site an alternative to a taller one.
 */
export const totalLevelOf = (
  buildings: ReadonlyArray<Doc<'buildings'>>,
  key: BuildingKey,
): number =>
  buildings.reduce(
    (sum, building) =>
      canonicalBuildingKey(building.key) === canonicalBuildingKey(key) ? sum + building.level : sum,
    0,
  );

export async function buildingLevel(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  key: BuildingKey,
): Promise<number> {
  return levelOf(await playerBuildings(ctx, playerId), key);
}

/** Two written points are one place: a point is copied whole from row to row, never recomputed. */
export const samePoint = (
  a: { readonly lon: number; readonly lat: number },
  b: { readonly lon: number; readonly lat: number },
): boolean => a.lon === b.lon && a.lat === b.lat;

/** **The building of this family standing at this very point** — what a raise names (ADR 0029). */
export const buildingAt = (
  buildings: ReadonlyArray<Doc<'buildings'>>,
  key: BuildingKey,
  point: { readonly lon: number; readonly lat: number },
): Doc<'buildings'> | undefined =>
  buildings.find(
    (building) =>
      canonicalBuildingKey(building.key) === canonicalBuildingKey(key) &&
      samePoint(building.point, point),
  );

/**
 * The HQ caps the others: nothing rises above it. The rule lived twice — once as a guard in
 * `constructions.start`, once as a flag in `view.playerView` — and two copies of a rule are
 * two chances to raise one without the other, which would grey out a button the server still
 * accepts, or the reverse.
 *
 * With no headquarters at all — `hqLevel` 0 — it blocks everything but the headquarters. That
 * used to make the first construction of a season the HQ without a rule saying so; the HQ now
 * stands at level 1 from the launch (ADR 0015), so a launched season never reads that branch.
 * It stays because a destroyed capital would.
 */
export const cappedByHq = (key: BuildingKey, level: number, hqLevel: number): boolean =>
  key !== 'hq' && level >= hqLevel;
