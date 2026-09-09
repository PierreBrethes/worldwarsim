import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { hashPassword, type PasswordDigest, verifyPassword } from './passwords';

const INDEPENDENT_FIXTURE: PasswordDigest = {
  passwordHash: 'c5W63fdFp3ru_9WRg5-8nM-Lxde5VlWBAoU0UIxP7ow',
  salt: 'AAECAwQFBgcICQoLDA0ODw',
  iterations: 123_456,
};

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

describe('password hashing', () => {
  let digest: PasswordDigest;

  beforeAll(async () => {
    digest = await hashPassword('fixture-password');
  });

  afterEach(() => vi.restoreAllMocks());

  it('uses the current work factor and expected byte lengths', () => {
    expect(digest.iterations).toBe(600_000);
    expect(decodeBase64Url(digest.salt)).toHaveLength(16);
    expect(decodeBase64Url(digest.passwordHash)).toHaveLength(32);
    expect(digest.salt).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(digest.passwordHash).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates independent salts and hashes for the same password', async () => {
    const second = await hashPassword('fixture-password');

    expect(second.salt).not.toBe(digest.salt);
    expect(second.passwordHash).not.toBe(digest.passwordHash);
  });

  it('accepts the matching password and rejects another one', async () => {
    await expect(verifyPassword('fixture-password', digest)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', digest)).resolves.toBe(false);
  });

  it('keeps leading and trailing spaces significant', async () => {
    const spaced = await hashPassword(' fixture-password ');

    await expect(verifyPassword(' fixture-password ', spaced)).resolves.toBe(true);
    await expect(verifyPassword('fixture-password ', spaced)).resolves.toBe(false);
    await expect(verifyPassword(' fixture-password', spaced)).resolves.toBe(false);
  });

  it('verifies a PBKDF2 fixture produced by an independent primitive', async () => {
    await expect(verifyPassword('fixture-password', INDEPENDENT_FIXTURE)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', INDEPENDENT_FIXTURE)).resolves.toBe(false);
  });

  it('rejects malformed base64url and decoded lengths', async () => {
    await expect(
      verifyPassword('fixture-password', { ...INDEPENDENT_FIXTURE, salt: 'not+base64url' }),
    ).resolves.toBe(false);
    await expect(
      verifyPassword('fixture-password', {
        ...INDEPENDENT_FIXTURE,
        passwordHash: `${INDEPENDENT_FIXTURE.passwordHash}=`,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyPassword('fixture-password', { ...INDEPENDENT_FIXTURE, salt: 'AA' }),
    ).resolves.toBe(false);
    await expect(
      verifyPassword('fixture-password', { ...INDEPENDENT_FIXTURE, passwordHash: 'AA' }),
    ).resolves.toBe(false);
  });

  it('rejects an invalid stored work factor', async () => {
    await expect(
      verifyPassword('fixture-password', { ...INDEPENDENT_FIXTURE, iterations: 0 }),
    ).resolves.toBe(false);
    await expect(
      verifyPassword('fixture-password', { ...INDEPENDENT_FIXTURE, iterations: 1.5 }),
    ).resolves.toBe(false);
    await expect(
      verifyPassword('fixture-password', {
        ...INDEPENDENT_FIXTURE,
        iterations: 0x1_0000_0000,
      }),
    ).resolves.toBe(false);
  });

  it('propagates a Web Crypto failure', async () => {
    const failure = new Error('Web Crypto unavailable');
    vi.spyOn(crypto.subtle, 'deriveBits').mockRejectedValueOnce(failure);

    await expect(verifyPassword('fixture-password', INDEPENDENT_FIXTURE)).rejects.toBe(failure);
  });
});
