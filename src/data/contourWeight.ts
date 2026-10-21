import { useSyncExternalStore } from 'react';
import type { ContourWeight } from '@/domain/contours';
import { keepContourWeight, readContourWeight } from './settings';

let state: ContourWeight | null = null;
const subscribers = new Set<() => void>();

const snapshot = (): ContourWeight => (state ??= readContourWeight());

export const useContourWeight = (): ContourWeight => useSyncExternalStore(subscribe, snapshot);

export function setContourWeight(weight: ContourWeight): void {
  state = weight;
  keepContourWeight(weight);
  for (const subscriber of subscribers) subscriber();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
