import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server';
import { heldOf } from './control';
import { recordLinkage } from './holding';
import { stampReadMark } from './readMarks';
import { settle } from './resources';
import { viewOf } from './view';
import { reassessDetection } from './movement/detection';
import { researchMs } from '../src/domain/research';
import { modeOf } from '../src/domain/season-mode';
import { LON_LAT, UNIT_ROLE } from './validators';
import { aimOf, march } from './movement/orders';
import { nominalStrength } from './constants';
import { capitalRegionOf, nearestRegion, pointOfRegion } from './regions';
import { isNation } from '../src/domain/nations';
import { handOver, layPoint, seasonPoints } from './strategicPoints';

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

/** Documents per transaction: well under the system-operation cap of a single mutation. */
const WIPE_BATCH = 200;

/** Jobs per transaction: each cancel is a system operation, and 200 overran the cap on a loaded base. */
const JOBS_PAGE = 50;

/** One batch of one game table; `more` says whether the table still holds documents. */
export const wipeBatch = internalMutation({
  args: { table: v.string() },
  handler: async (ctx, { table }) => {
    if (!(GAME_TABLES as readonly string[]).includes(table)) throw new Error('not a game table');
    const name = table as (typeof GAME_TABLES)[number];
    const docs = await ctx.db.query(name).take(WIPE_BATCH);
    for (const doc of docs) await ctx.db.delete(doc._id);
    return { more: docs.length === WIPE_BATCH };
  },
});

/** One page of the scheduled-job table, its pending jobs cancelled: every job targets game tables. */
export const cancelJobsPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.system
      .query('_scheduled_functions')
      .paginate({ cursor, numItems: JOBS_PAGE });
    for (const job of page.page)
      if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id);
    return { cursor: page.isDone ? null : page.continueCursor, done: page.isDone };
  },
});

/**
 * **Wipes every game table**, a batch per transaction (a single mutation hit "too many system
 * operations" on a loaded base). A season is disposable by design — 48 hours to 7 days, then a
 * full reset (ADR 0001) — so a schema slice that lands mid-season is not migrated, it is
 * emptied. Accounts and sessions are durable identity and stay outside `GAME_TABLES`.
 * Pending scheduled jobs are cancelled first, so none wakes up on a wiped table.
 *
 * `internalAction`, so no client can reach it. Run it by hand: `npx convex run dev:reset`.
 */
export const reset = internalAction({
  args: {},
  handler: async (ctx) => {
    let cursor: string | null = null;
    for (;;) {
      const page: { cursor: string | null; done: boolean } = await ctx.runMutation(
        internal.dev.cancelJobsPage,
        { cursor },
      );
      if (page.done) break;
      cursor = page.cursor;
    }
    for (const table of GAME_TABLES)
      while ((await ctx.runMutation(internal.dev.wipeBatch, { table })).more);
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
 * **Un QG élevé d'un coup**, pour la démo des chantiers : le niveau les accélère (ADR 0031).
 *
 * `npx convex run dev:promoteHq '{"playerId":"…","level":3}'`
 */
export const promoteHq = internalMutation({
  args: { playerId: v.id('players'), level: v.number() },
  handler: async (ctx, { playerId, level }) => {
    const hq = (
      await ctx.db
        .query('buildings')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect()
    ).find((building) => building.key === 'hq');
    if (hq) await ctx.db.patch(hq._id, { level });
  },
});

/**
 * **Une visite passée du plateau personnel**, pour la démo de la récolte : datée de `hours` plus
 * tôt, avec des stocks qui font paraître à l'ouverture suivante ce que `gains` dit — positif
 * entré, négatif sorti.
 *
 * `npx convex run dev:pastVisit '{"seasonId":"…","hours":9,"gains":{"food":100}}'`
 */
export const pastVisit = internalMutation({
  args: {
    seasonId: v.id('seasons'),
    hours: v.number(),
    gains: v.record(v.string(), v.number()),
  },
  handler: async (ctx, { seasonId, hours, gains }) => {
    const now = Date.now();
    const players = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect();
    for (const player of players) {
      const { stocks } = await settle(ctx, player._id, now);
      await stampReadMark(ctx, player._id, {
        boardReadAt: now - hours * 3_600_000,
        boardReadStocks: Object.fromEntries(
          Object.entries(stocks).map(([key, stock]) => [
            key,
            Math.max(0, Math.floor(stock) - (gains[key] ?? 0)),
          ]),
        ),
      });
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
    /** Ses crans déjà entamés (coups et plein, ADR 0028 §3) ; absents, pleins. */
    rounds: v.optional(v.number()),
    fuel: v.optional(v.number()),
  },
  handler: async (ctx, { playerId, role, count, lon, lat, carriedBy, rounds, fuel }) => {
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
          ...(rounds === undefined ? {} : { rounds }),
          ...(fuel === undefined ? {} : { fuel }),
        }),
      );
    return ids;
  },
});

/** Le QG du joueur, posé à la capitale s'il n'en a pas : c'est là qu'un transport se charge. */
async function headquartersOf(ctx: MutationCtx, player: Doc<'players'>) {
  let hq = (
    await ctx.db
      .query('buildings')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect()
  ).find((building) => building.key === 'hq');
  if (hq === undefined && isNation(player.nation)) {
    const regionId = capitalRegionOf(player.nation);
    const id = await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key: 'hq',
      regionId,
      point: pointOfRegion(regionId),
      level: 1,
      homeOf: player._id,
    });
    hq = (await ctx.db.get(id))!;
  }
  return hq;
}

/**
 * **La scène de la logistique** (ADR 0028 §4), pour la démo : un avant-poste de niveau 2 près de
 * Bruxelles, son dépôt entamé, un camion chargé au QG et un autre en garnison au point.
 * `fullDepot` y ajoute Lille, un point au dépôt plein, que la démo des tournées saute ou attend.
 *
 * `npx convex run dev:logisticsScene '{"playerId":"…"}'`
 */
export const logisticsScene = internalMutation({
  args: { playerId: v.id('players'), fullDepot: v.optional(v.boolean()) },
  handler: async (ctx, { playerId, fullDepot }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const now = Date.now();
    if (fullDepot === true)
      await ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon: 3.06, lat: 50.63 },
        hostCountry: 'FRA',
        level: 1,
        specialization: 'relay',
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
        depot: { ammunition: 400, oil: 0, coal: 0 },
      });
    const outpostId = await ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId,
      point: { lon: 4.35, lat: 50.85 },
      hostCountry: 'BEL',
      level: 2,
      specialization: 'relay',
      foundedAt: now - 1,
      disabledUntil: null,
      immuneUntil: null,
      depot: { ammunition: 260, oil: 150, coal: 90 },
    });
    const hq = await headquartersOf(ctx, player);
    const truck = (stationedAt: Id<'buildings'> | Id<'outposts'>, load: Doc<'troops'>['load']) =>
      ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId,
        role: 'landTransport',
        tier: 1,
        nominalStrength: nominalStrength('landTransport', 1),
        currentStrength: nominalStrength('landTransport', 1),
        stationedAt,
        ...(load === undefined ? {} : { load }),
      });
    if (hq !== undefined) await truck(hq._id, { ammunition: 90, oil: 50, coal: 20 });
    await truck(outpostId, { ammunition: 30, oil: 0, coal: 0 });
    /** Deux points côtiers, Marseille et Agde, et un cargo chargé au premier. */
    const coast = async (lon: number, lat: number, depot: Doc<'outposts'>['depot']) =>
      ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon, lat },
        hostCountry: 'FRA',
        level: 1,
        specialization: 'relay',
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
        ...(depot === undefined ? {} : { depot }),
      });
    const marseille = await coast(5.37, 43.3, { ammunition: 40, oil: 0, coal: 180 });
    await coast(3, 43.3, undefined);
    await ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId,
      role: 'cargo',
      tier: 1,
      nominalStrength: nominalStrength('cargo', 1),
      currentStrength: nominalStrength('cargo', 1),
      stationedAt: marseille,
      load: { ammunition: 120, oil: 0, coal: 220 },
    });
    return outpostId;
  },
});

/**
 * **Fait arriver sur-le-champ les mouvements d'un joueur**, pour voir une livraison ou une
 * tournée se dénouer sans attendre la route (#128).
 *
 * `npx convex run dev:arriveNow '{"playerId":"…"}'`
 */
export const arriveNow = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const moving = await ctx.db
      .query('movements')
      .filter((q) => q.eq(q.field('playerId'), playerId))
      .collect();
    for (const movement of moving)
      await ctx.scheduler.runAfter(0, internal.movements.arrive, { movementId: movement._id });
    return moving.length;
  },
});

/**
 * **La scène du largage** (ADR 0028 §4), pour la démo : un aérodrome à la capitale, un avion
 * chargé, un avant-poste de niveau 1 près de Bruxelles — une escale n'est pas requise — au dépôt
 * entamé, et une escouade isolée en Rhénanie, à sec.
 *
 * `npx convex run dev:airdropScene '{"playerId":"…"}'`
 */
export const airdropScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null || !isNation(player.nation)) throw new Error('no such player');
    await headquartersOf(ctx, player);
    /** L'aérodrome et l'avion de transport sont derrière leurs cartes (ADR 0028 §5). */
    await ctx.db.patch(playerId, { researched: ['aviation', 'airlift'] });
    const regionId = capitalRegionOf(player.nation);
    const airfield = await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId,
      key: 'airfield',
      regionId,
      point: pointOfRegion(regionId),
      level: 1,
    });
    await ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId,
      role: 'airTransport',
      tier: 1,
      nominalStrength: nominalStrength('airTransport', 1),
      currentStrength: nominalStrength('airTransport', 1),
      stationedAt: airfield,
      load: { ammunition: 80, oil: 40, coal: 0 },
    });
    await ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId,
      point: { lon: 4.35, lat: 50.85 },
      hostCountry: 'BEL',
      level: 1,
      specialization: 'relay',
      foundedAt: Date.now() - 1,
      disabledUntil: null,
      immuneUntil: null,
      depot: { ammunition: 150, oil: 60, coal: 0 },
    });
    /** Une dépêche posée là : son « Localiser » cadre la carte entre l'aérodrome et le point. */
    await ctx.db.insert('notices', {
      playerId,
      at: Date.now(),
      kind: 'outpostFounded',
      hostCountry: 'BEL',
      point: { lon: 4.35, lat: 50.85 },
      specialization: 'relay',
    });
    for (const troop of [
      { role: 'infantry' as const, rounds: 0 },
      { role: 'armor' as const, rounds: 0, fuel: 1 },
    ])
      await ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId,
        tier: 1,
        nominalStrength: nominalStrength(troop.role, 1),
        currentStrength: nominalStrength(troop.role, 1),
        stationedAt: { lon: 7.1, lat: 50.4 },
        ...troop,
      });
  },
});

/**
 * **Une recherche en cours** (ADR 0028 §5, #123) : un Centre de recherche de niveau 2 au sud de la
 * capitale, l'infanterie MK2 et l'aviation acquises, le blindé posé il y a six heures sur le
 * Centre — le reste de sa durée, raccourcie au niveau 2, à courir —, et deux cartes en file.
 */
export const researchScene = internalMutation({
  /** `idle` : le Centre debout et rien de posé, pour poser une carte depuis l'arbre. */
  args: { playerId: v.id('players'), idle: v.optional(v.boolean()) },
  handler: async (ctx, { playerId, idle }) => {
    const player = await ctx.db.get(playerId);
    if (player === null || !isNation(player.nation)) throw new Error('no such player');
    await headquartersOf(ctx, player);
    const regionId = capitalRegionOf(player.nation);
    const { lon, lat } = pointOfRegion(regionId);
    await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId,
      key: 'researchCenter',
      regionId,
      point: { lon, lat: lat - 0.45 },
      level: 2,
      outpostId: null,
    });
    if (idle === true) {
      await ctx.db.patch(playerId, { researched: ['infantryMk2', 'aviation'] });
      return;
    }
    const now = Date.now();
    const hour = 3_600_000;
    const totalMs = researchMs('armor', 2);
    const remainingMs = totalMs - 6 * hour;
    await ctx.db.patch(playerId, {
      researched: ['infantryMk2', 'aviation'],
      research: { card: 'armor', totalMs, remainingMs: totalMs, since: now - 6 * hour },
      researchQueue: ['escort', 'carrier'],
    });
    await ctx.scheduler.runAt(now + remainingMs, internal.research.finish, {
      playerId,
      finishesAt: now + remainingMs,
    });
  },
});

/**
 * **Les niveaux qui accélèrent** (ADR 0031), pour la démo : une caserne de niveau 3 à la capitale
 * et deux cartes Transmissions acquises.
 */
export const levelsScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null || !isNation(player.nation)) throw new Error('no such player');
    const regionId = capitalRegionOf(player.nation);
    await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId,
      key: 'barracks',
      regionId,
      point: pointOfRegion(regionId),
      level: 3,
    });
    await ctx.db.patch(playerId, {
      researched: ['transmissions1', 'transmissions2'],
    });
  },
});

/**
 * **La ligne du pétrole synthétique** (4.11), pour la démo : la carte acquise, un arsenal de
 * niveau 2 et un lot de soixante pétroles lancé il y a quatre heures sur la ligne du pétrole.
 */
export const oilLineScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null || !isNation(player.nation)) throw new Error('no such player');
    await ctx.db.patch(playerId, {
      researched: [...new Set([...(player.researched ?? []), 'syntheticOil' as const])],
    });
    const regionId = capitalRegionOf(player.nation);
    const { lon, lat } = pointOfRegion(regionId);
    await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId,
      key: 'arsenal',
      regionId,
      point: { lon: lon + 0.4, lat: lat + 0.3 },
      level: 2,
    });
    await ctx.db.insert('orders', {
      playerId,
      chain: 'arsenal',
      line: 'oil',
      ordered: 60,
      produced: 0,
      placedAt: Date.now() - 4 * 3_600_000,
    });
  },
});

/**
 * **La scène de l'artillerie** (4.10) : la carte acquise, une pièce seule au nord de Paris, une
 * escouade adverse de seize troupes à Amiens, dans sa portée et sur le sol français, et une
 * escouade française de quatorze troupes à Reims : la salve bornée et le fanion qui compte.
 */
export const artilleryScene = internalMutation({
  args: { playerId: v.id('players'), enemyId: v.id('players') },
  handler: async (ctx, { playerId, enemyId }) => {
    const player = await ctx.db.get(playerId);
    const enemy = await ctx.db.get(enemyId);
    if (player === null || enemy === null) throw new Error('no such player');
    await ctx.db.patch(playerId, {
      researched: [...new Set([...(player.researched ?? []), 'artillery' as const])],
    });
    const post = async (
      owner: Doc<'players'>,
      at: { lon: number; lat: number },
      roles: ReadonlyArray<readonly [Doc<'troops'>['role'], number]>,
    ) => {
      for (const [role, count] of roles)
        for (let k = 0; k < count; k++)
          await ctx.db.insert('troops', {
            seasonId: owner.seasonId,
            playerId: owner._id,
            role,
            tier: 1,
            nominalStrength: nominalStrength(role, 1),
            currentStrength: nominalStrength(role, 1),
            stationedAt: at,
          });
    };
    await post(player, { lon: 2.35, lat: 49.2 }, [['artillery', 1]]);
    await post(player, { lon: 4.03, lat: 49.26 }, [
      ['infantry', 8],
      ['armor', 4],
      ['landTransport', 2],
    ]);
    await post(enemy, { lon: 2.3, lat: 49.9 }, [
      ['infantry', 10],
      ['armor', 4],
      ['landTransport', 2],
    ]);
    await reassessDetection(ctx, player.seasonId, Date.now());
  },
});

/**
 * **Bakou, Dakar, Singapour et Halifax tenus** : le joueur tient les quatre, un blindé au plein vide
 * en Rhénanie (arrêté depuis 5 h : à Bakou son prochain cran vient dans 7 h), un camion au plein de
 * quatre crans (−20 % à Singapour), et les deux dépêches du dépôt qui brûle à Dakar.
 */
export const pointsScene = internalMutation({
  args: { playerId: v.id('players'), enemyId: v.id('players') },
  handler: async (ctx, { playerId, enemyId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const now = Date.now();
    for (const key of ['baku', 'dakar', 'singapore', 'halifax'] as const) {
      const point = await layPoint(ctx, player.seasonId, key);
      if (point === null) throw new Error(`no region under ${key}`);
      await ctx.db.patch(point._id, { holderId: player._id, heldSince: now - 3 * 3_600_000 });
    }
    for (const [role, fuel] of [
      ['armor', 0],
      ['landTransport', 4],
    ] as const)
      await ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId,
        role,
        tier: 1,
        nominalStrength: nominalStrength(role, 1),
        currentStrength: nominalStrength(role, 1),
        stationedAt: { lon: 7.1, lat: 50.4 },
        fuel,
        fuelAt: now - 5 * 3_600_000,
      });
    const lost = { ammunition: 40, oil: 20, coal: 0 };
    await ctx.db.insert('notices', {
      playerId,
      at: now,
      kind: 'depotBurned',
      side: 'holder',
      country: 'BEL',
      lost,
    });
    await ctx.db.insert('notices', {
      playerId: enemyId,
      at: now,
      kind: 'depotBurned',
      side: 'capturer',
      country: 'BEL',
      lost,
    });
  },
});

/**
 * **La scène du navire** (#129), pour la démo : un port à Marseille, un cargo à quai, un avant-poste
 * côtier à Agde. Le cargo est de la démo, le départ et l'arrivée le long du quai se jouent à l'écran.
 *
 * `npx convex run dev:navyScene '{"playerId":"…"}'`
 */
export const navyScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const point = { lon: 5.37, lat: 43.3 };
    const region = nearestRegion([point.lon, point.lat]);
    if (region === null) throw new Error('no region at Marseille');
    const port = await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId,
      key: 'port',
      regionId: region.id,
      point,
      level: 1,
    });
    await ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId,
      point: { lon: 3, lat: 43.3 },
      hostCountry: 'FRA',
      level: 1,
      specialization: 'relay',
      foundedAt: Date.now() - 1,
      disabledUntil: null,
      immuneUntil: null,
    });
    await ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId,
      role: 'cargo',
      tier: 1,
      nominalStrength: nominalStrength('cargo', 1),
      currentStrength: nominalStrength('cargo', 1),
      stationedAt: port,
    });
  },
});

/**
 * **Le banc de charge de la Mondiale** (#143, `scripts/banc-mondiale.mjs`). Quatre portes internes
 * pour remplir une saison locale sans mille deux cents appels publics : la scène d'un joueur, ses
 * mouvements en vol, une réévaluation du brouillard, et l'état de la file des jobs.
 *
 * La scène : des escouades de trois fantassins, une pile de troupes en réserve, quatre avant-postes
 * au dépôt entamé, et un camion chargé au premier (la tournée se lance par `tours.start`).
 */
export const benchScene = internalMutation({
  args: {
    playerId: v.id('players'),
    squads: v.array(LON_LAT),
    reserve: v.object({ at: LON_LAT, count: v.number() }),
    outposts: v.array(LON_LAT),
  },
  handler: async (ctx, { playerId, squads, reserve, outposts }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const troop = (role: 'infantry' | 'armor', at: { lon: number; lat: number }) =>
      ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId,
        role,
        tier: 1,
        nominalStrength: nominalStrength(role, 1),
        currentStrength: nominalStrength(role, 1),
        stationedAt: at,
      });
    const placed: { at: { lon: number; lat: number }; ids: Id<'troops'>[] }[] = [];
    for (const at of squads)
      placed.push({
        at,
        ids: [
          await troop('infantry', at),
          await troop('infantry', at),
          await troop('infantry', at),
        ],
      });
    const reserveIds: Id<'troops'>[] = [];
    for (let k = 0; k < reserve.count; k++)
      reserveIds.push(await troop(k % 4 === 0 ? 'armor' : 'infantry', reserve.at));
    const outpostIds: Id<'outposts'>[] = [];
    for (const [k, point] of outposts.entries())
      outpostIds.push(
        await ctx.db.insert('outposts', {
          seasonId: player.seasonId,
          playerId,
          point,
          hostCountry: 'BENCH',
          level: 2,
          specialization: 'relay',
          foundedAt: Date.now() - 1,
          disabledUntil: null,
          immuneUntil: null,
          depot:
            k === 0
              ? { ammunition: 260, oil: 150, coal: 90 }
              : { ammunition: 60, oil: 40, coal: 20 },
        }),
      );
    const truckId =
      outpostIds[0] === undefined
        ? null
        : await ctx.db.insert('troops', {
            seasonId: player.seasonId,
            playerId,
            role: 'landTransport',
            tier: 1,
            nominalStrength: nominalStrength('landTransport', 1),
            currentStrength: nominalStrength('landTransport', 1),
            stationedAt: outpostIds[0],
            load: { ammunition: 90, oil: 50, coal: 20 },
          });
    /** Des points posés hors du geste de couleur : leur couleur se retient comme après une
     *  fondation, sans quoi la vue mesurée serait celle d'un sol jamais relevé (#144). */
    await recordLinkage(ctx, player.seasonId);
    return { squads: placed, reserveIds, outpostIds, truckId };
  },
});

/** La couleur retenue des huit sièges, seule : ce que chaque changement de couleur paie (#144). */
export const benchRecord = internalMutation({
  args: { seasonId: v.id('seasons') },
  handler: (ctx, { seasonId }) => recordLinkage(ctx, seasonId),
});

/**
 * **La chute d'un QG, prête à aboutir** : le pire geste de couleur du banc (#144). `loserId`
 * tient `points` points stratégiques et son QG, `capturerId` l'a pris ; le banc appelle
 * `captures.complete`, qui règle, rapporte, rend les points et retient la couleur.
 */
export const benchFall = internalMutation({
  args: { capturerId: v.id('players'), loserId: v.id('players'), points: v.number() },
  handler: async (ctx, { capturerId, loserId, points }) => {
    const loser = await ctx.db.get(loserId);
    if (loser === null) throw new Error('no such player');
    const now = Date.now();
    for (const point of (await seasonPoints(ctx, loser.seasonId)).slice(0, points))
      await handOver(ctx, point, loserId, now);
    await recordLinkage(ctx, loser.seasonId);
    const hq = (await headquartersOf(ctx, loser))!;
    const captureId = await ctx.db.insert('captures', {
      seasonId: loser.seasonId,
      playerId: capturerId,
      defenderId: loserId,
      target: { kind: 'building', buildingId: hq._id },
      site: { kind: 'building', building: 'hq', regionId: hq.regionId },
      point: hq.point ?? { lon: 0, lat: 0 },
      progress: 1,
      progressAt: now,
      rate: 1,
      durationMs: 1,
      rest: null,
      completesAt: now,
    });
    return { captureId, expectedAt: now };
  },
});

/** Les mouvements d'un lot d'escouades : le vrai `march`, sans le slot (`keepsSlot`), un refus compté, puis la relecture du brouillard de leur joueur. */
export const benchFlights = internalMutation({
  args: {
    playerId: v.id('players'),
    flights: v.array(v.object({ ids: v.array(v.id('troops')), from: LON_LAT, to: LON_LAT })),
  },
  handler: async (ctx, { playerId, flights }) => {
    const player = await ctx.db.get(playerId);
    const season = player === null ? null : await ctx.db.get(player.seasonId);
    if (season === null) throw new Error('no such season');
    const failedAt: number[] = [];
    for (const flight of flights)
      try {
        await march(ctx, {
          playerId,
          season,
          type: 'march',
          origin: { kind: 'point', point: flight.from },
          troopIds: flight.ids,
          aim: await aimOf(ctx, playerId, { kind: 'point', point: flight.to }),
          keepsSlot: true,
        });
      } catch {
        failedAt.push(flights.indexOf(flight));
      }
    /** `keepsSlot` laisse la relecture à l'appelant, comme un pas de tournée. */
    await reassessDetection(ctx, season._id, Date.now(), playerId);
    return { filed: flights.length - failedAt.length, failedAt };
  },
});

/** La réévaluation du brouillard seule, pour la chronométrer : entière, ou d'un joueur. */
export const benchReassess = internalMutation({
  args: { seasonId: v.id('seasons'), playerId: v.optional(v.id('players')) },
  handler: async (ctx, { seasonId, playerId }) => {
    await reassessDetection(ctx, seasonId, Date.now(), playerId);
  },
});

/**
 * **Les réveils qui s'empilaient** (#146) : deux joueurs avec une station d'écoute, l'un au
 * charbon qui brûle, l'autre à sec. Chaque appel règle le muet puis relit le brouillard, comme
 * le font les règlements et les départs d'une partie ; sans garde, chacun laissait un job de plus.
 */
export const benchWakeups = internalMutation({
  args: { seasonId: v.id('seasons'), burning: v.id('players'), silent: v.id('players') },
  handler: async (ctx, { seasonId, burning, silent }) => {
    for (const [playerId, coal] of [
      [burning, 50],
      [silent, 0],
    ] as const) {
      const has = (
        await ctx.db
          .query('buildings')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .collect()
      ).some((building) => building.key === 'listening');
      if (!has) {
        const nation = (await ctx.db.get(playerId))!.nation;
        if (!isNation(nation)) continue;
        const regionId = capitalRegionOf(nation);
        await ctx.db.insert('buildings', {
          seasonId,
          playerId,
          key: 'listening',
          regionId,
          point: pointOfRegion(regionId),
          level: 1,
        });
        for (const row of await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .collect())
          if (row.key === 'coal') await ctx.db.patch(row._id, { stock: coal });
      }
    }
    await settle(ctx, silent, Date.now());
    await reassessDetection(ctx, seasonId, Date.now());
  },
});

/** Ce que le banc a posé, et la file des jobs planifiés encore en attente. */
export const benchStats = internalQuery({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    const count = async (table: 'troops' | 'movements' | 'outposts') =>
      (
        await ctx.db
          .query(table)
          .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
          .collect()
      ).length;
    /** Les jobs nés depuis la saison seulement : la table système garde ceux des bancs passés,
     *  et les relire tous dépassait les 4 096 lectures d'une query. */
    const since = (await ctx.db.get(seasonId))?._creationTime ?? 0;
    const jobs = await ctx.db.system
      .query('_scheduled_functions')
      .withIndex('by_creation_time', (q) => q.gte('_creationTime', since))
      .collect();
    const byName = new Map<string, number>();
    for (const job of jobs)
      if (job.state.kind === 'pending') byName.set(job.name, (byName.get(job.name) ?? 0) + 1);
    return {
      troops: await count('troops'),
      movements: await count('movements'),
      outposts: await count('outposts'),
      pendingJobs: jobs.filter((job) => job.state.kind === 'pending').length,
      /** Par fonction : de quoi voir quel job s'empile (#146). */
      pendingByName: [...byName].sort((a, b) => b[1] - a[1]),
    };
  },
});

/** Les places d'une saison, dans l'ordre d'arrivée : de quoi nourrir le banc. */
export const benchPlayers = internalQuery({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) =>
    (
      await ctx.db
        .query('players')
        .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
        .collect()
    ).map((player) => ({ id: player._id, nation: player.nation })),
});
