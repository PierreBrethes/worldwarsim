import type { MapMotion } from './map-motion';

/** Un numéro du bulletin des mises à jour : une feuille imprimée, et son résumé en texte. */
export type Patchnote = {
  /** `AAAA-MM-JJ`, la clé du bulletin et du « lu ». */
  date: string;
  title: string;
  image: string;
  /** Une vignette d'environ 400 px : la liste des Réglages ne décode pas la feuille entière. */
  thumb: string;
  /** Ce que dit la feuille, en texte : son texte alternatif, et sous elle au téléphone. */
  summary: string;
};

const isPatchnote = (row: unknown): row is Patchnote => {
  if (typeof row !== 'object' || row === null) return false;
  const { date, title, image, thumb, summary } = row as Record<string, unknown>;
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    typeof title === 'string' &&
    typeof image === 'string' &&
    typeof thumb === 'string' &&
    typeof summary === 'string'
  );
};

/** L'index servi par `public/patchnotes/index.json`, le plus récent d'abord. */
export const parsePatchnotes = (raw: unknown): Patchnote[] =>
  (Array.isArray(raw) ? raw.filter(isPatchnote) : []).sort((a, b) => b.date.localeCompare(a.date));

export const unreadOf = (all: ReadonlyArray<Patchnote>, read: ReadonlySet<string>): Set<string> =>
  new Set(all.filter((note) => !read.has(note.date)).map((note) => note.date));

/** Au bout du carrousel on écrit la limite, on ne grise pas une flèche. */
export const limitOf = (at: number, step: -1 | 1, count: number): 'first' | 'last' | null =>
  at + step < 0 ? 'first' : at + step >= count ? 'last' : null;

/** Le tour de feuille : « actives » elle glisse, « réduites » elle fond, « coupées » elle change. */
export const turnOf = (motion: MapMotion): { kind: 'slide' | 'fade' | 'cut'; ms: number } =>
  motion === 'full'
    ? { kind: 'slide', ms: 320 }
    : motion === 'reduced'
      ? { kind: 'fade', ms: 140 }
      : { kind: 'cut', ms: 0 };

/** La frise des Réglages : les bulletins groupés par mois (`AAAA-MM`), dans l'ordre reçu. */
export function monthsOf(notes: ReadonlyArray<Patchnote>): Array<[string, Patchnote[]]> {
  const groups = new Map<string, Patchnote[]>();
  for (const note of notes) {
    const month = note.date.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), note]);
  }
  return [...groups];
}
