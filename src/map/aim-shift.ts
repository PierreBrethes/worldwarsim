/** Ce que l'étiquette de la visée laisse de marge au bord de l'écran, en pixels d'écran. */
const AIM_MARGIN_PX = 8;

/**
 * **De combien l'étiquette de la visée se décale pour tenir à l'écran** (#586) : centrée sur le
 * point touché, elle déborderait au bord d'un téléphone. Son bord gauche est borné à
 * `[8, largeur − largeur d'étiquette − 8]` ; trop large pour la place, elle garde le bord gauche.
 */
export function aimShiftOf(x: number, width: number, room: number): number {
  const left = x - width / 2;
  const bounded = Math.max(AIM_MARGIN_PX, Math.min(left, room - width - AIM_MARGIN_PX));
  return bounded - left;
}
