import { samePoint } from './geo';
import { isAlarm } from './journal';
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

/** **Une liasse** : des dépêches voisines que le journal replie en une ligne, la plus récente en
 *  tête. Une dépêche seule est une liasse d'une ligne. */
export type JournalBundle = { readonly lines: ReadonlyArray<JournalLine> };

/** Ce qui garde sa ligne : une alarme, un combat, un Sept, une Guerre éclair restée sur place, une
 *  heure à venir (« au réveil ») et une édition. */
const standsAlone = ({ dispatch }: JournalLine): boolean =>
  isAlarm(dispatch.kind) ||
  dispatch.kind === 'edition' ||
  dispatch.combat !== null ||
  dispatch.point !== undefined ||
  dispatch.stood !== undefined ||
  dispatch.resolutionAt !== null ||
  dispatch.remaining !== null;

const MINUTE_MS = 60_000;

const sameBundle = (older: JournalLine, newer: JournalLine): boolean => {
  const a = older.dispatch;
  const b = newer.dispatch;
  return (
    !standsAlone(older) &&
    !standsAlone(newer) &&
    a.kind === b.kind &&
    ((a.place !== null &&
      b.place !== null &&
      samePoint([a.place.lon, a.place.lat], [b.place.lon, b.place.lat])) ||
      Math.floor(a.at / MINUTE_MS) === Math.floor(b.at / MINUTE_MS))
  );
};

/**
 * **Les dépêches répétées se replient en liasses, l'ordre du serveur intact** : seules des voisines
 * de même sorte, au même lieu (`place` connu des deux) ou à la même minute (`at`, jamais `t`), se
 * rejoignent, et une liasse ne réordonne rien. Le filtre du journal s'applique ensuite aux liasses.
 */
export function groupJournal(lines: ReadonlyArray<JournalLine>): JournalBundle[] {
  const bundles: JournalLine[][] = [];
  for (const line of lines) {
    const last = bundles.at(-1);
    if (last !== undefined && sameBundle(last[last.length - 1], line)) last.push(line);
    else bundles.push([line]);
  }
  return bundles.map((bundle) => ({ lines: bundle }));
}
