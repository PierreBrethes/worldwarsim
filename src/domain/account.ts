export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;
export const PASSWORD_MIN_BYTES = 8;
export const PASSWORD_MAX_BYTES = 72;

export function normalizeNickname(nickname: string): string {
  return nickname.trim().normalize('NFC');
}

export function nicknameKey(nickname: string): string {
  return normalizeNickname(nickname).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function nicknameRefusal(nickname: string): 'NICKNAME_INVALID' | null {
  if (/[\p{Cc}\p{Cf}]/u.test(nickname)) return 'NICKNAME_INVALID';

  const normalized = normalizeNickname(nickname);
  const length = Array.from(normalized).length;
  return length < NICKNAME_MIN || length > NICKNAME_MAX || nicknameKey(normalized).length === 0
    ? 'NICKNAME_INVALID'
    : null;
}

export function passwordRefusal(
  password: string,
): 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' | null {
  const length = new TextEncoder().encode(password).byteLength;
  if (length < PASSWORD_MIN_BYTES) return 'PASSWORD_TOO_SHORT';
  if (length > PASSWORD_MAX_BYTES) return 'PASSWORD_TOO_LONG';
  return null;
}
