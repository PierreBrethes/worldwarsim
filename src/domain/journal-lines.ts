import type { DispatchSeverity, JournalDispatch } from './player-view';

export type JournalLine = {
  readonly dispatch: JournalDispatch;
  /** Les dépêches plus anciennes que cette ligne remplace — seulement les éditions, aujourd'hui. */
  readonly earlier: number;
};

/** Ce que les cases du journal retiennent : tout, le non lu, ou une gravité. */
export type JournalFilter = 'all' | 'unread' | DispatchSeverity;

export const passesFilter = (dispatch: JournalDispatch, filter: JournalFilter): boolean =>
  filter === 'all' || (filter === 'unread' ? dispatch.unread : dispatch.severity === filter);

/**
 * **Le journal se lit dans l'ordre où le serveur le sert, une ligne par dépêche.**
 *
 * **Seule la dernière édition de presse reste à la page.** Elles paraissent toutes les trois
 * heures et ne disent qu'un rang : dix lignes « vous êtes 1er » noyaient ce qui avait changé.
 * Les plus anciennes ne sont pas perdues, elles sont comptées — le classement se lit à la Presse.
 */
export function journalLines(dispatches: ReadonlyArray<JournalDispatch>): JournalLine[] {
  const editions = dispatches.filter((dispatch) => dispatch.kind === 'edition');
  const newestEdition = editions[0];
  return dispatches.flatMap((dispatch): JournalLine[] =>
    dispatch.kind !== 'edition'
      ? [{ dispatch, earlier: 0 }]
      : dispatch === newestEdition
        ? [{ dispatch, earlier: editions.length - 1 }]
        : [],
  );
}
