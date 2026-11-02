/**
 * **Ce qu'un Guet écrit de la pile qu'il relève** (ADR 0037 §5), sur la ligne de l'observateur.
 * La pile ne s'écrit que sous un Guet qui voit **à l'instant** ; hors de sa vue, elle se fige et
 * porte la date de sa dernière lecture (`readAt`), que l'étiquette écrit. Une lecture à venir ne
 * montre rien avant son ouverture : la ligne garde seulement sa fenêtre, et un réveil à ses deux
 * bornes la fait lire, puis figer (`readingTransition`).
 */
import type { UnitRole } from './ids';

export type ReadWindow = { readonly from: number; readonly to: number };

export type Reading = {
  /** La fenêtre de Guet en cours ou la prochaine, sur la ligne d'une colonne. */
  readonly readFrom?: number;
  readonly readTo?: number;
  /** La pile lue, un rôle par troupe ; absente, aucun Guet ne l'a lue. */
  readonly stack?: ReadonlyArray<UnitRole>;
  /** Figée : l'instant de sa dernière lecture. Absente sous un Guet qui lit. */
  readonly readAt?: number;
};

/** La première fenêtre de Guet, une fois fondues celles qui se chevauchent. */
export function firstReadWindow(windows: ReadonlyArray<ReadWindow>): ReadWindow | null {
  const sorted = [...windows].sort((a, b) => a.from - b.from);
  const [first, ...rest] = sorted;
  if (first === undefined) return null;
  let to = first.to;
  for (const window of rest) {
    if (window.from > to) break;
    to = Math.max(to, window.to);
  }
  return { from: first.from, to };
}

const live = (reading: Reading): boolean =>
  reading.stack !== undefined && reading.readAt === undefined;

/** La pile figée à l'instant où plus rien ne la lit : au plus tard, à la fin de sa fenêtre. */
export const lostReading = (row: Reading, now: number): Reading =>
  live(row) ? { ...row, readAt: Math.min(now, row.readTo ?? now) } : row;

/**
 * **La ligne d'une colonne, relue** : `window` est la fenêtre de Guet en cours ou à venir,
 * `null` si aucun Guet ne la promet plus.
 */
export function columnReading(
  row: Reading,
  window: ReadWindow | null,
  roles: ReadonlyArray<UnitRole>,
  now: number,
): Reading {
  const kept = lostReading(row, now);
  const frozen = kept.stack === undefined ? {} : { stack: kept.stack, readAt: kept.readAt! };
  if (window === null) return frozen;
  if (window.from > now) return { readFrom: window.from, readTo: window.to, ...frozen };
  /** Une lecture qui court garde son ouverture : la relire à chaque événement réécrirait la
   *  ligne, et réveillerait le plateau de l'observateur pour rien. */
  const readFrom = live(row) && row.readFrom !== undefined ? row.readFrom : window.from;
  return { readFrom, readTo: window.to, stack: [...roles] };
}

/** **L'instant où la lecture change d'elle-même** : l'ouverture de sa fenêtre, puis sa fin. */
export function readingTransition(reading: Reading, now: number): number | null {
  if (reading.readFrom !== undefined && reading.readFrom > now) return reading.readFrom;
  if (reading.readTo !== undefined && reading.readTo > now) return reading.readTo;
  return null;
}

/**
 * **La ligne d'un camp couvert à l'instant** : un camp n'a pas de lecture à venir. Sous un Guet,
 * la pile se lit ; sans lui, la dernière lue se fige — sauf sur une ligne fermée qui rouvre, qui
 * relève peut-être une autre force au même point.
 */
export function campReading(
  row: (Reading & { readonly until: number | null }) | undefined,
  reads: boolean,
  roles: ReadonlyArray<UnitRole>,
  now: number,
): Reading {
  if (reads) return { stack: [...roles] };
  if (row === undefined || row.until !== null || row.stack === undefined) return {};
  return { stack: row.stack, readAt: row.readAt ?? now };
}
