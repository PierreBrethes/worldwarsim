import { DRAWN_SHARE } from '@/domain/piece-size';

/**
 * **The size every piece is drawn at**, as a factor on the common scale: the share all pieces are
 * drawn at (`DRAWN_SHARE`) times the player's one slider (ADR 0035 §6); and the window's CSS
 * pixels per board unit seen from one unit away: what a target keeps its least width on screen by
 * (`targetGrowth`).
 */
export const pieceScale = { size: DRAWN_SHARE, pxPerUnit: 1172 };

/** The factor at the player's `percent` (100: `DRAWN_SHARE`). */
export const drawnSizeAt = (percent: number): number => (DRAWN_SHARE * percent) / 100;
