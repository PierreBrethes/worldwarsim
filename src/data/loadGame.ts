import { loadWorld, type World } from '@/domain/world';
import type { PlayerView } from '@/domain/player-view';
import { convexHttpClient } from './convexClient';
import { loadPlayerView } from './serverView';
import { readToken } from './token';

export type GameState =
  | { state: 'active'; world: World; view: PlayerView; token: string }
  | { state: 'none' };

let worldInFlight: Promise<World> | null = null;

export async function loadGame(): Promise<GameState> {
  const token = readToken();
  if (!token || !convexHttpClient()) return { state: 'none' };

  worldInFlight ??= loadWorld();
  const world = await worldInFlight;
  return { state: 'active', world, view: await loadPlayerView(world, token), token };
}
