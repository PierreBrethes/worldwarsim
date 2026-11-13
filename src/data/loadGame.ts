import type { Atlas } from '@/domain/atlas';
import type { Foundation, Shore } from '@/map/engine/sea';
import { answerOf, loadAtlas, loadFarSheet, once } from './atlas';
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
  { state: 'active'; atlas: Atlas; ground: Foundation; seat: Seat } | { state: 'none' };

/** The coast's field and the sea's texels, calculated by a worker (`shore.worker.ts`). */
const loadShore = once(() =>
  answerOf<Shore>(
    () => new Worker(new URL('../map/engine/shore.worker.ts', import.meta.url), { type: 'module' }),
    'grid',
  ),
);

/** One object for the page, like `atlas`: a new one would rebuild the engine that depends on it. */
const loadGround = once(async (): Promise<Foundation> => {
  const [shore, far] = await Promise.all([loadShore(), loadFarSheet()]);
  return { ...shore, far };
});

export async function loadGame(): Promise<GameEntry> {
  const seat = readSeat();
  if (!seat || !convexClient) return { state: 'none' };
  /** La grille vient avec l'atlas : sans elle, la visée lirait toute la terre comme de la mer. La
   *  feuille « loin » aussi : l'écran ne montre jamais la carte sans ses pays. */
  const [atlas, ground] = await Promise.all([loadAtlas(), loadGround()]);
  return { state: 'active', atlas, ground, seat };
}
