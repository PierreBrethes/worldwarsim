import type { ReactNode } from 'react';
import { Newspaper, type Turning } from './Newspaper';

/**
 * **La feuille d'entrée : la une, la connexion, l'invitation.** Trois pages qu'un visiteur voit
 * avant d'avoir un compte, et une seule mesure. Sous 768 px la marge intérieure n'est plus les
 * 30 px du bureau : la feuille zoomée à l'échelle d'interface (`.hud`) ne laissait que 300 px
 * à une enseigne qui en demandait 400, d'où la manchette rognée du relevé mobile (C3). La marge
 * est une variable, `--sheet-pad`, que tout ce qui se pose sur la feuille lit au lieu d'écrire
 * son propre chiffre.
 *
 * **Et la feuille prend toute la largeur de l'écran, pas cinq sixièmes.** `hud-fit` divise le
 * pourcentage par l'échelle parce que `zoom` le multipliait ; mesuré le 04/10 sur Chromium 153 et
 * WebKit 26, il ne le multiplie plus, et la feuille d'un iPhone 13 tombait à 298 px sur 358.
 * Les pages d'entrée bornent donc à `100%` tout court.
 */
export function EntrySheet({
  width,
  turning,
  backdrop = 'film',
  children,
}: {
  width: number;
  turning: Turning;
  backdrop?: 'map' | 'film';
  children: ReactNode;
}) {
  return (
    <Newspaper width={width} turning={turning} backdrop={backdrop} fit="container">
      <div className="paper-grain @container relative border border-[var(--ink)] text-[var(--ink)] shadow-[0_20px_46px_rgba(0,0,0,.6),0_2px_0_rgba(0,0,0,.5)] [--sheet-pad:30px] max-md:[--sheet-pad:16px]">
        {children}
      </div>
    </Newspaper>
  );
}

/** Ce qu'il faut toucher, au doigt comme à la souris : le mot ne grossit pas, son creux si. */
export const TOUCH_TARGET = 'inline-flex min-h-11 items-center';

/**
 * **L'enseigne à la largeur de la feuille**, plafonnée à `max` : la manchette fait un peu moins
 * de huit fois sa taille de large (mesuré, « la » compris), et `cqi` est la feuille elle-même,
 * qui est le conteneur.
 */
export const fittedWordmark = (max: number): string =>
  `min(${max}px, calc((100cqi - 2 * var(--sheet-pad)) / ${WORDMARK_WIDTH_PER_SIZE}))`;

const WORDMARK_WIDTH_PER_SIZE = 7.4;
