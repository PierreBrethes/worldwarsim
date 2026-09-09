export const PBKDF2_ITERATIONS = 600_000;

export type PasswordDigest = Readonly<{
  passwordHash: string;
  salt: string;
  iterations: number;
}>;

const SALT_BYTES = 16;
const HASH_BYTES = 32;
const MAX_PBKDF2_ITERATIONS = 0xffff_ffff;
const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;

  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return encodeBase64Url(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

function validIterations(iterations: number): boolean {
  return Number.isInteger(iterations) && iterations > 0 && iterations <= MAX_PBKDF2_ITERATIONS;
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<PasswordDigest> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const passwordHash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);

  return {
    passwordHash: encodeBase64Url(passwordHash),
    salt: encodeBase64Url(salt),
    iterations: PBKDF2_ITERATIONS,
  };
}

export async function verifyPassword(password: string, digest: PasswordDigest): Promise<boolean> {
  if (!validIterations(digest.iterations)) return false;

  const salt = decodeBase64Url(digest.salt);
  const expected = decodeBase64Url(digest.passwordHash);
  if (salt?.byteLength !== SALT_BYTES || expected?.byteLength !== HASH_BYTES) return false;

  const actual = await derivePasswordHash(password, salt, digest.iterations);
  let difference = 0;
  for (let index = 0; index < HASH_BYTES; index += 1) {
    difference |= actual[index]! ^ expected[index]!;
  }
  return difference === 0;
}
