import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import type { BuildingKey } from '../src/domain/ids';

export type { BuildingKey };

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
 * **Level 0 means absent.** A building is put up on a region or it does not exist (ADR 0015) —
 * the old floor of 1, which made every building exist from the launch, is gone. A key held on
 * several regions answers with its best instance: the headquarters cap and the tier gates read
 * the strongest one, never a sum of unrelated sites.
 */
export const levelOf = (buildings: ReadonlyArray<Doc<'buildings'>>, key: BuildingKey): number =>
  buildings.reduce((best, building) => (building.key === key ? Math.max(best, building.level) : best), 0);

/** What a family of buildings is worth altogether — the measure an output adds up over sites,
 *  where a ceiling reads only the best one. */
export const totalLevelOf = (buildings: ReadonlyArray<Doc<'buildings'>>, key: BuildingKey): number =>
  buildings.reduce((sum, building) => (building.key === key ? sum + building.level : sum), 0);

export async function buildingLevel(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  key: BuildingKey,
): Promise<number> {
  return levelOf(await playerBuildings(ctx, playerId), key);
}

export const buildingAt = (
  buildings: ReadonlyArray<Doc<'buildings'>>,
  key: BuildingKey,
  regionId: string,
): Doc<'buildings'> | undefined =>
  buildings.find((building) => building.key === key && building.regionId === regionId);

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
