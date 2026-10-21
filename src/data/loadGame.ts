import type { Atlas } from '@/domain/atlas';
import { PROJECTION } from '@/map/engine/frame';
import { loadShore, type Shore } from '@/map/engine/sea';
import { loadAtlas } from './atlas';
import { convexClient } from './convexClient';
import { readSeat, type Seat } from './session';

/**
 * What the board needs before it can subscribe: the geometry, and the seat — the session and
 * the season it opens (ADR 0022). The view itself is **not** loaded here — it arrives through
 * the live query and nowhere else. Fetching it twice, once over HTTP for the first frame and
 * once over the subscription, cost a second round trip to serve a value that was replaced
 * immediately.
 */
export type GameEntry =
  { state: 'active'; atlas: Atlas; shore: Shore; seat: Seat } | { state: 'none' };

export async function loadGame(): Promise<GameEntry> {
  const seat = readSeat();
  if (!seat || !convexClient) return { state: 'none' };
  /** La grille vient avec l'atlas : sans elle, la visée lirait toute la terre comme de la mer. */
  const [atlas, shore] = await Promise.all([loadAtlas(), loadShore(PROJECTION)]);
  return { state: 'active', atlas, shore, seat };
}
