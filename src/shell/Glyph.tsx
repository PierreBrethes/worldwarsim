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

/** A plain coin: the price line says its own resources, so its mark must name none of them. */
export function CoinGlyph({ size = 15, label }: SolidGlyphProps) {
  return (
    <SolidGlyph size={size} label={label}>
      <circle cx="12" cy="12" r="7.6" />
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

/** The open eye is detection, never weapon range. */
export function EyeGlyph({ size = 15, label }: SolidGlyphProps) {
  return (
    <SolidGlyph size={size} label={label}>
      <path
        fillRule="evenodd"
        d="M2 12 C5.1 6.2 8.5 4.5 12 4.5 C15.5 4.5 18.9 6.2 22 12 C18.9 17.8 15.5 19.5 12 19.5 C8.5 19.5 5.1 17.8 2 12 Z M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8 Z M12 10.3 A1.7 1.7 0 1 1 12 13.7 A1.7 1.7 0 1 1 12 10.3 Z"
      />
    </SolidGlyph>
  );
}
