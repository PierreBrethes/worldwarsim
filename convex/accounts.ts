import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { fail } from './errors';
import { accountOf, previewOf } from './seasons';

const digestArgs = {
  passwordHash: v.string(),
  salt: v.string(),
  iterations: v.number(),
};

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

    const collision = await ctx.db
      .query('sessions')
      .withIndex('byToken', (q) => q.eq('token', args.token))
      .unique();
    if (collision) fail('SESSION_TOKEN_COLLISION');

    const now = Date.now();
    const accountId = await ctx.db.insert('accounts', {
      nickname: args.nickname,
      nicknameKey: args.nicknameKey,
      passwordHash: args.passwordHash,
      salt: args.salt,
      iterations: args.iterations,
      createdAt: now,
    });
    await ctx.db.insert('sessions', {
      accountId,
      token: args.token,
      createdAt: now,
      lastSeenAt: now,
    });
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

    const collision = await ctx.db
      .query('sessions')
      .withIndex('byToken', (q) => q.eq('token', args.token))
      .unique();
    if (collision) fail('SESSION_TOKEN_COLLISION');

    const now = Date.now();
    await ctx.db.insert('sessions', {
      accountId: account._id,
      token: args.token,
      createdAt: now,
      lastSeenAt: now,
    });
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

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (session) await ctx.db.delete(session._id);
  },
});
