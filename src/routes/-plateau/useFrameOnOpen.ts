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
 * **Recadrer l'objet touché au-dessus de la surface ouverte, à l'ouverture puis à chaque lâcher.**
 * `covered` est la hauteur mesurée de la surface, `null` tant qu'elle n'est pas là. Le hook tient
 * deux états : le `subject`, gardé tant que la surface est ouverte, et le `pending`, l'attente de
 * la mesure à l'ouverture — la demande la sert une fois que la hauteur se tient, et s'abandonne si
 * `cancel` est appelé (un geste du joueur sur la carte) ; `cancel` n'annule que lui, le sujet
 * survit. `replay(covered)` relit le sujet au lâcher d'une feuille sur un cran, avec la hauteur
 * visée, sans attente ; sans hauteur (le plateau se déplie, sa hauteur n'est pas encore là), il
 * rouvre une attente. Une surface qui part emporte le sujet. Chaque service coûte 1,5 s d'images
 * à la carte : celui qui sert décide s'il y a lieu de bouger.
 */
export function useFrameOnOpen<Request>(
  covered: number | null,
  serve: (request: Request, covered: number) => void,
  /** La surface est ouverte, même si elle ne couvre rien pour l'instant : le plateau replié garde
   *  son site sélectionné, et le déplier doit le recadrer. Par défaut, elle l'est quand elle se
   *  mesure. */
  open: boolean = covered !== null,
): {
  ask: (request: Request) => void;
  cancel: () => void;
  forget: () => void;
  replay: (covered?: number) => void;
} {
  const [pending, setPending] = useState<{ request: Request; at: number } | null>(null);
  const subject = useRef<Request | null>(null);
  const served = useRef<typeof pending>(null);
  const measured = useRef(false);
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    if (subject.current === null) return;
    if (open) {
      measured.current = true;
      return;
    }
    if (!measured.current) return;
    const gone = setTimeout(() => {
      subject.current = null;
      setPending(null);
    }, GONE_MS);
    return () => clearTimeout(gone);
  }, [open]);
  useEffect(() => {
    if (pending === null || pending === served.current || covered === null) return;
    measured.current = true;
    const settled = setTimeout(() => {
      served.current = pending;
      if (Date.now() - pending.at <= WAIT_MS) serve(pending.request, covered);
    }, SETTLE_MS);
    return () => clearTimeout(settled);
  }, [pending, covered, serve]);
  const wait = useCallback((request: Request) => {
    measured.current = latest.current;
    setPending({ request, at: Date.now() });
  }, []);
  const ask = useCallback(
    (request: Request) => {
      subject.current = request;
      wait(request);
    },
    [wait],
  );
  const replay = useCallback(
    (height?: number) => {
      const request = subject.current;
      if (request === null) return;
      if (height === undefined) wait(request);
      else serve(request, height);
    },
    [wait, serve],
  );
  const cancel = useCallback(() => setPending(null), []);
  /** Une sélection qui ne demande pas de recadrage emporte le sujet : un cran lâché ne doit pas
   *  rejouer celui d'avant. */
  const forget = useCallback(() => {
    subject.current = null;
    setPending(null);
  }, []);
  return { ask, cancel, forget, replay };
}
