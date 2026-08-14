import type { PlayableRegion } from './ids';

export type { PlayableRegion };

export function playableRegion(playerCount: number): PlayableRegion {
  if (playerCount <= 3) return 'europe';
  if (playerCount <= 6) return 'europe-med';
  return 'world';
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function gameCode(random: () => number): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('');
}

export function accruedStock(
  { stock, ratePerHour, updatedAt }: { stock: number; ratePerHour: number; updatedAt: number },
  now: number,
  cap?: number,
): number {
  const hours = Math.max(0, now - updatedAt) / 3_600_000;
  const raw = stock + ratePerHour * hours;
  return cap === undefined ? raw : Math.min(cap, raw);
}
