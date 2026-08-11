import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { Carte } from '@/carte/Carte';
import { Coque } from '@/coque/Coque';
import { chargerPartie } from '@/donnees/chargerPartie';
import { DockMouvements } from './-plateau/DockMouvements';
import { LegendeEtatsArc } from './-plateau/LegendeEtatsArc';
import { ModaleEnvoi } from './-plateau/ModaleEnvoi';
import { ModaleJournal } from './-plateau/ModaleJournal';
import { PanneauCompteurs } from './-plateau/PanneauCompteurs';
import { PanneauMaNation } from './-plateau/PanneauMaNation';
import { PanneauPaysSelectionne } from './-plateau/PanneauPaysSelectionne';

export type RecherchePlateau = {
  pays?: string;
  vue?: 'mouvements';
  modale?: 'journal' | 'envoi';
};

export const Route = createFileRoute('/plateau')({
  validateSearch: (brut: Record<string, unknown>): RecherchePlateau => {
    const recherche: RecherchePlateau = {};
    if (typeof brut.pays === 'string') recherche.pays = brut.pays;
    if (brut.vue === 'mouvements') recherche.vue = brut.vue;
    if (brut.modale === 'journal' || brut.modale === 'envoi') recherche.modale = brut.modale;
    return recherche;
  },
  loader: chargerPartie,
  pendingComponent: Chargement,
  component: Plateau,
});

function Plateau() {
  const { monde, vue } = Route.useLoaderData();
  const { pays, vue: vueRecherche, modale } = Route.useSearch();
  const naviguer = useNavigate({ from: Route.fullPath });

  const selectionner = useCallback(
    (nom: string | null) => {
      void naviguer({
        search: (precedente) => {
          const { pays: _ecarte, ...reste } = precedente;
          return nom ? { ...reste, pays: nom } : reste;
        },
        replace: true,
      });
    },
    [naviguer],
  );

  const fermerModale = useCallback(() => {
    void naviguer({
      search: ({ modale: _ecartee, ...reste }) => reste,
    });
  }, [naviguer]);

  return (
    <Coque vue={vue}>
      {vueRecherche === 'mouvements' && <DockMouvements vue={vue} />}
      <div className="relative min-w-0 flex-1">
        <Carte monde={monde} arcs={vue.arcs} paysSelectionne={pays ?? null} onSelection={selectionner} />
        <PanneauMaNation vue={vue} />
        {pays && <PanneauPaysSelectionne pays={pays} vue={vue} />}
        <PanneauCompteurs arcs={vue.arcs} />
        <LegendeEtatsArc couverture={vue.couverture} />
      </div>
      {modale === 'journal' && <ModaleJournal vue={vue} onFermer={fermerModale} />}
      {modale === 'envoi' && <ModaleEnvoi vue={vue} monde={monde} pays={pays ?? null} onFermer={fermerModale} />}
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
