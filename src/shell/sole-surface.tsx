import { useRouter } from '@tanstack/react-router';
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
 *
 * **Le retour du navigateur ferme la feuille** (#584) : tant qu'une surface qui `marks` tient la
 * place, une seule entrée d'historique, posée par l'historique du routeur, la représente. Retour
 * la dépile et ferme la feuille par son propre geste ; la feuille qui se ferme seule la retire. Une
 * surface qui en remplace une autre ne pose ni ne retire rien, et celle qui ne marque pas — une
 * fenêtre, qui vit déjà dans l'adresse, la rose, un menu — ne pose rien, et la retire si elle
 * prend la place d'une feuille. Une entrée qu'une fenêtre a recouverte reste où elle est.
 */
type Claim = (close: () => void, marks?: boolean) => () => void;

type Sole = { readonly claim: Claim; readonly closeCurrent: () => boolean };

const SoleSurfaceContext = createContext<Sole | null>(null);

/** Hors du rendu : le compilateur lierait `claim` à `history.location`, qui change à chaque
 *  navigation, et toute surface ouverte se réclamerait alors sous le même geste. */
type History = NonNullable<ReturnType<typeof useRouter>>['history'];
const indexOf = (history: History): number => history.location.state.__TSR_index;

export function SoleSurfaceProvider({ children }: { children: ReactNode }) {
  const history = useRouter({ warn: false })?.history;
  const current = useRef<{ close: () => void; marks: boolean } | null>(null);
  /** L'index de l'entrée que nous avons posée, `null` quand il n'y en a pas. */
  const marker = useRef<number | null>(null);
  /** L'adresse de l'entrée sous la nôtre, et celle qu'il faut lui rendre quand la feuille a
   *  changé l'adresse entre-temps (sa sélection vit dans l'URL : fermée, elle l'a retirée). */
  const below = useRef('');
  const landing = useRef<string | null>(null);
  const atMarker = useCallback(
    () => marker.current !== null && history !== undefined && indexOf(history) === marker.current,
    [history],
  );

  /** Dépile notre entrée si on est dessus et qu'aucune feuille ne la tient. */
  const popIfOrphan = useCallback(() => {
    if (history === undefined || current.current?.marks || !atMarker()) return;
    marker.current = null;
    if (history.location.href !== below.current) landing.current = history.location.href;
    history.flush();
    history.back();
  }, [history, atMarker]);

  /** Après le rendu : une feuille remplacée aussitôt (ou un double montage) garde son entrée. */
  const settle = useCallback(() => queueMicrotask(popIfOrphan), [popIfOrphan]);

  /** Retour a dépilé l'entrée : la feuille se ferme, et il n'y a plus rien à retirer. */
  useEffect(
    () =>
      history?.subscribe(({ location }) => {
        if (landing.current !== null) {
          const href = landing.current;
          landing.current = null;
          history.replace(href);
          return;
        }
        if (marker.current === null || location.state.__TSR_index > marker.current) return;
        /* Retour d'une fenêtre qui recouvrait l'entrée : on y est revenu sans feuille, et un seul
           Retour de plus doit quitter le plateau. */
        if (location.state.__TSR_index === marker.current) return popIfOrphan();
        marker.current = null;
        const held = current.current;
        if (held?.marks) held.close();
      }),
    [history, popIfOrphan],
  );

  const claim = useCallback<Claim>(
    (close, marks = true) => {
      const mine = { close, marks };
      const previous = current.current;
      current.current = mine;
      if (marks && history !== undefined && !atMarker()) {
        below.current = history.location.href;
        history.push(below.current);
        marker.current = history.location.state.__TSR_index;
      }
      previous?.close();
      settle();
      return () => {
        if (current.current !== mine) return;
        current.current = null;
        settle();
      };
    },
    [history, atMarker, settle],
  );
  /** Ferme la surface qui tient la place, par son propre geste : `false` s'il n'y en a pas. */
  const closeCurrent = useCallback(() => {
    const held = current.current;
    held?.close();
    return held !== null;
  }, []);
  const value = useMemo(() => ({ claim, closeCurrent }), [claim, closeCurrent]);
  return <SoleSurfaceContext.Provider value={value}>{children}</SoleSurfaceContext.Provider>;
}

/**
 * Réclame la place au montage. Sans fournisseur — au bureau, dans un test — rien ne se passe.
 * `marks` faux : la surface vit ailleurs que dans une feuille (l'adresse, la rose, un menu) et ne
 * porte pas d'entrée d'historique.
 */
export function useSoleSurface(close: () => void, enabled = true, marks = true): void {
  const claim = useContext(SoleSurfaceContext)?.claim ?? null;
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (claim === null || !enabled) return;
    return claim(() => latest.current(), marks);
  }, [claim, enabled, marks]);
}

/** Sous le seuil, la rose est une surface : l'ouvrir referme le plateau déplié ou la feuille. */
export const useRoseSurface = (rose: unknown, closeRose: () => void): void =>
  useSoleSurface(closeRose, rose !== null, false);

/** « Carte » : ferme la surface ouverte par son propre `onClose`, celui qui date la lecture du
 *  journal ou quitte le télégraphe. `false` : aucune n'est ouverte ici, l'adresse décide. */
export const useCloseSoleSurface = (): (() => boolean) =>
  useContext(SoleSurfaceContext)?.closeCurrent ?? (() => false);

/**
 * **La carte nue** (#584) : un toucher qui ne désigne rien ferme la surface ouverte et s'arrête
 * là ; sans surface, il lit le sol (`read`). `keep` : une pile en main garde sa place, et le
 * toucher lit le sol comme avant (la visée est #586).
 */
export function useBareMapTap(
  read: (name: string | null) => void,
  keep: boolean,
): (name: string | null) => void {
  const closeSurface = useCloseSoleSurface();
  return useCallback(
    (name) => {
      if (!keep && closeSurface()) return;
      read(name);
    },
    [read, keep, closeSurface],
  );
}

/**
 * **Le port de la carte nue** : le plateau rend son `Shell`, donc le fournisseur est sous lui et
 * le plateau ne peut pas lire `useBareMapTap` lui-même. Ce composant, posé dans le cadre, y lit le
 * toucher et le dépose dans `port`, que la carte appelle.
 */
export function BareMapPort({
  read,
  keep,
  port,
}: {
  read: (name: string | null) => void;
  keep: boolean;
  port: { current: (name: string | null) => void };
}): null {
  const tap = useBareMapTap(read, keep);
  useEffect(() => {
    port.current = tap;
  });
  return null;
}
