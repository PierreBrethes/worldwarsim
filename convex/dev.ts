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
import { belligerents } from './production';
import { stampReadMark } from './readMarks';
import { settle } from './resources';
import { viewOf } from './view';
import { marchingForce, reassessDetection } from './movement/detection';
import { lineCrossingOf, positionAt } from '../src/domain/interception';
import { windowsOf } from '../src/domain/sighting-windows';
import { researchMs } from '../src/domain/research';
import { modeOf } from '../src/domain/season-mode';
import { LON_LAT, STRATEGIC_POINT_KEY, UNIT_ROLE, UNIT_TIER, RESEARCH_CARD } from './validators';
import { aimOf, march } from './movement/orders';
import { chainSecondTarget } from './movement/blitzkrieg';
import { nominalStrength, outpostReachKm, PLUNDER_DISABLED_HOURS } from './constants';
import { capitalRegionOf, nearestRegion, pointOfRegion } from './regions';
import { fileSurvey, surveyFoundation } from './surveys';
import { regionAtPoint } from './regionGeometry';
import { DEPOSIT_POINTS } from '../src/domain/world';
import { HOME_BY_NATION, isNation } from '../src/domain/nations';
import { concludeSeason } from './seasons';
import { seatsOf } from './seats';
import type { ResearchCard, UnitRole } from '../src/domain/ids';
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

/**
 * **The final editions of the Mondiales, frozen per account** (#443, ADR 0040): an archive that
 * survives both the founder's « détruire » and the reset, like identity — which is why it is
 * neither of the two lists above.
 */
export const ARCHIVE_TABLES = ['finalEditions', 'finalEditionReaders'] as const;

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
 * `only` n'en remplit qu'une (`"coal"`) : un bac plein parmi des bacs entamés.
 *
 * `npx convex run dev:fillStocks '{"seasonId":"…","stock":400}'`
 */
export const fillStocks = internalMutation({
  args: { seasonId: v.id('seasons'), stock: v.number(), only: v.optional(v.string()) },
  handler: async (ctx, { seasonId, stock, only }) => {
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
      for (const row of rows)
        if (only === undefined || row.key === only)
          await ctx.db.patch(row._id, { stock, updatedAt: now });
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
 * **Plus de canon ni de camion à bord d'un avion de transport** (#284) : l'aile n'assoit que
 * l'infanterie, mais une troupe embarquée avant cette règle y est restée, et bloquait son avion.
 * La troupe garde son point, elle repart à pied. Idempotente.
 *
 * Par pages, la suivante planifiée par la précédente : toute la table `troops` dépasse ce
 * qu'une mutation peut lire (vu sur la base locale le 26/10). `freed` compte la première page.
 *
 * `npx convex run dev:backfillAirTransportInfantryOnly`
 */
export const backfillAirTransportInfantryOnly = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('troops').paginate({ cursor: cursor ?? null, numItems: 500 });
    let freed = 0;
    for (const troop of page.page) {
      if (troop.role === 'infantry' || troop.carriedBy === undefined) continue;
      const carrier = await ctx.db.get(troop.carriedBy);
      if (carrier?.role !== 'airTransport') continue;
      await ctx.db.patch(troop._id, { carriedBy: undefined });
      freed += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.dev.backfillAirTransportInfantryOnly, {
        cursor: page.continueCursor,
      });
    }
    return { freed };
  },
});

/**
 * **Le silence des vigies sur une base d'avant le champ** (#370) : `players.listeningSilent` est
 * lu « entend » quand il manque, et un joueur déjà muet au déploiement le resterait sur la carte
 * de tous jusqu'à son prochain réveil. Planifie `listening.reassess` pour chaque belligérant des
 * saisons lancées, qui règle son économie et écrit son verdict. Idempotente.
 *
 * `npx convex run dev:backfillListeningSilent`
 */
export const backfillListeningSilent = internalMutation({
  args: {},
  handler: async (ctx) => {
    let players = 0;
    for (const season of await ctx.db.query('seasons').collect()) {
      if (season.status !== 'launched') continue;
      for (const player of await belligerents(ctx, season._id)) {
        await ctx.scheduler.runAfter(0, internal.listening.reassess, { playerId: player._id });
        players += 1;
      }
    }
    return { players };
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
    /** Son rang : seuls l'infanterie et le blindé en ont un second (`NOMINAL_STRENGTH`) ; absent, le premier. */
    tier: v.optional(UNIT_TIER),
    /** Ses crans déjà entamés (coups et plein, ADR 0028 §3) ; absents, pleins. */
    rounds: v.optional(v.number()),
    fuel: v.optional(v.number()),
    /** **En tournée depuis ce dépôt**, à l'arrêt : la pile de Rangoun d'une démo (#176). */
    tourBase: v.optional(v.id('outposts')),
  },
  handler: async (
    ctx,
    { playerId, role, count, lon, lat, carriedBy, tier = 1, rounds, fuel, tourBase },
  ) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const strength = nominalStrength(role, tier);
    const ids: Id<'troops'>[] = [];
    for (let k = 0; k < count; k++)
      ids.push(
        await ctx.db.insert('troops', {
          seasonId: player.seasonId,
          playerId,
          role,
          tier,
          nominalStrength: strength,
          currentStrength: strength,
          stationedAt: { lon, lat },
          ...(carriedBy === undefined ? {} : { carriedBy }),
          ...(rounds === undefined ? {} : { rounds }),
          ...(fuel === undefined ? {} : { fuel }),
          ...(tourBase === undefined
            ? {}
            : {
                tour: {
                  base: tourBase,
                  stops: [],
                  consigne: { ammunition: 0, oil: 0, coal: 0 },
                  next: 0,
                },
              }),
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
  args: {
    playerId: v.id('players'),
    fullDepot: v.optional(v.boolean()),
    /** A second, empty truck at the headquarters: two transports on one pile (#319). */
    twin: v.optional(v.boolean()),
  },
  handler: async (ctx, { playerId, fullDepot, twin }) => {
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
      specialty: 'store',
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
    if (hq !== undefined && twin === true) await truck(hq._id, undefined);
    await truck(outpostId, { ammunition: 30, oil: 0, coal: 0 });
    /** Deux points côtiers, Marseille et Agde, et un cargo chargé au premier. */
    const coast = async (lon: number, lat: number, depot: Doc<'outposts'>['depot']) =>
      ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon, lat },
        hostCountry: 'FRA',
        level: 1,
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
 * **La scène du chargement** (#271), pour la démo : un entrepôt dans l'Oise et le QG à la
 * capitale, un camion vide en garnison à chacun. La démo les charge plus tard (`--chargement`).
 *
 * `npx convex run dev:loadingScene '{"playerId":"…"}'`
 */
export const loadingScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const hq = await headquartersOf(ctx, player);
    if (hq === undefined) throw new Error('no headquarters');
    const regionId = 'FRA-5312';
    const warehouse = await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId,
      key: 'warehouse',
      regionId,
      point: pointOfRegion(regionId),
      level: 1,
    });
    const truck = (stationedAt: Id<'buildings'>) =>
      ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId,
        role: 'landTransport',
        tier: 1,
        nominalStrength: nominalStrength('landTransport', 1),
        currentStrength: nominalStrength('landTransport', 1),
        stationedAt,
      });
    const trucks = { warehouse: await truck(warehouse), hq: await truck(hq._id) };
    await recordLinkage(ctx, player.seasonId);
    await reassessDetection(ctx, player.seasonId, Date.now(), playerId);
    return trucks;
  },
});

/**
 * **Fait arriver sur-le-champ les mouvements d'un joueur**, pour voir une livraison ou une
 * tournée se dénouer sans attendre la route (#128). `afterMs` les fait arriver plus tard : le
 * temps d'ouvrir la carte, où le combat de `--combat` se joue (#272).
 *
 * `npx convex run dev:arriveNow '{"playerId":"…"}'`
 */
export const arriveNow = internalMutation({
  args: {
    playerId: v.id('players'),
    afterMs: v.optional(v.number()),
    /** Its whole way slid forward too: the pawn reaches the end of its route at the arrival (#362). */
    onTime: v.optional(v.boolean()),
  },
  handler: async (ctx, { playerId, afterMs, onTime }) => {
    const moving = await ctx.db
      .query('movements')
      .filter((q) => q.eq(q.field('playerId'), playerId))
      .collect();
    const arrivesAt = Date.now() + (afterMs ?? 0);
    for (const movement of moving) {
      /** `arrive` ne part pas avant l'heure (le Fort repousse une arrivée en route) : l'heure se
       *  ramène, et une reprise glisse avec la route ou se perd avec elle. */
      const shift = arrivesAt - movement.arrivesAt;
      await ctx.db.patch(movement._id, {
        arrivesAt,
        ...(onTime ? { departedAt: movement.departedAt + shift } : {}),
        resumed:
          onTime && movement.resumed !== undefined
            ? { ...movement.resumed, at: movement.resumed.at + shift }
            : undefined,
      });
      await ctx.scheduler.runAfter(afterMs ?? 0, internal.movements.arrive, {
        movementId: movement._id,
      });
    }
    return moving.length;
  },
});

/**
 * **Les recrues en file sortent tout de suite** : chaque lot daté (la tête de file de sa caserne)
 * est livré maintenant, ou dans `afterMs`, au lieu d'attendre sa formation — le temps d'ouvrir la
 * carte sur la caserne, comme `arriveNow` pour une marche. La livraison est celle du jeu
 * (`troops.deliver`) : la recrue sort au rang commandé.
 *
 * `npx convex run dev:finishRecruitments '{"playerId":"…"}'`
 */
export const finishRecruitments = internalMutation({
  args: { playerId: v.id('players'), afterMs: v.optional(v.number()) },
  handler: async (ctx, { playerId, afterMs }) => {
    const batches = (
      await ctx.db
        .query('recruitments')
        .filter((q) => q.eq(q.field('playerId'), playerId))
        .collect()
    ).filter((batch) => batch.finishesAt !== null);
    for (const batch of batches)
      await ctx.scheduler.runAfter(afterMs ?? 0, internal.troops.deliver, {
        recruitmentId: batch._id,
      });
    return batches.length;
  },
});

/** Des cartes de recherche acquises d'un coup, sans Centre : celles qu'une scène suppose. */
export const grantCards = internalMutation({
  args: { playerId: v.id('players'), cards: v.array(RESEARCH_CARD) },
  handler: async (ctx, { playerId, cards }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    await ctx.db.patch(playerId, {
      researched: [...new Set([...(player.researched ?? []), ...cards])],
    });
  },
});

/**
 * **Une revue à chaque capitale** (`--huit`) : deux fantassins et un blindé de chaque nation de la
 * saison, posés au point de sa capitale. Rend le point de chacune, pour les lieux de la démo.
 */
export const reviewScene = internalMutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    const players = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect();
    const capitals: Record<string, [number, number]> = {};
    for (const player of players) {
      if (!isNation(player.nation)) continue;
      const { lon, lat } = pointOfRegion(capitalRegionOf(player.nation));
      capitals[player.nation] = [lon, lat];
      for (const [role, count] of [
        ['infantry', 2],
        ['armor', 1],
      ] as const)
        for (let k = 0; k < count; k++)
          await ctx.db.insert('troops', {
            seasonId,
            playerId: player._id,
            role,
            tier: 1,
            nominalStrength: nominalStrength(role, 1),
            currentStrength: nominalStrength(role, 1),
            stationedAt: { lon, lat },
          });
    }
    return capitals;
  },
});

/**
 * **Une absence à rejouer** (#439, `--absence`) : le joueur a fermé son journal `hours` heures
 * plus tôt, son dernier rejeu est effacé, ses premiers pas passés, et douze dépêches à lieu sont
 * tombées depuis, en couronne autour de sa capitale ; ce qui était tombé depuis recule d'autant,
 * avant la fermeture. Rejouable à volonté :
 * `npx convex run dev:absenceScene '{"playerId":"…"}'`. Rend le point de la capitale.
 */
export const absenceScene = internalMutation({
  args: { playerId: v.id('players'), hours: v.optional(v.number()) },
  handler: async (ctx, { playerId, hours = 9 }) => {
    const player = await ctx.db.get(playerId);
    if (player === null || !isNation(player.nation)) throw new Error('no such nation');
    const capital = pointOfRegion(capitalRegionOf(player.nation));
    const now = Date.now();
    const away = now - hours * 3_600_000;
    const marks = await ctx.db
      .query('readMarks')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .unique();
    if (marks !== null) await ctx.db.patch(marks._id, { absenceTourAt: undefined });
    // What fell since — the launch's objectives, a previous scene — goes behind the closing: the
    // tour would fly to them first, being the newest.
    const since = await ctx.db
      .query('notices')
      .withIndex('byPlayerAt', (q) => q.eq('playerId', playerId).gt('at', away))
      .collect();
    for (const notice of since) await ctx.db.patch(notice._id, { at: notice.at - (now - away) });
    await stampReadMark(ctx, playerId, { journalReadAt: away });
    await stampReadMark(ctx, playerId, { firstSteps: { done: [], shown: 'skipped' } });
    for (let k = 0; k < 12; k++) {
      const turn = (k / 12) * 2 * Math.PI;
      const reach = 0.7 + (k % 3) * 0.35;
      const point = {
        lon: capital.lon + reach * 1.4 * Math.cos(turn),
        lat: capital.lat + reach * Math.sin(turn),
      };
      const region = nearestRegion([point.lon, point.lat]);
      if (region === null) throw new Error('no region near the capital');
      const head = { playerId, at: away + ((k + 1) / 13) * (now - away) };
      const hostCountry = region.country;
      const rows = [
        { kind: 'columnArrived', movementType: 'march', hostCountry, point, troops: 3 },
        { kind: 'constructionFinished', building: 'barracks', regionId: region.id, level: 2 },
        { kind: 'outpostFounded', hostCountry, point },
        {
          kind: 'recruitmentDelivered',
          role: 'infantry',
          site: { building: 'barracks', regionId: region.id },
        },
        { kind: 'fortHeld', hostCountry, point, headingDegrees: 90, arrivesAt: head.at },
        { kind: 'outpostDisabled', hostCountry, point },
      ] as const;
      await ctx.db.insert('notices', { ...head, ...rows[k % rows.length]! });
    }
    return [capital.lon, capital.lat] as [number, number];
  },
});

/**
 * **Une mine qu'aucun avant-poste ne couvre** (`--hors-portee`) : le QG à Paris, et une mine sur le
 * charbon de la Ruhr, en sol étranger où le joueur n'a posé aucun point. La fiche de la mine lit
 * `unreached` : la montée y est refusée, et dite. Rend le point de la mine.
 */
export const unreachedMineScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const ruhr = DEPOSIT_POINTS.find((point) => point.id === 'coal-DEU-1572');
    if (ruhr === undefined) throw new Error('no deposit coal-DEU-1572');
    await headquartersOf(ctx, player);
    await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId,
      key: 'mine',
      regionId: ruhr.regionId,
      point: { lon: ruhr.lonLat[0], lat: ruhr.lonLat[1] },
      level: 1,
    });
    return ruhr.lonLat;
  },
});

/**
 * **L'Évacuation et la capture, posées** (`--evacuation`, #450) : l'URSS tient une caserne de
 * niveau 2 à Pskov, un entrepôt de niveau 2 à côté, une réserve de caserne au niveau 3 et
 * d'arsenal au niveau 5, et un avant-poste en Roumanie dont le puits est sous capture française ;
 * la France tient une caserne de niveau 2 dans la Marne, sous une capture soviétique. Rend les
 * points.
 */
export const evacuationScene = internalMutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    const players = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect();
    const ussr = players.find((player) => player.nation === 'ussr');
    const france = players.find((player) => player.nation === 'france');
    if (ussr === undefined || france === undefined) throw new Error('--evacuation wants --huit');
    const barracks = async (player: Doc<'players'>, regionId: string) => {
      const hq = await headquartersOf(ctx, player);
      if (hq !== undefined) await ctx.db.patch(hq._id, { level: 4 });
      const point = pointOfRegion(regionId);
      const id = await ctx.db.insert('buildings', {
        seasonId,
        playerId: player._id,
        key: 'barracks',
        regionId,
        point,
        level: 2,
      });
      return { id, point };
    };
    const soviet = await barracks(ussr, 'RUS-2336');
    /** Un arsenal gardé au niveau 5 (pris au plafond) sous un QG de niveau 4 : la tuile dit où
     *  il sortira. */
    await ctx.db.patch(ussr._id, {
      evacuated: [
        { key: 'barracks', level: 3 },
        { key: 'arsenal', level: 5 },
      ],
    });
    /** Un entrepôt sans réserve de son type : sa carte dit « niveau 2 gardé en réserve ». */
    const store = pointOfRegion('RUS-2335');
    await ctx.db.insert('buildings', {
      seasonId,
      playerId: ussr._id,
      key: 'warehouse',
      regionId: 'RUS-2335',
      point: store,
      level: 2,
    });
    const french = await barracks(france, 'FRA-5323');
    const now = Date.now();
    const siege = (
      capturer: Doc<'players'>,
      defender: Doc<'players'>,
      buildingId: Id<'buildings'>,
      building: 'barracks' | 'oilWell',
      regionId: string,
      point: { lon: number; lat: number },
    ) =>
      ctx.db.insert('captures', {
        seasonId,
        playerId: capturer._id,
        defenderId: defender._id,
        target: { kind: 'building', buildingId },
        site: { kind: 'building', building, regionId },
        point,
        progress: 0,
        progressAt: now,
        rate: 1,
        durationMs: 6 * 3_600_000,
        rest: null,
        completesAt: now + 6 * 3_600_000,
      });
    await siege(ussr, france, french.id, 'barracks', 'FRA-5323', french.point);
    /** Un avant-poste soviétique en Roumanie, dont le puits qu'il ancre est sous une capture
     *  française : il ne se démantèle pas (`DISMANTLE_UNDER_CAPTURE`). */
    const prahova = pointOfRegion('ROU-310');
    const outpostId = await ctx.db.insert('outposts', {
      seasonId,
      playerId: ussr._id,
      point: prahova,
      hostCountry: 'ROU',
      regionId: 'ROU-310',
      level: 1,
      foundedAt: now - 1,
      disabledUntil: null,
      immuneUntil: null,
    });
    const wellPoint = { lon: prahova.lon + 0.25, lat: prahova.lat + 0.1 };
    const well = await ctx.db.insert('buildings', {
      seasonId,
      playerId: ussr._id,
      key: 'oilWell',
      regionId: 'ROU-310',
      point: wellPoint,
      level: 1,
      outpostId,
    });
    await siege(france, ussr, well, 'oilWell', 'ROU-310', wellPoint);
    await recordLinkage(ctx, seasonId);
    await surveyFoundation(ctx, seasonId, [prahova.lon, prahova.lat], outpostReachKm(1), now);
    return {
      evacuation: [soviet.point.lon, soviet.point.lat],
      'evacuation-neuf': [store.lon, store.lat],
      'sous-capture': [french.point.lon, french.point.lat],
      demantelement: [prahova.lon, prahova.lat],
    };
  },
});

/**
 * **Le Prêt-bail, posé** (`--pret-bail`, #448) : un avant-poste américain à Aix-la-Chapelle et son
 * camion chargé ; deux avant-postes français en Belgique, Namur au dépôt entamé et Liège, que le
 * relevé américain garde ; un camion français chargé à Namur, qui a relevé Aix-la-Chapelle ; et un
 * Prêt-bail déjà livré à Liège, dont chacun lit sa dépêche. Rend les points.
 */
export const lendLeaseScene = internalMutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    const players = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect();
    const usa = players.find((player) => player.nation === 'usa');
    const france = players.find((player) => player.nation === 'france');
    if (usa === undefined || france === undefined) throw new Error('--pret-bail wants --huit');
    const now = Date.now();
    const plant = (
      player: Doc<'players'>,
      point: { lon: number; lat: number },
      hostCountry: string,
      depot: { ammunition: number; oil: number; coal: number },
    ) =>
      ctx.db.insert('outposts', {
        seasonId,
        playerId: player._id,
        point,
        hostCountry,
        regionId: regionAtPoint([point.lon, point.lat])!.id,
        level: 1,
        specialty: 'general',
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
        depot,
      });
    const aachen = { lon: 6.08, lat: 50.78 };
    const namur = { lon: 4.87, lat: 50.47 };
    const liege = { lon: 5.57, lat: 50.63 };
    const base = await plant(usa, aachen, 'DEU', { ammunition: 0, oil: 0, coal: 0 });
    const french = await plant(france, namur, 'BEL', { ammunition: 150, oil: 60, coal: 0 });
    await plant(france, liege, 'BEL', { ammunition: 80, oil: 40, coal: 0 });
    /** Un camion chargé de chaque côté : l'Américain livre, le Français se voit dire le refus. */
    for (const [player, stationedAt] of [
      [usa, base],
      [france, french],
    ] as const)
      await ctx.db.insert('troops', {
        seasonId,
        playerId: player._id,
        role: 'landTransport',
        tier: 1,
        nominalStrength: nominalStrength('landTransport', 1),
        currentStrength: nominalStrength('landTransport', 1),
        stationedAt,
        load: { ammunition: 120, oil: 80, coal: 40 },
      });
    await recordLinkage(ctx, seasonId);
    await fileSurvey(
      ctx,
      usa._id,
      [namur, liege].map((point) => ({ point: [point.lon, point.lat] as const, radiusKm: 1 })),
      now,
    );
    await fileSurvey(ctx, france._id, [{ point: [aachen.lon, aachen.lat], radiusKm: 1 }], now);
    /** Un Prêt-bail déjà livré à Liège : le convoi rentré dit le lieu, le receveur la nation. */
    const delivered = { ammunition: 80, oil: 40, coal: 0 };
    await ctx.db.insert('notices', {
      playerId: usa._id,
      at: now - 60_000,
      kind: 'supplyDelivered',
      hostCountry: 'BEL',
      point: liege,
      delivered,
      kept: { ammunition: 20, oil: 0, coal: 0 },
      abroad: true,
    });
    await ctx.db.insert('notices', {
      playerId: france._id,
      at: now - 60_000,
      kind: 'lendLeaseReceived',
      nation: 'usa',
      hostCountry: 'BEL',
      point: liege,
      delivered,
    });
    await reassessDetection(ctx, seasonId, now);
    return {
      'pret-bail': [namur.lon, namur.lat],
      'pret-bail-convoi': [aachen.lon, aachen.lat],
      'pret-bail-recu': [liege.lon, liege.lat],
    };
  },
});

/**
 * **La Doctrine du porte-avions** (#449, `--porte-avions` avec `--huit`) : une escadre japonaise
 * qui part au large de Honshu (cap libre, compte g), une autre déjà passée la mi-parcours vers
 * Truk (cap tenu), et une escadre française partie du même point vers le même cap, au même
 * instant (sans l'atout, compte a).
 */
export const carrierDoctrineScene = internalMutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    const season = (await ctx.db.get(seasonId))!;
    const players = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect();
    const japan = players.find((player) => player.nation === 'japan');
    const france = players.find((player) => player.nation === 'france');
    if (japan === undefined || france === undefined) throw new Error('--porte-avions wants --huit');
    const now = Date.now();
    const sail = async (
      player: Doc<'players'>,
      from: { lon: number; lat: number },
      to: { lon: number; lat: number },
    ) => {
      const troopIds = [];
      for (const role of ['carrier', 'escort'] as const)
        troopIds.push(
          await ctx.db.insert('troops', {
            seasonId,
            playerId: player._id,
            role,
            tier: 1,
            nominalStrength: nominalStrength(role, 1),
            currentStrength: nominalStrength(role, 1),
            stationedAt: from,
          }),
        );
      return march(ctx, {
        playerId: player._id,
        season,
        type: 'march',
        origin: { kind: 'point', point: from },
        troopIds,
        aim: await aimOf(ctx, player._id, { kind: 'point', point: to }),
      });
    };
    const offHonshu = { lon: 142, lat: 32 };
    const eastward = { lon: 158, lat: 25 };
    await sail(japan, offHonshu, eastward);
    await sail(france, offHonshu, eastward);
    /** Partie il y a six dixièmes de sa route : la mi-parcours est derrière elle. */
    const held = await sail(japan, { lon: 150, lat: 30 }, { lon: 152, lat: 12 });
    const length = held.arrivesAt - now;
    const arrivesAt = now + length * 0.4;
    await ctx.db.patch(held.movementId, { departedAt: now - length * 0.6, arrivesAt });
    await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, {
      movementId: held.movementId,
    });
    const past = marchingForce((await ctx.db.get(held.movementId))!);
    await reassessDetection(ctx, seasonId, now);
    return {
      'porte-avions': [offHonshu.lon, offHonshu.lat],
      'porte-avions-tenu': positionAt(past, now),
    };
  },
});

/**
 * **Poser une Guerre éclair** (#451) : des avant-postes `foe` relevés par `attacker`, ses chars à
 * `from`, et l'attaque à deux cibles telle que `movements.attack` la dépose. `arrivedNow` ramène
 * son arrivée à l'instant (le trajet glissé avec elle), et le job d'arrivée part tout de suite.
 */
async function stageBlitzkrieg(
  ctx: MutationCtx,
  {
    attacker,
    foe,
    from,
    first,
    then,
    tanks = 3,
    rounds,
    garrison = [],
    arrivedNow = false,
    hostCountry,
  }: {
    attacker: Doc<'players'>;
    foe: Doc<'players'>;
    from: { lon: number; lat: number };
    first: { lon: number; lat: number };
    then: { lon: number; lat: number };
    tanks?: number;
    rounds?: number;
    garrison?: ReadonlyArray<UnitRole>;
    arrivedNow?: boolean;
    hostCountry?: string;
  },
) {
  const season = (await ctx.db.get(attacker.seasonId))!;
  const now = Date.now();
  const troop = (
    player: Doc<'players'>,
    role: UnitRole,
    stationedAt: Doc<'troops'>['stationedAt'],
  ) =>
    ctx.db.insert('troops', {
      seasonId: season._id,
      playerId: player._id,
      role,
      tier: 1,
      nominalStrength: nominalStrength(role, 1),
      currentStrength: nominalStrength(role, 1),
      stationedAt,
      ...(rounds === undefined || player._id !== attacker._id ? {} : { rounds }),
    });
  const outposts: Id<'outposts'>[] = [];
  for (const point of [first, then]) {
    const region = regionAtPoint([point.lon, point.lat])!;
    outposts.push(
      await ctx.db.insert('outposts', {
        seasonId: season._id,
        playerId: foe._id,
        point,
        hostCountry: hostCountry ?? region.country,
        regionId: region.id,
        level: 1,
        specialty: 'general',
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
      }),
    );
  }
  for (const role of garrison) await troop(foe, role, outposts[0]!);
  await fileSurvey(
    ctx,
    attacker._id,
    [first, then].map((point) => ({ point: [point.lon, point.lat] as const, radiusKm: 1 })),
    now,
  );
  const troopIds = [];
  for (let k = 0; k < tanks; k++) troopIds.push(await troop(attacker, 'armor', from));
  const aimed = await aimOf(ctx, attacker._id, { kind: 'outpost', outpostId: outposts[0]! });
  const filed = await march(ctx, {
    playerId: attacker._id,
    season,
    type: 'attack',
    origin: { kind: 'point', point: from },
    troopIds,
    aim: aimed,
    keepsSlot: true,
  });
  await chainSecondTarget(ctx, attacker, season, filed.movementId, aimed.aim, {
    kind: 'outpost',
    outpostId: outposts[1]!,
  });
  if (arrivedNow) {
    const length = filed.arrivesAt - now;
    await ctx.db.patch(filed.movementId, { departedAt: now - length, arrivesAt: now });
    await ctx.scheduler.runAt(now, internal.movements.arrive, { movementId: filed.movementId });
  }
  return { movementId: filed.movementId, troopIds, outposts };
}

/**
 * **La Guerre éclair** (#451, `--guerre-eclair` avec `--huit`, l'Allemagne au compte c) : une
 * colonne allemande en main devant Aix-la-Chapelle, face à deux avant-postes français relevés
 * (Liège, Namur), un point de marche (Spa) et un avant-poste allemand (Bastogne) pour le refus ;
 * puis, chacune à part, une attaque à deux cibles en vol (Luxembourg puis Arlon), une seconde
 * jambe partie (Malines tenue, vers Louvain), une tombée (Gand, garnison trop forte) et une
 * restée sur place faute de coups (Neufchâteau). La France (compte a) voit repartir de Malines
 * une colonne inconnue.
 */
export const blitzkriegScene = internalMutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    const players = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect();
    const germany = players.find((player) => player.nation === 'germany');
    const france = players.find((player) => player.nation === 'france');
    if (germany === undefined || france === undefined)
      throw new Error('--guerre-eclair wants --huit');
    const now = Date.now();
    const p = (lon: number, lat: number) => ({ lon, lat });
    const aachen = p(6.08, 50.78);
    const liege = p(5.57, 50.63);
    const namur = p(4.87, 50.47);
    const bastogne = p(5.72, 50.02);
    const spa = p(5.86, 50.49);
    /** La main : trois chars posés, deux avant-postes français relevés, un allemand. */
    for (let k = 0; k < 3; k++)
      await ctx.db.insert('troops', {
        seasonId,
        playerId: germany._id,
        role: 'armor',
        tier: 1,
        nominalStrength: nominalStrength('armor', 1),
        currentStrength: nominalStrength('armor', 1),
        stationedAt: aachen,
      });
    for (const [player, point] of [
      [france, liege],
      [france, namur],
      [germany, bastogne],
    ] as const) {
      const region = regionAtPoint([point.lon, point.lat])!;
      await ctx.db.insert('outposts', {
        seasonId,
        playerId: player._id,
        point,
        hostCountry: region.country,
        regionId: region.id,
        level: 1,
        specialty: 'general',
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
      });
    }
    await fileSurvey(
      ctx,
      germany._id,
      [liege, namur].map((point) => ({ point: [point.lon, point.lat] as const, radiusKm: 1 })),
      now,
    );
    const luxembourg = p(6.13, 49.61);
    const arlon = p(5.81, 49.68);
    await stageBlitzkrieg(ctx, {
      attacker: germany,
      foe: france,
      from: p(6.64, 49.75),
      first: luxembourg,
      then: arlon,
    });
    const mechelen = p(4.48, 51.03);
    const leuven = p(4.7, 50.88);
    await stageBlitzkrieg(ctx, {
      attacker: germany,
      foe: france,
      from: p(4.4, 51.22),
      first: mechelen,
      then: leuven,
      arrivedNow: true,
    });
    const ghent = p(3.72, 51.05);
    await stageBlitzkrieg(ctx, {
      attacker: germany,
      foe: france,
      from: p(3.26, 50.83),
      first: ghent,
      then: p(3.22, 51.21),
      tanks: 2,
      garrison: ['armor', 'armor', 'armor', 'armor', 'armor', 'armor'],
      arrivedNow: true,
    });
    const neufchateau = p(5.43, 49.84);
    await stageBlitzkrieg(ctx, {
      attacker: germany,
      foe: france,
      from: p(5.07, 49.79),
      first: neufchateau,
      then: p(5.38, 49.92),
      rounds: 1,
      garrison: ['infantry'],
      arrivedNow: true,
    });
    await recordLinkage(ctx, seasonId);
    await reassessDetection(ctx, seasonId, now);
    const at = (point: { lon: number; lat: number }) => [point.lon, point.lat];
    return {
      'guerre-eclair': at(aachen),
      liege: at(liege),
      namur: at(namur),
      bastogne: at(bastogne),
      spa: at(spa),
      'guerre-eclair-lancee': at(luxembourg),
      'guerre-eclair-tenue': at(mechelen),
      'guerre-eclair-perdue': at(ghent),
      'guerre-eclair-restee': at(neufchateau),
    };
  },
});

/**
 * **Le banc de la seconde jambe** (#451) : deux attaques allemandes sur un même genre de cible
 * gardée, l'une simple, l'autre à deux cibles, ramenées à leur arrivée. Le banc mesure chacune
 * par `movements:arrive` : la seconde jambe ne doit pas alourdir la passe.
 */
export const benchBlitzkrieg = internalMutation({
  args: { attackerId: v.id('players'), defenderId: v.id('players'), from: LON_LAT },
  handler: async (ctx, { attackerId, defenderId, from }) => {
    const attacker = (await ctx.db.get(attackerId))!;
    const foe = (await ctx.db.get(defenderId))!;
    const ids = [];
    for (const [k, chained] of [false, true].entries()) {
      const near = { lon: from.lon + 0.3, lat: from.lat + 0.2 * (k + 1) };
      const staged = await stageBlitzkrieg(ctx, {
        attacker,
        foe,
        from,
        first: near,
        then: { lon: near.lon + 0.3, lat: near.lat },
        garrison: ['infantry'],
        hostCountry: 'BENCH',
      });
      if (!chained) await ctx.db.patch(staged.movementId, { blitzkrieg: undefined });
      /** Échue tout de suite, sa durée gardée : la vue lit la part parcourue sur les deux. */
      const movement = (await ctx.db.get(staged.movementId))!;
      const due = Date.now() - 1;
      await ctx.db.patch(staged.movementId, {
        departedAt: movement.departedAt - (movement.arrivesAt - due),
        arrivesAt: due,
      });
      ids.push(staged.movementId);
    }
    await reassessDetection(ctx, attacker.seasonId, Date.now(), attackerId);
    return { plain: ids[0]!, chained: ids[1]! };
  },
});

/**
 * **Une présence de pillage déjà entamée** (`--pillage`) : les colonnes en phase de présence
 * sont reculées de `hours` heures, de sorte que les caisses tombées à chaque quart de la présence
 * (`loadingAt`) se voient déjà ; la fin de présence est replanifiée à sa nouvelle date.
 */
export const pastPresence = internalMutation({
  args: { playerId: v.id('players'), hours: v.number() },
  handler: async (ctx, { playerId, hours }) => {
    const movements = await ctx.db
      .query('movements')
      .filter((q) => q.eq(q.field('playerId'), playerId))
      .collect();
    const now = Date.now();
    let moved = 0;
    for (const movement of movements) {
      if (movement.plunder?.phase !== 'presence') continue;
      /** Never past now: a deadline in the past would replan a job the clock has already missed. */
      const back = Math.min(hours * 3_600_000, movement.plunder.until - now);
      const until = movement.plunder.until - back;
      await ctx.db.patch(movement._id, {
        departedAt: movement.departedAt - back,
        arrivesAt: until,
        plunder: { ...movement.plunder, until },
      });
      await ctx.scheduler.runAt(until, internal.movements.completePlunderPresence, {
        movementId: movement._id,
        expectedAt: until,
      });
      moved++;
    }
    return moved;
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
 * **Les sites au repos qui vivent** (#273), pour la démo : quatre mines françaises sur leurs
 * gisements (deux de charbon, deux de fer), un chantier naval au Havre, une coque sur cale, et
 * Bakou tenu, son puits sur le gisement. Le Centre qui cherche est celui de `researchScene`.
 *
 * `npx convex run dev:sitesScene '{"playerId":"…"}'`
 */
export const sitesScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null || !isNation(player.nation)) throw new Error('no such player');
    await headquartersOf(ctx, player);
    const now = Date.now();
    const baku = await layPoint(ctx, player.seasonId, 'baku');
    if (baku === null) throw new Error('no region under baku');
    await ctx.db.patch(baku._id, { holderId: playerId, heldSince: now - 3_600_000 });
    for (const [key, id] of [
      ['mine', 'coal-FRA-5328'],
      ['mine', 'coal-FRA-5334'],
      ['mine', 'iron-FRA-5325'],
      ['mine', 'iron-FRA-5275'],
      ['oilWell', 'oil-AZE-1690'],
    ] as const) {
      const deposit = DEPOSIT_POINTS.find((candidate) => candidate.id === id);
      if (deposit === undefined) throw new Error(`no deposit ${id}`);
      await ctx.db.insert('buildings', {
        seasonId: player.seasonId,
        playerId,
        key,
        regionId: deposit.regionId,
        point: { lon: deposit.lonLat[0], lat: deposit.lonLat[1] },
        level: 1,
      });
    }
    const point = { lon: 0.11, lat: 49.49 };
    const region = nearestRegion([point.lon, point.lat]);
    if (region === null) throw new Error('no region at Le Havre');
    const port = await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId,
      key: 'port',
      regionId: region.id,
      point,
      level: 1,
    });
    // A hull on the slip for the day: nothing delivers it.
    await ctx.db.insert('recruitments', {
      playerId,
      buildingId: port,
      role: 'escort',
      tier: 1,
      rank: 0,
      finishesAt: now + 24 * 3_600_000,
    });
    await recordLinkage(ctx, player.seasonId);
    await reassessDetection(ctx, player.seasonId, now, playerId);
  },
});

/**
 * **Une mine jumelle sabotée** (#432), pour la démo : à six cents mètres de la mine de charbon de
 * `sitesScene` (même gisement, même région, même clé), une seconde hors service douze heures.
 * Seule celle de `sitesScene` doit s'animer. À lancer après `sitesScene`.
 *
 * `npx convex run dev:sabotageScene '{"playerId":"…"}'`
 */
export const sabotageScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null || !isNation(player.nation)) throw new Error('no such player');
    const now = Date.now();
    const deposit = DEPOSIT_POINTS.find((candidate) => candidate.id === 'coal-FRA-5328');
    if (deposit === undefined) throw new Error('no deposit coal-FRA-5328');
    await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId,
      key: 'mine',
      regionId: deposit.regionId,
      point: { lon: deposit.lonLat[0] + 0.008, lat: deposit.lonLat[1] },
      level: 1,
      disabledUntil: now + PLUNDER_DISABLED_HOURS * 3_600_000,
    });
    await recordLinkage(ctx, player.seasonId);
    await reassessDetection(ctx, player.seasonId, now, playerId);
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
      researched: [
        ...new Set<ResearchCard>([
          ...(player.researched ?? []),
          'transmissions1',
          'transmissions2',
        ]),
      ],
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
 * **Bakou, Narvik, Singapour et Halifax tenus** par le joueur, **Dakar par l'adversaire**. Un puits
 * de pétrole du joueur en Prahova, coupé du réseau (Narvik : il produit un quart) ; un entrepôt de
 * l'adversaire en Pologne, relevé (le pillage y laisse 600 par ressource). Un blindé à sec en
 * Basse-Saxe, arrêté depuis 5 h (à Bakou son prochain cran vient dans 7 h) ; un camion plein et son
 * fantassin à Coblence (−20 % de plein à Singapour) ; une escorte en Atlantique, que la démo envoie
 * en mer (Halifax : ce mouvement ne prend pas de slot) ; les deux dépêches du dépôt qui brûle à Dakar.
 */
export const pointsScene = internalMutation({
  args: { playerId: v.id('players'), enemyId: v.id('players') },
  handler: async (ctx, { playerId, enemyId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const now = Date.now();
    for (const [key, holder] of [
      ['baku', player._id],
      ['narvik', player._id],
      ['singapore', player._id],
      ['halifax', player._id],
      ['dakar', enemyId],
    ] as const) {
      const point = await layPoint(ctx, player.seasonId, key);
      if (point === null) throw new Error(`no region under ${key}`);
      await ctx.db.patch(point._id, { holderId: holder, heldSince: now - 3 * 3_600_000 });
    }
    /** L'entrepôt de l'adversaire loin du puits, en Pologne : visé seul, sans cliquer le puits. */
    const warehouseRegion = nearestRegion([20, 52]);
    if (warehouseRegion === null) throw new Error('no region in Poland');
    for (const [owner, key, regionId] of [
      [playerId, 'oilWell', 'ROU-310'],
      [enemyId, 'warehouse', warehouseRegion.id],
    ] as const) {
      /** Un puits se pose sur son gisement : la région seule ne dit pas où il tient. */
      const deposit = DEPOSIT_POINTS.find((candidate) => candidate.regionId === regionId);
      await ctx.db.insert('buildings', {
        seasonId: player.seasonId,
        playerId: owner,
        key,
        regionId,
        point:
          deposit === undefined
            ? pointOfRegion(regionId)
            : { lon: deposit.lonLat[0], lat: deposit.lonLat[1] },
        level: 1,
      });
    }
    await fileSurvey(ctx, playerId, [{ point: warehouseRegion.point, radiusKm: 1 }], now);
    await recordLinkage(ctx, player.seasonId);
    /** Chaque pile à son point : le camion marche avec son fantassin (un transport seul ne fait
     *  qu'un raid). */
    for (const [role, fuel, at] of [
      ['armor', 0, { lon: 9.7, lat: 52.4 }],
      ['escort', undefined, { lon: -30, lat: 45 }],
      ['landTransport', 4, { lon: 7.6, lat: 50.35 }],
      ['infantry', undefined, { lon: 7.6, lat: 50.35 }],
    ] as const)
      await ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId,
        role,
        tier: 1,
        nominalStrength: nominalStrength(role, 1),
        currentStrength: nominalStrength(role, 1),
        stationedAt: at,
        ...(fuel === undefined ? {} : { fuel, fuelAt: now - 5 * 3_600_000 }),
      });
    const lost = { ammunition: 40, oil: 20, coal: 0 };
    await ctx.db.insert('notices', {
      playerId: enemyId,
      at: now,
      kind: 'depotBurned',
      side: 'holder',
      country: 'BEL',
      lost,
    });
    await ctx.db.insert('notices', {
      playerId,
      at: now,
      kind: 'depotBurned',
      side: 'capturer',
      country: 'BEL',
      lost,
    });
  },
});

/**
 * **Deux nations côte à côte** (#217), pour la démo : un avant-poste britannique en Hainaut, contre
 * le Nord français, de quoi voir deux contours voisins chacun en retrait chez lui.
 *
 * `npx convex run dev:neighbourScene '{"playerId":"…"}'`
 */
export const neighbourScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    await ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId,
      point: { lon: 3.95, lat: 50.45 },
      hostCountry: 'BEL',
      level: 2,
      specialty: 'lookout',
      foundedAt: Date.now() - 1,
      disabledUntil: null,
      immuneUntil: null,
    });
    await recordLinkage(ctx, player.seasonId);
    await surveyFoundation(ctx, player.seasonId, [3.95, 50.45], outpostReachKm(2), Date.now());
  },
});

/**
 * **La scène des gisements** (#239), pour la démo, au cadrage de la maquette : un QG à Paris, une
 * mine de niveau 2 sur le charbon du Nord, un avant-poste à Namur, et une mine adverse relevée sur
 * le charbon de la Sarre. Une mine en main y trouve le Hainaut prenable, la Sarre prise, la Ruhr
 * hors de portée ; un puits, aucun pétrole à sa portée.
 *
 * `npx convex run dev:depositsScene '{"playerId":"…","enemyId":"…"}'`
 */
export const depositsScene = internalMutation({
  args: { playerId: v.id('players'), enemyId: v.id('players') },
  handler: async (ctx, { playerId, enemyId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const now = Date.now();
    const deposit = (id: string) => {
      const point = DEPOSIT_POINTS.find((candidate) => candidate.id === id);
      if (point === undefined) throw new Error(`no deposit ${id}`);
      return { lon: point.lonLat[0], lat: point.lonLat[1] };
    };
    for (const [owner, key, regionId, point, level] of [
      [playerId, 'hq', 'FRA-5333', pointOfRegion('FRA-5333'), 1],
      [playerId, 'mine', 'FRA-5334', deposit('coal-FRA-5334'), 2],
      [enemyId, 'mine', 'DEU-1581', deposit('coal-DEU-1581'), 1],
    ] as const)
      await ctx.db.insert('buildings', {
        seasonId: player.seasonId,
        playerId: owner,
        key,
        regionId,
        point,
        level,
      });
    await ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId,
      point: { lon: 4.87, lat: 50.47 },
      hostCountry: 'BEL',
      level: 1,
      foundedAt: now - 1,
      disabledUntil: null,
      immuneUntil: null,
    });
    const saar = deposit('coal-DEU-1581');
    await fileSurvey(ctx, playerId, [{ point: [saar.lon, saar.lat], radiusKm: 1 }], now);
    await recordLinkage(ctx, player.seasonId);
  },
});

/**
 * **La scène des quais** (#221), pour la démo : trois avant-postes français, à La Valette, à
 * Singapour et à Florence, d'où viser un port sur une île, sur une côte qui borde un voisin, et
 * dans l'intérieur.
 *
 * `npx convex run dev:quaysScene '{"playerId":"…"}'`
 */
export const quaysScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const places = [
      { lon: 14.45, lat: 35.9, hostCountry: 'MLT' },
      { lon: 103.82, lat: 1.35, hostCountry: 'SGP' },
      { lon: 11.25, lat: 43.77, hostCountry: 'ITA' },
    ];
    for (const { lon, lat, hostCountry } of places)
      await ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon, lat },
        hostCountry,
        level: 3,
        /** Malte en Fort ; les deux autres, points d'avant la refonte, choisissent encore. */
        ...(hostCountry === 'MLT' ? { specialty: 'fort' as const } : {}),
        foundedAt: Date.now() - 1,
        disabledUntil: null,
        immuneUntil: null,
      });
    await recordLinkage(ctx, player.seasonId);
  },
});

/**
 * **La scène des liaisons** (#370), pour la démo : deux avant-postes français en liaison, Namur et
 * Liège, un troisième seul à Bâle, à plus de 240 km des deux, et une pile à Charleroi d'où viser Aix-la-Chapelle à
 * travers les deux rayons. Avec `dryCoal`, le charbon national tombe à zéro : toutes les vigies
 * aveugles.
 *
 * `npx convex run dev:liaisonsScene '{"playerId":"…","dryCoal":false}'`
 */
export const liaisonsScene = internalMutation({
  args: { playerId: v.id('players'), dryCoal: v.boolean() },
  handler: async (ctx, { playerId, dryCoal }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const now = Date.now();
    for (const [lon, lat, hostCountry] of [
      [4.87, 50.47, 'BEL'],
      [5.57, 50.63, 'BEL'],
      [7.59, 47.56, 'CHE'],
    ] as const)
      await ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon, lat },
        hostCountry,
        level: 1,
        specialty: 'general',
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
      });
    for (let count = 0; count < 2; count += 1)
      await ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId,
        role: 'infantry',
        tier: 1,
        nominalStrength: nominalStrength('infantry', 1),
        currentStrength: nominalStrength('infantry', 1),
        stationedAt: { lon: 4.44, lat: 50.41 },
      });
    if (dryCoal) {
      await settle(ctx, playerId, now);
      const coal = await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect();
      for (const row of coal.filter((one) => one.key === 'coal'))
        await ctx.db.patch(row._id, { stock: 0, updatedAt: now });
    }
    await recordLinkage(ctx, player.seasonId);
    await reassessDetection(ctx, player.seasonId, now, playerId);
  },
});

/**
 * **La scène des zones** (#375), pour la démo : un réseau français en Lorraine. Metz au centre
 * (niveau 2), Luxembourg et Nancy (niveau 1), Sarrebruck en Guet (niveau 2) — des triangles dont
 * la carte retire le côté long —, Strasbourg désactivé (ni lavis ni liaison), et une pile à
 * Thionville à soulever.
 *
 * `npx convex run dev:zonesScene '{"playerId":"…"}'`
 */
export const zonesScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const now = Date.now();
    for (const [lon, lat, hostCountry, level, more] of [
      [6.13, 49.61, 'LUX', 1, {}],
      [6.18, 49.12, 'FRA', 2, {}],
      [6.18, 48.69, 'FRA', 1, {}],
      [7.0, 49.23, 'DEU', 2, { specialty: 'lookout' }],
      [7.75, 48.58, 'FRA', 1, { disabledUntil: now + 3 * 60 * 60 * 1000 }],
    ] as const)
      await ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon, lat },
        hostCountry,
        level,
        specialty: 'general',
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
        ...more,
      });
    for (let count = 0; count < 2; count += 1)
      await ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId,
        role: 'infantry',
        tier: 1,
        nominalStrength: nominalStrength('infantry', 1),
        currentStrength: nominalStrength('infantry', 1),
        stationedAt: { lon: 6.17, lat: 49.36 },
      });
    await recordLinkage(ctx, player.seasonId);
    await reassessDetection(ctx, player.seasonId, now, playerId);
  },
});

/**
 * **La scène des rondes** (#376), pour la démo : quatre avant-postes français en étoile autour de
 * Metz (Luxembourg, Nancy, Sarrebruck), un blindé à Luxembourg que la démo lance en ronde vers
 * Metz, une infanterie en halte à Nancy sur Metz–Nancy, une infanterie seule à Metz (la liaison
 * vers Sarrebruck est libre), et la dépêche d'une ronde dont la liaison a été retirée du tracé.
 * Deux cartes Transmissions : quatre slots, pour que le geste ne bute pas sur le dernier.
 *
 * `npx convex run dev:patrolScene '{"playerId":"…"}'`
 */
export const patrolScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const now = Date.now();
    const researched: ResearchCard[] = ['transmissions1', 'transmissions2'];
    await ctx.db.patch(playerId, {
      researched: [...new Set([...(player.researched ?? []), ...researched])],
    });
    const plant = (lon: number, lat: number, hostCountry: string) =>
      ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon, lat },
        hostCountry,
        level: 1,
        specialty: 'general',
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
      });
    const luxembourg = await plant(6.13, 49.61, 'LUX');
    const metz = await plant(6.18, 49.12, 'FRA');
    const nancy = await plant(6.18, 48.69, 'FRA');
    await plant(7.0, 49.23, 'DEU');
    const troop = (role: UnitRole, stationedAt: Id<'outposts'>) =>
      ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId,
        role,
        tier: 1,
        nominalStrength: nominalStrength(role, 1),
        currentStrength: nominalStrength(role, 1),
        stationedAt,
      });
    await troop('armor', luxembourg);
    await troop('infantry', metz);
    const halted = await troop('infantry', nancy);
    const haltUntil = now + 40 * 60_000;
    const jobId = await ctx.scheduler.runAt(haltUntil, internal.patrols.haltEnds, {
      troopId: halted,
    });
    await ctx.db.patch(halted, { patrol: { ends: [metz, nancy], to: nancy, haltUntil, jobId } });
    await ctx.db.insert('notices', {
      playerId,
      at: now - 5 * 60_000,
      kind: 'patrolEnded',
      role: 'artillery',
      why: 'withdrawn',
      hostCountry: 'FRA',
    });
    await recordLinkage(ctx, player.seasonId);
    await reassessDetection(ctx, player.seasonId, now, playerId);
  },
});

/**
 * **La scène de la ligne de guet** (#377), pour la démo : deux avant-postes français hors de
 * France, Liège et Sarrebruck, en liaison, une infanterie en ronde en halte à Liège, et une
 * colonne de l'adversaire partie de Virton vers Coblence, qui a coupé la liaison il y a cinq
 * minutes au milieu, loin des deux vigies et de notre sol : relevée au point de franchissement
 * par la seule ligne, et la dépêche le dit.
 *
 * `npx convex run dev:watchLineScene '{"playerId":"…","enemyId":"…"}'`
 */
export const watchLineScene = internalMutation({
  args: { playerId: v.id('players'), enemyId: v.id('players') },
  handler: async (ctx, { playerId, enemyId }) => {
    const player = await ctx.db.get(playerId);
    const season = player === null ? null : await ctx.db.get(player.seasonId);
    if (player === null || season === null) throw new Error('no such player');
    const now = Date.now();
    const plant = (lon: number, lat: number, hostCountry: string) =>
      ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon, lat },
        hostCountry,
        level: 1,
        specialty: 'general',
        foundedAt: now - 3_600_000,
        disabledUntil: null,
        immuneUntil: null,
      });
    const liege = await plant(5.57, 50.63, 'BEL');
    const saarbrucken = await plant(7.0, 49.23, 'DEU');
    const patrol = await ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId,
      role: 'infantry',
      tier: 1,
      nominalStrength: nominalStrength('infantry', 1),
      currentStrength: nominalStrength('infantry', 1),
      stationedAt: liege,
    });
    const haltUntil = now + 2 * 3_600_000;
    const jobId = await ctx.scheduler.runAt(haltUntil, internal.patrols.haltEnds, {
      troopId: patrol,
    });
    await ctx.db.patch(patrol, {
      patrol: { ends: [liege, saarbrucken], to: saarbrucken, haltUntil, jobId },
    });

    const from = { lon: 5.46, lat: 49.59 };
    const troopId = await ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: enemyId,
      role: 'armor',
      tier: 1,
      nominalStrength: nominalStrength('armor', 1),
      currentStrength: nominalStrength('armor', 1),
      stationedAt: from,
    });
    const { movementId } = await march(ctx, {
      playerId: enemyId,
      season,
      type: 'march',
      origin: { kind: 'point', point: from },
      troopIds: [troopId],
      aim: await aimOf(ctx, enemyId, { kind: 'point', point: { lon: 7.12, lat: 50.27 } }),
    });
    const movement = (await ctx.db.get(movementId))!;
    const crossing = lineCrossingOf(
      marchingForce(movement),
      [
        [5.57, 50.63],
        [7.0, 49.23],
      ],
      movement.departedAt,
    );
    if (crossing === null) throw new Error('the column misses the line');
    /** Partie plus tôt, elle a franchi il y a cinq minutes ; la lecture se fait juste avant, pour
     *  que le relevé et sa dépêche partent comme ils seraient partis. */
    const shift = crossing.at - (now - 5 * 60_000);
    await ctx.db.patch(movementId, {
      departedAt: movement.departedAt - shift,
      arrivesAt: movement.arrivesAt - shift,
    });
    await ctx.scheduler.runAt(movement.arrivesAt - shift, internal.movements.arrive, {
      movementId,
    });
    await recordLinkage(ctx, player.seasonId);
    await reassessDetection(ctx, player.seasonId, crossing.at - shift - 60_000, [
      playerId,
      enemyId,
    ]);
  },
});

/**
 * **Deux vigies et un trou** (#412), pour la démo : deux généralistes français, à Cologne et à
 * Erfurt, et un blindé britannique d'Aix-la-Chapelle à Leipzig qui passe sous l'un puis sous
 * l'autre. Parti plus tôt, il est dans le trou d'entre les deux — ou, `reappeared`, sous la
 * seconde vigie : le premier tronçon a disparu, l'arc repart de la réapparition.
 *
 * `npx convex run dev:twoSentriesScene '{"playerId":"…","enemyId":"…","reappeared":false}'`
 */
export const twoSentriesScene = internalMutation({
  args: { playerId: v.id('players'), enemyId: v.id('players'), reappeared: v.boolean() },
  handler: async (ctx, { playerId, enemyId, reappeared }) => {
    const player = await ctx.db.get(playerId);
    const season = player === null ? null : await ctx.db.get(player.seasonId);
    if (player === null || season === null) throw new Error('no such player');
    const now = Date.now();
    for (const [lon, lat] of [
      [6.96, 50.94],
      [11.03, 50.98],
    ] as const)
      await ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon, lat },
        hostCountry: 'DEU',
        level: 1,
        specialty: 'general',
        foundedAt: now - 86_400_000,
        disabledUntil: null,
        immuneUntil: null,
      });
    const from = { lon: 6.08, lat: 50.78 };
    const troopId = await ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: enemyId,
      role: 'armor',
      tier: 1,
      nominalStrength: nominalStrength('armor', 1),
      currentStrength: nominalStrength('armor', 1),
      stationedAt: from,
    });
    const { movementId } = await march(ctx, {
      playerId: enemyId,
      season,
      type: 'march',
      origin: { kind: 'point', point: from },
      troopIds: [troopId],
      aim: await aimOf(ctx, enemyId, { kind: 'point', point: { lon: 12.37, lat: 51.34 } }),
    });
    const row = (
      await ctx.db
        .query('sightings')
        .withIndex('byMovement', (q) => q.eq('movementId', movementId))
        .collect()
    ).find((one) => one.playerId === playerId);
    const [first, second] = row === undefined ? [] : windowsOf(row);
    if (first === undefined || second === undefined) throw new Error('no hole between the two');
    const at = reappeared ? (second.from + second.to) / 2 : (first.to + second.from) / 2;
    const shift = at - now;
    const movement = (await ctx.db.get(movementId))!;
    await ctx.db.patch(movementId, {
      departedAt: movement.departedAt - shift,
      arrivesAt: movement.arrivesAt - shift,
    });
    await ctx.scheduler.runAt(movement.arrivesAt - shift, internal.movements.arrive, {
      movementId,
    });
    /** Relue à son départ, la ligne est celle qu'une partie aurait écrite : ses rendez-vous
     *  échus partent aussitôt, la dépêche et la réapparition. */
    await reassessDetection(ctx, player.seasonId, movement.departedAt - shift, [playerId, enemyId]);
    await recordLinkage(ctx, player.seasonId);
  },
});

/**
 * **La scène des métiers** (#371), pour la démo : quatre avant-postes français entre Arlon et
 * Sarrebruck. À Arlon un point de niveau 1, dont l'élévation offre Magasin, Guet et Fort ; à
 * Luxembourg un point d'avant la refonte, généraliste au niveau 2, qui choisit gratuitement ; à
 * Trèves un Magasin plein au-delà de la capacité simple, en file pour devenir Guet (en chantier
 * dès que la file le fait partir) ; à
 * Sarrebruck un Guet, au rayon entier. L'acier est remis à 1 000 pour que tout se paie.
 *
 * `npx convex run dev:specialtiesScene '{"playerId":"…"}'`
 */
export const specialtiesScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const now = Date.now();
    const plant = (
      lon: number,
      lat: number,
      hostCountry: string,
      level: number,
      more: Partial<Doc<'outposts'>> = {},
    ) =>
      ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon, lat },
        hostCountry,
        level,
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
        ...more,
      });
    await plant(5.81, 49.68, 'BEL', 1);
    await plant(6.13, 49.61, 'LUX', 2);
    const changing = await plant(6.64, 49.75, 'DEU', 2, {
      specialty: 'store',
      depot: { ammunition: 700, oil: 300, coal: 200 },
    });
    await plant(7.0, 49.23, 'DEU', 2, { specialty: 'lookout' });
    /** Mis en file comme le ferait `respecializeOutpost`, au dernier rang et sans date : c'est la
     *  file qui le fait partir à son tour (`resume`), à la durée de `worksMinutes`, et qui pose
     *  `changingTo` au départ. Derrière un chantier en cours (`--chantiers`), il attend. */
    const queue = await ctx.db
      .query('constructions')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect();
    await ctx.db.insert('constructions', {
      playerId,
      building: 'outpost',
      outpostId: changing,
      specialty: 'lookout',
      respecialize: true,
      regionId: '',
      level: 2,
      rank: queue.reduce((top, entry) => Math.max(top, entry.rank + 1), 0),
      finishesAt: null,
    });
    await ctx.runMutation(internal.constructions.resume, { playerId });
    await settle(ctx, playerId, now);
    for (const row of (
      await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect()
    ).filter((one) => one.key === 'steel'))
      await ctx.db.patch(row._id, { stock: 1000, updatedAt: now });
    await recordLinkage(ctx, player.seasonId);
    await reassessDetection(ctx, player.seasonId, now, playerId);
  },
});

/**
 * **La scène des Magasins** (#372), pour la démo : deux Magasins français de niveau 2, plein à
 * Berne, presque vide à Innsbruck. Une pile à sec à Turin, d'où viser Stuttgart à travers Berne, et
 * une à Vérone, d'où viser Nuremberg à travers Innsbruck : le chip dit ce qu'elles y reprendront.
 * Deux colonnes à sec font ces deux routes et arrivent vingt secondes après la scène : le journal
 * dit ce que chaque Magasin a versé, et le dépôt d'Innsbruck tombe à zéro.
 *
 * `npx convex run dev:storesScene '{"playerId":"…"}'`
 */
export const storesScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    const season = player === null ? null : await ctx.db.get(player.seasonId);
    if (player === null || season === null) throw new Error('no such player');
    const now = Date.now();
    for (const [lon, lat, hostCountry, depot] of [
      [7.45, 46.95, 'CHE', { ammunition: 800, oil: 600, coal: 200 }],
      [11.4, 47.27, 'AUT', { ammunition: 15, oil: 10, coal: 0 }],
    ] as const)
      await ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon, lat },
        hostCountry,
        level: 2,
        specialty: 'store',
        depot,
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
      });
    const dryPile = async (at: { lon: number; lat: number }) => {
      const ids: Array<Id<'troops'>> = [];
      for (const role of ['infantry', 'infantry', 'landTransport'] as const)
        ids.push(
          await ctx.db.insert('troops', {
            seasonId: player.seasonId,
            playerId,
            role,
            tier: 1,
            nominalStrength: nominalStrength(role, 1),
            currentStrength: nominalStrength(role, 1),
            stationedAt: at,
            rounds: 0,
            fuel: role === 'landTransport' ? 3 : 0,
          }),
        );
      return ids;
    };
    const routes = [
      { from: { lon: 7.68, lat: 45.07 }, to: { lon: 9.18, lat: 48.78 } },
      { from: { lon: 10.99, lat: 45.44 }, to: { lon: 11.08, lat: 49.45 } },
    ];
    for (const { from, to } of routes) {
      await dryPile(from);
      const { movementId, arrivesAt } = await march(ctx, {
        playerId,
        season,
        type: 'march',
        origin: { kind: 'point', point: from },
        troopIds: await dryPile(from),
        aim: await aimOf(ctx, playerId, { kind: 'point', point: to }),
      });
      /** Partie il y a le temps de sa route, elle arrive tout de suite : la dépêche se lit à la
       *  capture. Le rendez-vous d'origine trouvera la colonne déjà arrivée. */
      const soon = now + 20_000;
      await ctx.db.patch(movementId, { departedAt: soon - (arrivesAt - now), arrivesAt: soon });
      await ctx.scheduler.runAt(soon, internal.movements.arrive, { movementId });
    }
    await recordLinkage(ctx, player.seasonId);
    await reassessDetection(ctx, player.seasonId, now, playerId);
  },
});

/**
 * **La scène des Forts** (#374), pour la démo : un Fort français de niveau 2 à Namur, au charbon,
 * et un Fort adverse à Luxembourg, son maître sans charbon. Une colonne adverse part de Gand vers
 * Liège : elle entre dans la vigie de Namur trente secondes après la scène, et l'arrivée s'y
 * rechiffre (`@namur`, `@gand`). Une colonne française part de Nancy vers Liège à côté du Fort
 * sans charbon, qui ne la retient pas (`@luxembourg`).
 *
 * `npx convex run dev:fortScene '{"playerId":"…","enemyId":"…"}'`
 */
export const fortScene = internalMutation({
  args: { playerId: v.id('players'), enemyId: v.id('players') },
  handler: async (ctx, { playerId, enemyId }) => {
    const player = await ctx.db.get(playerId);
    const season = player === null ? null : await ctx.db.get(player.seasonId);
    if (player === null || season === null) throw new Error('no such player');
    const now = Date.now();
    for (const [owner, lon, lat, hostCountry] of [
      [playerId, 4.87, 50.47, 'BEL'],
      [enemyId, 6.13, 49.61, 'LUX'],
    ] as const)
      await ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId: owner,
        point: { lon, lat },
        hostCountry,
        level: 2,
        specialty: 'fort',
        foundedAt: now - 1,
        disabledUntil: null,
        immuneUntil: null,
      });
    await settle(ctx, enemyId, now);
    for (const row of await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', enemyId))
      .collect())
      if (row.key === 'coal') await ctx.db.patch(row._id, { stock: 0, updatedAt: now });
    await reassessDetection(ctx, player.seasonId, now, enemyId);

    const columnOf = async (
      owner: Id<'players'>,
      from: { lon: number; lat: number },
      to: { lon: number; lat: number },
    ) => {
      const troopId = await ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId: owner,
        role: 'infantry',
        tier: 1,
        nominalStrength: nominalStrength('infantry', 1),
        currentStrength: nominalStrength('infantry', 1),
        stationedAt: from,
      });
      const { movementId } = await march(ctx, {
        playerId: owner,
        season,
        type: 'march',
        origin: { kind: 'point', point: from },
        troopIds: [troopId],
        aim: await aimOf(ctx, owner, { kind: 'point', point: to }),
      });
      return movementId;
    };
    const held = await columnOf(enemyId, { lon: 3.72, lat: 51.05 }, { lon: 5.57, lat: 50.63 });
    await columnOf(playerId, { lon: 6.18, lat: 48.69 }, { lon: 5.57, lat: 50.63 });

    /** Partie plus tôt, elle entre dans la vigie de Namur dans trente secondes : la réévaluation
     *  replace le rendez-vous, l'ancien job d'arrivée passe sans rien faire. */
    const movement = (await ctx.db.get(held))!;
    if (movement.fortEntry === undefined) throw new Error('the column misses the Fort');
    const shift = movement.fortEntry.at - (now + 30_000);
    await ctx.db.patch(held, {
      departedAt: movement.departedAt - shift,
      arrivesAt: movement.arrivesAt - shift,
    });
    await ctx.scheduler.runAt(movement.arrivesAt - shift, internal.movements.arrive, {
      movementId: held,
    });
    await reassessDetection(ctx, player.seasonId, now, enemyId);
  },
});

/**
 * **La scène du Guet** (#373), pour la démo : un Guet français de niveau 2 à Kaiserslautern, au
 * rayon entier (180 km), et un généraliste à Berne. En face, des piles britanniques : trois
 * fantassins et un blindé partis de Wurtzbourg vers Munich (une colonne lue) ;
 * deux fantassins et un canon à Francfort (un camp lu, hors de la mi-portée d'un généraliste) ;
 * un blindé et un fantassin lus à Mayence il y a deux heures, partis depuis hors de vue (une
 * dernière position connue qui garde sa pile) ; deux fantassins près de Berne, que le généraliste
 * relève sans les lire.
 *
 * `npx convex run dev:guetScene '{"playerId":"…","enemyId":"…"}'`
 */
export const guetScene = internalMutation({
  args: { playerId: v.id('players'), enemyId: v.id('players') },
  handler: async (ctx, { playerId, enemyId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const { seasonId } = player;
    const now = Date.now();
    const plant = (lon: number, lat: number, hostCountry: string, level: number, more = {}) =>
      ctx.db.insert('outposts', {
        seasonId,
        playerId,
        point: { lon, lat },
        hostCountry,
        level,
        /** Debout avant le relevé de Mayence, deux heures plus tôt. */
        foundedAt: now - 3 * 3_600_000,
        disabledUntil: null,
        immuneUntil: null,
        ...more,
      });
    await plant(7.77, 49.44, 'DEU', 2, { specialty: 'lookout' });
    await plant(7.45, 46.95, 'CHE', 1);
    const pile = async (at: { lon: number; lat: number }, roles: ReadonlyArray<UnitRole>) => {
      const ids: Array<Id<'troops'>> = [];
      for (const role of roles)
        ids.push(
          await ctx.db.insert('troops', {
            seasonId,
            playerId: enemyId,
            role,
            tier: 1,
            nominalStrength: nominalStrength(role, 1),
            currentStrength: nominalStrength(role, 1),
            stationedAt: at,
          }),
        );
      return ids;
    };
    const wurzburg = { lon: 9.93, lat: 49.79 };
    const column = await pile(wurzburg, ['infantry', 'infantry', 'infantry', 'armor']);
    await pile({ lon: 8.68, lat: 50.11 }, ['infantry', 'infantry', 'artillery']);
    await pile({ lon: 7.6, lat: 47.15 }, ['infantry', 'infantry']);
    const lost = await pile({ lon: 8.27, lat: 50.0 }, ['armor', 'infantry']);
    await reassessDetection(ctx, seasonId, now - 2 * 3_600_000);
    for (const troopId of lost)
      await ctx.db.patch(troopId, { stationedAt: { lon: 13.4, lat: 52.5 } });
    const season = await ctx.db.get(seasonId);
    if (season === null) throw new Error('no such season');
    await march(ctx, {
      playerId: enemyId,
      season,
      type: 'march',
      origin: { kind: 'point', point: wurzburg },
      troopIds: column,
      aim: await aimOf(ctx, enemyId, { kind: 'point', point: { lon: 11.58, lat: 48.14 } }),
    });
    await reassessDetection(ctx, seasonId, now);
    await recordLinkage(ctx, seasonId);
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
    /** **Une infanterie pour la ronde** (#377) : le banc la lance sur une liaison tracée du
     *  premier point, et sa ligne de guet se relit à chaque réévaluation. */
    const patrolId =
      outpostIds[0] === undefined
        ? null
        : await ctx.db.insert('troops', {
            seasonId: player.seasonId,
            playerId,
            role: 'infantry',
            tier: 1,
            nominalStrength: nominalStrength('infantry', 1),
            currentStrength: nominalStrength('infantry', 1),
            stationedAt: outpostIds[0],
          });
    /** Des points posés hors du geste de couleur : leur couleur se retient comme après une
     *  fondation, sans quoi la vue mesurée serait celle d'un sol jamais relevé (#144). */
    await recordLinkage(ctx, player.seasonId);
    return { squads: placed, reserveIds, outpostIds, truckId, patrolId };
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

/**
 * **Les épingles au loin** (#234), pour la démo : `piles` piles d'une infanterie semées sur la
 * France, une sur deux serrée en Lorraine, du semis `seed` — une mutation a une seconde, la démo
 * l'appelle par lots. Le dernier appel (`piles: 0`) pose en face trois camps britanniques relevés en
 * Sarre et en Alsace, un quatrième perdu de vue près de Metz (dernière position connue), et un entrepôt relevé.
 *
 * `npx convex run dev:pinsScene '{"playerId":"…","enemyId":"…","piles":100,"seed":1}'`
 */
export const pinsScene = internalMutation({
  args: {
    playerId: v.id('players'),
    enemyId: v.id('players'),
    piles: v.number(),
    seed: v.number(),
  },
  handler: async (ctx, { playerId, enemyId, piles, seed: start }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const { seasonId } = player;
    const troop = (owner: Id<'players'>, at: { lon: number; lat: number }) =>
      ctx.db.insert('troops', {
        seasonId,
        playerId: owner,
        role: 'infantry',
        tier: 1,
        nominalStrength: nominalStrength('infantry', 1),
        currentStrength: nominalStrength('infantry', 1),
        stationedAt: at,
      });
    /** Un semis déterministe : la même démo d'une fois à l'autre. */
    let seed = 7 + start * 7919;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let laid = 0;
    while (laid < piles) {
      const lorraine = laid % 2 === 0;
      const at = lorraine
        ? { lon: 5.6 + random() * 1.6, lat: 48.4 + random() * 1.0 }
        : { lon: -1 + random() * 8, lat: 43.6 + random() * 6.4 };
      if (!nearestRegion([at.lon, at.lat])?.id.startsWith('FRA-')) continue;
      await troop(playerId, at);
      laid += 1;
    }
    if (piles > 0) return;
    const now = Date.now();
    for (const at of [
      { lon: 7.3, lat: 49.05 },
      { lon: 7.45, lat: 48.6 },
      { lon: 7.55, lat: 49.3 },
    ])
      await troop(enemyId, at);
    const lost = await troop(enemyId, { lon: 6.6, lat: 49.3 });
    const warehouse = nearestRegion([4.8, 50.8]);
    if (warehouse === null) throw new Error('no region in Belgium');
    await ctx.db.insert('buildings', {
      seasonId,
      playerId: enemyId,
      key: 'warehouse',
      regionId: warehouse.id,
      point: pointOfRegion(warehouse.id),
      level: 1,
    });
    await fileSurvey(ctx, playerId, [{ point: warehouse.point, radiusKm: 1 }], now);
    await reassessDetection(ctx, seasonId, now - 2 * 3_600_000);
    /** Parti hors de vue deux heures plus tard : son camp devient une dernière position connue. */
    await ctx.db.patch(lost, { stationedAt: { lon: 9.5, lat: 52.5 } });
    await reassessDetection(ctx, seasonId, now);
    await recordLinkage(ctx, seasonId);
  },
});

const SCENE_HOURS = 240;
const HOUR_MS = 3_600_000;

/**
 * **Une Mondiale conclue, pour la démo de l'édition finale** (#455) : une saison de dix jours
 * réécrite comme si elle avait été jouée — une place tombée au sixième jour, les Sept passés de
 * main en main, des passes, une édition par jour — puis conclue par la porte du jeu
 * (`concludeSeason`) avec le verdict demandé. La France l'emporte quand il y a un vainqueur.
 *
 * `hold` annule la chaîne de clôture : l'édition reste « en attente » une demi-heure, puis
 * « aucune ». Jamais pour une saison réelle : c'est un faux passé.
 *
 * `npx convex run dev:concludeScene '{"seasonId":"…","reason":"points"}'`
 */
export const concludeScene = internalMutation({
  args: {
    seasonId: v.id('seasons'),
    reason: v.union(
      v.literal('points'),
      v.literal('clock'),
      v.literal('draw'),
      v.literal('closed'),
    ),
    hold: v.optional(v.boolean()),
  },
  handler: async (ctx, { seasonId, reason, hold }) => {
    const now = Date.now();
    const seats = await seatsOf(ctx, seasonId);
    const winner = seats.find((seat) => seat.nation === 'france') ?? seats[0]!;
    const fallen = seats.at(-1)!;
    /** Les points finissent trois heures avant l'horloge ; une clôture à la main deux jours avant. */
    const ahead = reason === 'points' ? 3 : reason === 'closed' ? 50 : 0;
    const launchedAt = now - (SCENE_HOURS - ahead) * HOUR_MS;
    await ctx.db.patch(seasonId, { launchedAt, durationHours: SCENE_HOURS });
    const at = (hours: number) => launchedAt + hours * HOUR_MS;

    const fellAt = at(116);
    await ctx.db.patch(fallen._id, { defeated: true, eliminatedAt: fellAt });
    for (const seat of seats)
      await ctx.db.insert('notices', {
        playerId: seat._id,
        at: fellAt,
        kind: 'playerEliminated',
        nation: fallen.nation ?? fallen.nickname,
        ...(seat._id === fallen._id ? { by: winner.nation ?? winner.nickname } : {}),
        irregulars: true,
      });

    /** Les Sept : un premier teneur, un retour au neutre sur le troisième, la main finale ; le
     *  vainqueur aux points en tient quatre à la fin. */
    const others = seats.filter((seat) => seat._id !== winner._id && seat._id !== fallen._id);
    const points = await seasonPoints(ctx, seasonId);
    for (const [rank, point] of points.entries()) {
      const first = others[rank % others.length] ?? winner;
      const last =
        reason === 'points' && rank < 4 ? winner : (others[(rank + 1) % others.length] ?? winner);
      const hands: Array<{ at: number; holderId: Id<'players'> | null }> = [
        { at: at(10 + rank * 7), holderId: first._id },
        ...(rank === 2 ? [{ at: at(90), holderId: null }] : []),
        { at: at(120 + rank * 12), holderId: last._id },
      ];
      const heldMs: Record<string, number> = {};
      for (const [index, hand] of hands.slice(0, -1).entries())
        if (hand.holderId !== null)
          heldMs[hand.holderId] = (heldMs[hand.holderId] ?? 0) + hands[index + 1]!.at - hand.at;
      const final = hands.at(-1)!;
      await ctx.db.patch(point._id, {
        hands,
        holderId: final.holderId,
        heldSince: final.at,
        heldMs: heldMs as Record<Id<'players'>, number>,
      });
    }

    /** Quelques passes entre voisins, la plus grande au milieu de la saison. */
    for (const [rank, attacker] of seats.entries()) {
      const defender = seats[(rank + 1) % seats.length]!;
      if (attacker._id === defender._id) continue;
      const strength = nominalStrength('infantry', 1);
      const troopId = await ctx.db.insert('troops', {
        seasonId,
        playerId: attacker._id,
        role: 'infantry',
        tier: 1,
        nominalStrength: strength,
        currentStrength: strength,
        stationedAt: null,
      });
      const engaged = 4 + ((rank * 5) % 11);
      const [lon, lat] = isNation(defender.nation)
        ? HOME_BY_NATION[defender.nation]
        : [2.35, 48.85];
      await ctx.db.insert('engagements', {
        seasonId,
        attackerId: attacker._id,
        defenderId: defender._id,
        cause: 'arrival',
        point: { lon, lat },
        hostCountry: 'FRA',
        at: at(20 + rank * 11),
        winner: rank % 3 === 2 ? 'defender' : 'attacker',
        outpostId: null,
        disabledUntil: null,
        troops: Array.from({ length: engaged }, (_, index) => {
          const side = index % 2 === 0 ? ('attacker' as const) : ('defender' as const);
          const destroyed = index % 3 === 0;
          return {
            troopId,
            side,
            role: 'infantry' as const,
            tier: 1 as const,
            strengthBefore: strength,
            strengthAfter: destroyed ? 0 : strength,
            state: destroyed ? ('destroyed' as const) : ('standing' as const),
          };
        }),
      });
    }

    await concludeSeason(
      ctx,
      seasonId,
      reason === 'points' || reason === 'clock' ? winner._id : null,
      now,
      reason === 'closed' ? { reason, closedBy: winner.nation ?? winner.nickname } : { reason },
    );

    /** Une édition par jour avant la finale, qui monte vers les chiffres de la conclusion : la
     *  chaîne les lit après cette mutation, pour les courbes du carnet. */
    const finals = await ctx.db
      .query('editions')
      .withIndex('bySeasonAt', (q) => q.eq('seasonId', seasonId).eq('at', now))
      .collect();
    for (const line of finals)
      for (let day = 1; at(day * 24) < now; day++) {
        const share = Math.min(1, 0.35 + (0.65 * day * 24) / (SCENE_HOURS - ahead));
        const fade = line.playerId === fallen._id && at(day * 24) > fellAt ? 0.4 : 1;
        await ctx.db.insert('editions', {
          seasonId,
          playerId: line.playerId,
          at: at(day * 24),
          final: false,
          territory: Math.round(line.territory * share * fade * 10) / 10,
          industry: Math.round(line.industry * share),
          military: Math.round(line.military * share * fade),
          deeds: Math.round(line.deeds * share),
          general: Math.round(line.general * share * fade),
        });
      }

    if (hold === true)
      for (const job of await ctx.db.system.query('_scheduled_functions').collect())
        if (job.name.includes('countDispatches') && job.state.kind === 'pending')
          await ctx.scheduler.cancel(job._id);
  },
});

/** **Un point tenu par la porte du jeu** (`handOver`) : Rangoun au banc et à la démo (#176). */
export const holdPoint = internalMutation({
  args: { playerId: v.id('players'), key: STRATEGIC_POINT_KEY },
  handler: async (ctx, { playerId, key }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const point = await layPoint(ctx, player.seasonId, key);
    if (point === null) throw new Error(`no region under ${key}`);
    await handOver(ctx, point, playerId, Date.now());
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
    /** Les deux joueurs dont le charbon a bougé : seuls eux règlent leur silence et leur réveil. */
    await reassessDetection(ctx, seasonId, Date.now(), [burning, silent]);
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
