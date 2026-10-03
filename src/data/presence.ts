import { useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PRESENCE_THROTTLE_MIN } from '../../convex/constants';
import type { Seat } from './session';

const PRESENT_BEAT_MS = 60_000;

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
  const beatPresent = useMutation(api.notifications.present);
  /**
   * **À la minute, et seulement onglet visible** : c'est ce battement-là qui dit au serveur que
   * l'écran montre déjà les alarmes, donc qu'une notification serait un doublon
   * (`src/domain/push.ts`, `IN_PLAY_WINDOW_MS`). Il écrit dans sa propre table, jamais dans la
   * place du joueur, et se tait de même.
   */
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === 'visible') void beatPresent(seat).catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, PRESENT_BEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [beatPresent, seat]);
  useEffect(() => {
    const beat = () => void touch(seat).catch(() => undefined);
    beat();
    const timer = window.setInterval(beat, PRESENCE_THROTTLE_MIN * 60_000);
    return () => window.clearInterval(timer);
  }, [touch, seat]);
}
