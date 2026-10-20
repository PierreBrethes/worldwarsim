import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

/**
 * **Une seule surface ouverte à la fois sous le seuil** (piste A, passe 2) : feuille ou fenêtre,
 * en ouvrir une ferme l'autre. Les surfaces ne se connaissent pas — une fenêtre vit dans l'URL,
 * la feuille « à faire » dans le pied, un panneau dans l'état du plateau — donc aucune ne peut
 * fermer les autres. Chacune réclame la place en montant et donne de quoi la fermer ; la
 * précédente est fermée par son propre geste, celui qu'aurait eu son bouton « fermer ».
 */
type Claim = (close: () => void) => () => void;

type Sole = { readonly claim: Claim; readonly closeCurrent: () => boolean };

const SoleSurfaceContext = createContext<Sole | null>(null);

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
  /** Ferme la surface qui tient la place, par son propre geste : `false` s'il n'y en a pas. */
  const closeCurrent = useCallback(() => {
    const held = current.current;
    held?.close();
    return held !== null;
  }, []);
  const value = useMemo(() => ({ claim, closeCurrent }), [claim, closeCurrent]);
  return <SoleSurfaceContext.Provider value={value}>{children}</SoleSurfaceContext.Provider>;
}

/** Réclame la place au montage. Sans fournisseur — au bureau, dans un test — rien ne se passe. */
export function useSoleSurface(close: () => void, enabled = true): void {
  const claim = useContext(SoleSurfaceContext)?.claim ?? null;
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (claim === null || !enabled) return;
    return claim(() => latest.current());
  }, [claim, enabled]);
}

/** « Carte » : ferme la surface ouverte par son propre `onClose`, celui qui date la lecture du
 *  journal ou quitte le télégraphe. `false` : aucune n'est ouverte ici, l'adresse décide. */
export const useCloseSoleSurface = (): (() => boolean) =>
  useContext(SoleSurfaceContext)?.closeCurrent ?? (() => false);
