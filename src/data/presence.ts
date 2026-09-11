import { useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PRESENCE_THROTTLE_MIN } from '../../convex/constants';
import type { Seat } from './session';

/**
 * **Le plateau dit qu'on est là.** Une query ne peut pas écrire, donc la présence est une
 * mutation, et le seul moment où l'on sait qu'un joueur regarde sa partie est le montage du
 * plateau. Elle n'a qu'un lecteur : un fondateur qui ne revient plus perd l'exclusivité de la
 * clôture (`convex/seasons.ts`, `concludeRefusal`).
 *
 * **Un battement, pas un pouls** : la cadence est celle du seuil serveur, qui refuse de toute
 * façon une réécriture sous la borne — le client ne fait donc que s'aligner, il ne décide de
 * rien. Une session laissée ouverte une nuit continue de compter comme une présence : c'est
 * assumé, quarante-huit heures ne mesurent pas l'attention, elles mesurent l'abandon.
 *
 * **L'échec se tait.** Personne n'a demandé cet appel ; un refus au bandeau serait une erreur
 * sur un geste que le joueur n'a pas fait.
 */
export function usePresence(seat: Seat): void {
  const touch = useMutation(api.players.touch);
  useEffect(() => {
    const beat = () => void touch(seat).catch(() => undefined);
    beat();
    const timer = window.setInterval(beat, PRESENCE_THROTTLE_MIN * 60_000);
    return () => window.clearInterval(timer);
  }, [touch, seat]);
}
