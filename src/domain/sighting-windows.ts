/**
 * **Les fenêtres d'une ligne de relevé** (#412, ADR 0021 précisée le 03/11/2026). Une colonne vue
 * par deux guetteurs l'un après l'autre garde une ligne par observateur, mais pas leur enveloppe :
 * entre deux fenêtres qui ne se touchent pas, personne n'a rien vu, et la ligne n'en dit rien.
 *
 * Seule la dernière fenêtre ouverte se sert ; la précédente, close, est la dernière position
 * connue jusqu'à la réapparition. `from` et `to` de la ligne restent l'enveloppe — la première
 * ouverture, qui date la dépêche, et la fin de la dernière fenêtre —, jamais servie telle quelle.
 */
import { INTERCEPTION_SAMPLES } from './interception';

export type SightWindow = { readonly from: number; readonly to: number };

/** Toute lecture d'une ligne passe par ici : une ligne d'avant #412 n'a que son enveloppe. */
export const windowsOf = (row: {
  readonly from: number;
  readonly to: number;
  readonly windows?: ReadonlyArray<SightWindow> | undefined;
}): ReadonlyArray<SightWindow> => row.windows ?? [{ from: row.from, to: row.to }];

/** La fenêtre servie : la dernière ouverte, close ou non ; `null` avant la première. */
export function servedWindow(windows: ReadonlyArray<SightWindow>, now: number): SightWindow | null {
  return windows.filter((window) => window.from <= now).at(-1) ?? null;
}

/** La fenêtre qui voit la colonne à l'instant, ou `null` dans un trou. */
export const windowAt = (windows: ReadonlyArray<SightWindow>, now: number): SightWindow | null =>
  windows.find((window) => window.from <= now && now <= window.to) ?? null;

/** La prochaine ouverture après `after`, ou `null`. */
export const nextOpening = (windows: ReadonlyArray<SightWindow>, after: number): number | null =>
  windows.find((window) => window.from > after)?.from ?? null;

/** **Un pas de la grille du trajet** : deux fenêtres qu'il sépare se touchent, car la grille ne
 *  sait rien de ce qui se passe entre deux échantillons. */
export const gridStepOf = (force: { readonly departedAt: number; readonly arrivesAt: number }) =>
  (force.arrivesAt - force.departedAt) / INTERCEPTION_SAMPLES;

/** Une milliseconde de jeu pour l'arrondi flottant des échantillons, jamais une tolérance. */
const ROUNDING_MS = 1;

/** Les fenêtres dans l'ordre, jointes quand elles se chevauchent ou se touchent à un pas près. */
export function joinedWindows(
  windows: ReadonlyArray<SightWindow>,
  step: number,
): ReadonlyArray<SightWindow> {
  const joined: Array<{ from: number; to: number }> = [];
  for (const window of [...windows].sort((a, b) => a.from - b.from)) {
    const last = joined[joined.length - 1];
    if (last !== undefined && window.from <= last.to + step + ROUNDING_MS)
      last.to = Math.max(last.to, window.to);
    else joined.push({ from: window.from, to: window.to });
  }
  return joined;
}

/**
 * **Les fenêtres d'une ligne, relues** : le passé reste tel qu'il a été vu, l'avenir est ce que
 * les détecteurs promettent encore (`desired`, tous ouverts à `now` ou après). La fenêtre en cours
 * finit à `max(now, prédiction)` : elle peut raccourcir quand plus rien ne la tient. Ce qui précède
 * la fenêtre servie ne se servira plus, et s'élague.
 */
export function relaidWindows(
  held: ReadonlyArray<SightWindow>,
  desired: ReadonlyArray<SightWindow>,
  now: number,
  step: number,
): ReadonlyArray<SightWindow> {
  const opened = held.filter((window) => window.from <= now);
  const current = opened.at(-1);
  const past =
    current === undefined || current.to < now
      ? opened
      : [...opened.slice(0, -1), { from: current.from, to: now }];
  return prunedWindows(joinedWindows([...past, ...desired], step), now);
}

/** Ce qui précède la fenêtre servie ne se servira plus. */
export function prunedWindows(
  windows: ReadonlyArray<SightWindow>,
  now: number,
): ReadonlyArray<SightWindow> {
  const served = servedWindow(windows, now);
  return served === null ? windows : windows.slice(windows.indexOf(served));
}

/** Ce que la ligne écrit dans `windows` : rien quand la seule fenêtre est l'enveloppe. */
export const storedWindows = (
  from: number,
  windows: ReadonlyArray<SightWindow>,
): Array<{ from: number; to: number }> | undefined =>
  windows.length === 1 && windows[0]!.from === from
    ? undefined
    : windows.map((window) => ({ from: window.from, to: window.to }));

/** Deux listes de fenêtres égales par valeur : une écriture identique réveillerait la vue. */
export const sameWindows = (a: ReadonlyArray<SightWindow>, b: ReadonlyArray<SightWindow>) =>
  a.length === b.length &&
  a.every((window, index) => window.from === b[index]!.from && window.to === b[index]!.to);
