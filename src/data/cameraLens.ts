import { useSyncExternalStore } from 'react';
import type { CameraLens } from '@/domain/camera-lens';
import { keepCameraLens, readCameraLens } from './settings';

let state: CameraLens | null = null;
const subscribers = new Set<() => void>();

const snapshot = (): CameraLens => (state ??= readCameraLens());

export const useCameraLens = (): CameraLens => useSyncExternalStore(subscribe, snapshot);

export function setCameraLens(lens: CameraLens): void {
  state = lens;
  keepCameraLens(lens);
  for (const subscriber of subscribers) subscriber();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
