import type { DispatchSeverity, JournalDispatch } from './player-view';

export type JournalLine = {
  readonly dispatch: JournalDispatch;
  /** Les dépêches plus anciennes que cette ligne remplace — seulement les éditions, aujourd'hui. */
  readonly earlier: number;
};

export type JournalSection = {
  readonly severity: DispatchSeverity;
  readonly lines: ReadonlyArray<JournalLine>;
};

const ORDER: ReadonlyArray<DispatchSeverity> = ['critical', 'notable', 'routine'];

/**
 * **Le journal se range par gravité, et une rubrique vide n'existe pas** : trois colonnes
 * gardées à largeur égale pour un « critique : 0 » repoussaient la lecture du reste.
 *
 * **Seule la dernière édition de presse reste à la page.** Elles paraissent toutes les trois
 * heures et ne disent qu'un rang : dix lignes « vous êtes 1er » noyaient ce qui avait changé.
 * Les plus anciennes ne sont pas perdues, elles sont comptées — le classement se lit à la Presse.
 */
export function journalSections(dispatches: ReadonlyArray<JournalDispatch>): JournalSection[] {
  const editions = dispatches.filter((dispatch) => dispatch.kind === 'edition');
  const newestEdition = editions[0];
  const lines = dispatches.flatMap((dispatch): JournalLine[] =>
    dispatch.kind !== 'edition'
      ? [{ dispatch, earlier: 0 }]
      : dispatch === newestEdition
        ? [{ dispatch, earlier: editions.length - 1 }]
        : [],
  );
  return ORDER.map((severity) => ({
    severity,
    lines: lines.filter((line) => line.dispatch.severity === severity),
  })).filter((section) => section.lines.length > 0);
}
