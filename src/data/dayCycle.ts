import { useSyncExternalStore } from 'react';
import type { DayCycle } from '@/domain/daylight';
import { keepDayCycle, readDayCycle } from './settings';

let state: DayCycle | null = null;
const subscribers = new Set<() => void>();

const snapshot = (): DayCycle => (state ??= readDayCycle());

export const useDayCycle = (): DayCycle => useSyncExternalStore(subscribe, snapshot);

export function setDayCycle(cycle: DayCycle): void {
  state = cycle;
  keepDayCycle(cycle);
  for (const subscriber of subscribers) subscriber();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
