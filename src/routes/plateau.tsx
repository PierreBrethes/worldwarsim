import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { Carte } from '@/carte/Carte';
import { Coque } from '@/coque/Coque';
import { chargerPartie } from '@/donnees/chargerPartie';
import { LegendeEtatsArc } from './-plateau/LegendeEtatsArc';
import { PanneauCompteurs } from './-plateau/PanneauCompteurs';
import { PanneauMaNation } from './-plateau/PanneauMaNation';
import { PanneauPaysSelectionne } from './-plateau/PanneauPaysSelectionne';

type RecherchePlateau = { pays?: string };

export const Route = createFileRoute('/plateau')({
  validateSearch: (recherche: Record<string, unknown>): RecherchePlateau =>
    typeof recherche.pays === 'string' ? { pays: recherche.pays } : {},
  loader: chargerPartie,
  pendingComponent: Chargement,
  component: Plateau,
});

function Plateau() {
  const { monde, vue } = Route.useLoaderData();
  const { pays } = Route.useSearch();
  const naviguer = useNavigate({ from: Route.fullPath });

  const selectionner = useCallback(
    (nom: string | null) => {
      void naviguer({ search: nom ? { pays: nom } : {}, replace: true });
    },
    [naviguer],
  );

  return (
    <Coque vue={vue}>
      <Carte monde={monde} arcs={vue.arcs} paysSelectionne={pays ?? null} onSelection={selectionner} />
      <PanneauMaNation vue={vue} />
      {pays && <PanneauPaysSelectionne pays={pays} vue={vue} />}
      <PanneauCompteurs arcs={vue.arcs} />
      <LegendeEtatsArc couverture={vue.couverture} />
    </Coque>
  );
}

function Chargement() {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--desk)]">
      <span className="eyebrow-sombre">Préparation du plateau…</span>
    </div>
  );
}
