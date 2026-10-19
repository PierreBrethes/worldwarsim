import type { convexTest } from 'convex-test';
import type { FunctionArgs } from 'convex/server';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { nicknameKey } from '../src/domain/account';
import { isNation } from '../src/domain/nations';
import { capitalRegionOf, pointOfRegion } from './regions';
import { regionAtRoutePoint } from './regionGeometry';
import { openSession, sessionOf } from './sessions';
import { layPoint } from './strategicPoints';

/**
 * **La seule façon de s'asseoir à une table de test** (ADR 0022). Un jeton bricolé par suite
 * redeviendrait ce que le jeton de partie était — une identité inventée sur place — et la
 * première règle qui lirait le compte derrière la place échouerait dans dix-huit fichiers à la
 * fois.
 *
 * Le nom du fichier porte deux points : ni le bundler de Convex ni le glob de `convex-test` ne
 * le ramassent, donc il n'est pas un module du jeu, et `vitest` ne le prend pas pour une suite.
 */
type Bench = ReturnType<typeof convexTest>;

export type Seat = { readonly token: string; readonly seasonId: Id<'seasons'> };

let issued = 0;

/**
 * **Un compte et sa session, écrits directement.** Passer par `auth.register` coûterait
 * 600 000 itérations de PBKDF2 par joueur et par test : le hachage a sa propre suite
 * (`auth.test.ts`), et ce que les autres ont besoin de prouver commence après la porte.
 */
export async function signIn(t: Bench, nickname: string): Promise<string> {
  const token = `session-${String(++issued)}`;
  await t.run(async (ctx) => {
    const now = Date.now();
    const accountId = await ctx.db.insert('accounts', {
      nickname,
      nicknameKey: nicknameKey(nickname),
      passwordHash: 'fixture',
      salt: 'fixture',
      iterations: 1,
      createdAt: now,
    });
    await openSession(ctx, accountId, token);
  });
  return token;
}

/**
 * Le germe de la saison tire les objectifs neutres au lancement (`objectives.place`). Laissé à
 * `Math.random`, environ une saison sur cent cinquante posait un objectif sur Prahova, et sa
 * garnison irrégulière répondait à la place de la troupe du test : une suite rouge au hasard.
 * Vérifié : aucun objectif sur `ROU-310` avec ce germe pour France/URSS, les nations des suites.
 */
export const TEST_SEASON_SEED = 1;

/** Un compte neuf qui fonde une saison : la place du fondateur, et le code de l'invitation. */
export async function foundSeat(
  t: Bench,
  nickname = 'Pierre',
  compensation = 0.5,
): Promise<{ seat: Seat; code: string }> {
  const token = await signIn(t, nickname);
  const { code, seasonId } = await t.mutation(api.seasons.create, {
    token,
    compensation,
    mode: 'mondiale',
  });
  await t.run(async (ctx) => ctx.db.patch(seasonId, { seed: TEST_SEASON_SEED }));
  return { seat: { token, seasonId }, code };
}

/**
 * **Une saison lancée dont l'horloge ne tombera pas** : celle d'une Mondiale la conclut à sa
 * durée (`race.closeAtClock`), et une suite qui joue tous les minuteurs pour faire arriver ses
 * colonnes l'atteindrait. Ce qu'elle mesure n'est pas la fin de la saison : le rendez-vous est
 * annulé, la durée reste (la presse s'arrête sur elle).
 */
export const unclocked = (t: Bench) =>
  t.run(async (ctx) => {
    for (const job of await ctx.db.system
      .query('_scheduled_functions')
      .withIndex('by_creation_time')
      .collect()) {
      if (job.name.includes('closeAtClock') && job.state.kind === 'pending') {
        await ctx.scheduler.cancel(job._id);
      }
    }
  });

/** Un compte neuf qui rejoint par le code. */
export async function joinSeat(t: Bench, code: string, nickname: string): Promise<Seat> {
  const token = await signIn(t, nickname);
  const { seasonId } = await t.mutation(api.seasons.join, { token, code });
  return { token, seasonId };
}

/**
 * **La place derrière une session, dans une transaction déjà ouverte.** Les suites plantent des
 * bâtiments, des points et des troupes à la main : il leur faut le document du joueur, et il n'y
 * a plus d'index qui aille du jeton à lui directement.
 */
export async function seatIn(ctx: QueryCtx, seat: Seat): Promise<Doc<'players'>> {
  const session = await sessionOf(ctx, seat.token);
  if (!session) throw new Error('session not found');
  const player = await ctx.db
    .query('players')
    .withIndex('byAccountSeason', (q) =>
      q.eq('accountId', session.accountId).eq('seasonId', seat.seasonId),
    )
    .unique();
  if (!player) throw new Error('player not found');
  return player;
}

/** La même lecture, depuis le banc. */
export const seatDoc = (t: Bench, seat: Seat): Promise<Doc<'players'>> =>
  t.run((ctx) => seatIn(ctx, seat));

/**
 * **Le quartier général, posé.** Depuis la décision 1b du 13/09 il n'est plus planté au
 * lancement : il est la première dette du socle, et tant qu'il est dû le serveur refuse toute
 * autre clé (`HQ_FIRST`). Presque toute suite le veut donc debout avant sa première mesure — et
 * répéter la pose dans dix-huit fichiers serait dix-huit endroits à corriger le jour où elle
 * change.
 *
 * Il va sur la **capitale de 1940** par défaut, là où `endow` le plantait : une suite qui ne
 * parle pas de lui mesure ainsi exactement ce qu'elle mesurait avant. Celles qui veulent voir la
 * décision — un gisement sacrifié, un sol refusé — nomment leur région.
 *
 * Il amène sa compagnie d'infanterie en garnison, comme la dotation le faisait
 * (`constructions.garrisonTheGift`).
 */
export async function placeHq(t: Bench, seat: Seat, regionId?: string): Promise<string> {
  const region =
    regionId ??
    (await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      if (!isNation(player.nation)) throw new Error('seat without a nation');
      return capitalRegionOf(player.nation);
    }));
  await t.mutation(api.constructions.start, {
    ...seat,
    building: 'hq',
    regionId: region,
    point: pointOfRegion(region),
  });
  return region;
}

/** Les lignes d'accueil du compte qui tient cette place — ce que `accounts.seats` sert. */
export const seatsOf = (t: Bench, seat: Seat) => t.query(api.accounts.seats, { token: seat.token });

/**
 * **Le relevé qu'un assaut exige** (ADR 0024 §4) : depuis qu'on n'attaque que ce qu'on a vu, une
 * suite qui vise une région doit d'abord l'avoir relevée. La ligne écrite ici est exactement celle
 * que le couloir d'un mouvement aurait déposée en passant (`convex/surveys.ts`) — un souvenir de
 * l'observateur, jamais une vérité de plus sur le plateau.
 *
 * L'installation nommée est **n'importe quel mât de la saison** : la règle ne lit que le fait
 * qu'il y en ait un de relevé, et fabriquer un bâtiment pour le test changerait l'économie qu'il
 * mesure.
 */
export async function surveyRegion(t: Bench, seat: Seat, regionId: string): Promise<void> {
  await t.run((ctx: MutationCtx) => writeSurvey(ctx, seat, regionId));
}

async function writeSurvey(ctx: MutationCtx, seat: Seat, regionId: string): Promise<void> {
  const player = await seatIn(ctx, seat);
  const standing = await ctx.db
    .query('buildings')
    .withIndex('bySeason', (q) => q.eq('seasonId', player.seasonId))
    .collect();
  const building = standing.find((candidate) => candidate.regionId === regionId) ?? standing[0];
  if (building === undefined) throw new Error('no building to survey');
  const existing = await ctx.db
    .query('regionSightings')
    .withIndex('byPlayerRegion', (q) => q.eq('playerId', player._id).eq('regionId', regionId))
    .unique();
  const row = {
    seenAt: Date.now(),
    installations: [{ buildingId: building._id, key: building.key, point: building.point }],
    hasInstallations: true,
  };
  if (existing === null) {
    await ctx.db.insert('regionSightings', {
      playerId: player._id,
      regionId,
      ownerId: null,
      ...row,
    });
  } else {
    await ctx.db.patch(existing._id, row);
  }
}

/**
 * **L'assaut, tel qu'un joueur le donne depuis l'ADR 0024 §4** : sur une cible relevée. Le relevé
 * est posé ici plutôt que dans chaque cas parce qu'il est le **préalable** de l'ordre et non le
 * sujet des suites qui l'utilisent — elles mesurent la passe, la route ou la dépêche.
 *
 * Un camp et un avant-poste *sont* le relevé : rien à poser pour eux.
 */
export async function attacking(t: Bench, args: FunctionArgs<typeof api.movements.attack>) {
  const regionId =
    args.target.kind === 'region'
      ? args.target.regionId
      : args.target.kind === 'point'
        ? regionAtRoutePoint([args.target.point.lon, args.target.point.lat])
        : null;
  if (regionId !== null) {
    await surveyRegion(t, { token: args.token, seasonId: args.seasonId }, regionId);
  }
  return t.mutation(api.movements.attack, args);
}

/**
 * **Le relevé d'un camp, posé à la main** (ADR 0024 §1). Le jumeau immobile de `surveyRegion`, et
 * il existe pour la même raison : depuis le §4, viser une pile adverse demande de l'avoir relevée,
 * et les suites qui mesurent la passe n'ont pas à planter un guetteur pour ça.
 *
 * La ligne est celle que `reassessDetection` aurait écrite — même clé de station, même pauvreté :
 * une position, un milieu, une date.
 */
export async function surveyCamp(
  t: Bench,
  seat: Seat,
  point: { readonly lon: number; readonly lat: number },
): Promise<Id<'campSightings'>> {
  return t.run((ctx: MutationCtx) => writeCampSighting(ctx, seat, point));
}

async function writeCampSighting(
  ctx: MutationCtx,
  seat: Seat,
  point: { readonly lon: number; readonly lat: number },
): Promise<Id<'campSightings'>> {
  const player = await seatIn(ctx, seat);
  const standing = (
    await ctx.db
      .query('troops')
      .withIndex('bySeason', (q) => q.eq('seasonId', player.seasonId))
      .collect()
  ).find((troop) => {
    const address = troop.stationedAt;
    return (
      troop.playerId !== player._id &&
      address !== null &&
      typeof address !== 'string' &&
      address.lon === point.lon &&
      address.lat === point.lat
    );
  });
  if (standing === undefined) throw new Error('no camp standing at that point');
  return ctx.db.insert('campSightings', {
    playerId: player._id,
    seasonId: player.seasonId,
    stationKey: `${standing.playerId}@${point.lon},${point.lat}`,
    ownerId: standing.playerId,
    point: { lon: point.lon, lat: point.lat },
    medium: 'land',
    since: Date.now(),
    until: null,
    detector: 'troop',
    detectorId: null,
    detectorRegion: null,
    noticeFiled: true,
  });
}

/** A short or absent clock, for the suites that measure what the end of a season does. */
export const setClock = (t: Bench, seasonId: Id<'seasons'>, hours: number | null) =>
  t.run((ctx) => ctx.db.patch(seasonId, { durationHours: hours }));

/** Un point stratégique de la saison, posé neutre s'il n'a pas été tiré (`layPoint`). */
export const neutralPoint = async (
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  key: Doc<'strategicPoints'>['key'],
) => (await layPoint(ctx, seasonId, key))!;

/** Un point tenu par une place, posé s'il manquait. */
export const holdPoint = (
  t: Bench,
  seat: Seat,
  key: Doc<'strategicPoints'>['key'],
  holder: Seat = seat,
) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, holder);
    const point = await neutralPoint(ctx, seat.seasonId, key);
    await ctx.db.patch(point._id, { holderId: player._id, heldSince: Date.now() });
    return point._id;
  });
