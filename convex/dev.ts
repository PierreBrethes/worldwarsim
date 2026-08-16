import { internalMutation } from './_generated/server';

/**
 * **Wipes every game table.** A season is disposable by design — 48 hours to 7 days, then a
 * full reset (ADR 0001) — so a schema slice that lands mid-season is not migrated, it is
 * emptied: the old documents describe an economy that no longer exists.
 *
 * `internalMutation`, so no client can reach it. Run it by hand:
 * `npx convex run dev:reset`.
 */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      'constructions',
      'recruitments',
      'troops',
      'buildings',
      'resources',
      'players',
      'seasons',
    ] as const;
    for (const table of tables) {
      for (const doc of await ctx.db.query(table).collect()) {
        await ctx.db.delete(doc._id);
      }
    }
  },
});
