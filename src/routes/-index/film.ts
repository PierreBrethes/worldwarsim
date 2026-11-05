import type { fr } from '@/i18n/fr';
import { FRONT_FILM_URLS } from '@/shell/media';
import filmShots from './film-shots.json';

export type SubtitleKey = keyof typeof fr.film.subtitles;

export type FilmShot = {
  /** Seconds into the film. */
  readonly start: number;
  readonly end: number;
  readonly subtitle: SubtitleKey;
};

/**
 * **Les plans du film, au temps où le montage les pose** : la page lit ce manifeste, jamais la
 * vidéo, pour dire ses sous-titres. `scripts/film-accueil.mjs` l'écrit (`film-shots.json`) en
 * tournant le film (#469) : un plan commence où le précédent finit, et le film n'a pas de carton.
 */
const manifest = filmShots as {
  shots: { start: number; end: number; subtitle: SubtitleKey }[];
  loop: { from: number; to: number };
};
export const FILM_SHOTS: readonly FilmShot[] = manifest.shots;

/** La boucle muette de la une : un segment du même fichier, de deux à cinq plans, sans carton. */
export const FILM_LOOP = manifest.loop;

/** Deux découpes d'un même film : l'écran large, et le téléphone en 9:16. */
export type FilmCut = 'wide' | 'tall';

export const FILM_CUTS = {
  wide: {
    video: FRONT_FILM_URLS.wide,
    poster: '/film/accueil-affiche-16x9.webp',
    gestures: '/film/gestes-16x9.webp',
  },
  tall: {
    video: FRONT_FILM_URLS.tall,
    poster: '/film/accueil-affiche-9x16.webp',
    gestures: '/film/gestes-9x16.webp',
  },
} as const satisfies Record<FilmCut, object>;

export const subtitleAt = (seconds: number): SubtitleKey | null =>
  FILM_SHOTS.find((shot) => seconds >= shot.start && seconds < shot.end)?.subtitle ?? null;

/** Where the loop's playhead goes next: the loop's start, once it has left its segment. */
export const loopedTime = (seconds: number): number =>
  seconds >= FILM_LOOP.from && seconds < FILM_LOOP.to ? seconds : FILM_LOOP.from;
