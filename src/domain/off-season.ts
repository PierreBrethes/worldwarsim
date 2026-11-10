import type { PlayableRegion } from './ids';
import type { SeasonMode } from './season-mode';

export type { PlayableRegion };

export type SeasonStatus = 'lobby' | 'launched' | 'concluded';

/**
 * **Ce qui peut empêcher d'entrer, dans l'ordre où le serveur le dit** (ADR 0015) : `join` le
 * refuse et l'invitation l'annonce par la même fonction, sans quoi l'écran promettrait une porte
 * que le serveur ferme.
 *
 * La place d'abord, **avant tout autre refus** : celui qui l'a déjà la garde, et lui dire que les
 * inscriptions sont closes l'enverrait la chercher ailleurs qu'à l'accueil, où elle est. Puis la
 * saison close, puis le départ : **personne n'entre après le départ**, dans aucun mode (ADR 0027
 * §4) — la fenêtre de deux heures de la Mondiale est partie avec la saison à durée fixe.
 */
export type JoinRefusal =
  | 'SEAT_TAKEN'
  | 'SEASON_CONCLUDED'
  | 'REGISTRATION_CLOSED'
  | 'LOBBY_FULL'
  | 'BLITZ_FULL'
  | 'BLITZ_STARTED';

export function joinRefusalOf(input: {
  readonly seated: boolean;
  readonly status: SeasonStatus;
  readonly seats: number;
  readonly maximum: number;
  readonly mode?: SeasonMode;
}): JoinRefusal | null {
  if (input.seated) return 'SEAT_TAKEN';
  if (input.status === 'concluded') return 'SEASON_CONCLUDED';
  if (input.status === 'launched') {
    return input.mode === 'blitz' ? 'BLITZ_STARTED' : 'REGISTRATION_CLOSED';
  }
  if (input.seats >= input.maximum) return input.mode === 'blitz' ? 'BLITZ_FULL' : 'LOBBY_FULL';
  return null;
}

/** Un code saisi à la main ou lu dans une adresse : rogné, en capitales, et `null` s'il ne peut
 *  pas être un code — un caractère que l'alphabet ne tire jamais, ou la mauvaise longueur —, ce
 *  qui épargne une requête dont la réponse est connue d'avance. */
export function normalizeGameCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  const valid =
    code.length === GAME_CODE_LENGTH && [...code].every((letter) => CODE_ALPHABET.includes(letter));
  return valid ? code : null;
}

/** Un lien d'invitation collé (`invitationUrl`, ou son seul chemin) rend le code qui suit
 *  `/rejoindre/`, sans barre finale ni paramètres ; tout autre texte reste tel quel. */
const codeOfInput = (raw: string): string =>
  /\/rejoindre\/([^/?#\s]*)/i.exec(raw)?.[1] ?? raw;

/**
 * **Un code en cours de frappe** : ce qu'il en reste une fois rogné, la première lettre qu'aucun
 * code ne porte, et le code entier dès la sixième. La une ouvre l'invitation sur `code` sans
 * rien demander au serveur : il ne vaut que ce que `normalizeGameCode` accepterait.
 */
export function gameCodeEntry(raw: string): {
  readonly typed: string;
  readonly stray: string | null;
  readonly code: string | null;
} {
  const typed = codeOfInput(raw).replace(/\s/g, '').toUpperCase().slice(0, GAME_CODE_LENGTH);
  const stray = [...typed].find((letter) => !CODE_ALPHABET.includes(letter)) ?? null;
  return {
    typed,
    stray,
    code: typed.length === GAME_CODE_LENGTH ? normalizeGameCode(typed) : null,
  };
}

/** Le lien qui ouvre la saison à un invité : l'origine d'où le joueur la lit, jamais une adresse
 *  écrite ici. */
export const invitationUrl = (origin: string, code: string): string =>
  `${origin}/rejoindre/${code}`;

/** Où une place ouvre : le salon tant que la saison s'inscrit, le plateau ensuite. */
export const destinationOf = (seat: { readonly status: SeasonStatus }): 'salon' | 'plateau' =>
  seat.status === 'lobby' ? 'salon' : 'plateau';

export function playableRegion(playerCount: number): PlayableRegion {
  if (playerCount <= 3) return 'europe';
  if (playerCount <= 6) return 'europe-med';
  return 'world';
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const GAME_CODE_LENGTH = 6;

export function gameCode(random: () => number): string {
  return Array.from(
    { length: GAME_CODE_LENGTH },
    () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)],
  ).join('');
}
