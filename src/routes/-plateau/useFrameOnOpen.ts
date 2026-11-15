import { useCallback, useEffect, useRef, useState } from 'react';

/** Au-delà, aucune surface n'a répondu à l'ouverture : la demande ne doit pas recadrer la carte
 *  sous la feuille suivante. @a-mesurer */
const WAIT_MS = 2000;

/** Le temps que la hauteur reste la même avant d'être crue : un plateau qui se déplie la change
 *  par paliers (67, 164, puis 430 px en 440 ms au téléphone), et la première lecture est celle de
 *  sa barre. @a-mesurer */
const SETTLE_MS = 500;

/** Sans surface mesurée aussi longtemps, celle de la demande est partie : elle s'abandonne. Un
 *  instant de creux suffit à une feuille qui en remplace une autre. @a-mesurer */
const GONE_MS = 200;

/** **La plus haute des surfaces mesurées** : une feuille de sélection et le plateau déplié
 *  peuvent se tenir ensemble, et c'est la plus haute qui couvre la carte. */
export const tallest = (...heights: ReadonlyArray<number | null>): number | null =>
  heights.reduce<number | null>((top, h) => (h === null ? top : Math.max(top ?? 0, h)), null);

/**
 * **Recadrer une fois, à l'ouverture, vers la hauteur réelle de la surface ouverte.** L'objet
 * touché monte au-dessus de ce que la surface couvrira ; `covered` est sa hauteur mesurée, `null`
 * tant qu'elle n'est pas là. La demande attend que la mesure se tienne et la sert une fois : une
 * feuille tirée ensuite ne la rejoue pas (chaque `invalidate()` de la carte coûte 1,5 s d'images).
 * Elle s'abandonne si la surface part, ou si `cancel` est appelé — un geste du joueur sur la carte.
 */
export function useFrameOnOpen<Request>(
  covered: number | null,
  serve: (request: Request, covered: number) => void,
): { ask: (request: Request) => void; cancel: () => void } {
  const [asked, setAsked] = useState<{ request: Request; at: number } | null>(null);
  const served = useRef<typeof asked>(null);
  const measured = useRef(false);
  useEffect(() => {
    if (asked === null || asked === served.current) return;
    if (covered === null) {
      if (!measured.current) return;
      const gone = setTimeout(() => setAsked(null), GONE_MS);
      return () => clearTimeout(gone);
    }
    measured.current = true;
    const settled = setTimeout(() => {
      served.current = asked;
      if (Date.now() - asked.at <= WAIT_MS) serve(asked.request, covered);
    }, SETTLE_MS);
    return () => clearTimeout(settled);
  }, [asked, covered, serve]);
  const ask = useCallback((request: Request) => {
    measured.current = false;
    setAsked({ request, at: Date.now() });
  }, []);
  const cancel = useCallback(() => setAsked(null), []);
  return { ask, cancel };
}
