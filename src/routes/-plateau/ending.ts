import { useEffect } from 'react';
import { nationLabel } from '@/i18n/fr';
import { asLocalTime } from '@/domain/duration';
import type { PlayerView } from '@/domain/player-view';
import type { EndingFacts } from './PressWindow';

/**
 * **Comment une Blitz finit pour moi** : l'édition finale quand la saison est conclue, la même
 * page quand mon QG est tombé en cours de partie. `key` nomme la fin, `null` tant que rien n'est fini.
 */
export function endingOf(view: PlayerView): { key: 'final' | 'out' | null; facts: EndingFacts } {
  const { me } = view;
  const concluded = view.mode === 'blitz' && view.press?.final === true;
  const out = view.mode === 'blitz' && me.defeated;
  const fallen = out
    ? view.journal.find(
        (dispatch) =>
          dispatch.kind === 'elimination' &&
          dispatch.text.startsWith(nationLabel(me.nation).toUpperCase()),
      )
    : undefined;
  return {
    key: concluded ? 'final' : out ? 'out' : null,
    facts: {
      nation: me.nation,
      eliminatedAt: !concluded && fallen !== undefined ? asLocalTime(fallen.at) : null,
    },
  };
}

/** Ouvre une seule fois par appareil : la clé retient que la page a déjà paru d'elle-même. */
export function useOpenedOnce(key: string | null, open: () => void): void {
  useEffect(() => {
    if (key === null) return;
    try {
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, '1');
    } catch {
      /* sans stockage, elle s'ouvre à chaque chargement : mieux que jamais */
    }
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
