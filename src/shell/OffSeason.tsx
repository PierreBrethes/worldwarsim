import type { ReactNode } from 'react';
import { nationImage } from '@/emblems/Flag';
import { nationLabel } from '@/i18n/fr';
import { EngravedDefs, EngravedMap, type Box } from '@/emblems/EngravedMap';

/**
 * **Le hors-saison : la une pour lire, la table pour jouer** (prototype validé du 14/10,
 * `WWS/prototypes/connexion-salon.html`). Chaque écran est un objet de l'état-major posé sur un
 * bureau sombre où le monde est gravé ; les règles visuelles sont dans `styles/off-season.css`,
 * toutes sous `.os`.
 */
export function OffSeasonPage({ children }: { children: ReactNode }) {
  return (
    <div className="os">
      <EngravedDefs />
      <div className="os-desk" aria-hidden>
        <EngravedMap
          box={[-150, -50, 170, 76]}
          px={1500}
          dark
          fit="slice"
          flat
          gratStep={15}
          rings={[10, 6, 2.8]}
          pad={0}
        />
      </div>
      <div className="grain" aria-hidden />
      <main className="os-main">{children}</main>
    </div>
  );
}

/** Le drapeau, 3:2, jamais déformé ; sans nation, un cadre hachuré. */
export function FlagChip({ nation, width = 33 }: { nation: string | null; width?: number }) {
  const image = nationImage(nation);
  return (
    <span
      className={`flag ${image === null ? 'none' : ''}`}
      style={{ width, ...(image === null ? {} : { backgroundImage: image }) }}
      {...(image === null
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': nationLabel(nation) })}
    />
  );
}

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

function roman(value: number): string {
  let left = value;
  return ROMAN.reduce((written, [amount, sign]) => {
    let out = written;
    while (left >= amount) {
      out += sign;
      left -= amount;
    }
    return out;
  }, '');
}

export const romanDate = (date: Date): string =>
  [date.getDate(), date.getMonth() + 1, date.getFullYear()].map(roman).join(' · ');

/** **Le télégramme s'écrit en capitales sans accents** (choix 17) ; les lecteurs d'écran lisent
 *  la phrase d'origine. */
export const telegraphese = (line: string): string =>
  line.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, ' ').toUpperCase();

/** Les cadres de théâtre, en degrés — les mêmes que `THEATRES`, rangés comme la carte les lit. */
export const boxOf = (box: {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}): Box => [box.west, box.south, box.east, box.north];
