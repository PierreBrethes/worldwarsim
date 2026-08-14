import { useSyncExternalStore } from 'react';
import type { IndicatorCategory, IndicatorToggles } from '@/domain/indicators';
import { keepIndicatorToggles, readIndicatorToggles } from './settings';

/**
 * The screen-edge toggles have two distant readers — the rail that lights them, the map that
 * applies them — and no common ancestor that should carry them. A module store rather than a
 * context: the state lives where it is written, and the route has nothing to pass along.
 */
let state: IndicatorToggles | null = null;
const subscribers = new Set<() => void>();

const snapshot = (): IndicatorToggles => (state ??= readIndicatorToggles());

export const useIndicatorToggles = (): IndicatorToggles =>
  useSyncExternalStore(subscribe, snapshot);

export function toggleIndicator(category: IndicatorCategory): void {
  const current = snapshot();
  state = { ...current, [category]: !current[category] };
  keepIndicatorToggles(state);
  for (const subscriber of subscribers) subscriber();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
