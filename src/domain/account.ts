export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;
export const PASSWORD_MIN_BYTES = 8;
export const PASSWORD_MAX_BYTES = 72;
/** Ce qui sépare deux tentatives de connexion sur un même pseudo. Pas un verrouillage : les
 *  pseudos sont publics, et un compte qu'un adversaire pourrait fermer en se trompant exprès
 *  serait une arme. Trois secondes ramènent une recherche de mot de passe à vingt essais par
 *  minute, et ne coûtent rien à celui qui s'est trompé d'une lettre. */
export const LOGIN_MIN_INTERVAL_MS = 3_000;
/** Ce qui sépare deux inscriptions, tous pseudos confondus : chacune dérive un PBKDF2 de 600 000
 *  itérations dans le pool d'actions du backend, qu'un script saturerait en quelques dizaines
 *  d'appels. Quatre par seconde au plus. */
export const REGISTER_MIN_INTERVAL_MS = 250;

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
