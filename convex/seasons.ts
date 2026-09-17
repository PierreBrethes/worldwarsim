import { v } from 'convex/values';
import { internal } from './_generated/api';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import {
  canJoinRegistration,
  gameCode,
  playableRegion,
  registrationDeadline,
} from '../src/domain/off-season';
import { NATIONS, RESOURCES } from '../src/domain/ids';
import { isNation } from '../src/domain/nations';
import { fail } from './errors';
import { publishFinalEdition } from './press';
import { SEASON_CLOCK_HOURS } from './validators';
import {
  DEFAULT_REST_WINDOW,
  FOUNDER_ABSENCE_HOURS,
  PRESS_EDITION_HOURS,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_LAUNCH,
  STARTING_KIT,
} from './constants';

/**
 * **L'unique porte du jeu** (ADR 0022) : un jeton de session, une saison, et la place que le
 * compte y tient. Le jeton de partie est mort avec le wipe du 10/09 — il valait identité,
 * place et saison à la fois, et c'est ce triple emploi qui interdisait à un joueur de retrouver
 * ses parties depuis un second appareil.
 *
 * Les trois refus disent trois choses différentes, et le client en fait trois écrans : la
 * session est inconnue (on se reconnecte), le compte n'a pas de place dans cette saison-là (on
 * rentre à l'accueil), la saison n'existe plus. Un seul code pour les trois aurait renvoyé à la
 * page de connexion quelqu'un qui n'avait qu'une saison détruite.
 */
export async function playerOf(ctx: QueryCtx, token: string, seasonId: Id<'seasons'>) {
  const account = await accountOf(ctx, token);
  if (!account) fail('UNKNOWN_SESSION');
  const player = await seatOf(ctx, account, seasonId);
  if (!player) fail('NO_SEAT');
  const season = await ctx.db.get(player.seasonId);
  if (!season) fail('SEASON_GONE');
  return { player, season };
}

/** Le compte derrière un jeton de session, `null` si personne ne répond — une session
 *  inconnue, ou orpheline d'un compte effacé, ce que le lecteur ne distingue pas. */
export async function accountOf(ctx: QueryCtx, token: string): Promise<Doc<'accounts'> | null> {
  const session = await ctx.db
    .query('sessions')
    .withIndex('byToken', (q) => q.eq('token', token))
    .unique();
  return session === null ? null : await ctx.db.get(session.accountId);
}

/** **Au plus une place par compte et par saison** (ADR 0022) : l'index le dit, et `unique()`
 *  le fait échouer bruyamment si une seconde s'écrivait un jour. */
const seatOf = (
  ctx: QueryCtx,
  account: Doc<'accounts'>,
  seasonId: Id<'seasons'>,
): Promise<Doc<'players'> | null> =>
  ctx.db
    .query('players')
    .withIndex('byAccountSeason', (q) => q.eq('accountId', account._id).eq('seasonId', seasonId))
    .unique();

/**
 * **What a season has to be for an order to be given on it, and who may give one.** A concluded
 * season answers with a code of its own rather than "not launched": it *was* launched, somebody
 * won it, and telling a player his season never started is the kind of message that sends him
 * looking for a bug.
 *
 * It stays readable — the board and the journal serve a concluded season (`view.ts`), because
 * the wipe is manual and one reads the game back before erasing it.
 *
 * **The player travels with the season because a surrender is the same refusal** (decision of
 * 31/08): whoever laid down his arms observes, he does not order. Every game mutation already
 * came through here — construction, industry, recruitment, foundation, movement, entry into war
 * — so the door is widened rather than a check being scattered over a dozen handlers, and the
 * next mutation gets it by construction. **The telegraph deliberately does not read it**
 * (`messages.ts` never asked for a playable season): an observer still talks.
 */
export function requirePlayable(player: Doc<'players'>, season: Doc<'seasons'>): void {
  if (season.status === 'concluded') fail('SEASON_CONCLUDED');
  requireStarted(season);
  if (player.defeated === true) fail('PLAYER_DEFEATED');
}

/**
 * **What a scheduled job has to find to be allowed to write.** A conclusion does not empty the
 * scheduler, and neither does a `destroy` that leaves a job behind: without this, engagements
 * resolve, batches deliver and sites finish on a season nobody plays any more — a concluded
 * skirmish still fighting would falsify every measurement taken after a test.
 *
 * **It returns, it never fails.** Convex does not retry a mutation that throws, so a refusal
 * raised here would sit in the dashboard as an error that is not one. Nothing is cleaned up
 * either: the movement, the batch and the site stay exactly as they are, nobody will read
 * them, and `destroy` purges the season whole.
 *
 * It takes a **player**, not a season, because that is the handle every job actually holds — a
 * movement, a batch and a construction all hang from a player, none of them from a season.
 */
export async function seasonStillPlays(ctx: QueryCtx, playerId: Id<'players'>): Promise<boolean> {
  return (await playingSeason(ctx, playerId)) !== null;
}

/** The same reading, handing back the season rather than a yes: a job that writes a row needs
 *  the season to stamp it with, and reading it twice is two chances to read two different ones. */
export async function playingSeason(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Doc<'seasons'> | null> {
  const player = await ctx.db.get(playerId);
  if (!player) return null;
  const season = await ctx.db.get(player.seasonId);
  return season?.status === 'launched' ? season : null;
}

/** What a season has to be to be **looked at**. A concluded one passes: it is the game one
 *  reads back before the wipe, and a board that shuts the moment it is won says nothing. */
export function requireStarted(season: Doc<'seasons'>): void {
  if (season.status === 'lobby') fail('SEASON_NOT_LAUNCHED');
}

/**
 * **When this seat entered the war**, `null` while it is still out of it. The one reader of the
 * raw field, because the raw field has three states and only two meanings: a row written before
 * the latecomer landed carries **no** field, and its player entered the war with everybody else
 * at launch. An explicit `null` is the other thing entirely — a seat taken on a running season
 * whose owner is still picking his nation.
 */
export function warEntryOf(player: Doc<'players'>, season: Doc<'seasons'>): number | null {
  if (player.enteredWarAt !== undefined) return player.enteredWarAt;
  return season.status === 'lobby' ? null : season.launchedAt;
}

export const isAtWar = (player: Doc<'players'>, season: Doc<'seasons'>): boolean =>
  warEntryOf(player, season) !== null;

/**
 * **Le kit, et rien d'autre** — remis une fois, par les deux seules routes qui mènent à un
 * plateau : le lancement, pour tout le monde au salon, et l'entrée en guerre, pour qui arrive
 * après. Une seule écriture de la dotation, pour qu'un changement ne puisse pas atteindre une
 * route et manquer l'autre.
 *
 * **Rien n'est planté ici** (décision 1b du 13/09, révision des ADR 0015 et 0017 §2). Le quartier
 * général était posé d'office sur la capitale de 1940, et la compagnie d'infanterie avec lui ;
 * les deux sont passés dans le socle, que le joueur acquitte où il veut sur son sol
 * (`constructions.start`). Ce qui l'a rouvert : une bâtisse par région, donc un gisement sous le
 * QG est un gisement perdu — c'est au joueur de choisir ce qu'il sacrifie.
 *
 * Un belligérant qui n'a encore rien debout est donc un état normal, et le premier de la saison.
 */
async function endow(ctx: MutationCtx, player: Doc<'players'>, at: number): Promise<void> {
  if (!isNation(player.nation)) fail('UNKNOWN_NATION', { nickname: player.nickname });
  const kit = STARTING_KIT;
  for (const key of RESOURCES) {
    await ctx.db.insert('resources', {
      playerId: player._id,
      key,
      stock: kit[key],
      updatedAt: at,
    });
  }

  await ctx.db.patch(player._id, { enteredWarAt: at });
}

/**
 * **Un seul choix** (ADR 0020 §11) : l'horloge, et elle peut ne pas exister. Le format est parti
 * le 31/08 — il ne restait de lui qu'une ligne de départ, et une seule saison n'en demande pas
 * deux.
 */
export const create = mutation({
  args: {
    token: v.string(),
    durationHours: SEASON_CLOCK_HOURS,
    compensation: v.number(),
  },
  handler: async (ctx, { token, durationHours, compensation }) => {
    const account = await accountOf(ctx, token);
    if (!account) fail('UNKNOWN_SESSION');
    const code = await freeCode(ctx);
    const seasonId = await ctx.db.insert('seasons', {
      code,
      status: 'lobby',
      durationHours,
      compensation: Math.max(0, Math.min(1, compensation)),
      seed: Math.floor(Math.random() * 2 ** 31),
      playableRegion: null,
      launchedAt: null,
      winnerId: null,
      winnerNation: null,
      concludedAt: null,
      playerCount: 0,
    });
    await seat(ctx, account, seasonId, true);
    return { code, seasonId };
  },
});

/** **Une place, et le pseudo du compte copié dessus** — la seule écriture de `players` du jeu,
 *  partagée par les deux portes d'entrée pour qu'un champ neuf ne puisse pas en manquer une. */
async function seat(
  ctx: MutationCtx,
  account: Doc<'accounts'>,
  seasonId: Id<'seasons'>,
  creator: boolean,
): Promise<void> {
  await ctx.db.insert('players', {
    seasonId,
    accountId: account._id,
    nickname: account.nickname,
    creator,
    nation: null,
    ready: false,
    restWindow: DEFAULT_REST_WINDOW,
    enteredWarAt: null,
  });
  await countSeat(ctx, seasonId);
}

/**
 * **Le compte des places se tient à l'écriture**, parce qu'il se lit une fois par saison du
 * compte sur l'écran d'accueil (`previewOf`) : recompté à la lecture, il y faisait un `collect()`
 * par ligne, en série, et c'est ce qui a fini par dépasser la seconde en production (12/09).
 *
 * **Il ne décroît jamais, et il n'a pas à le faire** : une place ne se quitte pas, elle
 * disparaît avec sa saison (`destroy`), qui emporte le compte avec elle.
 *
 * Une saison d'avant ce champ se fait compter une fois, ici, plutôt que incrémentée à partir de
 * rien : le comptage est déjà fait quand on écrit, et la place neuve y est.
 */
async function countSeat(ctx: MutationCtx, seasonId: Id<'seasons'>): Promise<void> {
  const season = await ctx.db.get(seasonId);
  if (!season) return;
  if (season.playerCount === undefined) {
    await ctx.db.patch(seasonId, { playerCount: (await seatsOf(ctx, seasonId)).length });
    return;
  }
  await ctx.db.patch(seasonId, { playerCount: season.playerCount + 1 });
}

/**
 * **No rate limiting here, deliberately.** A game code is 6 characters over a 32-letter
 * alphabet — 32⁶ ≈ 1.07 × 10⁹ — and only lobbies still open are joinable. With ten live
 * lobbies, a brute-forcer needs some 74 million attempts for even odds of landing in one:
 * more than a week of hammering at 100 requests a second, to win the right to sit at a
 * board game with strangers.
 *
 * The mitigations available are all worse than that exposure. Convex mutations do not see
 * the client IP, so a counter has to key on something else: per season it becomes a griefing
 * lever (a stranger locks your friends out of their own lobby), and per nickname it keys on
 * a value the attacker picks. **Le compte n'y change rien** : il faut toujours le code, et le
 * refus par `SEAT_TAKEN` ne dit rien qu'un joueur déjà assis ne sache.
 *
 * What would change this: public lobbies, or codes shared beyond a group of friends.
 */
export const join = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const account = await accountOf(ctx, token);
    if (!account) fail('UNKNOWN_SESSION');
    const season = await ctx.db
      .query('seasons')
      .withIndex('byCode', (q) => q.eq('code', code.trim().toUpperCase()))
      .unique();
    if (!season) fail('UNKNOWN_GAME_CODE');
    /** **Avant tout autre refus**, y compris la fenêtre d'inscription : celui qui a déjà sa
     *  place la garde, et lui dire que les inscriptions sont closes l'enverrait la chercher
     *  ailleurs qu'à l'accueil, où elle est. */
    if (await seatOf(ctx, account, season._id)) fail('SEAT_TAKEN');
    if (season.status === 'concluded') fail('SEASON_CONCLUDED');
    if (!canJoinRegistration(season.status, season.launchedAt, Date.now())) {
      fail('REGISTRATION_CLOSED');
    }
    const present = await seatsOf(ctx, season._id);
    /**
     * A running season hands out no seat it cannot arm: every belligerent already holds a
     * nation, so a board with none left would open a lobby whose only screen is a wall of taken
     * flags. The refusal is said here rather than discovered there — **before** the seat count,
     * because at eight nations for eight seats the two fire together and "no nation left" is the
     * one that names the real obstacle to a latecomer.
     *
     * The theatre is the one frozen at launch — a latecomer does not redraw it. It does not
     * narrow the eight nations *yet*: the day a theatre carries its own roster, this is where it
     * is read.
     */
    if (season.status === 'launched' && freeNations(present).length === 0) {
      fail('NO_FREE_NATION');
    }
    if (present.length >= MAX_PLAYERS) fail('LOBBY_FULL', { maximum: MAX_PLAYERS });
    await seat(ctx, account, season._id, false);
    return { seasonId: season._id };
  },
});

/**
 * **Une ligne d'accueil, pour une place du compte** (ADR 0022). Elle se lit depuis le compte
 * désormais (`accounts.me`) et non plus depuis une liste de jetons tenue par le navigateur :
 * c'est tout le bénéfice du compte — le même joueur retrouve ses parties sur un second
 * appareil, sans redemander le code à personne.
 *
 * Une place dont la saison a disparu est **silencieusement ignorée** plutôt que signalée : la
 * saison a été mise au rebut, et un écran d'entrée qui en ferait une erreur se condamnerait
 * sur une ligne que le joueur ne peut pas réparer.
 */
export async function previewOf(ctx: QueryCtx, player: Doc<'players'>) {
  const season = await ctx.db.get(player.seasonId);
  if (!season) return null;
  const players = season.playerCount ?? (await seatsOf(ctx, season._id)).length;
  const winnerNation = await winnerNationOf(ctx, season);
  return {
    /** La saison que la ligne ouvre : c'est elle que le client retient comme place active, et
     *  elle voyage avec chaque ordre ensuite (`playerOf`). */
    seasonId: season._id,
    code: season.code,
    status: season.status,
    durationHours: season.durationHours,
    launchedAt: season.launchedAt,
    createdAt: season._creationTime,
    playableRegion: season.playableRegion ?? playableRegion(players),
    players,
    nickname: player.nickname,
    creator: player.creator,
    nation: player.nation,
    /** A seat on a running season whose owner has not entered the war goes back to the lobby,
     *  not to the board: he holds no nation, and the board could not draw him. */
    atWar: isAtWar(player, season),
    /** **« Défaite : observer »**, et c'est tout ce que la ligne d'accueil change : elle ouvre
     *  le même plateau, en l'état. Un observateur n'est pas sorti de sa saison — il la regarde. */
    defeated: player.defeated ?? false,
    /** Enough for the home screen to say who took the season without opening the board — the
     *  only end screen the test victory gets, with the journal's headline. */
    winnerNation,
  };
}

/**
 * **Les joueurs d'une saison** — et le siège irrégulier n'en est pas un (objectifs neutres,
 * 17/09/2026). C'est **la** porte de « qui joue ici » : le salon, le lancement, l'entrée en
 * guerre, l'encre, la presse, le classement, la dominance, le doyen et le relevé la lisent tous,
 * pour que l'exclusion soit une ligne et non douze filtres qu'un treizième lecteur oublierait.
 *
 * Ce qu'elle ne sert pas : `destroy`, qui efface **tout** ce qui pend à la saison, garnisons
 * locales comprises — sans quoi le siège irrégulier survivrait à la partie qui l'a créé.
 */
export const seatsOf = async (
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'players'>>> =>
  (await everySeatOf(ctx, seasonId)).filter((seat) => seat.irregular !== true);

/** Toutes les places, le siège irrégulier compris — la lecture d'un balayage, jamais d'une règle. */
export const everySeatOf = (
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'players'>>> =>
  ctx.db
    .query('players')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();

/** La nation du vainqueur, gravée à la conclusion — et lue à la place derrière `winnerId` pour
 *  les seules saisons conclues avant que le champ existe. */
async function winnerNationOf(ctx: QueryCtx, season: Doc<'seasons'>): Promise<string | null> {
  if (season.winnerNation !== undefined) return season.winnerNation;
  const winnerId = season.winnerId ?? null;
  if (winnerId === null) return null;
  const winner = await ctx.db.get(winnerId);
  return winner === null ? null : (winner.nation ?? winner.nickname);
}

export const lobby = query({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    const present = await seatsOf(ctx, season._id);
    return {
      code: season.code,
      status: season.status,
      registrationClosesAt:
        season.status === 'launched' ? registrationDeadline(season.launchedAt) : null,
      durationHours: season.durationHours,
      compensation: season.compensation,
      /** Frozen at launch, and only widening while the lobby is still open: a latecomer joins a
       *  theatre, he does not redraw it. */
      playableRegion: season.playableRegion ?? playableRegion(present.length),
      me: {
        nickname: player.nickname,
        creator: player.creator,
        nation: player.nation,
        ready: player.ready,
        restWindow: player.restWindow,
        /** What tells the lobby which of its two faces to wear: the one before the launch, or
         *  the entry into war of somebody who arrived after it (`enterWar`). */
        atWar: isAtWar(player, season),
      },
      // The id travels so the lobby list has a stable React key: nicknames are not unique
      // (nothing forbids two "Pierre"), and keying on them collapses two rows into one.
      // A document id grants nothing on its own — every mutation authenticates by token.
      players: present.map((entry) => ({
        id: entry._id,
        nickname: entry.nickname,
        creator: entry.creator,
        nation: entry.nation,
        ready: entry.ready,
        /** On a running season "prêt" means nothing any more: what a row says is whether that
         *  seat is a nation in the field or somebody still at the door. */
        atWar: isAtWar(entry, season),
      })),
    };
  },
});

export const launch = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    if (!player.creator) fail('CREATOR_ONLY');
    if (season.status !== 'lobby') fail('SEASON_ALREADY_LAUNCHED');
    const present = await seatsOf(ctx, season._id);
    if (present.length < MIN_PLAYERS_TO_LAUNCH) {
      fail('NOT_ENOUGH_PLAYERS', { minimum: MIN_PLAYERS_TO_LAUNCH });
    }
    const stragglers = present.filter((entry) => !entry.ready);
    if (stragglers.length > 0) {
      fail('PLAYERS_NOT_READY', { nicknames: stragglers.map((entry) => entry.nickname) });
    }

    const now = Date.now();
    await ctx.db.patch(season._id, {
      status: 'launched',
      launchedAt: now,
      playableRegion: playableRegion(present.length),
    });
    for (const entry of present) await endow(ctx, entry, now);

    /**
     * **La première édition du classement**, à `launchedAt + PRESS_EDITION_HOURS` et pas une
     * minute avant : au lancement tout le monde a la même dotation, il n'y a rien à raconter.
     * Le travail se replanifie ensuite lui-même (`convex/press.ts`), comme les files.
     */
    await ctx.scheduler.runAfter(PRESS_EDITION_HOURS * 3_600_000, internal.press.publish, {
      playerId: present[0]!._id,
    });

    /**
     * **Les objectifs neutres se posent dans leur propre travail** (objectifs neutres,
     * 17/09/2026). Le lancement porte déjà la dotation de chacun ; y ajouter un champ de
     * distances par quartier général et une route par paire de voisins, c'est mettre la seconde
     * d'une mutation sur le geste qui ouvre la partie. Ce que la séparation achète est une saison
     * **jouable avant que les dépêches tombent** : le plateau s'ouvre, les réserves paraissent
     * une seconde plus tard.
     */
    await ctx.scheduler.runAfter(0, internal.objectives.place, { seasonId: season._id });
  },
});

/**
 * **The entry into war of a latecomer** — the launch he missed, for him alone. He is endowed
 * exactly as the others were (`endow`): same kit, same foundation still owed — headquarters included
 * since the decision of 13/09 —,
 * and no compensation for the hours he was not there. The measure of that handicap will come
 * from a real case, not from a number invented here.
 *
 * No "ready" and no relaunch: the launch happened, the season is running, and nobody waits for
 * him. What he has to have is what a seat needs to become a nation — a free flag.
 */
export const enterWar = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    /** Twice-clicked is not an error: the second call finds a belligerent and hands out
     *  nothing. Answering with a refusal would be telling him his own entry failed. */
    if (isAtWar(player, season)) return;
    if (player.nation === null) fail('NATION_REQUIRED');

    const present = await seatsOf(ctx, season._id);
    const holder = present.find(
      (entry) => entry.nation === player.nation && entry._id !== player._id,
    );
    if (holder) fail('NATION_TAKEN', { nation: player.nation, nickname: holder.nickname });

    await endow(ctx, player, Date.now());
  },
});

/**
 * **The one exit a season has**, whichever door it takes: the test victory when a pass crosses
 * the threshold (`victory.ts`), and the founder's own hand when there is no clock to end it
 * (`conclude`). Three fields, written once, so a season taken and a season closed cannot end up
 * in two subtly different states — `winnerId: null` is the whole difference, and it is the
 * honest one: nobody won.
 */
export async function concludeSeason(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  winnerId: Id<'players'> | null,
  at: number,
): Promise<void> {
  /**
   * **L'édition finale s'écrit d'abord** (`classement-bareme.md` §5) : après le `patch`, le
   * garde-fou de tout travail planifié (`seasonStillPlays`) la refuserait — ce qui est
   * précisément ce qui arrête toutes les suivantes. C'est le classement que la page de presse
   * tamponne, et il n'y a pas d'écran de fin pour le doubler.
   */
  await publishFinalEdition(ctx, seasonId, at);
  /** La nation part avec l'identifiant, dans la même écriture : l'accueil nomme le vainqueur
   *  sans rouvrir sa place, et la place, elle, peut disparaître au wipe. */
  const winner = winnerId === null ? null : await ctx.db.get(winnerId);
  await ctx.db.patch(seasonId, {
    status: 'concluded',
    winnerId,
    winnerNation: winner === null ? null : (winner.nation ?? winner.nickname),
    concludedAt: at,
  });
}

/**
 * **Depuis quand on ne l'a plus vu.** Un siège déposé avant que la présence existe ne porte pas
 * le champ, et le lancement de la saison fait alors foi : un fondateur d'avant n'est pas un
 * fondateur absent depuis toujours, il est un fondateur qu'on n'a pas encore mesuré. Le
 * `_creationTime` ne sert que le cas dégénéré d'une saison au salon, qui n'a pas d'heure de
 * lancement et où la clôture n'existe pas.
 */
export function lastSeenOf(player: Doc<'players'>, season: Doc<'seasons'>): number {
  return player.lastSeenAt ?? season.launchedAt ?? player._creationTime;
}

/** L'heure à partir de laquelle le doyen peut clore à la place du fondateur. */
export const concludeOpensAt = (founder: Doc<'players'>, season: Doc<'seasons'>): number =>
  lastSeenOf(founder, season) + FOUNDER_ABSENCE_HOURS * 3_600_000;

export const founderOf = (seats: ReadonlyArray<Doc<'players'>>): Doc<'players'> | null =>
  seats.find((seat) => seat.creator) ?? null;

/**
 * **Le doyen : le plus ancien belligérant debout qui n'est pas le fondateur.** Le rang d'entrée
 * plutôt qu'un vote, comme le successeur d'une capitulation (`players.surrender`) — et le
 * fondateur en est exclu par construction, sans quoi le doyen serait presque toujours lui et la
 * porte ne s'ouvrirait sur personne.
 */
export function elderOf(
  seats: ReadonlyArray<Doc<'players'>>,
  season: Doc<'seasons'>,
  founder: Doc<'players'>,
): Doc<'players'> | null {
  return (
    [...seats]
      .filter((seat) => seat._id !== founder._id && seat.defeated !== true && isAtWar(seat, season))
      .sort((left, right) => left._creationTime - right._creationTime)[0] ?? null
  );
}

/**
 * **Qui peut clore, et pourquoi pas.** Une seule fonction pour la mutation et pour la vue
 * (ADR 0015) : ce que le plateau propose et ce que le serveur accepte ne peuvent pas diverger,
 * et il n'y a donc pas de bouton grisé à expliquer.
 *
 * Le fondateur passe toujours ; le doyen passe quand le fondateur n'a plus été vu depuis
 * `FOUNDER_ABSENCE_HOURS`. **Le titre ne bouge pas** — le fondateur reste fondateur, il a
 * seulement perdu l'exclusivité, et il la reprend à son retour puisque la présence se réécrit.
 */
export function concludeRefusal(
  player: Doc<'players'>,
  seats: ReadonlyArray<Doc<'players'>>,
  season: Doc<'seasons'>,
  now: number,
): 'CREATOR_ONLY' | 'FOUNDER_STILL_PRESENT' | null {
  if (player.creator) return null;
  const founder = founderOf(seats);
  if (founder === null) return 'CREATOR_ONLY';
  /** Le rang d'abord, l'heure ensuite : à qui n'est pas le doyen on ne dit rien du fondateur.
   *  L'absence est publique, mais elle n'a de sens que pour la main à qui elle ouvre la porte. */
  if (elderOf(seats, season, founder)?._id !== player._id) return 'CREATOR_ONLY';
  return now < concludeOpensAt(founder, season) ? 'FOUNDER_STILL_PRESENT' : null;
}

/**
 * **Le fondateur clôt la saison, à la main.** C'est la seule fin d'une partie sans horloge
 * (révision du 27/08 de l'ADR 0017), et la fin à l'heure n'existe de toute façon pas encore : ce
 * bouton rend le fait honnête plutôt que de le cacher derrière un compte à rebours qui ne
 * déclenche rien.
 *
 * Elle ne désigne personne — `winnerId` reste nul — et elle ne détruit rien : le plateau et le
 * journal servent une saison close (`requireStarted`), c'est la partie qu'on relit avant le wipe.
 * Les ordres, eux, sont refusés (`requirePlayable`), et les travaux planifiés se taisent
 * (`seasonStillPlays`).
 */
export const conclude = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    if (season.status !== 'launched') fail('SEASON_NOT_LAUNCHED');

    const now = Date.now();
    const present = await seatsOf(ctx, season._id);
    const refusal = concludeRefusal(player, present, season, now);
    if (refusal !== null) fail(refusal);

    await concludeSeason(ctx, season._id, null, now);
    for (const entry of present) {
      await ctx.db.insert('notices', { playerId: entry._id, at: now, kind: 'seasonClosed' });
    }
  },
});

/**
 * **The founder scraps the season, for everyone.** No vote and no soft delete: a season is
 * disposable by design (ADR 0001), and between friends the one who opened the lobby is the one
 * who closes it. The others hold a token that no longer answers — the lobby and the board both
 * treat that as a stale token and send them home, which is exactly what happened.
 *
 * Scheduled functions are not cancelled: a construction or a batch that fires afterwards finds
 * nothing to read and returns. That is already how a cancelled batch behaves.
 */
export const destroy = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    if (!player.creator) fail('CREATOR_ONLY');

    const present = await everySeatOf(ctx, season._id);
    for (const entry of present) {
      await erasePlayer(ctx, entry._id);
      await ctx.db.delete(entry._id);
    }
    /** **Un objectif n'appartient à personne** — il pend à la saison et à rien d'autre, donc
     *  `erasePlayer` ne peut pas l'emporter : c'est ici qu'il tombe, ou nulle part. */
    for (const objective of await ctx.db
      .query('objectives')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect()) {
      await ctx.db.delete(objective._id);
    }
    await ctx.db.delete(season._id);
  },
});

/**
 * **Everything hanging from one player**, which is every table the schema indexes `byPlayer`
 * plus the engagements he opened. The list is not a memo of what the game held when this was
 * written — a table left out survives its season as an orphan nobody can reach — so
 * `off-season.test.ts` walks the schema itself and fails on the next table that forgets to
 * appear here.
 *
 * Engagements are taken by attacker only, and that is enough: both sides of an engagement sit
 * in the same season, `destroy` erases all of them, and every account has exactly one
 * attacker — going by defender as well would delete the same row twice.
 */
async function erasePlayer(ctx: MutationCtx, playerId: Id<'players'>): Promise<void> {
  const player = await ctx.db.get(playerId);
  const byPlayer = async (
    table:
      | 'constructions'
      | 'recruitments'
      | 'troops'
      | 'buildings'
      | 'resources'
      | 'orders'
      | 'movements'
      | 'outposts'
      | 'sightings'
      | 'campSightings'
      | 'lootCrateSightings'
      | 'regionSightings'
      | 'stationedLoot'
      | 'notices'
      | 'messages',
  ) =>
    ctx.db
      .query(table)
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect();

  /** Les frappes pendent à l'engagement et non au joueur : elles partent avec le compte rendu
   *  qui les nomme, sans quoi la table garderait des lignes que plus aucun index n'atteint. */
  const accounts = await ctx.db
    .query('engagements')
    .withIndex('byAttacker', (q) => q.eq('attackerId', playerId))
    .collect();
  for (const account of accounts) {
    for (const strike of await ctx.db
      .query('strikes')
      .withIndex('byEngagement', (q) => q.eq('engagementId', account._id))
      .collect()) {
      await ctx.db.delete(strike._id);
    }
  }

  /** Les éditions pendent au joueur par un index composé — le préfixe suffit à les balayer,
   *  et un second index par joueur seul serait une clé de plus à tenir pour la même réponse. */
  const editions = await ctx.db
    .query('editions')
    .withIndex('byPlayerAt', (q) => q.eq('playerId', playerId))
    .collect();

  const plunderReports = new Map(
    [
      ...(await ctx.db
        .query('plunderReports')
        .withIndex('byAttacker', (q) => q.eq('attackerId', playerId))
        .collect()),
      ...(await ctx.db
        .query('plunderReports')
        .withIndex('byDefender', (q) => q.eq('defenderId', playerId))
        .collect()),
    ].map((report) => [report._id, report]),
  );
  const lootRecoveries = await ctx.db
    .query('lootRecoveries')
    .withIndex('byRecoveringPlayer', (q) => q.eq('recoveringPlayerId', playerId))
    .collect();
  const lootCollections = await ctx.db
    .query('lootCollections')
    .withIndex('byCollector', (q) => q.eq('collectorPlayerId', playerId))
    .collect();
  const lootCrates = (
    await Promise.all(
      lootRecoveries.map((recovery) =>
        ctx.db
          .query('lootCrates')
          .withIndex('byRecovery', (q) => q.eq('recoveryId', recovery._id))
          .collect(),
      ),
    )
  ).flat();
  const lootCrateDetectionJobs =
    player === null
      ? []
      : await ctx.db
          .query('lootCrateDetectionJobs')
          .withIndex('bySeason', (q) => q.eq('seasonId', player.seasonId))
          .collect();
  const lootRumors =
    player === null
      ? []
      : await ctx.db
          .query('lootRumors')
          .withIndex('bySeason', (q) => q.eq('seasonId', player.seasonId))
          .collect();

  const owned = [
    ...editions,
    ...plunderReports.values(),
    ...lootCrates,
    ...lootCrateDetectionJobs,
    ...lootRumors,
    ...lootRecoveries,
    ...lootCollections,
    ...(await byPlayer('constructions')),
    ...(await byPlayer('recruitments')),
    ...(await byPlayer('troops')),
    ...(await byPlayer('buildings')),
    ...(await byPlayer('resources')),
    ...(await byPlayer('orders')),
    ...(await byPlayer('movements')),
    ...(await byPlayer('outposts')),
    ...(await byPlayer('sightings')),
    ...(await byPlayer('campSightings')),
    ...(await byPlayer('lootCrateSightings')),
    ...(await byPlayer('regionSightings')),
    ...(await byPlayer('stationedLoot')),
    ...(await byPlayer('notices')),
    ...(await byPlayer('messages')),
    ...accounts,
  ];
  for (const doc of owned) await ctx.db.delete(doc._id);
}

/**
 * The nations nobody holds. Read off the seats present rather than off a stored roster: a
 * reservation is released with a click as long as the holder has not entered the war.
 */
export const freeNations = (
  present: ReadonlyArray<Doc<'players'>>,
): ReadonlyArray<(typeof NATIONS)[number]> =>
  NATIONS.filter((nation) => !present.some((entry) => entry.nation === nation));

async function freeCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = gameCode(Math.random);
    const existing = await ctx.db
      .query('seasons')
      .withIndex('byCode', (q) => q.eq('code', code))
      .unique();
    if (!existing) return code;
  }
  fail('NO_FREE_GAME_CODE');
}
