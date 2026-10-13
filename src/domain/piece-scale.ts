export type PieceScale = { readonly troops: number; readonly buildings: number };

export const MIN_PIECE_SCALE = 50;
export const MAX_PIECE_SCALE = 150;
export const PIECE_SCALE_STEP = 5;
export const DEFAULT_PIECE_SCALE: PieceScale = { troops: 100, buildings: 100 };

/** A percentage kept on the step and inside the range; anything unreadable is the default. */
export function parsePercent(raw: unknown, fallback = 100): number {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const stepped = Math.round(value / PIECE_SCALE_STEP) * PIECE_SCALE_STEP;
  return Math.min(MAX_PIECE_SCALE, Math.max(MIN_PIECE_SCALE, stepped));
}

export function parsePieceScale(raw: unknown): PieceScale {
  const kept = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return { troops: parsePercent(kept.troops), buildings: parsePercent(kept.buildings) };
}
