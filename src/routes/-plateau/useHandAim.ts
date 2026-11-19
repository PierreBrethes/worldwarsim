import { useCallback, useRef, useState } from 'react';
import type { CompassAction } from '@/domain/compass-rose';
import type { Hand } from '@/domain/hand';
import type { MapAim } from '@/map/WorldMap';

/**
 * **La visée du doigt, liée à la main qui l'a faite** (#586) : lever une autre pile, recomposer la
 * main ou la poser (`liftHand`, `compose`, `dropHand`) change la main, et la visée s'efface d'elle-
 * même — plus d'étiquette ni d'« Envoyer ». Une règle ici, et non un `setAim(null)` par appelant.
 */
export function useHandAim(hand: Hand) {
  const [raw, setRaw] = useState<{
    readonly target: MapAim;
    readonly chosen: number;
    readonly hand: Hand;
  } | null>(null);
  /** **Un seul « Envoyer » par visée** : le second toucher ne renvoie pas les mêmes troupes. */
  const sent = useRef(false);
  const aim = raw !== null && raw.hand === hand ? raw : null;
  const verb: CompassAction | null = aim?.target.verbs[aim.chosen] ?? null;

  const touch = useCallback(
    (target: MapAim) => {
      sent.current = false;
      setRaw({ target, chosen: 0, hand });
    },
    [hand],
  );
  const choose = useCallback((chosen: number) => {
    sent.current = false;
    setRaw((was) => (was === null ? null : { ...was, chosen }));
  }, []);
  const cancel = useCallback(() => setRaw(null), []);
  /** Donne l'ordre visé, sauf refus connu ou ordre déjà parti. */
  const send = useCallback(
    (refusal: string | null, act: (verb: CompassAction, at: MapAim['at']) => void) => {
      if (aim === null || verb === null || refusal !== null || sent.current) return;
      sent.current = true;
      act(verb, aim.target.at);
    },
    [aim, verb],
  );
  return { aim, verb, touch, choose, cancel, send };
}
