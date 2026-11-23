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
export type JournalBundle = {
  readonly head: JournalLine;
  /** De la plus récente à la plus ancienne, `head` comprise. */
  readonly lines: ReadonlyArray<JournalLine>;
  readonly oldest: JournalLine;
};

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

const sameBundle = (head: JournalLine, line: JournalLine): boolean => {
  const a = head.dispatch;
  const b = line.dispatch;
  return (
    !standsAlone(head) &&
    !standsAlone(line) &&
    a.kind === b.kind &&
    ((a.place !== null &&
      b.place !== null &&
      samePoint([a.place.lon, a.place.lat], [b.place.lon, b.place.lat])) ||
      Math.floor(a.at / MINUTE_MS) === Math.floor(b.at / MINUTE_MS))
  );
};

/**
 * **Les dépêches répétées se replient en liasses, l'ordre du serveur intact** : seules des voisines
 * de même sorte que la tête de la liasse (sa plus récente), au même lieu (`place` connu des deux) ou à la
 * même minute (`at`, jamais `t`), la rejoignent, et une liasse ne réordonne rien. Le filtre du journal s'applique ensuite aux liasses.
 */
export function groupJournal(lines: ReadonlyArray<JournalLine>): JournalBundle[] {
  const bundles: Array<{ head: JournalLine; lines: JournalLine[]; oldest: JournalLine }> = [];
  for (const line of lines) {
    const last = bundles.at(-1);
    if (last !== undefined && sameBundle(last.head, line)) {
      last.lines.push(line);
      last.oldest = line;
    } else bundles.push({ head: line, lines: [line], oldest: line });
  }
  return bundles;
}

/** Le filtre s'applique aux lignes de chaque liasse : celles qu'il écarte la quittent, une liasse
 *  vidée disparaît, une liasse réduite à une ligne s'affiche comme une dépêche seule. */
export function retainBundles(
  bundles: ReadonlyArray<JournalBundle>,
  filter: JournalFilter,
): JournalBundle[] {
  return bundles.flatMap((bundle): JournalBundle[] => {
    const lines = bundle.lines.filter((line) => passesFilter(line.dispatch, filter));
    const head = lines[0];
    const oldest = lines.at(-1);
    return head === undefined || oldest === undefined ? [] : [{ head, lines, oldest }];
  });
}
