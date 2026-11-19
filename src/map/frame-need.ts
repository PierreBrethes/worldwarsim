/** Ce qu'un point garde d'air au-dessus d'une feuille avant que la carte le remonte. */
export const REVEAL_MARGIN = 48;

/**
 * **La feuille cache-t-elle le sujet ?** `y` est la position du sujet sur le plateau (en pixels
 * depuis son bord haut), `covered` ce que la feuille prend en bas. Un sujet sorti par le haut du
 * cadre libre, ou à moins de la marge de son bord, se recadre de même. Seule la réponse « oui »
 * met la carte en mouvement : chaque recadrage coûte 1,5 s d'images.
 */
export const hiddenBy = (y: number, boardHeight: number, covered: number): boolean =>
  y > boardHeight - covered - REVEAL_MARGIN || y < REVEAL_MARGIN;

/** **Un voyage au lâcher a-t-il lieu d'être ?** Oui si un des points du sujet (ceux que le moteur
 *  a retrouvés ; aucun, rien à cadrer) est caché par la feuille. */
export const needsFrame = (
  spots: ReadonlyArray<{ readonly y: number }>,
  rect: { readonly top: number; readonly height: number },
  covered: number,
): boolean => spots.some((spot) => hiddenBy(spot.y - rect.top, rect.height, covered));
