import type { PlayableRegion } from './ids';

export type { PlayableRegion };

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
