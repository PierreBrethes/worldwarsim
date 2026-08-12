import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { Carte } from '@/carte/Carte';
import { Coque } from '@/coque/Coque';
import { encreParPaysPris } from '@/domaine/nations';
import type { Monde } from '@/domaine/monde';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { chargerPartie } from '@/donnees/chargerPartie';
import { adapterVueServeur } from '@/donnees/chargerVueJoueurConvex';
import { InfoBulleRegion } from './-plateau/InfoBulleRegion';
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
  const partie = Route.useLoaderData();
  if (partie.etat === 'aucune') return <AucunePartie />;
  return <PlateauReactif monde={partie.monde} vueInitiale={partie.vue} jeton={partie.jeton} />;
}

function AucunePartie() {
  const naviguer = useNavigate();
  return (
    <div className="flex h-full items-center justify-center bg-[var(--desk)] px-6">
      <div className="hud trame-papier w-[520px] max-w-full border border-[var(--ink)] px-[30px] pt-[22px] pb-6 text-center">
        <p className="text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">plateau indisponible</p>
        <h1 className="mt-3 border-t-2 border-b border-[var(--ink)] py-3 font-[var(--font-display)] text-[26px] leading-none font-extrabold tracking-[.03em] text-[var(--ink)] uppercase">
          aucune partie en cours
        </h1>
        <p className="mt-4 text-[13px] leading-[1.55] text-[var(--ink)]">
          Le plateau ne s’ouvre qu’avec une saison rejointe. Fondez-en une ou entrez le code d’une
          partie existante.
        </p>
        <button
          type="button"
          onClick={() => void naviguer({ to: '/accueil' })}
          className="mt-5 w-full cursor-pointer border border-[var(--ink)] py-[10px] text-[10px] tracking-[.2em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          retour à l’accueil
        </button>
      </div>
    </div>
  );
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

function ContenuPlateau({ monde, vue, jeton }: { monde: Monde; vue: VueJoueur; jeton: string }) {
  const { pays, modale } = Route.useSearch();
  const naviguer = useNavigate({ from: Route.fullPath });
  const [regionSurvolee, setRegionSurvolee] = useState<string | null>(null);

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

  const encreParPays = useMemo(
    () => encreParPaysPris([vue.moi, ...vue.adversaires]),
    [vue.moi, vue.adversaires],
  );

  const fermerModale = useCallback(() => {
    void naviguer({
      search: ({ modale: _ecartee, ...reste }) => reste,
    });
  }, [naviguer]);

  return (
    <Coque vue={vue}>
      <div className="relative min-w-0 flex-1">
        <Carte
          monde={monde}
          arcs={vue.arcs}
          encreParPays={encreParPays}
          paysSelectionne={pays ?? null}
          nationJoueur={vue.moi.nation}
          onSelection={selectionner}
          onSurvolRegion={setRegionSurvolee}
        />
        <PanneauMaNation vue={vue} />
        {pays && <PanneauPaysSelectionne pays={pays} vue={vue} />}
        <PanneauCompteurs arcs={vue.arcs} chargeeA={vue.chargeeA} />
        <div className="absolute right-4 bottom-[26px] z-10 flex flex-col items-end gap-3">
          {regionSurvolee && <InfoBulleRegion nom={regionSurvolee} />}
          <LegendeEtatsArc couverture={vue.couverture} />
        </div>
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
      {/* le rideau prolonge le noir du lancement jusqu'à la première image de la carte */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 bg-[var(--desk)]"
        style={{ animation: 'lever-de-rideau .9s ease forwards' }}
      />
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
