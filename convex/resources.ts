import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { RESOURCES, type BuildingKey, type DepositKey, type ResourceKey } from '../src/domain/ids';
import {
  EXPLOITED_DEPOSITS,
  emptyStocks,
  exploits,
  settleStocks,
  type ChainReport,
  type Conversion,
} from '../src/domain/economy';
import { playerBuildings, totalLevelOf } from './buildings';
import {
  BASE_CAP,
  CHAINS,
  EXTRACTION_PER_HOUR,
  STORAGE_CAP_PER_LEVEL,
  STORED_BY,
  isCommanded,
  type ChainKey,
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
 * One exploitation building and what it actually pulls out. `deposit` is what the *region*
 * holds, not what the building takes from it: a mine standing over oil reads "pétrole, 0/h",
 * which is a mistake a player must be able to see. A mute building is not an absent one.
 */
export type ExtractionSite = {
  readonly key: BuildingKey;
  readonly regionId: string;
  readonly level: number;
  readonly deposit: DepositKey | null;
  readonly perHour: number;
};

export function extractionSites(
  buildings: ReadonlyArray<Doc<'buildings'>>,
): ReadonlyArray<ExtractionSite> {
  return buildings
    .filter((building) => EXPLOITED_DEPOSITS[building.key] !== undefined)
    .map((building) => {
      const deposit = regionFacts(building.regionId)?.deposit ?? null;
      const yielding = deposit !== null && exploits(building.key, deposit);
      return {
        key: building.key,
        regionId: building.regionId,
        level: building.level,
        deposit,
        perHour: yielding ? EXTRACTION_PER_HOUR[deposit] * building.level : 0,
      };
    });
}

/**
 * What a nation produces every hour, read off the map rather than off a stored number: an
 * exploitation building only yields what the region under it holds, so a mine gives coal on a
 * coal deposit and ore on an ore one, and nothing at all on neither.
 *
 * It sums the sites rather than walking the buildings a second time: the national rate and the
 * per-site detail are the same numbers, and two readings of "does this building yield" would
 * let the industry window disagree with the stock it explains.
 */
export function extractionRates(
  buildings: ReadonlyArray<Doc<'buildings'>>,
): Record<ResourceKey, number> {
  const rates = emptyStocks();
  for (const site of extractionSites(buildings)) {
    if (site.deposit !== null) rates[site.deposit] += site.perHour;
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

/** A lot as the settlement reads it, whether it comes from the table or from a settled copy. */
export type OrderState = {
  readonly chain: BuildingKey;
  readonly ordered: number;
  readonly produced: number;
};

/**
 * The three chains, standing or not. A chain nobody built settles at zero all the same — it
 * is `settleStocks` that shrugs it off — and keeping it in the list is what lets the industry
 * window print it extinguished: an absent chain is information, an absent line is a hole.
 *
 * A commanded chain carries what is left of its lot as a quota; the others carry `null`, which
 * is not the same as zero — see `Conversion.quota`. A commanded chain with no row is therefore
 * at zero: silent until asked, which is the whole decision.
 */
export function chainsOf(
  buildings: ReadonlyArray<Doc<'buildings'>>,
  orders: ReadonlyArray<OrderState>,
): ReadonlyArray<Conversion> {
  return (Object.keys(CHAINS) as ReadonlyArray<ChainKey>).map((key) => {
    const { output, inputs, perHourPerLevel } = CHAINS[key];
    const lot = orders.find((order) => order.chain === key);
    return {
      by: key,
      output,
      inputs,
      perHour: perHourPerLevel * totalLevelOf(buildings, key),
      quota: isCommanded(key) ? Math.max(0, (lot?.ordered ?? 0) - (lot?.produced ?? 0)) : null,
    };
  });
}

export type SettledOrder = OrderState & { readonly row: Doc<'orders'> };

export type Economy = {
  readonly rows: ReadonlyArray<Doc<'resources'>>;
  readonly stocks: Record<ResourceKey, number>;
  readonly ratePerHour: Record<ResourceKey, number>;
  readonly cap: Record<ResourceKey, number>;
  readonly chains: ReadonlyArray<ChainReport>;
  /** The standing lots, advanced to `now` like the stocks — never as stored. */
  readonly orders: ReadonlyArray<SettledOrder>;
};

/**
 * The window the chains are diagnosed over. The one just settled cannot serve: a player who
 * just paid for a construction reads zero minutes, where nothing was asked of any chain and
 * every one of them would report as running. An hour ahead of the settled stocks answers the
 * question actually being asked — *why is my alloy not rising* — in the present tense.
 */
export const OUTLOOK_HOURS = 1;

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
  const orderRows = await ordersOf(ctx, playerId);
  const settled = settleStocks({
    stocks: stored,
    ratePerHour,
    cap,
    conversions: chainsOf(buildings, orderRows),
    hours: (now - updatedAt) / 3_600_000,
  });

  /**
   * A lot advances by exactly what the settlement made, never by elapsed time: if the alloy
   * ran out halfway through the night, the lot is that much less far along, and the two
   * figures cannot drift because only one of them was ever computed.
   */
  const madeBy = new Map(settled.chains.map((report) => [report.conversion.by, report.made]));
  const orders = orderRows.map((row) => ({
    row,
    chain: row.chain,
    ordered: row.ordered,
    produced: Math.min(row.ordered, row.produced + (madeBy.get(row.chain) ?? 0)),
  }));

  // Projected, never written: only its verdict is kept. Same function, same arbitration —
  // raising a chain's rate moves the stocks and the diagnosis together or neither. It reads
  // the *settled* lots, so a batch that just finished reports as awaiting an order, not as
  // running for one more hour.
  const outlook = settleStocks({
    stocks: settled.stocks,
    ratePerHour,
    cap,
    conversions: chainsOf(buildings, orders),
    hours: OUTLOOK_HOURS,
  });

  return { rows, stocks: settled.stocks, ratePerHour, cap, chains: outlook.chains, orders };
}

export async function ordersOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'orders'>>> {
  return ctx.db
    .query('orders')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

/**
 * The largest lot the input reserve allows, in units of output — the only ceiling the slider
 * has. It reads the stocks settled to `now`, not the outlook: a player orders against what he
 * holds, not against what he will hold in an hour.
 */
export function maxOrderOf(economy: Economy, chain: BuildingKey): number {
  const report = economy.chains.find((candidate) => candidate.conversion.by === chain);
  if (report === undefined) return 0;
  const limit = report.conversion.inputs.reduce(
    (least, [key, quantity]) => Math.min(least, Math.floor(economy.stocks[key] / quantity)),
    Number.POSITIVE_INFINITY,
  );
  return Number.isFinite(limit) ? Math.max(0, limit) : 0;
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

/**
 * The stocks and the lots are banked together because they were settled together: writing one
 * without the other would let a mutation re-settle the same hour of arsenal output at the next
 * reading, or bank ammunition against a lot that never advanced.
 */
async function writeStocks(
  ctx: MutationCtx,
  economy: Economy,
  stocks: Record<ResourceKey, number>,
  now: number,
): Promise<void> {
  for (const row of economy.rows) {
    await ctx.db.patch(row._id, { stock: stocks[row.key], updatedAt: now });
  }
  for (const order of economy.orders) {
    if (order.produced !== order.row.produced) {
      await ctx.db.patch(order.row._id, { produced: order.produced });
    }
  }
}

/** Bring a player up to `now` and write it down, spending nothing. What every mutation that
 *  changes the shape of the economy — a lot placed, a lot cancelled — owes the reading before
 *  it: otherwise the new shape would be applied retroactively to the hours already elapsed. */
export async function settle(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  now: number,
): Promise<Economy> {
  const economy = await economyOf(ctx, playerId, now);
  await writeStocks(ctx, economy, economy.stocks, now);
  return economy;
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
