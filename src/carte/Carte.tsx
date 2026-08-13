import { useEffect, useRef, useState } from 'react';
import { chargerRegions, type Monde } from '@/domaine/monde';
import type { EtiquetteCarte } from '@/domaine/etiquettes';
import type { BasculesIndicateurs } from '@/domaine/indicateurs';
import type { ArcAffiche } from '@/domaine/vue-joueur';
import { EchelleTrajet } from './EchelleTrajet';
import { EtiquettesCarte } from './EtiquettesCarte';
import { IndicateursBord } from './IndicateursBord';
import { MoteurCarte, type SurvolCarte } from './moteur';

type Props = {
  monde: Monde;
  arcs: ReadonlyArray<ArcAffiche>;
  etiquettes: ReadonlyArray<EtiquetteCarte>;
  encreParPays: ReadonlyMap<string, string>;
  paysSelectionne: string | null;
  nationJoueur: string | null;
  /** Les catégories dont les entités hors champ se rabattent au bord de l'écran. */
  indicateurs: BasculesIndicateurs;
  /** L'identifiant du mouvement que la frise désigne — l'arc correspondant monte en intensité. */
  mouvementAccentue: string | null;
  onSelection: (nom: string | null) => void;
  onSurvolRegion?: (nom: string | null) => void;
  onSurvolArc?: (id: string | null) => void;
  onSurvolEtiquette?: (id: string | null) => void;
};

export function Carte({
  monde,
  arcs,
  etiquettes,
  encreParPays,
  paysSelectionne,
  nationJoueur,
  indicateurs,
  mouvementAccentue,
  onSelection,
  onSurvolRegion,
  onSurvolArc,
  onSurvolEtiquette,
}: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const moteur = useRef<MoteurCarte | null>(null);
  const [survol, setSurvol] = useState<SurvolCarte>(null);
  // La couche d'étiquettes ne peut se brancher qu'une fois le moteur construit : elle a besoin
  // de l'instance, pas d'une référence qui ne déclenche aucun rendu.
  const [moteurPret, setMoteurPret] = useState<MoteurCarte | null>(null);

  useEffect(() => {
    if (!conteneur.current) return;
    const instance = new MoteurCarte(conteneur.current, monde);
    instance.onSurvol = setSurvol;
    moteur.current = instance;
    setMoteurPret(instance);
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
      setMoteurPret(null);
    };
  }, [monde]);

  useEffect(() => {
    if (moteur.current) moteur.current.onSelection = onSelection;
  }, [onSelection]);

  useEffect(() => {
    if (moteur.current) moteur.current.onSurvolRegion = onSurvolRegion ?? (() => {});
  }, [onSurvolRegion]);

  useEffect(() => {
    if (moteur.current) moteur.current.onSurvolArc = onSurvolArc ?? (() => {});
  }, [onSurvolArc]);

  useEffect(() => {
    moteur.current?.definirNationJoueur(nationJoueur);
  }, [nationJoueur]);

  useEffect(() => {
    moteur.current?.accentuerArc(mouvementAccentue);
  }, [mouvementAccentue]);

  // L'échelle segmentée suit le même pont de surlignage que l'accent du fil : la frise et la
  // carte désignent le même mouvement, il n'y a qu'une source à lire.
  const arcDesigne = arcs.find((arc) => arc.id === mouvementAccentue) ?? null;

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
      <EtiquettesCarte
        etiquettes={etiquettes}
        moteur={moteurPret}
        onSurvolMouvement={onSurvolEtiquette ?? (() => {})}
        onSelection={onSelection}
      />
      <IndicateursBord etiquettes={etiquettes} moteur={moteurPret} bascules={indicateurs} />
      {arcDesigne && (
        <div className="absolute top-4 left-4 z-10">
          <EchelleTrajet arc={arcDesigne} />
        </div>
      )}
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
