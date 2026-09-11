import { loadWorld, type World } from '@/domain/world';
import { convexClient } from './convexClient';
import { readSeat, type Seat } from './session';

/**
 * What the board needs before it can subscribe: the geometry, and the seat — the session and
 * the season it opens (ADR 0022). The view itself is **not** loaded here — it arrives through
 * the live query and nowhere else. Fetching it twice, once over HTTP for the first frame and
 * once over the subscription, cost a second round trip to serve a value that was replaced
 * immediately.
 */
export type GameEntry = { state: 'active'; world: World; seat: Seat } | { state: 'none' };

let worldInFlight: Promise<World> | null = null;

export async function loadGame(): Promise<GameEntry> {
  const seat = readSeat();
  if (!seat || !convexClient) return { state: 'none' };

  // The world is a static asset, identical for every season: fetched once for the lifetime
  // of the tab, and shared by every visit to the board.
  worldInFlight ??= loadWorld();
  return { state: 'active', world: await worldInFlight, seat };
}
