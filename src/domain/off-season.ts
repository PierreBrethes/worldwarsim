import type { PlayableRegion } from './ids';

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

export function playableRegion(playerCount: number): PlayableRegion {
  if (playerCount <= 3) return 'europe';
  if (playerCount <= 6) return 'europe-med';
  return 'world';
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function gameCode(random: () => number): string {
  return Array.from(
    { length: 6 },
    () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)],
  ).join('');
}
