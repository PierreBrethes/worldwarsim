import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { accruedStock } from '../src/domain/off-season';
import type { ResourceKey } from '../src/domain/ids';
import { fail } from './errors';

export type { ResourceKey };
export type Costs = Readonly<Record<ResourceKey, number>>;

const KEYS: ReadonlyArray<ResourceKey> = ['supply', 'steel', 'manpower'];

export async function resourceRows(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'resources'>>> {
  return ctx.db
    .query('resources')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

export async function resourceRow(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  key: ResourceKey,
) {
  const rows = await resourceRows(ctx, playerId);
  const row = rows.find((candidate) => candidate.key === key);
  if (!row) fail('MISSING_RESOURCE', { resource: key });
  return row;
}

/**
 * What a resource looks like to the client: the stock accrued up to `now`, floored, plus
 * what the interface needs to keep extrapolating on its own. Both surfaces that serve
 * resources — the board view and the workshop — had their own copy of this; they now read
 * the same one, so a rounding rule cannot differ between two screens showing one stock.
 */
export function resourceSnapshot(
  rows: ReadonlyArray<Doc<'resources'>>,
  key: ResourceKey,
  now: number,
): { stock: number; ratePerHour: number; cap: number | null } {
  const row = rows.find((candidate) => candidate.key === key);
  if (!row) fail('MISSING_RESOURCE', { resource: key });
  return {
    stock: Math.floor(accruedStock(row, now, row.cap ?? undefined)),
    ratePerHour: row.ratePerHour,
    cap: row.cap,
  };
}

/**
 * All three stocks are checked before any is debited: a partial spend would leave a player
 * short of supply without having received anything, and nothing here knows how to roll back.
 */
export async function debit(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  costs: Costs,
  now: number,
): Promise<void> {
  const rows = await ctx.db
    .query('resources')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();

  const planned = KEYS.map((key) => {
    const row = rows.find((candidate) => candidate.key === key);
    if (!row) fail('MISSING_RESOURCE', { resource: key });
    const available = accruedStock(row, now, row.cap ?? undefined);
    const cost = costs[key];
    if (available < cost) {
      fail('INSUFFICIENT_RESOURCE', {
        resource: key,
        needed: cost,
        available: Math.floor(available),
      });
    }
    return { row, remaining: available - cost };
  });

  for (const { row, remaining } of planned) {
    await ctx.db.patch(row._id, { stock: remaining, updatedAt: now });
  }
}

/**
 * The refund of a cancelled batch. It respects the cap: returning manpower above conscription
 * would make it vanish at the next computation, better to clip it right away.
 */
export async function credit(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  gains: Costs,
  now: number,
): Promise<void> {
  const rows = await ctx.db
    .query('resources')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();

  for (const key of KEYS) {
    const row = rows.find((candidate) => candidate.key === key);
    if (!row) fail('MISSING_RESOURCE', { resource: key });
    const cap = row.cap ?? undefined;
    const returned = accruedStock(row, now, cap) + gains[key];
    await ctx.db.patch(row._id, {
      stock: cap === undefined ? returned : Math.min(returned, cap),
      updatedAt: now,
    });
  }
}
