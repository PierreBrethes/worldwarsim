import { clampToEdge, type EdgePoint } from '@/domain/indicators';

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

/**
 * **Où l'objet tenu se rappelle, ou `null` s'il se voit.** `spot` est l'objet dans le cadre de la
 * carte (`null` : introuvable ou dos tourné, rien à rappeler). Il est caché quand il sort du cadre
 * libre — hors de l'écran, sous la barre du haut, ou sous la feuille (`hiddenBy`, comme le
 * recadrage à l'ouverture) ; le point du bord est alors celui du cadre libre qui regarde vers lui.
 */
export function heldRim(
  spot: { readonly x: number; readonly y: number } | null,
  size: { readonly width: number; readonly height: number },
  insets: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  },
): EdgePoint | null {
  if (spot === null) return null;
  const seen =
    !hiddenBy(spot.y, size.height, insets.bottom) &&
    spot.y >= insets.top &&
    spot.x >= insets.left &&
    spot.x <= size.width - insets.right;
  if (seen) return null;
  const free = {
    width: size.width - insets.left - insets.right,
    height: size.height - insets.top - insets.bottom,
  };
  const edge = clampToEdge(spot.x - insets.left, spot.y - insets.top, free.width, free.height);
  return { ...edge, x: edge.x + insets.left, y: edge.y + insets.top };
}
