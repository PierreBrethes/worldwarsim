// @vitest-environment node

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { LOGIN_MIN_INTERVAL_MS } from '../src/domain/account';
import { hashPassword } from './passwords';
import {
  refreshSession,
  SESSION_IDLE_MS,
  SESSION_REFRESH_MS,
  sessionOf,
  tokenDigest,
} from './sessions';
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
        /** The table keeps the digest, never the token: a leaked base opens nothing. */
        token: await tokenDigest(result.token),
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
  afterEach(() => vi.useRealTimers());

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

  /**
   * **A pause, never a lock.** The right password is refused too inside the interval — the
   * attempt is not even examined — and a refused attempt does not push the next one back, or
   * hammering a nickname would shut its owner out for as long as one cared to hammer.
   */
  it('examines one login attempt per nickname every three seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t = boot();
    await t.action(api.auth.register, { nickname: 'Pierre', password: 'mot de passe solide' });
    const wrong = { nickname: 'Pierre', password: 'mauvais secret' };
    const right = { nickname: 'pierre', password: 'mot de passe solide' };

    await expect(t.action(api.auth.login, wrong)).rejects.toThrow('BAD_CREDENTIALS');
    await expect(t.action(api.auth.login, wrong)).rejects.toThrow('LOGIN_TOO_FAST');
    await expect(t.action(api.auth.login, right)).rejects.toThrow('LOGIN_TOO_FAST');

    vi.setSystemTime(Date.now() + LOGIN_MIN_INTERVAL_MS - 1);
    await expect(t.action(api.auth.login, right)).rejects.toThrow('LOGIN_TOO_FAST');
    vi.setSystemTime(Date.now() + 1);
    expect(await t.action(api.auth.login, right)).toEqual({
      token: expect.stringMatching(tokenPattern),
    });

    /** Another nickname is another door: one account under fire slows nobody else down. */
    await t.action(api.auth.register, { nickname: 'Camille', password: 'mot de passe solide' });
    expect(
      await t.action(api.auth.login, { nickname: 'Camille', password: 'mot de passe solide' }),
    ).toEqual({ token: expect.stringMatching(tokenPattern) });
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

describe('what a session is worth, and for how long', () => {
  afterEach(() => vi.useRealTimers());

  const account = { nickname: 'Pierre', password: 'mot de passe solide' };

  it('does not open on the digest the table keeps', async () => {
    const t = boot();
    const { token } = await t.action(api.auth.register, account);
    const kept = await t.run(async (ctx) => (await ctx.db.query('sessions').first())!);

    expect(kept.token).not.toBe(token);
    expect(kept.hashed).toBe(true);
    expect(await t.query(api.accounts.me, { token: kept.token })).toBeNull();
    expect(await t.query(api.accounts.me, { token })).toEqual({ nickname: 'Pierre' });
  });

  it('still reads a session written before the digest, and converts it on its first write', async () => {
    const t = boot();
    await t.action(api.auth.register, account);
    await t.run(async (ctx) => {
      const session = (await ctx.db.query('sessions').first())!;
      await ctx.db.insert('sessions', {
        accountId: session.accountId,
        token: 'jeton en clair',
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      });
    });
    const legacy = { token: 'jeton en clair' };
    expect(await t.query(api.accounts.me, legacy)).toEqual({ nickname: 'Pierre' });

    await t.run((ctx) => refreshSession(ctx, legacy.token));
    const converted = await t.run((ctx) => sessionOf(ctx, legacy.token));
    expect(converted).toMatchObject({ hashed: true, token: await tokenDigest(legacy.token) });
    expect(await t.query(api.accounts.me, legacy)).toEqual({ nickname: 'Pierre' });
  });

  it('expires after thirty idle days, and lives on when it is used', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
    const t = boot();
    const idle = await t.action(api.auth.register, account);
    vi.setSystemTime(Date.now() + 5_000);
    const used = await t.action(api.auth.login, account);

    vi.setSystemTime(Date.now() + SESSION_REFRESH_MS - 10_000);
    await t.run((ctx) => refreshSession(ctx, used.token));
    expect((await t.run((ctx) => sessionOf(ctx, used.token)))!.lastSeenAt).toBeLessThan(Date.now());

    vi.setSystemTime(Date.now() + SESSION_IDLE_MS - SESSION_REFRESH_MS);
    await t.run((ctx) => refreshSession(ctx, used.token));
    expect((await t.run((ctx) => sessionOf(ctx, used.token)))!.lastSeenAt).toBe(Date.now());

    vi.setSystemTime(Date.now() + SESSION_REFRESH_MS + 60_000);
    expect(await t.query(api.accounts.me, idle)).toBeNull();
    expect(await t.query(api.accounts.me, used)).toEqual({ nickname: 'Pierre' });

    /** The door sweeps: what the account let expire leaves the table at its next login. */
    await t.action(api.auth.login, account);
    expect(await t.run(async (ctx) => ctx.db.query('sessions').collect())).toHaveLength(2);
  });

  it('closes every other device, sessions and notifications alike', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
    const t = boot();
    const here = await t.action(api.auth.register, account);
    vi.setSystemTime(Date.now() + 5_000);
    const elsewhere = await t.action(api.auth.login, account);
    const other = await t.action(api.auth.register, { ...account, nickname: 'Camille' });

    const device = { p256dh: 'clef', auth: 'secret', userAgent: 'Firefox' };
    for (const [session, endpoint] of [
      [here, 'https://push.example/ici'],
      [elsewhere, 'https://push.example/ailleurs'],
      [other, 'https://push.example/camille'],
    ] as const) {
      await t.mutation(api.notifications.subscribe, { ...session, ...device, endpoint });
    }

    expect(
      await t.mutation(api.accounts.logoutOthers, {
        ...here,
        endpoint: 'https://push.example/ici',
      }),
    ).toEqual({ closed: 1 });

    expect(await t.query(api.accounts.me, here)).toEqual({ nickname: 'Pierre' });
    expect(await t.query(api.accounts.me, elsewhere)).toBeNull();
    expect(await t.query(api.accounts.me, other)).toEqual({ nickname: 'Camille' });
    expect((await t.query(api.notifications.devices, here)).map((kept) => kept.endpoint)).toEqual([
      'https://push.example/ici',
    ]);
    expect(await t.query(api.notifications.devices, other)).toHaveLength(1);
    await expect(t.mutation(api.accounts.logoutOthers, elsewhere)).rejects.toThrow(
      'UNKNOWN_SESSION',
    );
  });
});

describe('password recovery and login races', () => {
  afterEach(() => vi.useRealTimers());

  it('revokes every session and accepts only the replacement password', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t = boot();
    const first = await t.action(api.auth.register, {
      nickname: 'Pierre',
      password: 'ancien secret',
    });
    vi.setSystemTime(Date.now() + LOGIN_MIN_INTERVAL_MS);
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
    vi.setSystemTime(Date.now() + LOGIN_MIN_INTERVAL_MS);
    await expect(
      t.action(api.auth.login, { nickname: 'Pierre', password: 'ancien secret' }),
    ).rejects.toThrow('BAD_CREDENTIALS');
    vi.setSystemTime(Date.now() + LOGIN_MIN_INTERVAL_MS);
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
