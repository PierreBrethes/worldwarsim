import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { RESOURCES } from '../src/domain/ids';
import type { ResourceAmounts } from '../src/domain/loot';
import type { TroopAddress } from './movement/forces';

type StationedLoad = {
  readonly seasonId: Id<'seasons'>;
  readonly playerId: Id<'players'>;
  readonly troopIds: ReadonlyArray<Id<'troops'>>;
  readonly stationedAt: TroopAddress;
  readonly loot: ResourceAmounts;
  readonly plunderReportId?: Id<'plunderReports'>;
};

/** Zero is a reportable result of an expedition, but it is not cargo to preserve. */
export async function stationLoot(
  ctx: MutationCtx,
  load: StationedLoad,
): Promise<Id<'stationedLoot'> | null> {
  if (!RESOURCES.some((key) => load.loot[key] > 0)) return null;
  return ctx.db.insert('stationedLoot', {
    ...load,
    troopIds: [...load.troopIds],
  });
}

export async function stationMovementLoot(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  stationedAt: TroopAddress,
): Promise<Id<'stationedLoot'> | null> {
  if (movement.loot === undefined) return null;
  return stationLoot(ctx, {
    seasonId: movement.seasonId,
    playerId: movement.playerId,
    troopIds: movement.troopIds,
    stationedAt,
    loot: movement.loot,
    ...(movement.plunderReportId === undefined
      ? {}
      : { plunderReportId: movement.plunderReportId }),
  });
}
