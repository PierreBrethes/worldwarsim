import type { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import { playerViewOf, type ServerView } from '@/domain/server-view';

import type { PlayerView } from '@/domain/player-view';
import { shareUnchanged } from './shareUnchanged';

/** What the aiming card reads. `null` is an unreachable target, never an error. */
export type MovementPreviewed = FunctionReturnType<typeof api.movements.preview>;
/** **Le cap neuf d'une flotte reprise en mer** (#449), mesuré comme un départ. */
export type CoursePreviewed = FunctionReturnType<typeof api.movements.previewCourse>;
export type PlunderPreviewed = FunctionReturnType<typeof api.movements.previewPlunder>;
export type StrikePreviewed = FunctionReturnType<typeof api.movements.previewStrike>;
export type CapturePreviewed = FunctionReturnType<typeof api.movements.previewCapture>;
export type LootCollectionPreviewed = FunctionReturnType<
  typeof api.movements.previewLootCollection
>;

/**
 * `previous` est la vue rendue juste avant : chaque sous-arbre resté égal en garde l'identité
 * (`shareUnchanged`), pour que les panneaux ne recalculent que ce que la réponse a changé (#148).
 */
export function adaptServerView(
  server: ServerView,
  previous: PlayerView | null = null,
): PlayerView {
  return shareUnchanged(previous, playerViewOf(server));
}
