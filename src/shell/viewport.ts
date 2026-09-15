import { useEffect, useState } from 'react';

/**
 * **Un seuil, jamais un agent.** Sous cette largeur les surfaces du plateau cessent d'être des
 * fenêtres posées sur un bureau et deviennent des feuilles : une par écran, pleine page, qu'on
 * ferme au lieu de la pousser. C'est le `md` de Tailwind, et c'est la seule mesure du dépôt —
 * un second chiffre écrit ailleurs se serait désaccordé du premier à la première retouche.
 *
 * La carte, elle, ne lit pas ce seuil : ce qui marche au doigt marche, ce qui demande un clic
 * droit ne marche pas, et c'est assumé (décision du 15/09).
 */
export const NARROW_MAX_WIDTH = 767;

const NARROW = `(max-width: ${NARROW_MAX_WIDTH}px)`;

export function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches);
  useEffect(() => {
    const media = matchMedia(NARROW);
    const follow = () => setNarrow(media.matches);
    // Une première lecture après le montage : la rotation d'un téléphone peut avoir eu lieu
    // entre l'état initial et l'abonnement.
    follow();
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);
  return narrow;
}
