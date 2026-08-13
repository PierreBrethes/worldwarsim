import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { Carte } from '@/carte/Carte';
import { Coque } from '@/coque/Coque';
import { encreParPaysPris } from '@/domaine/nations';
import type { Monde } from '@/domaine/monde';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { chargerPartie } from '@/donnees/chargerPartie';
import { adapterVueServeur } from '@/donnees/chargerVueJoueurConvex';
import { ETAT_FACTICE, appliquerEtatFactice, marqueursFactices } from '@/donnees/etat-factice';
import { FriseMouvements } from './-plateau/FriseMouvements';
import { InfoBulleRegion } from './-plateau/InfoBulleRegion';
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

const MODALES = ['journal', 'troupes', 'production', 'nation', 'reglages'] as const;

export type Modale = (typeof MODALES)[number];

/** L'ordre du tableau est l'ordre d'empilement : la dernière entrée est au premier plan. */
export type RecherchePlateau = {
  pays?: string;
  modales?: Modale[];
};

export function avecModale(recherche: RecherchePlateau, nom: Modale): RecherchePlateau {
  const autres = (recherche.modales ?? []).filter((ouverte) => ouverte !== nom);
  return { ...recherche, modales: [...autres, nom] };
}

export function sansModale(recherche: RecherchePlateau, nom: Modale): RecherchePlateau {
  const { modales, ...reste } = recherche;
  const restantes = (modales ?? []).filter((ouverte) => ouverte !== nom);
  return restantes.length ? { ...reste, modales: restantes } : reste;
}

export const basculerModale = (recherche: RecherchePlateau, nom: Modale): RecherchePlateau =>
  (recherche.modales ?? []).includes(nom) ? sansModale(recherche, nom) : avecModale(recherche, nom);

export const modaleOuverte = (recherche: RecherchePlateau, nom: Modale): boolean =>
  (recherche.modales ?? []).includes(nom);

// `modale=journal` était le paramètre d'avant l'empilement : un vieux lien reste ouvrable.
function lireModales(brut: Record<string, unknown>): Modale[] {
  const demandees = Array.isArray(brut.modales) ? brut.modales : [brut.modales ?? brut.modale];
  return demandees
    .filter((valeur): valeur is Modale => MODALES.includes(valeur as Modale))
    .filter((nom, rang, toutes) => toutes.indexOf(nom) === rang);
}

export const Route = createFileRoute('/plateau')({
  validateSearch: (brut: Record<string, unknown>): RecherchePlateau => {
    const recherche: RecherchePlateau = {};
    if (typeof brut.pays === 'string') recherche.pays = brut.pays;
    const modales = lireModales(brut);
    if (modales.length) recherche.modales = modales;
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
  const vueServie = serveur ? adapterVueServeur(monde, serveur) : vueInitiale;
  const vue = ETAT_FACTICE ? appliquerEtatFactice(vueServie) : vueServie;
  return <ContenuPlateau monde={monde} vue={vue} jeton={jeton} />;
}

function ContenuPlateau({ monde, vue, jeton }: { monde: Monde; vue: VueJoueur; jeton: string }) {
  const { pays, modales = [] } = Route.useSearch();
  const naviguer = useNavigate({ from: Route.fullPath });
  const [regionSurvolee, setRegionSurvolee] = useState<string | null>(null);
  // Deux sources pour un seul accent : quand le pointeur quitte la carte pour entrer dans une
  // fiche, la boucle de rendu annonce « plus rien sous le pointeur » à l'image d'après. Une
  // seule variable et cet écho effacerait le survol que la fiche vient d'allumer.
  const [arcSurvole, setArcSurvole] = useState<string | null>(null);
  const [ficheSurvolee, setFicheSurvolee] = useState<string | null>(null);
  const mouvementSurvole = ficheSurvolee ?? arcSurvole;

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

  const marqueurs = useMemo(() => (ETAT_FACTICE ? marqueursFactices(vue) : []), [vue]);

  const fermerModale = useCallback(
    (nom: Modale) => {
      void naviguer({ search: (precedente) => sansModale(precedente, nom) });
    },
    [naviguer],
  );

  const mettreEnAvant = useCallback(
    (nom: Modale) => {
      void naviguer({ search: (precedente) => avecModale(precedente, nom), replace: true });
    },
    [naviguer],
  );

  // L'édition du réveil : s'il y a du critique non lu, le journal est déjà posé
  // sur le bureau en arrivant. Une seule fois par arrivée, et jamais par-dessus
  // un lien profond qui demande une autre surface.
  const editionServie = useRef(false);
  useEffect(() => {
    if (editionServie.current) return;
    editionServie.current = true;
    if (modales.length) return;
    if (!vue.journal.some((depeche) => depeche.gravite === 'critique')) return;
    void naviguer({
      search: (precedente) => avecModale(precedente, 'journal'),
      replace: true,
    });
  }, [modales, vue.journal, naviguer]);

  return (
    <Coque vue={vue}>
      <div className="relative min-w-0 flex-1">
        <Carte
          monde={monde}
          arcs={vue.arcs}
          marqueurs={marqueurs}
          chargeeA={vue.chargeeA}
          encreParPays={encreParPays}
          paysSelectionne={pays ?? null}
          nationJoueur={vue.moi.nation}
          mouvementAccentue={mouvementSurvole}
          onSelection={selectionner}
          onSurvolRegion={setRegionSurvolee}
          onSurvolArc={setArcSurvole}
        />
        {pays && <PanneauPaysSelectionne pays={pays} vue={vue} />}
        <FriseMouvements
          vue={vue}
          mouvementSurvole={mouvementSurvole}
          mouvementDesigneParLaCarte={ficheSurvolee ? null : arcSurvole}
          onSurvol={setFicheSurvolee}
          onSelection={selectionner}
        />
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-3">
          {regionSurvolee && <InfoBulleRegion nom={regionSurvolee} />}
        </div>
      </div>
      <Suspense fallback={null}>
        {modales.map((nom, rang) => {
          const fenetre = {
            rang,
            auPremierPlan: rang === modales.length - 1,
            surMiseEnAvant: () => mettreEnAvant(nom),
            onFermer: () => fermerModale(nom),
          };
          switch (nom) {
            case 'journal':
              return <ModaleJournal key={nom} vue={vue} {...fenetre} />;
            case 'troupes':
              return (
                <ModaleTroupes
                  key={nom}
                  vue={vue}
                  monde={monde}
                  pays={pays ?? null}
                  {...fenetre}
                />
              );
            case 'production':
              return (
                <ModaleProduction key={nom} nation={vue.moi.nation} jeton={jeton} {...fenetre} />
              );
            case 'nation':
              return <ModaleNation key={nom} vue={vue} jeton={jeton} {...fenetre} />;
            case 'reglages':
              return <ModaleReglages key={nom} {...fenetre} />;
          }
        })}
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
