import { asLocalTime } from './duration';
import type { PlayerView, SeasonVerdict } from './player-view';

/** Ce que la fin d'une partie doit savoir de moi : qui je suis, et l'heure où mon QG est tombé. */
export type EndingFacts = {
  readonly nation: string;
  readonly eliminatedAt: string | null;
};

export type Outcome = 'winner' | 'loser' | 'out' | 'draw';

/**
 * **Comment une partie finit pour moi**, dans les deux modes : l'édition finale quand la saison
 * est conclue, la même page quand mon QG est tombé en cours de partie (B10, M17) — jamais pour
 * une capitulation, qui n'écrit pas d'heure de chute. `key` nomme la fin, `null` tant que rien
 * n'est fini.
 */
export function endingOf(view: PlayerView): { key: 'final' | 'out' | null; facts: EndingFacts } {
  const { me } = view;
  const concluded = view.press?.final === true;
  const out = me.eliminatedAt !== null;
  return {
    key: concluded ? 'final' : out ? 'out' : null,
    facts: {
      nation: me.nation,
      eliminatedAt: !concluded && out ? asLocalTime(me.eliminatedAt!) : null,
    },
  };
}

/** L'issue d'un joueur à la conclusion : le vainqueur, l'égalité, le tombé, le vaincu. */
export const outcomeOf = (
  line: { readonly nation: string | null; readonly defeated: boolean },
  verdict: SeasonVerdict | null,
): Outcome =>
  verdict?.winnerNation === null && verdict !== null
    ? 'draw'
    : line.nation !== null && line.nation === verdict?.winnerNation
      ? 'winner'
      : line.defeated
        ? 'out'
        : 'loser';
