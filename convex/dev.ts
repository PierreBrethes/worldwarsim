import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import { heldOf } from './control';
import { settle } from './resources';
import { viewOf } from './view';
import { seatedOf } from './movement/forces';
import { seatLoose } from '../src/domain/troops';
import { modeOf } from '../src/domain/season-mode';
import { UNIT_ROLE } from './validators';
import { nominalStrength } from './constants';

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
  'pushQueue',
  'presences',
  'readMarks',
  'sightings',
  'campSightings',
  'regionSightings',
  'recruitments',
  'orders',
  'strikes',
  'engagements',
  'plunderReports',
  'captures',
  'lootRecoveries',
  'lootCollections',
  'lootCrates',
  'lootRumors',
  'lootCrateSightings',
  'lootCrateDetectionJobs',
  'stationedLoot',
  'movements',
  'outposts',
  'objectives',
  'strategicPoints',
  'troops',
  'buildings',
  'resources',
  'players',
  'seasons',
] as const;

/** Durable identity survives both a single-season destruction and the development game reset. */
export const IDENTITY_TABLES = [
  'accounts',
  'sessions',
  'pushSubscriptions',
  'authThrottle',
] as const;

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
 * **Remplir les stocks d'une saison de test**, chaque ressource de chaque siège portée à `stock`
 * — le relevé mobile a besoin d'une caserne, donc d'un QG de niveau 2, donc de charbon qu'une
 * saison neuve n'a pas. Réglé d'abord, pour que l'écriture ne réécrive pas des heures dues.
 * Jamais pour une saison réelle : c'est une triche, et elle n'a pas de porte cliente.
 *
 * `npx convex run dev:fillStocks '{"seasonId":"…","stock":400}'`
 */
export const fillStocks = internalMutation({
  args: { seasonId: v.id('seasons'), stock: v.number() },
  handler: async (ctx, { seasonId, stock }) => {
    const now = Date.now();
    const players = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect();
    for (const player of players) {
      await settle(ctx, player._id, now);
      const rows = await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect();
      for (const row of rows) await ctx.db.patch(row._id, { stock, updatedAt: now });
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
 * **Qui est à bord, écrit une fois** (révision de l'ADR 0025, 15/10). Être à bord se calculait :
 * une troupe au point d'un transport y montait. C'est désormais un état (`troops.carriedBy`), et
 * une partie en cours garde ce qu'elle voyait — chaque pile posée sur un point, et chaque colonne
 * en route, s'assoit comme le calcul l'asseyait. Sans elle, un convoi en mer n'aurait plus personne à bord.
 * Idempotente : qui est déjà assis ne bouge pas.
 *
 * `npx convex run dev:backfillCarriedBy`
 */
export const backfillCarriedBy = internalMutation({
  args: {},
  handler: async (ctx) => {
    const groups = new Map<string, Array<Doc<'troops'>>>();
    const riding = new Map<string, string>();
    for (const movement of await ctx.db.query('movements').collect())
      for (const troopId of movement.troopIds) riding.set(troopId, movement._id);
    for (const troop of await ctx.db.query('troops').collect()) {
      /** À quai, dans un bâtiment, personne n'était à bord (`boardingPile` d'avant). */
      if (!riding.has(troop._id) && typeof troop.stationedAt === 'string') continue;
      const key = riding.get(troop._id) ?? `${troop.playerId}:${JSON.stringify(troop.stationedAt)}`;
      groups.set(key, [...(groups.get(key) ?? []), troop]);
    }
    let seated = 0;
    for (const group of groups.values())
      for (const [riderId, carrierId] of seatLoose(group.map(seatedOf))) {
        await ctx.db.patch(riderId as Id<'troops'>, { carriedBy: carrierId as Id<'troops'> });
        seated += 1;
      }
    return { seated };
  },
});

/**
 * **Rallumer la presse là où elle s'est tue.** La chaîne des éditions n'a pas de planificateur
 * au-dessus d'elle — chaque `press:publish` prend le rendez-vous du suivant (ADR 0020 §4) — donc
 * une saison dont le maillon est tombé ne publie plus jamais, et rien ne le dit. C'est arrivé le
 * 12/09 à 23 h 55 : l'édition a dépassé la seconde d'une mutation, la transaction a été annulée
 * avec sa replanification. La séparation du 13/09 ferme cette cause-là ; ceci est la sortie de
 * secours pour toutes les autres.
 *
 * **Idempotente, et c'est tout son intérêt** : elle lit les travaux en attente et ne relance que
 * les saisons qui n'en ont aucun. La relancer deux fois de suite ne double pas une chaîne, donc
 * ne double pas les lignes d'une édition — ce qui serait pire que le silence qu'on répare.
 *
 * Un travail **en cours** compte comme vivant : il est en train de prendre le rendez-vous
 * suivant, et le doubler créerait précisément la seconde chaîne qu'on refuse.
 *
 * `npx convex run dev:relaunchPress`
 */
export const relaunchPress = internalMutation({
  args: {},
  handler: async (ctx) => {
    const alive = new Set<Id<'seasons'>>();
    for (const job of await ctx.db.system.query('_scheduled_functions').collect()) {
      /** Le nom porte l'extension du module en production (`press.js:publish`) et ne la porte
       *  pas sous `convex-test`. Les deux formes disent le même travail. */
      if (job.name !== 'press.js:publish' && job.name !== 'press:publish') continue;
      if (job.state.kind !== 'pending' && job.state.kind !== 'inProgress') continue;
      const { playerId } = (job.args[0] ?? {}) as { playerId?: Id<'players'> };
      const player = playerId === undefined ? null : await ctx.db.get(playerId);
      if (player !== null) alive.add(player.seasonId);
    }

    const relaunched: string[] = [];
    for (const season of await ctx.db.query('seasons').collect()) {
      if (season.status !== 'launched' || alive.has(season._id)) continue;
      /** Une Blitz n'a pas de chaîne d'édition : seule sa conclusion en écrit une. */
      if (modeOf(season.mode) === 'blitz') continue;
      /** N'importe quel siège fait l'affaire : `publish` ne s'en sert que pour retrouver la
       *  saison et vérifier qu'elle se joue encore. */
      const seat = await ctx.db
        .query('players')
        .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
        .first();
      if (seat === null) continue;
      await ctx.scheduler.runAfter(0, internal.press.publish, { playerId: seat._id });
      relaunched.push(season.code);
    }
    return { relaunched };
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

/**
 * **Poser des troupes sur une saison de test**, à un point de la carte et à pleine force — pour
 * essayer le geste sans attendre une caserne. `carriedBy` met la nouvelle à bord d'un transport
 * déjà posé au même point. Jamais pour une saison réelle : c'est une triche, sans porte cliente.
 *
 * `npx convex run dev:spawnTroops '{"playerId":"…","role":"infantry","count":2,"lon":2.3,"lat":48.8}'`
 */
export const spawnTroops = internalMutation({
  args: {
    playerId: v.id('players'),
    role: UNIT_ROLE,
    count: v.number(),
    lon: v.number(),
    lat: v.number(),
    carriedBy: v.optional(v.id('troops')),
  },
  handler: async (ctx, { playerId, role, count, lon, lat, carriedBy }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const strength = nominalStrength(role, 1);
    const ids: Id<'troops'>[] = [];
    for (let k = 0; k < count; k++)
      ids.push(
        await ctx.db.insert('troops', {
          seasonId: player.seasonId,
          playerId,
          role,
          tier: 1,
          nominalStrength: strength,
          currentStrength: strength,
          stationedAt: { lon, lat },
          ...(carriedBy === undefined ? {} : { carriedBy }),
        }),
      );
    return ids;
  },
});
