import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { heldOf } from './control';
import { viewOf } from './view';

/**
 * **Every table of the game, and the whole of it.** Exported rather than inlined so a test can
 * hold it against `schema.tables`: a table left out survives the wipe as an orphan nobody can
 * reach — no token names it and no season owns it — and it is exactly what a schema slice landing
 * mid-season would leave behind, since nothing here is migrated.
 */
export const GAME_TABLES = [
  'editions',
  'constructions',
  'messages',
  'notices',
  'sightings',
  'regionSightings',
  'recruitments',
  'orders',
  'strikes',
  'engagements',
  'plunderReports',
  'lootRecoveries',
  'lootCrates',
  'lootCrateSightings',
  'lootCrateDetectionJobs',
  'stationedLoot',
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

/**
 * **L'état de référence, pris sur une saison réellement jouée.** Ce qui sort d'ici est
 * exactement ce que le plateau de ce jeton reçoit — `viewOf` est la fonction que `playerView`
 * appelle, `heldOf` celle de `control.held` — brouillard compris. Rien n'est ajouté : une vue
 * d'export qui lirait la vérité aurait produit un document décrivant un jeu que personne ne
 * joue, ce qu'était l'ancien instantané du simulateur.
 *
 * `internalQuery`, donc hors de portée d'un client, et un jeton inconnu échoue par
 * `playerByToken` — jamais une vue vide, qui se serait exportée sans bruit.
 *
 * `npx convex run dev:snapshot '{"token":"…"}'`, ou `node scripts/exporter-etat-reference.mjs`.
 */
export const snapshot = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => ({
    playerView: await viewOf(ctx, token),
    control: await heldOf(ctx, token),
  }),
});
