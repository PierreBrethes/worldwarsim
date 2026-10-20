import { useSyncExternalStore } from 'react';

/**
 * Une seule horloge par période : vingt composants qui battent à la seconde partagent un
 * intervalle, qui n'existe que tant que l'un d'eux l'écoute.
 */
type Beat = {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
};
const beats = new Map<number, Beat>();

function beatOf(periodMs: number): Beat {
  let beat = beats.get(periodMs);
  if (!beat) {
    beat = { now: Date.now(), listeners: new Set(), timer: null };
    beats.set(periodMs, beat);
  }
  return beat;
}

export function useClock(periodMs = 1000): number {
  const beat = beatOf(periodMs);
  return useSyncExternalStore(
    (listener) => {
      beat.listeners.add(listener);
      if (beat.timer === null) {
        const tick = () => {
          beat.now = Date.now();
          beat.listeners.forEach((notify) => notify());
        };
        beat.timer = setInterval(tick, periodMs);
        // Après une pause l'heure gardée est vieille : un premier battement la rafraîchit, hors
        // du rendu (la changer à l'abonnement fait boucler React sous Suspense).
        setTimeout(tick, 0);
      }
      return () => {
        beat.listeners.delete(listener);
        if (beat.listeners.size === 0 && beat.timer !== null) {
          clearInterval(beat.timer);
          beat.timer = null;
        }
      };
    },
    () => beat.now,
    () => Date.now(),
  );
}
