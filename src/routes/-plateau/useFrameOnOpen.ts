import { useCallback, useEffect, useRef, useState } from 'react';

/** Au-delà, aucune surface n'a répondu à l'ouverture : la demande ne doit pas recadrer la carte
 *  sous la feuille suivante. @a-mesurer */
const WAIT_MS = 2000;

/** Le temps que la hauteur reste la même avant d'être crue : un plateau qui se déplie la change à
 *  par paliers (67, 164, puis 430 px en 440 ms au téléphone), et la première lecture est celle de sa barre. @a-mesurer */
const SETTLE_MS = 500;

/**
 * **Recadrer une fois, à l'ouverture, vers la hauteur réelle de la surface ouverte.** L'objet
 * touché monte au-dessus de ce que la surface couvrira ; `covered` est sa hauteur mesurée, `null`
 * tant qu'elle n'est pas là. La demande attend que la mesure se tienne et la sert une fois : une feuille
 * tirée ensuite ou une carte déplacée par le joueur ne la rejouent pas (chaque `invalidate()` de
 * la carte coûte 1,5 s d'images).
 */
export function useFrameOnOpen<Request>(
  covered: number | null,
  serve: (request: Request, covered: number) => void,
): (request: Request) => void {
  const [asked, setAsked] = useState<{ request: Request; at: number } | null>(null);
  const served = useRef<typeof asked>(null);
  useEffect(() => {
    if (asked === null || asked === served.current || covered === null) return;
    const settled = setTimeout(() => {
      served.current = asked;
      if (Date.now() - asked.at <= WAIT_MS) serve(asked.request, covered);
    }, SETTLE_MS);
    return () => clearTimeout(settled);
  }, [asked, covered, serve]);
  return useCallback((request) => setAsked({ request, at: Date.now() }), []);
}
