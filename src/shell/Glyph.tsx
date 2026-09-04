import type { ReactNode } from 'react';

export function Glyph({ children, size = 19 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/**
 * **La famille pleine du rail, en vecteur** (planche 68a). Les onze pictogrammes du jeu sont des
 * PNG masqués (`Pictogram`) ; ces trois-là n'ont pas de planche rasterisée, alors ils se tracent
 * — mais dans leur famille et non dans celle des bascules : une silhouette pleine, sans contour,
 * une seule encre, les réserves creusées à l'`evenodd` comme les visages de main-d'œuvre.
 *
 * Il porte un nom, jamais `aria-hidden` : dans la fiche de l'abaque le libellé ne s'imprime plus,
 * donc le dessin *est* le nom de la donnée — le cacher au lecteur d'écran laisserait « 18 » nu.
 */
function SolidGlyph({
  children,
  size,
  label,
}: {
  children: ReactNode;
  size: number;
  label: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}

type SolidGlyphProps = { size?: number; label: string };

/** Un lingot, jamais la pile de trois du rail : la fiche dit un prix, pas un stock. */
export function IngotGlyph({ size = 15, label }: SolidGlyphProps) {
  return (
    <SolidGlyph size={size} label={label}>
      <path d="M3.4 17.4 L7.9 8.2 H16.1 L20.6 17.4 Z" />
    </SolidGlyph>
  );
}

/** Les aiguilles sont une réserve dans le plein, pas un trait posé dessus. */
export function ClockGlyph({ size = 15, label }: SolidGlyphProps) {
  return (
    <SolidGlyph size={size} label={label}>
      <path
        fillRule="evenodd"
        d="M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 Z M11.1 5.8 H12.9 V11.2 H17.1 V12.9 H11.1 Z"
      />
    </SolidGlyph>
  );
}

/** L'effectif est la vie : le cœur le dit sans qu'un mot ait à l'écrire. */
export function HeartGlyph({ size = 15, label }: SolidGlyphProps) {
  return (
    <SolidGlyph size={size} label={label}>
      <path d="M12 20.6 L4.4 12 A5 5 0 0 1 12 6.4 A5 5 0 0 1 19.6 12 Z" />
    </SolidGlyph>
  );
}
