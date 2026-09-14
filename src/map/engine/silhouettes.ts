import type { Medium } from '@/domain/routing';

/**
 * **Les trois silhouettes de domaine**, et il n'y en a qu'un jeu : prisme au sol, coque à la
 * flotte, delta au ciel. C'est ce que le brouillard laisse voir d'une force adverse — le milieu,
 * jamais ce qu'elle est (fiche 04) — et deux dessins pour la même chose auraient divergé au
 * premier retouche : le pion d'un arc relevé (`pawn.ts`) et le mât d'un camp relevé
 * (`MapLabels.tsx`, ADR 0024 §1) lisent tous deux ici.
 *
 * Elles sont tracées dans le repère de la planche — y vers le bas, hauteur autour de douze — et
 * chaque rendu les normalise à sa façon.
 */
export const SILHOUETTES: Readonly<
  Record<Medium, ReadonlyArray<ReadonlyArray<readonly [number, number]>>>
> = {
  land: [
    [
      [-9, 2],
      [0, 6],
      [9, 2],
      [0, -2],
    ],
  ],
  sea: [
    [
      [-10, 0],
      [10, 0],
      [6, 5],
      [-6, 5],
    ],
    [
      [-1, 0],
      [-1, -12],
      [8, -8],
    ],
  ],
  air: [
    [
      [-9, 0],
      [0, -5],
      [9, 0],
      [0, 3],
    ],
  ],
};

/**
 * Plate width. The three silhouettes are normalized to it, so they weigh the same on screen:
 * a delta must not look more hurried than a prism because it is thinner.
 */
export const PLATE_WIDTH = 20;

/**
 * Le même contour, en chemin SVG centré dans un carré de vingt — la boîte des glyphes du jeu
 * (`Glyph`). Le repère de la planche a y vers le bas, celui du SVG aussi : rien ne se retourne
 * ici, contrairement au rendu trois dimensions qui, lui, remonte l'axe.
 */
export const silhouettePaths = (medium: Medium): ReadonlyArray<string> =>
  SILHOUETTES[medium].map(
    (outline) =>
      `${outline
        .map(
          ([x, y], index) =>
            `${index === 0 ? 'M' : 'L'}${x + PLATE_WIDTH / 2} ${y + PLATE_WIDTH / 2}`,
        )
        .join(' ')} Z`,
  );
