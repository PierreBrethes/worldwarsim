/**
 * The board's whole state lives in its URL: which windows are open, which country and building
 * they look at. This file is that state and the few functions that move it — alone, so that the
 * shell can read and change it without importing the board itself.
 */

export const WINDOWS = [
  'journal',
  'telegraph',
  /** **Pas d'entrée de rail** : la modale d'un site s'ouvre au clic gauche sur son mât, et de
   *  nulle part ailleurs (59a). Elle est ici parce qu'elle est une fenêtre comme les autres —
   *  même pile, même Échap, même URL partageable — et le bâtiment qu'elle sert est `building`. */
  'site',
  'economy',
  'nation',
  'settings',
  /** L'abaque de tir a pris l'entrée de rail que l'onglet « prod. » a libérée (59a, contrat 06) :
   *  il faut pouvoir le lire sans posséder un seul bâtiment de projection. */
  'gunnery',
  /** La presse : le classement à l'heure du dernier relevé. Elle ne commande rien — on la
   *  ferme, et c'est la seule action que le contrat 07 lui accorde. */
  'press',
] as const;

export type BoardWindow = (typeof WINDOWS)[number];

/**
 * The windows array's order is the stacking order: the last entry is in front.
 *
 * **Nothing about a movement lives here.** Composing a column and aiming it happen on the map,
 * in the widget and in the panels it opens (decision 12a) — a half-armed column in a URL would
 * be a shareable link to a state the server never heard of.
 */
export type BoardSearch = {
  country?: string;
  windows?: BoardWindow[];
  /**
   * The building whose line the opened surface focuses on — an **instance id**, never a key:
   * `?building=barracks` would open the barracks of Normandy for a click on the one in
   * Brittany. A stale id is not an error, it is a window without a focus.
   */
  building?: string;
};

/** The two surfaces a focus can live in. Closing one of them lets it go — there is a single
 *  `building` in the URL, so a focus that outlived its window would resurface unasked. The
 *  nation sheet left the list with its census: it names no building any more. */
const FOCUSED_WINDOWS: ReadonlyArray<BoardWindow> = ['economy', 'site'];

export function withWindow(search: BoardSearch, name: BoardWindow): BoardSearch {
  const others = (search.windows ?? []).filter((open) => open !== name);
  return { ...search, windows: [...others, name] };
}

export function withoutWindow(search: BoardSearch, name: BoardWindow): BoardSearch {
  const { windows, building, ...rest } = search;
  // The building focus leaves with whichever surface could have been carrying it.
  const kept =
    FOCUSED_WINDOWS.includes(name) || building === undefined ? rest : { ...rest, building };
  const remaining = (windows ?? []).filter((open) => open !== name);
  return remaining.length ? { ...kept, windows: remaining } : kept;
}

export const toggleWindow = (search: BoardSearch, name: BoardWindow): BoardSearch =>
  (search.windows ?? []).includes(name) ? withoutWindow(search, name) : withWindow(search, name);

export const windowOpen = (search: BoardSearch, name: BoardWindow): boolean =>
  (search.windows ?? []).includes(name);

export function readWindows(raw: Record<string, unknown>): BoardWindow[] {
  const requested = Array.isArray(raw.windows) ? raw.windows : [raw.windows];
  return requested
    .filter((value): value is BoardWindow => WINDOWS.includes(value as BoardWindow))
    .filter((name, rank, all) => all.indexOf(name) === rank);
}
