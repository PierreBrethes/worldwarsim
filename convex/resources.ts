import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { RESOURCES, type ResourceKey } from '../src/domain/ids';
import { emptyStocks, exploits, settleStocks, type Conversion } from '../src/domain/economy';
import { playerBuildings, totalLevelOf } from './buildings';
import {
  BASE_CAP,
  CHAINS,
  EXTRACTION_PER_HOUR,
  STORAGE_CAP_PER_LEVEL,
  STORED_BY,
  type Costs,
} from './constants';
import { fail } from './errors';
import { regionFacts } from './regions';

export type { ResourceKey, Costs };

export async function resourceRows(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'resources'>>> {
  return ctx.db
    .query('resources')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

/**
 * What a nation produces every hour, read off the map rather than off a stored number: an
 * exploitation building only yields what the region under it holds, so a mine gives coal on a
 * coal deposit and ore on an ore one, and nothing at all on neither.
 */
export function extractionRates(
  buildings: ReadonlyArray<Doc<'buildings'>>,
): Record<ResourceKey, number> {
  const rates = emptyStocks();
  for (const building of buildings) {
    const deposit = regionFacts(building.regionId)?.deposit ?? null;
    if (deposit === null || !exploits(building.key, deposit)) continue;
    rates[deposit] += EXTRACTION_PER_HOUR[deposit] * building.level;
  }
  return rates;
}

export function storageCaps(
  buildings: ReadonlyArray<Doc<'buildings'>>,
): Record<ResourceKey, number> {
  const caps = emptyStocks();
  for (const key of RESOURCES) caps[key] = BASE_CAP;
  for (const store of ['warehouse', 'depot'] as const) {
    const raised = STORAGE_CAP_PER_LEVEL * totalLevelOf(buildings, store);
    for (const key of STORED_BY[store]) caps[key] += raised;
  }
  return caps;
}

export function chainsOf(buildings: ReadonlyArray<Doc<'buildings'>>): ReadonlyArray<Conversion> {
  return (Object.keys(CHAINS) as ReadonlyArray<keyof typeof CHAINS>)
    .map((key) => {
      const { output, inputs, perHourPerLevel } = CHAINS[key];
      return { output, inputs, perHour: perHourPerLevel * totalLevelOf(buildings, key) };
    })
    .filter((conversion) => conversion.perHour > 0);
}

export type Economy = {
  readonly rows: ReadonlyArray<Doc<'resources'>>;
  readonly stocks: Record<ResourceKey, number>;
  readonly ratePerHour: Record<ResourceKey, number>;
  readonly cap: Record<ResourceKey, number>;
};

/**
 * The whole economy brought up to `now`, without writing anything: this is what a query
 * serves and what a mutation checks before it spends. Accrual and transformation happen in
 * one call because they are one movement — see `settleStocks`.
 *
 * The eight rows share a single `updatedAt` because they are always written together; the
 * latest of them is taken, so a row left behind by a partial write can only under-produce.
 */
export async function economyOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  now: number,
): Promise<Economy> {
  const rows = await resourceRows(ctx, playerId);
  const buildings = await playerBuildings(ctx, playerId);

  const stored = emptyStocks();
  let updatedAt = now;
  for (const key of RESOURCES) {
    const row = rows.find((candidate) => candidate.key === key);
    if (!row) fail('MISSING_RESOURCE', { resource: key });
    stored[key] = row.stock;
    updatedAt = Math.min(updatedAt, row.updatedAt);
  }

  const ratePerHour = extractionRates(buildings);
  const cap = storageCaps(buildings);
  const stocks = settleStocks({
    stocks: stored,
    ratePerHour,
    cap,
    conversions: chainsOf(buildings),
    hours: (now - updatedAt) / 3_600_000,
  });

  return { rows, stocks, ratePerHour, cap };
}

/** What the client reads of one resource: the settled stock, floored, plus what it needs to
 *  keep extrapolating between two readings. */
export function snapshotOf(
  economy: Economy,
  key: ResourceKey,
): { stock: number; ratePerHour: number; cap: number } {
  return {
    stock: Math.floor(economy.stocks[key]),
    ratePerHour: economy.ratePerHour[key],
    cap: economy.cap[key],
  };
}

export const snapshotAll = (
  economy: Economy,
): Record<ResourceKey, { stock: number; ratePerHour: number; cap: number }> =>
  Object.fromEntries(RESOURCES.map((key) => [key, snapshotOf(economy, key)])) as Record<
    ResourceKey,
    { stock: number; ratePerHour: number; cap: number }
  >;

async function writeStocks(
  ctx: MutationCtx,
  economy: Economy,
  stocks: Record<ResourceKey, number>,
  now: number,
): Promise<void> {
  for (const row of economy.rows) {
    await ctx.db.patch(row._id, { stock: stocks[row.key], updatedAt: now });
  }
}

/**
 * Every cost is checked before any is debited: a partial spend would leave a player short of
 * coal without having received anything, and nothing here knows how to roll back.
 */
export async function debit(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  costs: Costs,
  now: number,
): Promise<void> {
  const economy = await economyOf(ctx, playerId, now);
  const remaining = { ...economy.stocks };

  for (const [key, cost] of Object.entries(costs) as ReadonlyArray<[ResourceKey, number]>) {
    if (economy.stocks[key] < cost) {
      fail('INSUFFICIENT_RESOURCE', {
        resource: key,
        needed: cost,
        available: Math.floor(economy.stocks[key]),
      });
    }
    remaining[key] -= cost;
  }

  await writeStocks(ctx, economy, remaining, now);
}

/** The refund of a cancelled batch. It respects the ceiling: returning alloy above what the
 *  warehouses hold would make it vanish at the next reading, better to clip it right away. */
export async function credit(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  gains: Costs,
  now: number,
): Promise<void> {
  const economy = await economyOf(ctx, playerId, now);
  const stocks = { ...economy.stocks };
  for (const [key, gain] of Object.entries(gains) as ReadonlyArray<[ResourceKey, number]>) {
    stocks[key] = Math.min(economy.cap[key], stocks[key] + gain);
  }
  await writeStocks(ctx, economy, stocks, now);
}
