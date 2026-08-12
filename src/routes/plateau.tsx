import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { Suspense, lazy, useCallback } from 'react';
import { api } from '../../convex/_generated/api';
import { Carte } from '@/carte/Carte';
import { Coque } from '@/coque/Coque';
import type { Monde } from '@/domaine/monde';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { chargerPartie } from '@/donnees/chargerPartie';
import { adapterVueServeur } from '@/donnees/chargerVueJoueurConvex';
import { clientConvex } from '@/donnees/clientConvex';
import { lireJeton } from '@/donnees/jeton';
import { LegendeEtatsArc } from './-plateau/LegendeEtatsArc';
import { PanneauCompteurs } from './-plateau/PanneauCompteurs';
import { PanneauMaNation } from './-plateau/PanneauMaNation';
import { PanneauPaysSelectionne } from './-plateau/PanneauPaysSelectionne';

const ModaleJournal = lazy(() =>
  import('./-plateau/ModaleJournal').then((module) => ({ default: module.ModaleJournal })),
);
const ModaleTroupes = lazy(() =>
  import('./-plateau/ModaleTroupes').then((module) => ({ default: module.ModaleTroupes })),
);
const ModaleProduction = lazy(() =>
  import('./-plateau/ModaleProduction').then((module) => ({ default: module.ModaleProduction })),
);
const ModaleNation = lazy(() =>
  import('./-plateau/ModaleNation').then((module) => ({ default: module.ModaleNation })),
);
const ModaleReglages = lazy(() =>
  import('./-plateau/ModaleReglages').then((module) => ({ default: module.ModaleReglages })),
);

export type RecherchePlateau = {
  pays?: string;
  modale?: 'journal' | 'troupes' | 'production' | 'nation' | 'reglages';
};

const MODALES = ['journal', 'troupes', 'production', 'nation', 'reglages'] as const;

export const Route = createFileRoute('/plateau')({
  validateSearch: (brut: Record<string, unknown>): RecherchePlateau => {
    const recherche: RecherchePlateau = {};
    if (typeof brut.pays === 'string') recherche.pays = brut.pays;
    if (MODALES.includes(brut.modale as (typeof MODALES)[number])) {
      recherche.modale = brut.modale as (typeof MODALES)[number];
    }
    return recherche;
  },
  loader: chargerPartie,
  pendingComponent: Chargement,
  component: Plateau,
});

function Plateau() {
  const { monde, vue } = Route.useLoaderData();
  const jeton = lireJeton();
  if (clientConvex && jeton) return <PlateauReactif monde={monde} vueInitiale={vue} jeton={jeton} />;
  return <ContenuPlateau monde={monde} vue={vue} jeton={null} />;
}

function PlateauReactif({
  monde,
  vueInitiale,
  jeton,
}: {
  monde: Monde;
  vueInitiale: VueJoueur;
  jeton: string;
}) {
  const serveur = useQuery(api.vue.vueJoueur, { jeton });
  const vue = serveur ? adapterVueServeur(monde, serveur) : vueInitiale;
  return <ContenuPlateau monde={monde} vue={vue} jeton={jeton} />;
}

function ContenuPlateau({ monde, vue, jeton }: { monde: Monde; vue: VueJoueur; jeton: string | null }) {
  const { pays, modale } = Route.useSearch();
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
      <div className="relative min-w-0 flex-1">
        <Carte monde={monde} arcs={vue.arcs} paysSelectionne={pays ?? null} onSelection={selectionner} />
        <PanneauMaNation vue={vue} />
        {pays && <PanneauPaysSelectionne pays={pays} vue={vue} />}
        <PanneauCompteurs arcs={vue.arcs} chargeeA={vue.chargeeA} />
        <LegendeEtatsArc couverture={vue.couverture} />
      </div>
      <Suspense fallback={null}>
        {modale === 'journal' && <ModaleJournal vue={vue} onFermer={fermerModale} />}
        {modale === 'troupes' && (
          <ModaleTroupes vue={vue} monde={monde} pays={pays ?? null} onFermer={fermerModale} />
        )}
        {modale === 'production' && (
          <ModaleProduction nation={vue.moi.nation} jeton={jeton} onFermer={fermerModale} />
        )}
        {modale === 'nation' && <ModaleNation vue={vue} jeton={jeton} onFermer={fermerModale} />}
        {modale === 'reglages' && <ModaleReglages onFermer={fermerModale} />}
      </Suspense>
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
