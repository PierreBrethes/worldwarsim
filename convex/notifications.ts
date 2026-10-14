import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import {
  FLUSH_DELAY_MS,
  MAX_PUSH_DEVICES,
  PUSH_KEY_MAX_LENGTH,
  PUSH_TEST_INTERVAL_MS,
  deviceLabelOf,
  groupAlarms,
  groupTelegraph,
  isPushEndpoint,
  pushPreferencesOf,
  readSeat,
  type OutgoingPush,
  type PushType,
} from '../src/domain/push';
import { fail } from './errors';
import { readMarksOf, stampReadMark } from './readMarks';
import { accountOf, playerOf } from './seats';
import { PUSH_TYPE } from './validators';
import { modeOf } from '../src/domain/season-mode';

const PRESENCE_BEAT_MIN_MS = 30_000;
const ENDPOINT_MAX_LENGTH = 2048;

export type PushEntry = {
  readonly type: PushType;
  readonly phrase: string;
  readonly label?: string;
  readonly url: string;
  readonly at: number;
};

/**
 * **Un événement qui compte entre dans la file** — pour un joueur dont le compte a au moins un
 * appareil abonné et a laissé ce type coché, et pour personne d'autre. Le siège irrégulier n'a
 * pas de compte : il n'entend rien, ce qui est le cas des garnisons d'objectifs.
 *
 * **Le vidage est le seul qui parte**, et il est déplacé plutôt qu'empilé : ce qui arrive dans la
 * même minute — une passe de résolution écrit trois lignes — part ensemble.
 */
export async function notifyPlayer(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  entry: PushEntry,
): Promise<void> {
  const player = await ctx.db.get(playerId);
  if (player === null || player.accountId === undefined) return;
  const account = await ctx.db.get(player.accountId);
  if (account === null) return;
  if (!pushPreferencesOf(account.pushPreferences)[entry.type]) return;
  const device = await ctx.db
    .query('pushSubscriptions')
    .withIndex('byAccount', (q) => q.eq('accountId', account._id))
    .first();
  if (device === null) return;

  await ctx.db.insert('pushQueue', {
    accountId: account._id,
    seasonId: player.seasonId,
    type: entry.type,
    at: entry.at,
    phrase: entry.phrase,
    label: entry.label ?? entry.phrase,
    url: entry.url,
  });
  await planFlush(ctx, account._id, account.pushFlushJobId, entry.at + FLUSH_DELAY_MS);
}

/** Un seul vidage en attente, et jamais plus tard que `due` : un vidage replanifié à la fin d'un
 *  repos ou à l'heure du télégraphe ne doit pas retenir l'alarme qui vient d'arriver. */
async function planFlush(
  ctx: MutationCtx,
  accountId: Id<'accounts'>,
  pending: Id<'_scheduled_functions'> | undefined,
  due: number,
): Promise<void> {
  if (pending !== undefined) {
    const job = await ctx.db.system.get(pending);
    if (job !== null && job.state.kind === 'pending') {
      if (job.scheduledTime <= due) return;
      await ctx.scheduler.cancel(job._id);
    }
  }
  const jobId = await ctx.scheduler.runAfter(
    Math.max(0, due - Date.now()),
    internal.notifications.flush,
    { accountId },
  );
  await ctx.db.patch(accountId, { pushFlushJobId: jobId });
}

/**
 * **Le vidage d'un compte**, saison par saison. Les règles de ce qui part sont dans
 * `src/domain/push.ts` (`readSeat`) ; ici on lit l'état, on applique et on replanifie ce qui a
 * été retenu — la fin du repos, l'heure du télégraphe.
 */
export const flush = internalMutation({
  args: { accountId: v.id('accounts') },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (account === null) return;
    await ctx.db.patch(accountId, { pushFlushJobId: undefined });

    const queued = await ctx.db
      .query('pushQueue')
      .withIndex('byAccount', (q) => q.eq('accountId', accountId))
      .collect();
    const bySeason = new Map<Id<'seasons'>, Array<Doc<'pushQueue'>>>();
    for (const row of queued)
      bySeason.set(row.seasonId, [...(bySeason.get(row.seasonId) ?? []), row]);

    const now = Date.now();
    const departures: Array<OutgoingPush & { seasonId: Id<'seasons'> }> = [];
    let retryAt: number | null = null;
    const retryNoLaterThan = (instant: number) => {
      retryAt = retryAt === null ? instant : Math.min(retryAt, instant);
    };

    for (const [seasonId, rows] of bySeason) {
      const season = await ctx.db.get(seasonId);
      const player = await ctx.db
        .query('players')
        .withIndex('byAccountSeason', (q) => q.eq('accountId', accountId).eq('seasonId', seasonId))
        .unique();
      if (season === null || player === null) {
        for (const row of rows) await ctx.db.delete(row._id);
        continue;
      }
      const presence = await ctx.db
        .query('presences')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .first();
      const reading = readSeat(
        {
          presentAt: presence?.at ?? null,
          restWindow: player.restWindow,
          telegraphPushedAt: (await readMarksOf(ctx, player)).telegraphPushedAt,
        },
        now,
      );
      /** Une Blitz n'a pas de plage de repos (B2) : son rappel tombe à l'heure. */
      if (reading.restUntil !== null && modeOf(season.mode) !== 'blitz') {
        retryNoLaterThan(reading.restUntil);
        continue;
      }

      const alarms = rows.filter((row) => row.type !== 'telegraph');
      const telegraph = rows.filter((row) => row.type === 'telegraph');
      const alarm = reading.inPlay ? null : groupAlarms(alarms, seasonId);
      if (alarm !== null) departures.push({ ...alarm, seasonId });
      for (const row of alarms) await ctx.db.delete(row._id);

      if (telegraph.length === 0) continue;
      if (!reading.telegraphAllowed) {
        retryNoLaterThan(reading.telegraphRetryAt!);
        continue;
      }
      const gathered = groupTelegraph(telegraph.length, seasonId);
      if (gathered !== null) departures.push({ ...gathered, seasonId });
      for (const row of telegraph) await ctx.db.delete(row._id);
      await stampReadMark(ctx, player._id, { telegraphPushedAt: now });
    }

    for (const departure of departures) {
      await ctx.scheduler.runAfter(0, internal.pushSend.deliver, { accountId, ...departure });
    }
    if (retryAt !== null) {
      await planFlush(ctx, accountId, undefined, retryAt);
    }
  },
});

export const subscribe = mutation({
  args: {
    token: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.string(),
  },
  handler: async (ctx, { token, endpoint, p256dh, auth, userAgent }) => {
    const account = await accountOf(ctx, token);
    if (account === null) fail('UNKNOWN_SESSION');
    if (
      endpoint.length > ENDPOINT_MAX_LENGTH ||
      !isPushEndpoint(endpoint) ||
      p256dh.length > PUSH_KEY_MAX_LENGTH ||
      auth.length > PUSH_KEY_MAX_LENGTH
    )
      fail('PUSH_ENDPOINT_INVALID');

    const known = await ctx.db
      .query('pushSubscriptions')
      .withIndex('byEndpoint', (q) => q.eq('endpoint', endpoint))
      .unique();
    const fresh = { accountId: account._id, p256dh, auth, deviceLabel: deviceLabelOf(userAgent) };
    if (known !== null) {
      await ctx.db.patch(known._id, fresh);
      return;
    }
    const devices = await ctx.db
      .query('pushSubscriptions')
      .withIndex('byAccount', (q) => q.eq('accountId', account._id))
      .collect();
    const surplus = Math.max(0, devices.length - MAX_PUSH_DEVICES + 1);
    const oldestFirst = [...devices].sort((left, right) => left.createdAt - right.createdAt);
    for (const device of oldestFirst.slice(0, surplus)) await ctx.db.delete(device._id);
    await ctx.db.insert('pushSubscriptions', { ...fresh, endpoint, createdAt: Date.now() });
  },
});

export const unsubscribe = mutation({
  args: { token: v.string(), endpoint: v.string() },
  handler: async (ctx, { token, endpoint }) => {
    const account = await accountOf(ctx, token);
    if (account === null) fail('UNKNOWN_SESSION');
    await dropSubscription(ctx, endpoint, account._id);
  },
});

/** Un endpoint d'un autre compte n'est pas à retirer : il ne se désabonne que de chez soi. */
export async function dropSubscription(
  ctx: MutationCtx,
  endpoint: string,
  accountId: Id<'accounts'>,
): Promise<void> {
  const known = await ctx.db
    .query('pushSubscriptions')
    .withIndex('byEndpoint', (q) => q.eq('endpoint', endpoint))
    .unique();
  if (known !== null && known.accountId === accountId) await ctx.db.delete(known._id);
}

export const subscribed = query({
  args: { token: v.string(), endpoint: v.string() },
  handler: async (ctx, { token, endpoint }) => {
    const account = await accountOf(ctx, token);
    if (account === null) return false;
    const known = await ctx.db
      .query('pushSubscriptions')
      .withIndex('byEndpoint', (q) => q.eq('endpoint', endpoint))
      .unique();
    return known !== null && known.accountId === account._id;
  },
});

/** Les appareils du compte, pour la liste des Réglages — jamais les clés. */
export const devices = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const account = await accountOf(ctx, token);
    if (account === null) return [];
    const rows = await ctx.db
      .query('pushSubscriptions')
      .withIndex('byAccount', (q) => q.eq('accountId', account._id))
      .collect();
    return rows.map((row) => ({
      endpoint: row.endpoint,
      deviceLabel: row.deviceLabel,
      createdAt: row.createdAt,
      lastSentAt: row.lastSentAt ?? null,
    }));
  },
});

export const preferences = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const account = await accountOf(ctx, token);
    return pushPreferencesOf(account?.pushPreferences);
  },
});

export const setPreference = mutation({
  args: { token: v.string(), type: PUSH_TYPE, enabled: v.boolean() },
  handler: async (ctx, { token, type, enabled }) => {
    const account = await accountOf(ctx, token);
    if (account === null) fail('UNKNOWN_SESSION');
    await ctx.db.patch(account._id, {
      pushPreferences: { ...pushPreferencesOf(account.pushPreferences), [type]: enabled },
    });
  },
});

/** La clé publique VAPID, que le client donne au navigateur pour s'abonner. `null` tant que le
 *  serveur n'en a pas — l'écran dit alors que les notifications ne sont pas configurées. */
export const publicKey = query({
  args: {},
  handler: async () => process.env.VAPID_PUBLIC_KEY ?? null,
});

/**
 * **Présent à l'écran** : le plateau bat toutes les minutes tant qu'il est visible. Le serveur ne
 * réécrit rien sous `PRESENCE_BEAT_MIN_MS`, et la table n'est lue que par le vidage.
 */
export const present = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player } = await playerOf(ctx, token, seasonId);
    const now = Date.now();
    const row = await ctx.db
      .query('presences')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .first();
    if (row === null) {
      await ctx.db.insert('presences', { playerId: player._id, at: now });
    } else if (now - row.at >= PRESENCE_BEAT_MIN_MS) {
      await ctx.db.patch(row._id, { at: now });
    }
  },
});

/** **Pour le second lot** : une notification d'essai au compte courant, hors file, hors repos,
 *  hors présence — elle sert à voir que l'appareil sonne. */
export const sendTest = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const account = await accountOf(ctx, token);
    if (account === null) fail('UNKNOWN_SESSION');
    /** Un essai sonne sur chaque appareil du compte : rejoué en boucle, c'est le serveur qui
     *  frappe à la porte des services de push. Un second appui trop tôt ne fait rien. */
    const now = Date.now();
    if (account.pushTestAt !== undefined && now - account.pushTestAt < PUSH_TEST_INTERVAL_MS) {
      return;
    }
    await ctx.db.patch(account._id, { pushTestAt: now });
    await ctx.scheduler.runAfter(0, internal.pushSend.deliver, {
      accountId: account._id,
      body: 'Notification d’essai : cet appareil sonne.',
      url: '/plateau',
      tag: `test:${account._id}`,
      seasonId: null,
    });
  },
});

export const subscriptionsOf = internalQuery({
  args: { accountId: v.id('accounts') },
  handler: async (ctx, { accountId }) =>
    ctx.db
      .query('pushSubscriptions')
      .withIndex('byAccount', (q) => q.eq('accountId', accountId))
      .collect(),
});

export const markSent = internalMutation({
  args: { endpoint: v.string(), at: v.number() },
  handler: async (ctx, { endpoint, at }) => {
    const known = await ctx.db
      .query('pushSubscriptions')
      .withIndex('byEndpoint', (q) => q.eq('endpoint', endpoint))
      .unique();
    if (known !== null) await ctx.db.patch(known._id, { lastSentAt: at });
  },
});

/** **L'appareil a révoqué l'abonnement** (404 ou 410) : la ligne n'a plus d'avenir. */
export const revoke = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const known = await ctx.db
      .query('pushSubscriptions')
      .withIndex('byEndpoint', (q) => q.eq('endpoint', endpoint))
      .unique();
    if (known !== null) await ctx.db.delete(known._id);
  },
});
