import { useSyncExternalStore } from 'react';
import { keepPieceScale, readPieceScale } from './settings';

let state: number | null = null;
const subscribers = new Set<() => void>();

const snapshot = (): number => (state ??= readPieceScale());

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export const usePieceScale = (): number => useSyncExternalStore(subscribe, snapshot);

export function setPieceScale(scale: number): void {
  state = scale;
  keepPieceScale(scale);
  for (const subscriber of subscribers) subscriber();
}
