import { internalMutation } from './_generated/server';

/**
 * **Every table of the game, and the whole of it.** Exported rather than inlined so a test can
 * hold it against `schema.tables`: a table left out survives the wipe as an orphan nobody can
 * reach — no token names it and no season owns it — and it is exactly what a schema slice landing
 * mid-season would leave behind, since nothing here is migrated.
 */
export const GAME_TABLES = [
  'constructions',
  'notices',
  'sightings',
  'recruitments',
  'orders',
  'engagements',
  'movements',
  'outposts',
  'troops',
  'buildings',
  'resources',
  'players',
  'seasons',
] as const;

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
    for (const table of GAME_TABLES) {
      for (const doc of await ctx.db.query(table).collect()) {
        await ctx.db.delete(doc._id);
      }
    }
  },
});
