import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { FirstSteps } from '../src/domain/first-steps';

type Marks = {
  readonly journalReadAt: number | null;
  readonly telegraphReadAt: number | null;
  readonly telegraphPushedAt: number | null;
  readonly telegraphDirectReadAt: Readonly<Record<string, number>>;
  readonly boardRead: {
    readonly at: number;
    readonly stocks: Readonly<Record<string, number>>;
  } | null;
  readonly firstSteps: FirstSteps;
};

/**
 * **Ce qu'un joueur a lu, hors de sa place.** Ces trois heures vivaient sur `players`, que toute
 * vue de la saison lit (les sièges, les encres, le sol national) : fermer son journal réveillait
 * donc le plateau de tous les autres pour leur resservir la même chose. Ici, seul le lecteur de
 * sa propre ligne est réveillé — le même raisonnement que `presences`.
 *
 * Une place d'avant la table porte encore ses heures sur `players` : elles se relisent en repli,
 * et la première écriture les remplace. Rien n'est migré, la saison est jetable (ADR 0001).
 */
export async function readMarksOf(ctx: QueryCtx, player: Doc<'players'>): Promise<Marks> {
  const row = await ctx.db
    .query('readMarks')
    .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
    .first();
  return {
    journalReadAt: row?.journalReadAt ?? player.journalReadAt ?? null,
    telegraphReadAt: row?.telegraphReadAt ?? player.telegraphReadAt ?? null,
    telegraphPushedAt: row?.telegraphPushedAt ?? player.telegraphPushedAt ?? null,
    telegraphDirectReadAt: row?.telegraphDirectReadAt ?? {},
    boardRead:
      row?.boardReadAt === undefined || row.boardReadStocks === undefined
        ? null
        : { at: row.boardReadAt, stocks: row.boardReadStocks },
    firstSteps: row?.firstSteps ?? { done: [], shown: 'open' },
  };
}

export async function stampReadMark(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  mark:
    | { journalReadAt: number }
    | { telegraphReadAt: number }
    | { telegraphPushedAt: number }
    | { telegraphDirectReadAt: Record<string, number> }
    | { boardReadAt: number; boardReadStocks: Record<string, number> }
    | { firstSteps: NonNullable<Doc<'readMarks'>['firstSteps']> },
): Promise<void> {
  const row = await ctx.db
    .query('readMarks')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .first();
  if (row === null) await ctx.db.insert('readMarks', { playerId, ...mark });
  else await ctx.db.patch(row._id, mark);
}
