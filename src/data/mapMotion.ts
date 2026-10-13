import { useSyncExternalStore } from 'react';
import { type MapMotion, type MapMotionSetting, resolveMapMotion } from '@/domain/map-motion';
import { keepMapMotion, readMapMotion } from './settings';

let state: MapMotionSetting | null = null;
const subscribers = new Set<() => void>();

const snapshot = (): MapMotionSetting => (state ??= readMapMotion());

export const useMapMotionSetting = (): MapMotionSetting =>
  useSyncExternalStore(subscribe, snapshot);

export function setMapMotionSetting(setting: MapMotionSetting): void {
  state = setting;
  keepMapMotion(setting);
  for (const subscriber of subscribers) subscriber();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeSystem(listener: () => void): () => void {
  const query = matchMedia(REDUCED_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(subscribeSystem, () => matchMedia(REDUCED_QUERY).matches);

export function useMapMotion(): MapMotion {
  return resolveMapMotion(useMapMotionSetting(), usePrefersReducedMotion());
}
