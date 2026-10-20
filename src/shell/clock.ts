import { useSyncExternalStore } from 'react';

/**
 * Une seule horloge par période : vingt composants qui battent à la seconde partagent un
 * intervalle, qui n'existe que tant que l'un d'eux l'écoute.
 */
type Beat = {
  now: number;
  /** Le même abonnement à chaque rendu : un neuf ferait réabonner React à chaque rendu, et le
   *  seul lecteur d'une période, désabonné un instant, relançait un battement qui le refaisait
   *  rendre — en boucle (#148). */
  subscribe: (listener: () => void) => () => void;
};
const beats = new Map<number, Beat>();

function beatOf(periodMs: number): Beat {
  let beat = beats.get(periodMs);
  if (!beat) {
    const listeners = new Set<() => void>();
    let timer: ReturnType<typeof setInterval> | null = null;
    const strike = () => {
      fresh.now = Date.now();
      listeners.forEach((notify) => notify());
    };
    const fresh: Beat = {
      now: Date.now(),
      subscribe: (listener) => {
        listeners.add(listener);
        if (timer === null) {
          timer = setInterval(strike, periodMs);
          // Après une pause l'heure gardée est vieille : un premier battement la rafraîchit, hors
          // du rendu (la changer à l'abonnement fait boucler React sous Suspense).
          setTimeout(strike, 0);
        }
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0 && timer !== null) {
            clearInterval(timer);
            timer = null;
          }
        };
      },
    };
    beat = fresh;
    beats.set(periodMs, beat);
  }
  return beat;
}

export function useClock(periodMs = 1000): number {
  const beat = beatOf(periodMs);
  return useSyncExternalStore(
    beat.subscribe,
    () => beat.now,
    () => Date.now(),
  );
}
