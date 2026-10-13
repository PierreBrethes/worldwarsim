import { useSyncExternalStore } from 'react';
import type { PieceScale } from '@/domain/piece-scale';
import { keepPieceScale, readPieceScale } from './settings';

let state: PieceScale | null = null;
const subscribers = new Set<() => void>();

const snapshot = (): PieceScale => (state ??= readPieceScale());

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export const usePieceScale = (): PieceScale => useSyncExternalStore(subscribe, snapshot);

export function setPieceScale(scale: PieceScale): void {
  state = scale;
  keepPieceScale(scale);
  for (const subscriber of subscribers) subscriber();
}
