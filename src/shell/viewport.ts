import { createContext, useContext, useEffect, useState } from 'react';

/**
 * **Un seuil, jamais un agent.** Sous cette largeur les surfaces du plateau cessent d'être des
 * fenêtres posées sur un bureau et deviennent des feuilles : une par écran, pleine page, qu'on
 * ferme au lieu de la pousser. C'est le `md` de Tailwind, et c'est la seule mesure du dépôt —
 * un second chiffre écrit ailleurs se serait désaccordé du premier à la première retouche.
 *
 * La carte, elle, ne lit pas ce seuil : le doigt s'y décide par événement, sur `pointerType`
 * (décision mobile-1c du 03/10, qui révise celle du 15/09 — `domain/mouse-mapping.ts`).
 */
const NARROW_MAX_WIDTH = 767;

export const NARROW = `(max-width: ${NARROW_MAX_WIDTH}px)`;

/**
 * **Ce qu'on affiche du geste, pas ce qu'on en fait.** Le pointeur principal décide quelle notice
 * on montre — le doigt ou les boutons ; la carte, elle, lit chaque événement.
 */
export const COARSE = '(pointer: coarse)';

/** The lobby's phone column (`lobby.css`, `max-width: 760px`): the registry replaces the tokens. */
export const PHONE = '(max-width: 760px)';

export const usePhoneScreen = (): boolean => useMedia(PHONE);

export const useNarrowScreen = (): boolean => useMedia(NARROW);

export const useCoarsePointer = (): boolean => useMedia(COARSE);

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const follow = () => setMatches(media.matches);
    // Une première lecture après le montage : la rotation d'un téléphone peut avoir eu lieu
    // entre l'état initial et l'abonnement.
    follow();
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [query]);
  return matches;
}

/**
 * **Ce que la réglette et la colonne couvrent de la carte**, en pixels d'écran depuis le bord de
 * la carte : la table est plein écran, l'interface posée dessus. Ce qui se range au bord — les
 * indicateurs, l'échelle de route — s'y retire au lieu de passer dessous.
 */
export type BoardInsets = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

export const BoardInsetsContext = createContext<BoardInsets>({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

export const useBoardInsets = (): BoardInsets => useContext(BoardInsetsContext);

/**
 * **Ce qui se pose au bas de la carte se lève au-dessus du sous-main** (#122) : de ce que la bande
 * du plateau personnel prend au-delà de la marge de la table (`--mat-rise`, qu'elle publie). Une
 * seule mesure pour tous : sous `.hud`, la diviser par `--hud-scale`.
 */
export const MAT_LIFT = 'max(0px, var(--mat-rise, 0px) - var(--table-margin))';
/**
 * **Au téléphone, la barre basse est toujours là** : tant que le plateau personnel se charge, sa
 * barre de repli ne publie pas `--mat-rise`, et la pile des boutons de la carte, posée à la marge
 * de la table, passait dessous. `--board-bottom` (barre repliée, encoche comprise) est publié dès
 * l'arrivée : la pile se lève du plus grand des deux.
 */
export const PHONE_LIFT = `max(${MAT_LIFT}, var(--board-bottom, 0px) - var(--table-margin))`;
export const MAT_LIFT_HUD = `calc(${MAT_LIFT} / var(--hud-scale))`;

/**
 * **La carte « à faire » dépliée se déclare à la coque** tant qu'elle est montée : posée à droite
 * du carré de la colonne, hors de sa boîte, elle couvre la carte sans que la colonne le mesure.
 */
export const ColumnCardContext = createContext<(card: HTMLElement | null) => void>(() => {});

/** **Ce que la barre basse laisse sous une feuille**, en pixels d'écran : `--board-bottom` est une
 *  expression (`calc`), résolue ici par un élément de mesure. 0 sans la variable. */
export function boardBottomPx(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;width:0;height:var(--board-bottom,0px)';
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}
