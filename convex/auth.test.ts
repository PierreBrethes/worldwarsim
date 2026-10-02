// @vitest-environment node

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { hashPassword } from './passwords';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

describe('account registration', () => {
  afterEach(() => vi.useRealTimers());

  it('normalizes the displayed nickname and returns only a 32-byte session token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
    const t = boot();

    const result = await t.action(api.auth.register, {
      nickname: '  Le\u0301a  ',
      password: 'mot de passe solide',
    });

    expect(result).toEqual({ token: expect.stringMatching(tokenPattern) });
    expect(Object.keys(result)).toEqual(['token']);
    expect(await t.query(api.accounts.me, result)).toEqual({ nickname: 'Léa' });
    expect(
      await t.run(async (ctx) => {
        const account = (await ctx.db.query('accounts').first())!;
        const session = (await ctx.db.query('sessions').first())!;
        return {
          account: {
            nickname: account.nickname,
            nicknameKey: account.nicknameKey,
            createdAt: account.createdAt,
          },
          session: {
            accountId: session.accountId,
            token: session.token,
            createdAt: session.createdAt,
            lastSeenAt: session.lastSeenAt,
          },
        };
      }),
    ).toEqual({
      account: { nickname: 'Léa', nicknameKey: 'lea', createdAt: Date.now() },
      session: {
        accountId: expect.any(String),
        token: result.token,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      },
    });

    const initialLastSeenAt = Date.now();
    vi.advanceTimersByTime(60_000);
    expect(await t.query(api.accounts.me, result)).toEqual({ nickname: 'Léa' });
    expect(await t.run(async (ctx) => (await ctx.db.query('sessions').first())!.lastSeenAt)).toBe(
      initialLastSeenAt,
    );
  });

  it.each([
    ['Pi', 'mot de passe solide', 'NICKNAME_INVALID'],
    ['Pierre\u200b', 'mot de passe solide', 'NICKNAME_INVALID'],
    ['Pierre', 'court', 'PASSWORD_TOO_SHORT'],
    ['Pierre', 'é'.repeat(36) + 'a', 'PASSWORD_TOO_LONG'],
  ])('rejects invalid C1 input (%s)', async (nickname, password, code) => {
    const t = boot();
    await expect(t.action(api.auth.register, { nickname, password })).rejects.toThrow(code);
    expect(await t.run(async (ctx) => ctx.db.query('accounts').collect())).toEqual([]);
    expect(await t.run(async (ctx) => ctx.db.query('sessions').collect())).toEqual([]);
  });

  it('enforces accent-insensitive nickname uniqueness inside the transaction', async () => {
    const t = boot();
    await t.action(api.auth.register, { nickname: 'Léa', password: 'premier secret' });

    await expect(
      t.action(api.auth.register, { nickname: '  LEA  ', password: 'second secret' }),
    ).rejects.toThrow('NICKNAME_TAKEN');
    expect(await t.run(async (ctx) => ctx.db.query('accounts').collect())).toHaveLength(1);
    expect(await t.run(async (ctx) => ctx.db.query('sessions').collect())).toHaveLength(1);
  });

  it('lets only one of two concurrent registrations claim a nickname', async () => {
    const t = boot();
    const attempts = await Promise.allSettled([
      t.action(api.auth.register, { nickname: 'Pièrre', password: 'premier secret' }),
      t.action(api.auth.register, { nickname: 'PIERRE', password: 'second secret' }),
    ]);

    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(
      String(
        (attempts.find(({ status }) => status === 'rejected') as PromiseRejectedResult).reason,
      ),
    ).toContain('NICKNAME_TAKEN');
    expect(await t.run(async (ctx) => ctx.db.query('accounts').collect())).toHaveLength(1);
    expect(await t.run(async (ctx) => ctx.db.query('sessions').collect())).toHaveLength(1);
  });
});

describe('account login and sessions', () => {
  it('logs in with the normalized nickname and returns no digest fields', async () => {
    const t = boot();
    const registered = await t.action(api.auth.register, {
      nickname: 'Pièrre',
      password: 'mot de passe solide',
    });

    const loggedIn = await t.action(api.auth.login, {
      nickname: '  PIERRE  ',
      password: 'mot de passe solide',
    });

    expect(loggedIn).toEqual({ token: expect.stringMatching(tokenPattern) });
    expect(Object.keys(loggedIn)).toEqual(['token']);
    expect(loggedIn.token).not.toBe(registered.token);
    expect(await t.query(api.accounts.me, loggedIn)).toEqual({ nickname: 'Pièrre' });
  });

  it.each([
    ['Inconnu', 'mot de passe solide'],
    ['Pierre', 'mauvais secret'],
    ['Pi', 'mot de passe solide'],
    ['Pierre', 'court'],
    ['Pierre', 'é'.repeat(36) + 'a'],
  ])('uses BAD_CREDENTIALS for every refused login (%s)', async (nickname, password) => {
    const t = boot();
    await t.action(api.auth.register, { nickname: 'Pierre', password: 'mot de passe solide' });
    await expect(t.action(api.auth.login, { nickname, password })).rejects.toThrow(
      'BAD_CREDENTIALS',
    );
  });

  it('keeps sessions independent and makes logout idempotent', async () => {
    const t = boot();
    const first = await t.action(api.auth.register, {
      nickname: 'Pierre',
      password: 'mot de passe solide',
    });
    const second = await t.action(api.auth.login, {
      nickname: 'Pierre',
      password: 'mot de passe solide',
    });

    await t.mutation(api.accounts.logout, first);
    await t.mutation(api.accounts.logout, first);

    expect(await t.query(api.accounts.me, first)).toBeNull();
    expect(await t.query(api.accounts.me, second)).toEqual({ nickname: 'Pierre' });
  });

  it('returns null for unknown and orphaned sessions', async () => {
    const t = boot();
    expect(await t.query(api.accounts.me, { token: 'unknown' })).toBeNull();
    const { token } = await t.action(api.auth.register, {
      nickname: 'Pierre',
      password: 'mot de passe solide',
    });
    await t.run(async (ctx) => {
      const account = (await ctx.db.query('accounts').first())!;
      await ctx.db.delete(account._id);
    });
    expect(await t.query(api.accounts.me, { token })).toBeNull();
  });

  it('rejects forced token collisions without overwriting the existing session', async () => {
    const t = boot();
    const first = await t.action(api.auth.register, {
      nickname: 'Pierre',
      password: 'mot de passe solide',
    });
    const snapshot = (await t.query(internal.accounts.passwordDigest, {
      nicknameKey: 'pierre',
    }))!;

    await expect(
      t.mutation(internal.accounts.createSession, { ...snapshot, token: first.token }),
    ).rejects.toThrow('SESSION_TOKEN_COLLISION');
    expect(await t.query(api.accounts.me, first)).toEqual({ nickname: 'Pierre' });
    expect(await t.run(async (ctx) => ctx.db.query('sessions').collect())).toHaveLength(1);
  });

  it('rolls back a registration whose token collides with an existing session', async () => {
    const t = boot();
    const first = await t.action(api.auth.register, {
      nickname: 'Pierre',
      password: 'mot de passe solide',
    });
    const digest = await hashPassword('autre mot de passe');

    await expect(
      t.mutation(internal.accounts.register, {
        nickname: 'Léa',
        nicknameKey: 'lea',
        ...digest,
        token: first.token,
      }),
    ).rejects.toThrow('SESSION_TOKEN_COLLISION');
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.query('accounts').collect()).map(({ nickname }) => nickname),
      ),
    ).toEqual(['Pierre']);
    expect(await t.run(async (ctx) => ctx.db.query('sessions').collect())).toHaveLength(1);
  });
});

describe('password recovery and login races', () => {
  it('revokes every session and accepts only the replacement password', async () => {
    const t = boot();
    const first = await t.action(api.auth.register, {
      nickname: 'Pierre',
      password: 'ancien secret',
    });
    const second = await t.action(api.auth.login, {
      nickname: 'Pierre',
      password: 'ancien secret',
    });

    await t.action(internal.auth.resetPassword, {
      nickname: '  PIÈRRE  ',
      password: 'nouveau secret',
    });

    expect(await t.query(api.accounts.me, first)).toBeNull();
    expect(await t.query(api.accounts.me, second)).toBeNull();
    await expect(
      t.action(api.auth.login, { nickname: 'Pierre', password: 'ancien secret' }),
    ).rejects.toThrow('BAD_CREDENTIALS');
    const replacement = await t.action(api.auth.login, {
      nickname: 'Pierre',
      password: 'nouveau secret',
    });
    expect(await t.query(api.accounts.me, replacement)).toEqual({ nickname: 'Pierre' });
  });

  it('refuses invalid recovery input and an unknown account without creating one', async () => {
    const t = boot();
    await expect(
      t.action(internal.auth.resetPassword, { nickname: 'Pi', password: 'nouveau secret' }),
    ).rejects.toThrow('NICKNAME_INVALID');
    await expect(
      t.action(internal.auth.resetPassword, { nickname: 'Pierre', password: 'court' }),
    ).rejects.toThrow('PASSWORD_TOO_SHORT');
    await expect(
      t.action(internal.auth.resetPassword, {
        nickname: 'Pierre',
        password: 'nouveau secret',
      }),
    ).rejects.toThrow('ACCOUNT_NOT_FOUND');
    expect(await t.run(async (ctx) => ctx.db.query('accounts').collect())).toEqual([]);
  });

  it('rejects a login transaction whose verified digest predates a reset', async () => {
    const t = boot();
    await t.action(api.auth.register, { nickname: 'Pierre', password: 'ancien secret' });
    const stale = (await t.query(internal.accounts.passwordDigest, {
      nicknameKey: 'pierre',
    }))!;
    const replacement = await hashPassword('nouveau secret');

    await t.mutation(internal.accounts.resetPassword, {
      nicknameKey: 'pierre',
      ...replacement,
    });

    await expect(
      t.mutation(internal.accounts.createSession, {
        ...stale,
        token: 'A'.repeat(43),
      }),
    ).rejects.toThrow('BAD_CREDENTIALS');
    expect(await t.run(async (ctx) => ctx.db.query('sessions').collect())).toEqual([]);
  });

  it('revokes a session created just before the reset transaction', async () => {
    const t = boot();
    await t.action(api.auth.register, { nickname: 'Pierre', password: 'ancien secret' });
    const stale = (await t.query(internal.accounts.passwordDigest, {
      nicknameKey: 'pierre',
    }))!;
    const replacement = await hashPassword('nouveau secret');
    const token = 'B'.repeat(43);

    await t.mutation(internal.accounts.createSession, { ...stale, token });
    await t.mutation(internal.accounts.resetPassword, {
      nicknameKey: 'pierre',
      ...replacement,
    });

    expect(await t.query(api.accounts.me, { token })).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.query('sessions').collect())).toEqual([]);
  });
});

describe('identity persistence across game purges', () => {
  it('keeps the account and session after season destruction and the development reset', async () => {
    const t = boot();
    const session = await t.action(api.auth.register, {
      nickname: 'Pierre',
      password: 'mot de passe solide',
    });
    const { seasonId } = await t.mutation(api.seasons.create, {
      ...session,
      durationHours: 48,
      compensation: 0.5,
    });
    expect(await t.query(api.accounts.me, session)).toEqual({ nickname: 'Pierre' });
    expect(await t.query(api.accounts.seats, session)).toEqual([
      expect.objectContaining({ seasonId }),
    ]);

    await t.mutation(api.seasons.destroy, { ...session, seasonId });
    expect(await t.query(api.accounts.me, session)).toEqual({ nickname: 'Pierre' });
    expect(await t.query(api.accounts.seats, session)).toEqual([]);

    await t.mutation(internal.dev.reset, {});
    expect(await t.query(api.accounts.me, session)).toEqual({ nickname: 'Pierre' });
    expect(await t.query(api.accounts.seats, session)).toEqual([]);
  });
});
