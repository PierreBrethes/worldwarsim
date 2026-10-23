/**
 * **One size for every piece** (ADR 0035 §6): troops and buildings are tied, a tank must still
 * fit its shed. The setting keeps its two fields, written alike — the same record as before.
 */
export type PieceScale = { readonly troops: number; readonly buildings: number };

/**
 * 100 % is the common scale; below 80 a squad falls under its pin at the closest zoom, above
 * 125 a barracks spans more than a hundred kilometres.
 * @a-mesurer plage du POC de lisibilité (23/10), à reprendre sur une partie jouée (Q3)
 */
export const MIN_PIECE_SCALE = 80;
export const MAX_PIECE_SCALE = 125;

export const PIECE_SCALE_STEP = 5;
export const DEFAULT_PIECE_SCALE: PieceScale = { troops: 100, buildings: 100 };

/** A percentage kept on the step and inside the range; anything unreadable is the default. */
export function parsePercent(raw: unknown, fallback = 100): number {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const stepped = Math.round(value / PIECE_SCALE_STEP) * PIECE_SCALE_STEP;
  return Math.min(MAX_PIECE_SCALE, Math.max(MIN_PIECE_SCALE, stepped));
}

/** The one slider, read from the troops' field: a size kept apart for the buildings is dropped. */
export function parsePieceScale(raw: unknown): PieceScale {
  const kept = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return pieceScaleOf(parsePercent(kept.troops));
}

export const pieceScaleOf = (percent: number): PieceScale => ({
  troops: percent,
  buildings: percent,
});
