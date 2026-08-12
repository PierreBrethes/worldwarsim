import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import fondPlateau from './fond-plateau.jpg';

/**
 * Le hors-saison est un journal posé sur la table des cartes : accueil et salon sont
 * deux pages de la même édition. Passer de l'une à l'autre tourne la page — l'axe est
 * le pli, à gauche. Un fondu dirait « deux écrans » ; le pli dit « une seule édition ».
 */

const SORTIE_MS = 320;
const ENTREE_MS = 440;

export type Tournant = 'sortie' | 'entree' | null;

/**
 * `tourner` joue la sortie **puis** exécute la suite (le plus souvent une navigation) :
 * la page suivante monte déjà tournée et joue son entrée, donc les deux moitiés du
 * mouvement s'enchaînent sans que les deux routes aient à se parler.
 */
export function useTourDePage() {
  const [tournant, setTournant] = useState<Tournant>('entree');
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  // la page tournée redevient une page : sans cela le `perspective` du dernier
  // keyframe reste posé sur la feuille et lui fabrique un contexte 3D permanent.
  useEffect(() => {
    const fin = setTimeout(() => setTournant(null), ENTREE_MS);
    return () => clearTimeout(fin);
  }, []);

  const tourner = useCallback((suite: () => void) => {
    if (minuteur.current !== null) clearTimeout(minuteur.current);
    setTournant('sortie');
    minuteur.current = setTimeout(suite, SORTIE_MS);
  }, []);

  return { tournant, tourner };
}

const ANIMATION: Readonly<Record<'sortie' | 'entree', string>> = {
  sortie: `tour-de-page-sortie ${SORTIE_MS}ms ease-in both`,
  entree: `tour-de-page-entree ${ENTREE_MS}ms cubic-bezier(.2,.7,.2,1) both`,
};

export function Journal({
  largeur,
  tournant = null,
  children,
}: {
  largeur: number;
  tournant?: Tournant;
  children: ReactNode;
}) {
  return (
    <div className="relative h-full overflow-hidden bg-[var(--desk)]">
      <TableDesCartes />
      <div className="relative flex h-full items-start justify-center overflow-auto px-[clamp(16px,4vw,72px)] py-[26px]">
        <div className="hud relative" style={{ width: largeur, maxWidth: '100%' }}>
          <div
            aria-hidden
            className="absolute -bottom-[15px] -left-[9px] top-[11px] right-[5px] rotate-[-.7deg] border border-[rgba(23,18,8,.6)] bg-[var(--paper-pile-2)] shadow-[0_10px_24px_rgba(0,0,0,.5)]"
          />
          <div
            aria-hidden
            className="absolute -right-[11px] -bottom-[8px] left-[7px] top-[5px] rotate-[.9deg] border border-[rgba(23,18,8,.55)] bg-[var(--paper-pile)] shadow-[0_9px_21px_rgba(0,0,0,.45)]"
          />
          <div
            className="relative origin-left"
            style={tournant === null ? undefined : { animation: ANIMATION[tournant] }}
          >
            {children}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 transition-opacity duration-300"
              style={{
                opacity: tournant === 'sortie' ? 1 : 0,
                background:
                  'linear-gradient(90deg, rgba(23,18,8,.6) 0%, rgba(23,18,8,.12) 45%, rgba(23,18,8,0) 75%)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * La carte vue de dessus, hors de portée : elle donne la profondeur sans jamais
 * réclamer un clic. C'est une prise de vue du moteur lui-même, à la verticale —
 * pas une illustration : le hors-saison montre le plateau qui attend, pas une autre carte.
 * Floutée et assombrie, elle ne coûte ni three.js ni le monde entier au chargement.
 */
function TableDesCartes() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -inset-[2%]"
        style={{
          backgroundImage: `url(${fondPlateau})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '190%',
          backgroundPosition: '46% 62%',
          filter: 'grayscale(.35) sepia(.3) blur(4px) brightness(.72) contrast(1.06)',
          opacity: 0.72,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(68% 52% at 50% -8%, rgba(200,150,72,.26) 0%, rgba(23,18,8,0) 62%), radial-gradient(46% 40% at 18% 88%, rgba(63,90,125,.22) 0%, rgba(23,18,8,0) 70%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(18,14,7,.26) 0%, rgba(18,14,7,.5) 55%, rgba(10,8,4,.78) 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(23,18,8,.5) 0 1px, transparent 1px 4px)',
        }}
      />
      {/* la vignette mord sur les bandes latérales, les seules où la carte se voit :
          au-delà de ~130px de portée elle les éteint entièrement */}
      <div className="absolute inset-0 shadow-[inset_0_0_110px_rgba(8,6,3,.72)]" />
    </div>
  );
}

/** Le filet fort du journal : trois points de plomb puis un point — jamais l'inverse. */
export function FiletFort({ marge = 30 }: { marge?: number }) {
  return (
    <div aria-hidden style={{ margin: `0 ${marge}px` }}>
      <div className="h-[3px] bg-[var(--ink)]" />
      <div className="mt-[2px] h-px bg-[var(--ink)]" />
    </div>
  );
}

export function FiletFortInverse({ marge = 30 }: { marge?: number }) {
  return (
    <div aria-hidden style={{ margin: `0 ${marge}px` }}>
      <div className="h-px bg-[var(--ink)]" />
      <div className="mt-[2px] h-[3px] bg-[var(--ink)]" />
    </div>
  );
}
