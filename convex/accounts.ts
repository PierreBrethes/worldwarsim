import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { fail } from './errors';

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

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!session) return null;
    const account = await ctx.db.get(session.accountId);
    return account ? { nickname: account.nickname } : null;
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
