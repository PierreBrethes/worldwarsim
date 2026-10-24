/**
 * **One size for every piece** (ADR 0035 §6), a percentage: troops and buildings are tied, a tank
 * must still fit its shed.
 */

/**
 * 100 % is the common scale; below 80 a squad falls under its pin at the closest zoom, above
 * 125 a barracks spans more than a hundred kilometres.
 * @a-mesurer recommandation du designer (POC de lisibilité, 23/10), Q3 ouverte à Pierre
 */
export const MIN_PIECE_SCALE = 80;
export const MAX_PIECE_SCALE = 125;

export const PIECE_SCALE_STEP = 5;
export const DEFAULT_PIECE_SCALE = 100;

/** A percentage kept on the step and inside the range; anything unreadable is the default. */
export function parsePercent(raw: unknown, fallback = DEFAULT_PIECE_SCALE): number {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const stepped = Math.round(value / PIECE_SCALE_STEP) * PIECE_SCALE_STEP;
  return Math.min(MAX_PIECE_SCALE, Math.max(MIN_PIECE_SCALE, stepped));
}

/** The kept percentage — or, kept before the one slider, the troops' of the former pair. */
export function parsePieceScale(raw: unknown): number {
  const former =
    typeof raw === 'object' && raw !== null ? (raw as { troops?: unknown }).troops : raw;
  return parsePercent(former);
}
