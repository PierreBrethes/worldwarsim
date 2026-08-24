import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { gameCode, playableRegion } from '../src/domain/off-season';
import { NATIONS, RESOURCES, type SeasonFormat } from '../src/domain/ids';
import { isNation } from '../src/domain/nations';
import { fail } from './errors';
import { capitalRegionOf } from './regions';
import {
  DEFAULT_REST_WINDOW,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_LAUNCH,
  SEASON_FORMATS,
  formatOf,
  startingStock,
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
 * **What a season has to be for an order to be given on it.** A concluded season answers with a
 * code of its own rather than "not launched": it *was* launched, somebody won it, and telling a
 * player his season never started is the kind of message that sends him looking for a bug.
 *
 * It stays readable — the board and the journal serve a concluded season (`view.ts`), because
 * the wipe is manual and one reads the game back before erasing it.
 */
export function requirePlayable(season: Doc<'seasons'>): void {
  if (season.status === 'concluded') fail('SEASON_CONCLUDED');
  requireStarted(season);
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
 * **The kit, and one building** — handed out once, by the only two roads that lead to a board:
 * the launch, for everybody standing in the lobby, and the entry into war, for whoever arrives
 * afterwards. One writing of the endowment, so a change to it cannot reach one road and miss
 * the other.
 *
 * The headquarters goes on the region of the 1940 capital (ADR 0015), at the level its format
 * plants it. Everything else is put up or does not exist — but the HQ caps every other building,
 * so leaving it at zero made the first construction of a season forcibly the HQ, without a rule
 * saying so.
 *
 * The foundation of the format is **not** raised here: nothing is placed for the player. A
 * belligerent whose foundation is still owed is a normal state, and the free placements wait
 * for him to choose his regions (`constructions.start`).
 */
async function endow(
  ctx: MutationCtx,
  player: Doc<'players'>,
  format: SeasonFormat,
  at: number,
): Promise<void> {
  if (!isNation(player.nation)) fail('UNKNOWN_NATION', { nickname: player.nickname });
  const kit = startingStock(format);
  for (const key of RESOURCES) {
    await ctx.db.insert('resources', {
      playerId: player._id,
      key,
      stock: kit[key],
      updatedAt: at,
    });
  }
  await ctx.db.insert('buildings', {
    playerId: player._id,
    key: 'hq',
    regionId: capitalRegionOf(player.nation),
    level: SEASON_FORMATS[format].hqLevelAtLaunch,
  });
  await ctx.db.patch(player._id, { enteredWarAt: at });
}

export const create = mutation({
  args: {
    nickname: v.string(),
    durationHours: v.union(v.literal(48), v.literal(168)),
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
      doctrine: null,
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
    /**
     * **One joins a running season at any hour**, with no window and no switch to open — only a
     * concluded season closes its door. It is a choice made for the phase of testing between
     * friends, and it is to be revisited before the game opens any wider: a nation walking in on
     * the last hour of a seven-day campaign takes the field against armies it could never have
     * built, and nothing here compensates for that (the latecomer gets the launch kit as it is).
     */
    if (season.status === 'concluded') fail('SEASON_CONCLUDED');
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
      doctrine: null,
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
    doctrine: player.doctrine,
    /** A seat on a running season whose owner has not entered the war goes back to the lobby,
     *  not to the board: he holds no nation, and the board could not draw him. */
    atWar: isAtWar(player, season),
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
      durationHours: season.durationHours,
      compensation: season.compensation,
      /** Frozen at launch, and only widening while the lobby is still open: a latecomer joins a
       *  theatre, he does not redraw it. */
      playableRegion: season.playableRegion ?? playableRegion(present.length),
      me: {
        nickname: player.nickname,
        creator: player.creator,
        nation: player.nation,
        doctrine: player.doctrine,
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
    const format = formatOf(season.durationHours);
    for (const entry of present) await endow(ctx, entry, format, now);
  },
});

/**
 * **The entry into war of a latecomer** — the launch he missed, for him alone. He is endowed
 * exactly as the others were (`endow`): same kit, same headquarters, same foundation still owed,
 * and no compensation for the hours he was not there. The measure of that handicap will come
 * from a real case, not from a number invented here.
 *
 * No "ready" and no relaunch: the launch happened, the season is running, and nobody waits for
 * him. What he has to have is what a seat needs to become a nation — a free flag and a doctrine.
 */
export const enterWar = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);
    /** Twice-clicked is not an error: the second call finds a belligerent and hands out
     *  nothing. Answering with a refusal would be telling him his own entry failed. */
    if (isAtWar(player, season)) return;
    if (player.nation === null || player.doctrine === null) fail('NATION_AND_DOCTRINE_REQUIRED');

    const present = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
    const holder = present.find(
      (entry) => entry.nation === player.nation && entry._id !== player._id,
    );
    if (holder) fail('NATION_TAKEN', { nation: player.nation, nickname: holder.nickname });

    await endow(ctx, player, formatOf(season.durationHours), Date.now());
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
      | 'sightings',
  ) =>
    ctx.db
      .query(table)
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect();

  const owned = [
    ...(await byPlayer('constructions')),
    ...(await byPlayer('recruitments')),
    ...(await byPlayer('troops')),
    ...(await byPlayer('buildings')),
    ...(await byPlayer('resources')),
    ...(await byPlayer('orders')),
    ...(await byPlayer('movements')),
    ...(await byPlayer('outposts')),
    ...(await byPlayer('sightings')),
    ...(await ctx.db
      .query('engagements')
      .withIndex('byAttacker', (q) => q.eq('attackerId', playerId))
      .collect()),
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
