'use node';

import { v } from 'convex/values';
import { action, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import {
  nicknameKey,
  nicknameRefusal,
  normalizeNickname,
  passwordRefusal,
  REGISTER_MIN_INTERVAL_MS,
} from '../src/domain/account';
import { fail } from './errors';
import { hashPassword, verifyPassword } from './passwords';

function sessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString('base64url');
}

function validateRegistration(nickname: string, password: string): void {
  const nicknameError = nicknameRefusal(nickname);
  if (nicknameError) fail(nicknameError);
  const passwordError = passwordRefusal(password);
  if (passwordError) fail(passwordError);
}

export const register = action({
  args: { nickname: v.string(), password: v.string() },
  handler: async (ctx, { nickname, password }) => {
    validateRegistration(nickname, password);
    if (
      !(await ctx.runMutation(internal.accounts.claimRegistrationSlot, {
        intervalMs: REGISTER_MIN_INTERVAL_MS,
      }))
    ) {
      fail('REGISTER_TOO_FAST');
    }
    const digest = await hashPassword(password);
    const token = sessionToken();
    await ctx.runMutation(internal.accounts.register, {
      nickname: normalizeNickname(nickname),
      nicknameKey: nicknameKey(nickname),
      ...digest,
      token,
    });
    return { token };
  },
});

export const login = action({
  args: { nickname: v.string(), password: v.string() },
  handler: async (ctx, { nickname, password }) => {
    if (nicknameRefusal(nickname) || passwordRefusal(password)) fail('BAD_CREDENTIALS');

    const snapshot = await ctx.runQuery(internal.accounts.passwordDigest, {
      nicknameKey: nicknameKey(nickname),
    });
    /** A nickname nobody holds costs no derivation: nicknames are public, so refusing at once
     *  gives away nothing, and invented ones cannot be turned into CPU. */
    if (!snapshot) fail('BAD_CREDENTIALS');
    if (
      !(await ctx.runMutation(internal.accounts.claimLoginAttempt, {
        accountId: snapshot.accountId,
      }))
    ) {
      fail('LOGIN_TOO_FAST');
    }
    if (!(await verifyPassword(password, snapshot))) fail('BAD_CREDENTIALS');

    const token = sessionToken();
    await ctx.runMutation(internal.accounts.createSession, { ...snapshot, token });
    return { token };
  },
});

export const resetPassword = internalAction({
  args: { nickname: v.string(), password: v.string() },
  handler: async (ctx, { nickname, password }) => {
    validateRegistration(nickname, password);
    const digest = await hashPassword(password);
    await ctx.runMutation(internal.accounts.resetPassword, {
      nicknameKey: nicknameKey(nickname),
      ...digest,
    });
  },
});
