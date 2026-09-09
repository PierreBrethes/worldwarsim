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
import { capitalRegionOf } from './regions';
import { SEASON_CLOCK_HOURS } from './validators';
import {
  DEFAULT_REST_WINDOW,
  FOUNDER_ABSENCE_HOURS,
  PRESS_EDITION_HOURS,
  HQ_LEVEL_AT_LAUNCH,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_LAUNCH,
  STARTING_KIT,
  nominalStrength,
} from './constants';

export async function playerByToken(ctx: QueryCtx, token: string) {
  const player = await ctx.db
    .query('players')
    .withIndex('byToken', (q) => q.eq('token', token))
    .unique();
  if (!player) fail('UNKNOWN_TOKEN');
  const season = await ctx.db.get(player.seasonId);
  if (!season) fail('SEASON_GONE');
  return { player, season };
}

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
 * **The kit, one building and one company** — handed out once, by the only two roads that lead
 * to a board: the launch, for everybody standing in the lobby, and the entry into war, for
 * whoever arrives afterwards. One writing of the endowment, so a change to it cannot reach one
 * road and miss the other.
 *
 * The headquarters goes on the region of the 1940 capital (ADR 0015), at the level the season
 * plants it. Everything else is put up or does not exist — but the HQ caps every other building,
 * so leaving it at zero made the first construction of a season forcibly the HQ, without a rule
 * saying so.
 *
 * The foundation is **not** raised here: nothing is placed for the player. A belligerent whose
 * foundation is still owed is a normal state, and the free placements wait for him to choose
 * his regions (`constructions.start`).
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
  const hq = await ctx.db.insert('buildings', {
    seasonId: player.seasonId,
    playerId: player._id,
    key: 'hq',
    regionId: capitalRegionOf(player.nation),
    level: HQ_LEVEL_AT_LAUNCH,
    /** The capital is national soil by definition, and the one building that eats no placement
     *  of it (ADR 0020 §10) — a nation has a headquarters, it does not build one. */
    outpostId: null,
  });

  /**
   * **One infantry, garrisoned at the headquarters** (decision of 25/08). A nation that opens
   * with nothing standing has no answer at all to a column walking in on its first evening, and
   * a barracks is three decisions away.
   *
   * The consequence is accepted rather than dodged: this company counts in the **nominal** the
   * reduction rule measures against (`src/domain/victory.ts`), so a player who holds nothing but
   * his given infantry and loses it falls under half his nominal and becomes reduced — hence
   * scalpable by whoever took it. That is the price of opening with a defence, and it is the
   * shape the test victory is meant to be replaced from, never patched around.
   */
  const strength = nominalStrength('infantry', 1);
  await ctx.db.insert('troops', {
    seasonId: player.seasonId,
    playerId: player._id,
    role: 'infantry',
    tier: 1,
    nominalStrength: strength,
    currentStrength: strength,
    stationedAt: hq,
  });

  await ctx.db.patch(player._id, { enteredWarAt: at });
}

/**
 * **Un seul choix** (ADR 0020 §11) : l'horloge, et elle peut ne pas exister. Le format est parti
 * le 31/08 — il ne restait de lui qu'une ligne de départ, et une seule saison n'en demande pas
 * deux.
 */
export const create = mutation({
  args: {
    nickname: v.string(),
    durationHours: SEASON_CLOCK_HOURS,
    compensation: v.number(),
  },
  handler: async (ctx, { nickname, durationHours, compensation }) => {
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
      concludedAt: null,
    });
    const token = crypto.randomUUID();
    await ctx.db.insert('players', {
      seasonId,
      token,
      nickname: nickname.trim(),
      creator: true,
      nation: null,
      ready: false,
      restWindow: DEFAULT_REST_WINDOW,
      enteredWarAt: null,
    });
    return { code, token };
  },
});

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
 * a value the attacker picks. `previews` needs none either — it takes tokens, 122-bit
 * UUIDs that are not guessed.
 *
 * What would change this: public lobbies, or codes shared beyond a group of friends.
 */
export const join = mutation({
  args: { code: v.string(), nickname: v.string() },
  handler: async (ctx, { code, nickname }) => {
    const season = await ctx.db
      .query('seasons')
      .withIndex('byCode', (q) => q.eq('code', code.trim().toUpperCase()))
      .unique();
    if (!season) fail('UNKNOWN_GAME_CODE');
    if (season.status === 'concluded') fail('SEASON_CONCLUDED');
    if (!canJoinRegistration(season.status, season.launchedAt, Date.now())) {
      fail('REGISTRATION_CLOSED');
    }
    const present = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
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
    const token = crypto.randomUUID();
    await ctx.db.insert('players', {
      seasonId: season._id,
      token,
      nickname: nickname.trim(),
      creator: false,
      nation: null,
      ready: false,
      restWindow: DEFAULT_REST_WINDOW,
      enteredWarAt: null,
    });
    return { token };
  },
});

/**
 * **Every game this browser still holds a seat in.** The home screen keeps a list of tokens
 * (`src/data/token.ts`), and a player accumulates seasons — one lobby open, one running, one
 * already won.
 *
 * A token nobody answers for is **silently dropped** rather than reported: the season it named
 * was destroyed, and an entry screen that turned a scrapped game into an error would condemn
 * itself over a row the player cannot fix. The client sees a shorter list, which is the truth.
 */
export const previews = query({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, { tokens }) => {
    const seats = [];
    for (const token of tokens) {
      const seat = await previewOf(ctx, token);
      if (seat !== null) seats.push(seat);
    }
    return seats;
  },
});

async function previewOf(ctx: QueryCtx, token: string) {
  const player = await ctx.db
    .query('players')
    .withIndex('byToken', (q) => q.eq('token', token))
    .unique();
  if (!player) return null;
  const season = await ctx.db.get(player.seasonId);
  if (!season) return null;
  const present = await ctx.db
    .query('players')
    .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
    .collect();
  const winnerId = season.winnerId ?? null;
  const winner = winnerId === null ? null : await ctx.db.get(winnerId);
  return {
    // The token travels back so a row can name itself to the mutation it arms — it is the
    // client's own, it grants nothing it did not already hold.
    token,
    code: season.code,
    status: season.status,
    durationHours: season.durationHours,
    launchedAt: season.launchedAt,
    createdAt: season._creationTime,
    playableRegion: season.playableRegion ?? playableRegion(present.length),
    players: present.length,
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
    winnerNation: winner === null ? null : (winner.nation ?? winner.nickname),
  };
}

export const lobby = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    const present = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
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
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (!player.creator) fail('CREATOR_ONLY');
    if (season.status !== 'lobby') fail('SEASON_ALREADY_LAUNCHED');
    const present = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
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
  },
});

/**
 * **The entry into war of a latecomer** — the launch he missed, for him alone. He is endowed
 * exactly as the others were (`endow`): same kit, same headquarters, same foundation still owed,
 * and no compensation for the hours he was not there. The measure of that handicap will come
 * from a real case, not from a number invented here.
 *
 * No "ready" and no relaunch: the launch happened, the season is running, and nobody waits for
 * him. What he has to have is what a seat needs to become a nation — a free flag.
 */
export const enterWar = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(player, season);
    /** Twice-clicked is not an error: the second call finds a belligerent and hands out
     *  nothing. Answering with a refusal would be telling him his own entry failed. */
    if (isAtWar(player, season)) return;
    if (player.nation === null) fail('NATION_REQUIRED');

    const present = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
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
  await ctx.db.patch(seasonId, { status: 'concluded', winnerId, concludedAt: at });
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
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (season.status !== 'launched') fail('SEASON_NOT_LAUNCHED');

    const now = Date.now();
    const present = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
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
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (!player.creator) fail('CREATOR_ONLY');

    const present = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
    for (const entry of present) {
      await erasePlayer(ctx, entry._id);
      await ctx.db.delete(entry._id);
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

  const owned = [
    ...editions,
    ...plunderReports.values(),
    ...lootCrates,
    ...lootCrateDetectionJobs,
    ...lootRecoveries,
    ...(await byPlayer('constructions')),
    ...(await byPlayer('recruitments')),
    ...(await byPlayer('troops')),
    ...(await byPlayer('buildings')),
    ...(await byPlayer('resources')),
    ...(await byPlayer('orders')),
    ...(await byPlayer('movements')),
    ...(await byPlayer('outposts')),
    ...(await byPlayer('sightings')),
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
