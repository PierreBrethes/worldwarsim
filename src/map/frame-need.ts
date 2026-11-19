/** Ce qu'un point garde d'air au-dessus d'une feuille avant que la carte le remonte. */
export const REVEAL_MARGIN = 48;

/**
 * **La feuille cache-t-elle le sujet ?** `y` est la position du sujet sur le plateau (en pixels
 * depuis son bord haut), `covered` ce que la feuille prend en bas. Seule la réponse « oui » met la
 * carte en mouvement : chaque recadrage coûte 1,5 s d'images.
 */
export const hiddenBy = (y: number, boardHeight: number, covered: number): boolean =>
  y > boardHeight - covered - REVEAL_MARGIN;
