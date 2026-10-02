/**
 * **Les films vivent sur le VPS, hors du dépôt** (plan-4b-2026-10-02) : Nginx sert `/media/`
 * depuis un dossier monté, et en local on les dépose dans `public/media/`, ignoré par git.
 * Absents, rien ne casse — le fond retombe sur la table de carte.
 */
export const LOOP_URL = '/media/la-manchette-boucle-8s.mp4';
export const LOOP_POSTER_URL = '/media/la-manchette-boucle-poster.jpg';
export const FILM_URL = '/media/la-manchette-film-30s-leger.mp4';

/** Sous cette largeur la feuille couvre l'écran : trois mégaoctets pour un fond qu'on ne voit pas. */
export const FILM_BACKDROP_MIN_WIDTH = 900;

export type FilmBackdrop = 'video' | 'poster' | 'map';

/**
 * L'économie de données et l'écran étroit passent avant le mouvement réduit : ils renoncent même
 * à l'image fixe, quand le mouvement réduit ne renonce qu'à ce qui bouge.
 */
export function filmBackdrop({
  reducedMotion,
  saveData,
  width,
}: {
  reducedMotion: boolean;
  saveData: boolean;
  width: number;
}): FilmBackdrop {
  if (saveData || width < FILM_BACKDROP_MIN_WIDTH) return 'map';
  return reducedMotion ? 'poster' : 'video';
}
