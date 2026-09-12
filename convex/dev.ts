import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { heldOf } from './control';
import { viewOf } from './view';

/**
 * **Every disposable game table, and the whole of it.** Exported rather than inlined so the
 * partition test can hold it together with `IDENTITY_TABLES` against `schema.tables`: a game
 * table left out survives the wipe as an orphan nobody can reach.
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
  'lootCollections',
  'lootCrates',
  'lootRumors',
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

/** Durable identity survives both a single-season destruction and the development game reset. */
export const IDENTITY_TABLES = ['accounts', 'sessions'] as const;

/**
 * **Wipes every game table.** A season is disposable by design — 48 hours to 7 days, then a
 * full reset (ADR 0001) — so a schema slice that lands mid-season is not migrated, it is
 * emptied: the old documents describe an economy that no longer exists. Accounts and sessions
 * are durable identity and deliberately stay outside `GAME_TABLES`.
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
 * **Les deux champs dénormalisés de la saison, posés sur celles d'avant** (12/09) : le nombre de
 * places et la nation du vainqueur. Sans elle, une saison d'avant la ligne fait retomber
 * `previewOf` sur le comptage — la lecture même que la dénormalisation supprime — et l'accueil
 * d'un compte qui joue depuis longtemps garde le délai qu'on est venu corriger.
 *
 * Une migration plutôt qu'un wipe parce que ce n'est pas un changement de règle : les saisons
 * décrivent le même jeu après qu'avant, et l'une d'elles est en cours.
 *
 * `npx convex run dev:backfillSeasonPreview`
 */
export const backfillSeasonPreview = internalMutation({
  args: {},
  handler: async (ctx) => {
    let seasons = 0;
    for (const season of await ctx.db.query('seasons').collect()) {
      const present = await ctx.db
        .query('players')
        .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
        .collect();
      const winnerId = season.winnerId ?? null;
      const winner = winnerId === null ? null : await ctx.db.get(winnerId);
      await ctx.db.patch(season._id, {
        playerCount: present.length,
        winnerNation: winner === null ? null : (winner.nation ?? winner.nickname),
      });
      seasons += 1;
    }
    return { seasons };
  },
});

/**
 * **L'état de référence, pris sur une saison réellement jouée.** Ce qui sort d'ici est
 * exactement ce que le plateau de cette place reçoit — `viewOf` est la fonction que `playerView`
 * appelle, `heldOf` celle de `control.held` — brouillard compris. Rien n'est ajouté : une vue
 * d'export qui lirait la vérité aurait produit un document décrivant un jeu que personne ne
 * joue, ce qu'était l'ancien instantané du simulateur.
 *
 * `internalQuery`, donc hors de portée d'un client, et une session sans place dans la saison
 * demandée échoue par `playerOf` — jamais une vue vide, qui se serait exportée sans bruit.
 *
 * `npx convex run dev:snapshot '{"token":"…","seasonId":"…"}'`, ou
 * `node scripts/exporter-etat-reference.mjs`.
 */
export const snapshot = internalQuery({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => ({
    playerView: await viewOf(ctx, token, seasonId),
    control: await heldOf(ctx, token, seasonId),
  }),
});
