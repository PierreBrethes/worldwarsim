import type { fr } from '@/i18n/fr';

export type SubtitleKey = keyof typeof fr.film.subtitles;

export type FilmShot = {
  /** Seconds into the film. */
  readonly start: number;
  readonly end: number;
  readonly subtitle: SubtitleKey;
};

/**
 * **Les plans du film, au temps où le montage les pose** : la page lit ce manifeste, jamais la
 * vidéo, pour dire ses sous-titres. Le film (#469) le remplira à son montage ; ces temps sont
 * ceux de l'animatique de `WWS/prototypes/accueil-v1/`, qui suit le même scénario. Les cartons
 * de début et de fin n'ont pas de sous-titre : ils n'ont pas d'entrée.
 */
export const FILM_SHOTS: readonly FilmShot[] = [
  { start: 3, end: 7, subtitle: 'map' },
  { start: 7, end: 10, subtitle: 'night' },
  { start: 10, end: 14, subtitle: 'piece' },
  { start: 14, end: 17, subtitle: 'order' },
  { start: 17, end: 21, subtitle: 'seven' },
  { start: 21, end: 24, subtitle: 'day' },
  { start: 24, end: 28, subtitle: 'edition' },
];

/** La boucle muette de la une : un segment du même fichier, de deux à cinq plans, sans carton. */
export const FILM_LOOP = { from: 3, to: 17 } as const;

/** Deux découpes d'un même film : l'écran large, et le téléphone en 9:16. */
export type FilmCut = 'wide' | 'tall';

export const FILM_CUTS = {
  wide: {
    video: '/film/accueil-16x9.webm',
    poster: '/film/accueil-affiche-16x9.jpg',
    gestures: '/film/gestes-16x9.jpg',
  },
  tall: {
    video: '/film/accueil-9x16.webm',
    poster: '/film/accueil-affiche-9x16.jpg',
    gestures: '/film/gestes-9x16.jpg',
  },
} as const satisfies Record<FilmCut, object>;

export const subtitleAt = (seconds: number): SubtitleKey | null =>
  FILM_SHOTS.find((shot) => seconds >= shot.start && seconds < shot.end)?.subtitle ?? null;

/** Where the loop's playhead goes next: the loop's start, once it has left its segment. */
export const loopedTime = (seconds: number): number =>
  seconds >= FILM_LOOP.from && seconds < FILM_LOOP.to ? seconds : FILM_LOOP.from;
