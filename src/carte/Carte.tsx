import { useEffect, useRef, useState } from 'react';
import { chargerRegions, type Monde } from '@/domaine/monde';
import type { ArcAffiche } from '@/domaine/vue-joueur';
import { MoteurCarte, type SurvolCarte } from './moteur';

type Props = {
  monde: Monde;
  arcs: ReadonlyArray<ArcAffiche>;
  encreParPays: ReadonlyMap<string, string>;
  paysSelectionne: string | null;
  nationJoueur: string | null;
  onSelection: (nom: string | null) => void;
  onSurvolRegion?: (nom: string | null) => void;
};

export function Carte({ monde, arcs, encreParPays, paysSelectionne, nationJoueur, onSelection, onSurvolRegion }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const moteur = useRef<MoteurCarte | null>(null);
  const [survol, setSurvol] = useState<SurvolCarte>(null);

  useEffect(() => {
    if (!conteneur.current) return;
    const instance = new MoteurCarte(conteneur.current, monde);
    instance.onSurvol = setSurvol;
    moteur.current = instance;
    if (import.meta.env.DEV) (window as unknown as { moteurCarte?: MoteurCarte }).moteurCarte = instance;

    const observateur = new ResizeObserver(() => instance.redimensionner());
    observateur.observe(conteneur.current);

    // Décor de zoom uniquement : le plateau n'attend pas ces 500 Ko, et leur échec est muet.
    let abandonne = false;
    chargerRegions()
      .then((donnees) => {
        if (!abandonne) instance.afficherRegions(donnees);
      })
      .catch(() => {});

    return () => {
      abandonne = true;
      observateur.disconnect();
      instance.detruire();
      moteur.current = null;
    };
  }, [monde]);

  useEffect(() => {
    if (moteur.current) moteur.current.onSelection = onSelection;
  }, [onSelection]);

  useEffect(() => {
    if (moteur.current) moteur.current.onSurvolRegion = onSurvolRegion ?? (() => {});
  }, [onSurvolRegion]);

  useEffect(() => {
    moteur.current?.definirNationJoueur(nationJoueur);
  }, [nationJoueur]);

  useEffect(() => {
    moteur.current?.afficherArcs(arcs);
  }, [arcs]);

  useEffect(() => {
    moteur.current?.colorerNations(encreParPays);
  }, [encreParPays]);

  useEffect(() => {
    moteur.current?.selectionner(paysSelectionne);
  }, [paysSelectionne]);

  return (
    <div ref={conteneur} className="relative h-full w-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(ellipse 75% 68% at 50% 44%, rgba(228,216,189,.045) 0%, transparent 42%), radial-gradient(ellipse 85% 75% at 50% 46%, transparent 48%, rgba(10,7,3,.5) 100%)',
        }}
      />
      {survol && <EtiquettePays survol={survol} />}
    </div>
  );
}

function EtiquettePays({ survol }: { survol: NonNullable<SurvolCarte> }) {
  return (
    <div
      className="hud pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[160%] border border-[var(--ink-quiet)] bg-[var(--desk)] px-2 py-[3px] font-[var(--font-body)] text-[11.5px] text-[var(--paper)] whitespace-nowrap"
      style={{ left: survol.ecranX, top: survol.ecranY }}
    >
      {survol.nom}
    </div>
  );
}
