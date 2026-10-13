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
export const NARROW_MAX_WIDTH = 767;

const NARROW = `(max-width: ${NARROW_MAX_WIDTH}px)`;

/**
 * **Ce qu'on affiche du geste, pas ce qu'on en fait.** Le pointeur principal décide quelle notice
 * on montre — le doigt ou les boutons ; la carte, elle, lit chaque événement.
 */
const COARSE = '(pointer: coarse)';

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
