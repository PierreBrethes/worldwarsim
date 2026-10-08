import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { fail } from './errors';
import { dropSubscription } from './notifications';
import { LOGIN_MIN_INTERVAL_MS } from '../src/domain/account';
import { previewOf } from './seasons';
import { accountOf } from './seats';
import { openSession, sessionOf, tokenDigest } from './sessions';

const digestArgs = {
  passwordHash: v.string(),
  salt: v.string(),
  iterations: v.number(),
};

/** Un jeton est pris si son empreinte l'est — ou s'il l'est en clair, sur une ligne d'avant. */
async function tokenTaken(ctx: QueryCtx, token: string): Promise<boolean> {
  const digest = await tokenDigest(token);
  for (const value of [digest, token]) {
    const held = await ctx.db
      .query('sessions')
      .withIndex('byToken', (q) => q.eq('token', value))
      .unique();
    if (held !== null) return true;
  }
  return false;
}

export const passwordDigest = internalQuery({
  args: { nicknameKey: v.string() },
  handler: async (ctx, { nicknameKey }) => {
    const account = await ctx.db
      .query('accounts')
      .withIndex('byNicknameKey', (q) => q.eq('nicknameKey', nicknameKey))
      .unique();
    if (!account) return null;
    return {
      accountId: account._id,
      passwordHash: account.passwordHash,
      salt: account.salt,
      iterations: account.iterations,
    };
  },
});

export const register = internalMutation({
  args: {
    nickname: v.string(),
    nicknameKey: v.string(),
    ...digestArgs,
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const claimed = await ctx.db
      .query('accounts')
      .withIndex('byNicknameKey', (q) => q.eq('nicknameKey', args.nicknameKey))
      .unique();
    if (claimed) fail('NICKNAME_TAKEN');

    if (await tokenTaken(ctx, args.token)) fail('SESSION_TOKEN_COLLISION');

    const accountId = await ctx.db.insert('accounts', {
      nickname: args.nickname,
      nicknameKey: args.nicknameKey,
      passwordHash: args.passwordHash,
      salt: args.salt,
      iterations: args.iterations,
      createdAt: Date.now(),
    });
    await openSession(ctx, accountId, args.token);
  },
});

/**
 * **Une tentative à la fois sur un pseudo**, prise avant de dériver quoi que ce soit : `false`
 * et le mot de passe n'est même pas examiné. Une tentative refusée ici **ne repousse pas** la
 * suivante — sinon marteler un pseudo suffirait à en fermer la porte à son propriétaire.
 */
export const claimLoginAttempt = internalMutation({
  args: { accountId: v.id('accounts') },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (account === null) return true;
    const now = Date.now();
    if (
      account.loginAttemptAt !== undefined &&
      now - account.loginAttemptAt < LOGIN_MIN_INTERVAL_MS
    ) {
      return false;
    }
    await ctx.db.patch(accountId, { loginAttemptAt: now });
    return true;
  },
});

export const createSession = internalMutation({
  args: {
    accountId: v.id('accounts'),
    ...digestArgs,
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (
      !account ||
      account.passwordHash !== args.passwordHash ||
      account.salt !== args.salt ||
      account.iterations !== args.iterations
    ) {
      fail('BAD_CREDENTIALS');
    }

    if (await tokenTaken(ctx, args.token)) fail('SESSION_TOKEN_COLLISION');
    await openSession(ctx, account._id, args.token);
  },
});

export const resetPassword = internalMutation({
  args: { nicknameKey: v.string(), ...digestArgs },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query('accounts')
      .withIndex('byNicknameKey', (q) => q.eq('nicknameKey', args.nicknameKey))
      .unique();
    if (!account) fail('ACCOUNT_NOT_FOUND');

    await ctx.db.patch(account._id, {
      passwordHash: args.passwordHash,
      salt: args.salt,
      iterations: args.iterations,
    });
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('byAccount', (q) => q.eq('accountId', account._id))
      .collect();
    for (const session of sessions) await ctx.db.delete(session._id);
  },
});

/**
 * **Qui est là, et rien d'autre** (ADR 0022, révision du 12/09). Deux tables, deux documents :
 * c'est la question que le gardien racine pose à chaque écran (`__root.tsx`), et il n'a besoin
 * que de la réponse à celle-là. Les places ont suivi (`seats`) parce qu'un abonnement réactif
 * garde en vue *tout* ce que sa requête a lu : l'accueil et le plateau tenaient ainsi toutes les
 * places de toutes les saisons du compte, et la porte du jeu est devenue la requête la plus
 * lourde du jeu — jusqu'au délai d'une seconde en production.
 *
 * `null` est la session inconnue ou orpheline, et c'est ce que le client lit pour renvoyer à la
 * page de connexion — jamais un refus, qui aurait fait un écran d'erreur d'une simple
 * déconnexion.
 */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const account = await accountOf(ctx, token);
    return account === null ? null : { nickname: account.nickname };
  },
});

/**
 * **Les parties du compte**, pour le seul écran qui les liste (`/accueil`). Une session inconnue
 * n'en a aucune : le refus se dit en un seul endroit — `me` — et deux écrans de déconnexion
 * concurrents auraient couru l'un contre l'autre.
 */
export const seats = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const account = await accountOf(ctx, token);
    if (!account) return [];
    const taken = await ctx.db
      .query('players')
      .withIndex('byAccountSeason', (q) => q.eq('accountId', account._id))
      .collect();
    /** L'ordre d'entrée : le rang d'insertion est le seul que l'index ne donne pas, et c'est
     *  celui qui a un sens pour une liste de parties. */
    const ordered = [...taken].sort((left, right) => left._creationTime - right._creationTime);
    const previews = await Promise.all(ordered.map((seat) => previewOf(ctx, seat)));
    return previews.filter((preview) => preview !== null);
  },
});

/** `endpoint` est celui de l'appareil qui se déconnecte : il cesse de sonner pour ce compte
 *  (notif-1a). Les autres appareils du compte gardent leur abonnement. */
export const logout = mutation({
  args: { token: v.string(), endpoint: v.optional(v.string()) },
  handler: async (ctx, { token, endpoint }) => {
    const session = await sessionOf(ctx, token);
    if (!session) return;
    if (endpoint !== undefined) await dropSubscription(ctx, endpoint, session.accountId);
    await ctx.db.delete(session._id);
  },
});

/**
 * **Fermer tout ce qui n'est pas cet appareil** : les autres sessions du compte, et les autres
 * abonnements aux notifications — un appareil qu'on ne tient plus ne doit ni entrer ni sonner.
 * `endpoint` est l'abonnement de celui-ci, qui reste ; sans lui, aucun abonnement n'est le sien.
 */
export const logoutOthers = mutation({
  args: { token: v.string(), endpoint: v.optional(v.string()) },
  handler: async (ctx, { token, endpoint }) => {
    const session = await sessionOf(ctx, token);
    if (!session) fail('UNKNOWN_SESSION');
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('byAccount', (q) => q.eq('accountId', session.accountId))
      .collect();
    const others = sessions.filter((other) => other._id !== session._id);
    for (const other of others) await ctx.db.delete(other._id);

    const devices = await ctx.db
      .query('pushSubscriptions')
      .withIndex('byAccount', (q) => q.eq('accountId', session.accountId))
      .collect();
    for (const device of devices) {
      if (device.endpoint !== endpoint) await ctx.db.delete(device._id);
    }
    return { closed: others.length };
  },
});
