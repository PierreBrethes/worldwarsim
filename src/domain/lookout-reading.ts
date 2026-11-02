/**
 * **Ce qu'un Guet écrit de la pile qu'il relève** (ADR 0037 §5), sur la ligne de l'observateur.
 * La ligne garde ses fenêtres de lecture en cours et à venir, une par passage dans le cercle d'un
 * Guet (`passesAlong`), fondues quand elles se chevauchent. La pile ne s'écrit que dans une
 * fenêtre ouverte **à l'instant** ; hors d'elles, elle se fige et porte la date de sa dernière
 * lecture (`readAt`), que l'étiquette écrit. Un réveil à chaque borne la lit, puis la fige
 * (`readingTransition`).
 */
import type { UnitRole } from './ids';

export type ReadWindow = { readonly from: number; readonly to: number };

export type Reading = {
  /** Les fenêtres de Guet en cours et à venir, dans l'ordre, sur la ligne d'une colonne. */
  readonly reads?: ReadonlyArray<ReadWindow>;
  /** La pile lue, un rôle par troupe ; absente, aucun Guet ne l'a lue. */
  readonly stack?: ReadonlyArray<UnitRole>;
  /** Figée : l'instant de sa dernière lecture. Absente sous un Guet qui lit. */
  readonly readAt?: number;
};

/** Les fenêtres dans l'ordre, fondues quand elles se chevauchent. */
export function mergeWindows(windows: ReadonlyArray<ReadWindow>): ReadonlyArray<ReadWindow> {
  const merged: Array<{ from: number; to: number }> = [];
  for (const window of [...windows].sort((a, b) => a.from - b.from)) {
    const last = merged[merged.length - 1];
    if (last !== undefined && window.from <= last.to) last.to = Math.max(last.to, window.to);
    else merged.push({ from: window.from, to: window.to });
  }
  return merged;
}

/** La fenêtre ouverte à l'instant : sa fin n'en est plus, c'est l'heure où la pile se fige. */
const openAt = (windows: ReadonlyArray<ReadWindow> | undefined, now: number) =>
  windows?.find((window) => window.from <= now && now < window.to);

const live = (reading: Reading): boolean =>
  reading.stack !== undefined && reading.readAt === undefined;

/** La pile figée à l'instant où plus rien ne la lit : au plus tard, à la fin de la fenêtre où
 *  elle a été lue. */
export function lostReading(row: Reading, now: number): Reading {
  if (!live(row)) return row;
  const ends = (row.reads ?? []).flatMap((window) => (window.from <= now ? [window.to] : []));
  return { ...row, readAt: Math.min(now, ...ends) };
}

/**
 * **La ligne d'une colonne, relue** : `windows` sont les fenêtres de Guet que la route promet
 * encore. Une lecture qui court garde son ouverture : la relire à chaque événement réécrirait la
 * ligne, et réveillerait le plateau de l'observateur pour rien.
 */
export function columnReading(
  row: Reading,
  windows: ReadonlyArray<ReadWindow>,
  roles: ReadonlyArray<UnitRole>,
  now: number,
): Reading {
  const was = live(row) ? openAt(row.reads, now) : undefined;
  const reads = mergeWindows(windows)
    .filter((window) => window.to > now)
    .map((window) =>
      was !== undefined && window.from <= now && now < window.to
        ? { from: Math.min(was.from, window.from), to: window.to }
        : window,
    );
  const kept = reads.length === 0 ? {} : { reads };
  if (openAt(reads, now) !== undefined) return { ...kept, stack: [...roles] };
  const lost = lostReading(row, now);
  return lost.stack === undefined ? kept : { ...kept, stack: lost.stack, readAt: lost.readAt! };
}

/** **L'instant où la lecture change d'elle-même** : la prochaine borne de ses fenêtres. */
export function readingTransition(reading: Reading, now: number): number | null {
  const bounds = (reading.reads ?? []).flatMap((window) =>
    [window.from, window.to].filter((bound) => bound > now),
  );
  return bounds.length === 0 ? null : Math.min(...bounds);
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
