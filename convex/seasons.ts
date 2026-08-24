import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { gameCode, playableRegion } from '../src/domain/off-season';
import { RESOURCES } from '../src/domain/ids';
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
    if (season.status !== 'lobby') fail('SEASON_ALREADY_LAUNCHED');
    const present = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
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
      playableRegion: playableRegion(present.length),
      me: {
        nickname: player.nickname,
        creator: player.creator,
        nation: player.nation,
        doctrine: player.doctrine,
        ready: player.ready,
        restWindow: player.restWindow,
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
    /**
     * The starting kit, and **one building**: the headquarters, on the region of the 1940
     * capital (ADR 0015), at the level its format plants it. Everything else is put up or does
     * not exist — but the HQ caps every other building, so leaving it at zero made the first
     * construction of a season forcibly the HQ, without a rule saying so.
     *
     * The foundation of the format is **not** raised here: nothing is placed for the player.
     * A launched season whose foundation is still owed is a normal state, and the free
     * placements wait for him to choose his regions (`constructions.start`).
     */
    const format = formatOf(season.durationHours);
    const kit = startingStock(format);
    for (const entry of present) {
      if (!isNation(entry.nation)) fail('UNKNOWN_NATION', { nickname: entry.nickname });
      for (const key of RESOURCES) {
        await ctx.db.insert('resources', {
          playerId: entry._id,
          key,
          stock: kit[key],
          updatedAt: now,
        });
      }
      await ctx.db.insert('buildings', {
        playerId: entry._id,
        key: 'hq',
        regionId: capitalRegionOf(entry.nation),
        level: SEASON_FORMATS[format].hqLevelAtLaunch,
      });
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
