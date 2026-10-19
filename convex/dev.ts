import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { heldOf } from './control';
import { stampReadMark } from './readMarks';
import { settle } from './resources';
import { viewOf } from './view';
import { seatedOf } from './movement/forces';
import { reassessDetection } from './movement/detection';
import { seatLoose } from '../src/domain/troops';
import { modeOf } from '../src/domain/season-mode';
import { UNIT_ROLE } from './validators';
import { nominalStrength } from './constants';
import { capitalRegionOf, nearestRegion, pointOfRegion } from './regions';
import { isNation } from '../src/domain/nations';
import { layPoint } from './strategicPoints';

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
 * **Un QG élevé d'un coup**, pour la démo des chantiers parallèles (#136) : le niveau fait les voies.
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
 * **Une recherche en cours** (ADR 0028 §5) : l'infanterie MK2 et l'aviation acquises, le blindé
 * posé sur le QG il y a six heures — dix heures à courir.
 */
export const researchScene = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null || !isNation(player.nation)) throw new Error('no such player');
    await headquartersOf(ctx, player);
    const now = Date.now();
    const hour = 3_600_000;
    const remainingMs = 10 * hour;
    await ctx.db.patch(playerId, {
      researched: ['infantryMk2', 'aviation'],
      research: { card: 'armor', remainingMs: 16 * hour, since: now - 6 * hour },
    });
    await ctx.scheduler.runAt(now + remainingMs, internal.research.finish, {
      playerId,
      finishesAt: now + remainingMs,
    });
  },
});

/**
 * **Les niveaux qui accélèrent** (ADR 0031), pour la démo : une caserne de niveau 3 à la capitale
 * et la carte Chantier double acquise, la seconde file de chantier ouverte.
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
      researched: ['transmissions1', 'transmissions2', 'doubleWorks'],
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
 * **Bakou, Dakar et Singapour tenus** : le joueur tient les trois, un blindé et un camion au plein
 * vide en Rhénanie (le blindé reprend le sien à Bakou, le camion roule sans), et les deux dépêches
 * du dépôt qui brûle à Dakar.
 */
export const pointsScene = internalMutation({
  args: { playerId: v.id('players'), enemyId: v.id('players') },
  handler: async (ctx, { playerId, enemyId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) throw new Error('no such player');
    const now = Date.now();
    for (const key of ['baku', 'dakar', 'singapore'] as const) {
      const point = await layPoint(ctx, player.seasonId, key);
      if (point === null) throw new Error(`no region under ${key}`);
      await ctx.db.patch(point._id, { holderId: player._id, heldSince: now - 3 * 3_600_000 });
    }
    for (const [role, fuel] of [
      ['armor', 0],
      ['landTransport', 0],
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
