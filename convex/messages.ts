import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { nationInk } from '../src/domain/nations';
import {
  MESSAGE_MAX_CHARS,
  MESSAGE_MIN_INTERVAL_MS,
  TELEGRAPH_DEPTH,
} from '../src/domain/telegraph';
import { fail } from './errors';
import { playerOf } from './seasons';

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
  args: { token: v.string(), seasonId: v.id('seasons'), text: v.string() },
  handler: async (ctx, { token, seasonId, text }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requireOpenChannel(season);

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
    });
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
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    const latest = await ctx.db
      .query('messages')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .order('desc')
      .take(TELEGRAPH_DEPTH);
    const seats = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
    const byId = new Map(seats.map((seat) => [seat._id, seat]));

    return {
      /** The hour he last closed the window, `null` while he never has: the client counts what
       *  is unread from it, exactly as the journal does, and nothing here counts for him. */
      readAt: player.telegraphReadAt ?? null,
      messages: latest.reverse().map((message) => {
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
      }),
    };
  },
});

/**
 * **Lu à la fermeture**, same mechanism as the journal and a field of its own: what one had time
 * to see is what one read. No refusal on a concluded season — closing a window is reading, not
 * playing.
 */
export const markRead = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player } = await playerOf(ctx, token, seasonId);
    await ctx.db.patch(player._id, { telegraphReadAt: Date.now() });
  },
});
