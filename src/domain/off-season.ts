import type { PlayableRegion } from './ids';
import type { SeasonMode } from './season-mode';

export type { PlayableRegion };

/** Provisional V1 value; @a-mesurer before treating it as a campaign balance rule. */
export const REGISTRATION_WINDOW_HOURS = 2;
const REGISTRATION_WINDOW_MS = REGISTRATION_WINDOW_HOURS * 3_600_000;

export type SeasonStatus = 'lobby' | 'launched' | 'concluded';

export function registrationDeadline(launchedAt: number | null): number | null {
  return launchedAt === null ? null : launchedAt + REGISTRATION_WINDOW_MS;
}

export function canJoinRegistration(
  status: SeasonStatus,
  launchedAt: number | null,
  now: number,
): boolean {
  if (status === 'concluded') return false;
  if (status === 'lobby') return true;
  const deadline = registrationDeadline(launchedAt);
  return deadline !== null && now < deadline;
}

/**
 * **Ce qui peut empêcher d'entrer, dans l'ordre où le serveur le dit** (ADR 0015) : `join` le
 * refuse et l'invitation l'annonce par la même fonction, sans quoi l'écran promettrait une porte
 * que le serveur ferme.
 *
 * La place d'abord, **avant tout autre refus** : celui qui l'a déjà la garde, et lui dire que les
 * inscriptions sont closes l'enverrait la chercher ailleurs qu'à l'accueil, où elle est. La
 * nation avant le plafond de places : à huit nations pour huit places les deux se déclenchent
 * ensemble, et « plus de nation » est celui qui nomme le vrai obstacle d'un arrivant tardif.
 */
export type JoinRefusal =
  | 'SEAT_TAKEN'
  | 'SEASON_CONCLUDED'
  | 'REGISTRATION_CLOSED'
  | 'NO_FREE_NATION'
  | 'LOBBY_FULL'
  | 'BLITZ_FULL';

export function joinRefusalOf(input: {
  readonly seated: boolean;
  readonly status: SeasonStatus;
  readonly launchedAt: number | null;
  readonly now: number;
  readonly seats: number;
  readonly freeNations: number;
  readonly maximum: number;
  readonly mode?: SeasonMode;
}): JoinRefusal | null {
  if (input.seated) return 'SEAT_TAKEN';
  if (input.status === 'concluded') return 'SEASON_CONCLUDED';
  if (!canJoinRegistration(input.status, input.launchedAt, input.now)) return 'REGISTRATION_CLOSED';
  if (input.status === 'launched' && input.freeNations === 0) return 'NO_FREE_NATION';
  if (input.seats >= input.maximum) return input.mode === 'blitz' ? 'BLITZ_FULL' : 'LOBBY_FULL';
  return null;
}

/** Un code saisi à la main ou lu dans une adresse : rogné, en capitales, et `null` s'il ne peut
 *  pas être un code — un caractère que l'alphabet ne tire jamais, ou la mauvaise longueur —, ce
 *  qui épargne une requête dont la réponse est connue d'avance. */
export function normalizeGameCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  const valid =
    code.length === CODE_LENGTH && [...code].every((letter) => CODE_ALPHABET.includes(letter));
  return valid ? code : null;
}

/** Le lien qui ouvre la saison à un invité : l'origine d'où le joueur la lit, jamais une adresse
 *  écrite ici. */
export const invitationUrl = (origin: string, code: string): string =>
  `${origin}/rejoindre/${code}`;

/** Où une place ouvre : le salon tant que le joueur n'est pas en guerre (saison en inscription,
 *  ou arrivant qui n'a pas choisi son drapeau), le plateau sinon. */
export const destinationOf = (seat: {
  readonly status: SeasonStatus;
  readonly atWar: boolean;
}): 'salon' | 'plateau' => (seat.status === 'lobby' || !seat.atWar ? 'salon' : 'plateau');

export function playableRegion(playerCount: number): PlayableRegion {
  if (playerCount <= 3) return 'europe';
  if (playerCount <= 6) return 'europe-med';
  return 'world';
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function gameCode(random: () => number): string {
  return Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)],
  ).join('');
}
