import type { ReactNode } from 'react';

export function Glyph({ children, size = 19 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/**
 * **Un manipulateur morse** : le levier sur son pivot, le bouton à la main, deux étincelles.
 * Dessiné et non massicoté comme les onze pictogrammes — il n'existe pas de planche à cuire
 * pour lui, exactement comme la bascule des bâtiments et l'icône des réglages.
 */
export function TelegraphGlyph({ size = 19 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 15.5h11" />
      <path d="M5 11.5h7" />
      <path d="M9.5 11.5v4" />
      <circle cx="5" cy="11.5" r="1.3" />
      <path d="M14 8.2l1.8-1.7M16.4 9.4l2.3-.7" />
    </Glyph>
  );
}

/**
 * **Un journal plié** : la pliure au milieu, la manchette et trois lignes de colonne. Tracé et
 * non massicoté comme les onze pictogrammes — il n'existe pas de planche à cuire pour lui, et le
 * pictogramme `journal` est déjà pris par le bouton du bandeau, dont il serait le sosie.
 */
export function PressGlyph({ size = 19 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 5h14v10H3z" />
      <path d="M10 5v10" />
      <path d="M5 8h3M5 11h3M12 8h3M12 11h3" />
    </Glyph>
  );
}

/** **Une fiole** : le col, la panse, le niveau du liquide. Tracée comme les autres, la recherche
 *  n'ayant pas de planche à cuire. */
export function ResearchGlyph({ size = 19 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M8 3h4M9 3v5l-5 8.5h12L11 8V3" />
      <path d="M6.3 13h7.4" />
    </Glyph>
  );
}

export function SettingsGlyph({ size = 19 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M4 6.5h12M4 13.5h12" />
      <path d="M8 4.5v4M13 11.5v4" />
    </Glyph>
  );
}

/** Trois feuilles posées l'une sur l'autre : les calques de la carte, au dossier et sur la carte. */
export function LayersGlyph({ size = 19 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M10 3l7.5 4-7.5 4-7.5-4z" />
      <path d="M2.5 10.6l7.5 4 7.5-4" />
      <path d="M2.5 14l7.5 4 7.5-4" />
    </Glyph>
  );
}

/**
 * **La famille pleine, en vecteur** (planche 68a) : une silhouette pleine, sans contour, une seule
 * encre, les réserves creusées à l'`evenodd`. Celle des statistiques (`StatLines`), qui n'ont pas
 * de planche rasterisée. Il porte un nom, jamais `aria-hidden` : le dessin dit la donnée.
 */
export function SolidGlyph({
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

/** **Une liste** : trois lignes, la première en retrait — ce qui attend. Tracée, comme les autres. */
export function TodoGlyph({ size = 19 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 5h14M3 10h14M3 15h8" />
    </Glyph>
  );
}

/** **Une carte dépliée** : trois pans et leurs plis — là où ramène la clé. */
export function MapGlyph({ size = 19 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 5.5 7.5 4l5 1.5L17 4v10.5L12.5 16l-5-1.5L3 16z" />
      <path d="M7.5 4v10.5M12.5 5.5V16" />
    </Glyph>
  );
}
