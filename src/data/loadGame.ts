import { loadWorld, type World } from '@/domain/world';
import { convexClient } from './convexClient';
import { readToken } from './token';

/**
 * What the board needs before it can subscribe: the geometry, and the token that identifies
 * the player. The view itself is **not** loaded here — it arrives through the live query and
 * nowhere else. Fetching it twice, once over HTTP for the first frame and once over the
 * subscription, cost a second round trip to serve a value that was replaced immediately.
 */
export type GameEntry = { state: 'active'; world: World; token: string } | { state: 'none' };

let worldInFlight: Promise<World> | null = null;

export async function loadGame(): Promise<GameEntry> {
  const token = readToken();
  if (!token || !convexClient) return { state: 'none' };

  // The world is a static asset, identical for every season: fetched once for the lifetime
  // of the tab, and shared by every visit to the board.
  worldInFlight ??= loadWorld();
  return { state: 'active', world: await worldInFlight, token };
}
