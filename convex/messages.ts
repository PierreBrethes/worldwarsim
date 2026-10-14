import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { nationInk } from '../src/domain/nations';
import {
  canRead,
  MESSAGE_MAX_CHARS,
  MESSAGE_MIN_INTERVAL_MS,
  TELEGRAPH_DEPTH,
} from '../src/domain/telegraph';
import { fail } from './errors';
import { notifyPlayer } from './notifications';
import { telegraphUrl, push } from '../src/domain/push';
import { readMarksOf, stampReadMark } from './readMarks';
import { playerOf, seatsOf } from './seats';

/**
 * **On se chambre aussi en attendant le lancement.** The channel opens with the lobby and closes
 * with the season: `requirePlayable` would seal it before the launch, which is exactly the hour
 * players have nothing to do but talk to each other. A concluded season is the one refusal — it
 * is read back, it is not played, and that includes not being written into.
 */
function requireOpenChannel(season: Doc<'seasons'>): void {
  if (season.status === 'concluded') fail('SEASON_CONCLUDED');
}

export const post = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    text: v.string(),
    to: v.optional(v.id('players')),
    lobby: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, seasonId, text, to, lobby }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requireOpenChannel(season);
    if (lobby === true && season.status !== 'lobby') fail('SEASON_ALREADY_LAUNCHED');

    const seats = await seatsOf(ctx, season._id);
    if (to !== undefined && (to === player._id || !seats.some((seat) => seat._id === to))) {
      fail('UNKNOWN_RECIPIENT');
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) fail('EMPTY_MESSAGE');
    if (trimmed.length > MESSAGE_MAX_CHARS) {
      fail('MESSAGE_TOO_LONG', { maximum: MESSAGE_MAX_CHARS, length: trimmed.length });
    }

    /**
     * **One message a second, and the refusal says so.** It is a guard against a key held down
     * or a script, not a moderation policy: eight friends are not throttled by a second, and the
     * thread stays readable. Read off his own last row rather than off a counter, so nothing has
     * to be kept in step with the table.
     */
    const now = Date.now();
    const latest = await ctx.db
      .query('messages')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .order('desc')
      .first();
    if (latest !== null && now - latest.at < MESSAGE_MIN_INTERVAL_MS) {
      fail('TELEGRAPH_TOO_FAST', { intervalMs: MESSAGE_MIN_INTERVAL_MS });
    }

    await ctx.db.insert('messages', {
      seasonId: season._id,
      playerId: player._id,
      text: trimmed,
      at: now,
      ...(to === undefined ? {} : { to }),
      ...(lobby === true ? { lobby } : {}),
    });
    for (const seat of seats) {
      if (seat._id === player._id || (to !== undefined && seat._id !== to)) continue;
      await notifyPlayer(ctx, seat._id, {
        type: 'telegraph',
        phrase: push.telegraphOne,
        url: telegraphUrl,
        at: now,
      });
    }
  },
});

/**
 * **The tail of the thread, oldest first.** Bounded rather than paginated: the telegraph is a
 * fil, not an archive (`TELEGRAPH_DEPTH`), and a channel between at most eight players over at
 * most seven days has no back-scroll worth writing.
 *
 * The seats are resolved here because the client holds no roster of its own: a message carries
 * its sender's nickname, his nation and its ink. None of that is a leak — a belligerent's flag
 * is on the map from his first hour — and a message from a seat still choosing its nation
 * simply carries `null`, which is what the lobby shows.
 */
export const recent = query({
  args: { token: v.string(), seasonId: v.id('seasons'), lobby: v.optional(v.boolean()) },
  handler: async (ctx, { token, seasonId, lobby }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    const thread = lobby === true ? true : undefined;
    const seats = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
    const byId = new Map(seats.map((seat) => [seat._id, seat]));
    const marks = await readMarksOf(ctx, player);

    const shape = (message: Doc<'messages'>) => {
      const sender = byId.get(message.playerId);
      return {
        id: message._id,
        at: message.at,
        text: message.text,
        nickname: sender?.nickname ?? '',
        nation: sender?.nation ?? null,
        ink: nationInk(sender?.nation ?? null),
        mine: message.playerId === player._id,
      };
    };
    const general = () =>
      ctx.db
        .query('messages')
        .withIndex('byChannel', (q) =>
          q.eq('seasonId', season._id).eq('lobby', thread).eq('to', undefined),
        )
        .order('desc')
        .take(TELEGRAPH_DEPTH);
    const between = (from: Id<'players'>, to: Id<'players'>) =>
      ctx.db
        .query('messages')
        .withIndex('byPair', (q) =>
          q.eq('seasonId', season._id).eq('lobby', thread).eq('to', to).eq('playerId', from),
        )
        .order('desc')
        .take(TELEGRAPH_DEPTH);

    const direct = [];
    for (const other of await seatsOf(ctx, season._id)) {
      if (other._id === player._id) continue;
      const rows = [
        ...(await between(other._id, player._id)),
        ...(await between(player._id, other._id)),
      ]
        .filter((message) => canRead(message, player._id))
        .sort((a, b) => b.at - a.at)
        .slice(0, TELEGRAPH_DEPTH)
        .reverse();
      direct.push({
        with: other._id,
        nickname: other.nickname,
        nation: other.nation ?? null,
        ink: nationInk(other.nation ?? null),
        readAt: marks.telegraphDirectReadAt[other._id] ?? null,
        messages: rows.map(shape),
      });
    }

    return {
      /** The hour he last closed the window, `null` while he never has: the client counts what
       *  is unread from it, exactly as the journal does, and nothing here counts for him. */
      readAt: marks.telegraphReadAt,
      messages: (await general()).reverse().map(shape),
      direct,
    };
  },
});

/**
 * **Lu à la fermeture**, same mechanism as the journal and a field of its own: what one had time
 * to see is what one read. No refusal on a concluded season — closing a window is reading, not
 * playing.
 */
export const markRead = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), with: v.optional(v.id('players')) },
  handler: async (ctx, { token, seasonId, with: other }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    if (other === undefined) {
      await stampReadMark(ctx, player._id, { telegraphReadAt: Date.now() });
      return;
    }
    const seats = await seatsOf(ctx, season._id);
    if (other === player._id || !seats.some((seat) => seat._id === other)) return;
    const { telegraphDirectReadAt } = await readMarksOf(ctx, player);
    await stampReadMark(ctx, player._id, {
      telegraphDirectReadAt: { ...telegraphDirectReadAt, [other]: Date.now() },
    });
  },
});

/** Bounded so no single mutation deletes thousands of rows: a full pass queues the next. */
export const ERASE_BATCH = 500;

/**
 * **Un fil s'efface en entier, par lots** : le salon au lancement, la partie à la conclusion —
 * pas d'archive. Les dates de lecture n'ont rien à suivre : celles du salon précèdent le
 * lancement, celles de la partie la conclusion, aucun message ne peut les dépasser.
 */
export const erase = internalMutation({
  args: { seasonId: v.id('seasons'), lobby: v.boolean() },
  handler: async (ctx, { seasonId, lobby }) => {
    const rows = await ctx.db
      .query('messages')
      .withIndex('byChannel', (q) =>
        q.eq('seasonId', seasonId).eq('lobby', lobby ? true : undefined),
      )
      .take(ERASE_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === ERASE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.messages.erase, { seasonId, lobby });
    }
  },
});
