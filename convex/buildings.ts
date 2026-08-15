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

/** Level 1 is the floor: every building exists from the launch, none can be absent. */
export const levelOf = (buildings: ReadonlyArray<Doc<'buildings'>>, key: BuildingKey): number =>
  buildings.find((building) => building.key === key)?.level ?? 1;

export async function buildingLevel(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  key: BuildingKey,
): Promise<number> {
  return levelOf(await playerBuildings(ctx, playerId), key);
}

/**
 * The HQ caps the others: nothing rises above it. The rule lived twice — once as a guard in
 * `constructions.start`, once as a flag in `view.playerView` — and two copies of a rule are
 * two chances to raise one without the other, which would grey out a button the server still
 * accepts, or the reverse.
 */
export const cappedByHq = (key: BuildingKey, level: number, hqLevel: number): boolean =>
  key !== 'hq' && level >= hqLevel;
