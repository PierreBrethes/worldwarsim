import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';

/**
 * **Une seule surface ouverte à la fois sous le seuil** (piste A, passe 2) : feuille ou fenêtre,
 * en ouvrir une ferme l'autre. Les surfaces ne se connaissent pas — une fenêtre vit dans l'URL,
 * la feuille « à faire » dans le pied, un panneau dans l'état du plateau — donc aucune ne peut
 * fermer les autres. Chacune réclame la place en montant et donne de quoi la fermer ; la
 * précédente est fermée par son propre geste, celui qu'aurait eu son bouton « fermer ».
 */
type Claim = (close: () => void) => () => void;

const SoleSurfaceContext = createContext<Claim | null>(null);

export function SoleSurfaceProvider({ children }: { children: ReactNode }) {
  const current = useRef<{ close: () => void } | null>(null);
  const claim = useCallback<Claim>((close) => {
    const mine = { close };
    const previous = current.current;
    current.current = mine;
    previous?.close();
    return () => {
      if (current.current === mine) current.current = null;
    };
  }, []);
  return <SoleSurfaceContext.Provider value={claim}>{children}</SoleSurfaceContext.Provider>;
}

/** Réclame la place au montage. Sans fournisseur — au bureau, dans un test — rien ne se passe. */
export function useSoleSurface(close: () => void, enabled = true): void {
  const claim = useContext(SoleSurfaceContext);
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (claim === null || !enabled) return;
    return claim(() => latest.current());
  }, [claim, enabled]);
}
