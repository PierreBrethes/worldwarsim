import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../../convex/_generated/api';
import {
  FiletFort,
  FiletFortInverse,
  Journal,
  useTourDePage,
  type Tournant,
} from '@/coque/Journal';
import { Lancement } from '@/coque/Lancement';
import { libelleDoctrine } from '@/domaine/nations';
import { FiligraneDrapeau } from '@/emblemes/Drapeau';
import { clientConvex } from '@/donnees/clientConvex';
import { garderJeton, lireJeton } from '@/donnees/jeton';

export const Route = createFileRoute('/accueil')({ component: Accueil });

const LARGEUR = 720;

function Accueil() {
  return clientConvex ? <AccueilConnecte /> : <AccueilHorsLigne />;
}

function AccueilHorsLigne() {
  const { tournant } = useTourDePage();
  return (
    <FeuilleAccueil tournant={tournant}>
      <SansBackend />
    </FeuilleAccueil>
  );
}

function FeuilleAccueil({ tournant, children }: { tournant: Tournant; children: ReactNode }) {
  return (
    <Journal largeur={LARGEUR} tournant={tournant}>
      <div className="trame-papier @container relative border border-[var(--ink)] text-[var(--ink)] shadow-[0_20px_46px_rgba(0,0,0,.6),0_2px_0_rgba(0,0,0,.5)]">
        <div className="flex items-baseline justify-between gap-5 px-[30px] pt-[13px] pb-[9px]">
          <span className="eyebrow">édition du jour</span>
          <span className="font-[var(--font-mono)] text-[10.5px] tracking-[.14em] text-[var(--ink-faint)]">
            {dateRomaine(new Date())}
          </span>
          <span className="eyebrow">2 à 8 joueurs — entre amis</span>
        </div>

        <FiletFort />

        <div className="px-[30px] pt-[24px] pb-[18px] text-center">
          <h1 className="font-[var(--font-display)] text-[clamp(34px,7.4cqi,56px)] leading-[.92] font-extrabold tracking-[-.005em]">
            WORLDWARSIM
          </h1>
          <p className="mt-[13px] text-[11.5px] tracking-[.2em] text-[var(--ink-note)] uppercase">
            projeter de la force — l’information est chère, tout engagement est irréversible
          </p>
        </div>

        <FiletFortInverse />

        {children}

        <div
          aria-hidden
          className="pointer-events-none absolute right-[26px] bottom-[46px] rotate-[-9deg] border-2 border-[rgba(157,70,56,.55)] px-3 pt-[6px] pb-[5px] text-center text-[rgba(157,70,56,.62)]"
        >
          <div className="text-[10px] tracking-[.26em] uppercase">état-major</div>
          <div className="mt-px font-[var(--font-mono)] text-[9px] tracking-[.14em]">
            bureau des cartes
          </div>
        </div>
      </div>
    </Journal>
  );
}

function AccueilConnecte() {
  const naviguer = useNavigate();
  const { tournant, tourner } = useTourDePage();
  const fonder = useMutation(api.saisons.fonder);
  const rejoindre = useMutation(api.saisons.rejoindre);
  const [pseudo, setPseudo] = useState('');
  const [code, setCode] = useState('');
  const [duree, setDuree] = useState<48 | 168>(48);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reprise, setReprise] = useState(false);
  const jetonConnu = lireJeton();
  const apercu = useQuery(api.saisons.apercu, jetonConnu ? { jeton: jetonConnu } : 'skip');

  const versSalon = () => tourner(() => void naviguer({ to: '/salon' }));
  const versPlateau = useCallback(() => void naviguer({ to: '/plateau' }), [naviguer]);

  /**
   * Une saison déjà lancée n'a plus de salon à montrer : reprendre, c'est rentrer sur le
   * plateau. La séquence sert alors de sas — elle couvre le chargement de la carte.
   */
  const reprendre = () => {
    if (apercu?.statut === 'lancee') setReprise(true);
    else versSalon();
  };

  const soumettreFondation = async (evenement: FormEvent) => {
    evenement.preventDefault();
    try {
      const { jeton } = await fonder({ pseudo, dureeHeures: duree, compensation: 0.5 });
      garderJeton(jeton);
      versSalon();
    } catch (probleme) {
      setErreur(probleme instanceof Error ? probleme.message : String(probleme));
    }
  };

  const soumettreRejoindre = async (evenement: FormEvent) => {
    evenement.preventDefault();
    try {
      const { jeton } = await rejoindre({ code, pseudo });
      garderJeton(jeton);
      versSalon();
    } catch (probleme) {
      setErreur(probleme instanceof Error ? probleme.message : String(probleme));
    }
  };

  const pseudoPret = pseudo.trim().length > 1;

  return (
    <>
      <FeuilleAccueil tournant={tournant}>
        {apercu && (
          <div className="mx-[30px] mt-[20px]">
            <button
              type="button"
              onClick={reprendre}
              className={`relative flex w-full cursor-pointer items-center gap-4 overflow-hidden bg-[var(--ink)] py-[13px] pr-5 text-left ${
                apercu.nation ? 'pl-[106px]' : 'pl-5'
              }`}
            >
              <FiligraneDrapeau nation={apercu.nation} opacite={0.34} />
              <span
                className="relative flex-1"
                style={{ textShadow: '0 1px 3px rgba(23,18,8,.9)' }}
              >
                <span className="block text-[12px] tracking-[.22em] text-[var(--paper)] uppercase">
                  reprendre la partie en cours
                </span>
                <span className="mt-1 flex flex-wrap gap-x-4 text-[11.5px] text-[var(--paper-dim-2)]">
                  <span>
                    {apercu.nation ?? 'sans nation'}
                    {apercu.doctrine ? ` · doctrine ${libelleDoctrine(apercu.doctrine)}` : ''}
                  </span>
                  <span>
                    {apercu.statut === 'salon' ? `salon ${apercu.code}` : 'saison en cours'} ·{' '}
                    {apercu.regionJouable}
                  </span>
                  <span className="text-[var(--notable)]">{apercu.joueurs} joueurs</span>
                </span>
              </span>
              <span className="relative text-right">
                <span className="eyebrow-sombre block">
                  {apercu.statut === 'salon' ? 'statut' : 'fin dans'}
                </span>
                <span className="block font-[var(--font-mono)] text-[16px] text-[var(--paper)]">
                  {apercu.statut === 'salon'
                    ? 'ouvert'
                    : restant(apercu.lanceeLe, apercu.dureeHeures)}
                </span>
              </span>
            </button>
          </div>
        )}

        <div className="mx-[30px] mt-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">pseudo</span>
            <span className="text-[10.5px] text-[var(--ink-faint)]">
              pas de compte — le pseudo suffit, il meurt avec la saison
            </span>
          </div>
          <input
            value={pseudo}
            onChange={(evenement) => setPseudo(evenement.target.value)}
            className="mt-[6px] w-full border border-[var(--ink)] bg-transparent px-[14px] py-3 text-[17px] text-[var(--ink)] outline-none"
            placeholder="votre nom de guerre"
          />
        </div>

        <div className="mx-[30px] mt-6 flex items-stretch border-t border-[var(--ink)]">
          <form onSubmit={soumettreFondation} className="flex-1 pt-4 pr-[26px] pb-1">
            <Titre numero="I" titre="Fonder une saison" />
            <p className="mt-[5px] text-[11.5px] text-[var(--ink-note)]">
              Vous choisissez la cadence. Un code est tiré, vous le partagez.
            </p>

            <div className="eyebrow mt-[14px]">cadence</div>
            <div className="mt-[6px] flex gap-2">
              {CADENCES.map((cadence) => (
                <button
                  key={cadence.heures}
                  type="button"
                  onClick={() => setDuree(cadence.heures)}
                  className={`flex-1 cursor-pointer border border-[var(--ink)] px-2 py-[9px] text-center ${
                    duree === cadence.heures
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'text-[var(--ink)] hover:bg-[rgba(42,33,24,.08)]'
                  }`}
                >
                  <span className="block text-[12px] tracking-[.16em] uppercase">
                    {cadence.nom}
                  </span>
                  <span className="mt-[3px] block text-[10.5px] opacity-70">{cadence.note}</span>
                </button>
              ))}
            </div>

            <div className="eyebrow mt-[14px]">région — fixée au lancement</div>
            <div className="mt-[6px] flex gap-2">
              {REGIONS.map((region) => (
                <span
                  key={region.nom}
                  className="flex-1 border border-dashed border-[rgba(42,33,24,.4)] px-2 py-[7px] text-center text-[var(--ink-faint)]"
                >
                  <span className="block text-[10.5px] tracking-[.12em] uppercase">
                    {region.nom}
                  </span>
                  <span className="mt-[2px] block font-[var(--font-mono)] text-[10px]">
                    {region.joueurs}
                  </span>
                </span>
              ))}
            </div>

            <Engage actif={pseudoPret} type="submit">
              fonder — obtenir un code
            </Engage>
          </form>

          <div
            aria-hidden
            className="w-px"
            style={{
              background:
                'repeating-linear-gradient(180deg, var(--ink) 0 4px, transparent 4px 9px)',
            }}
          />

          <form onSubmit={soumettreRejoindre} className="flex-1 pt-4 pb-1 pl-[26px]">
            <Titre numero="II" titre="Rejoindre par code" />
            <p className="mt-[5px] text-[11.5px] text-[var(--ink-note)]">
              Six caractères reçus d’un fondateur. La cadence est déjà fixée.
            </p>

            <div className="eyebrow mt-[14px]">code de partie</div>
            <input
              value={code}
              onChange={(evenement) => setCode(evenement.target.value.toUpperCase())}
              maxLength={6}
              className="mt-[6px] w-full border border-[var(--ink)] bg-transparent p-[14px] text-center font-[var(--font-mono)] text-[22px] tracking-[.42em] text-[var(--ink)] uppercase outline-none"
              placeholder="ABC234"
            />
            <p className="mt-2 text-[10.5px] text-[var(--ink-faint)]">
              Le salon reste ouvert tant que le fondateur n’a pas lancé.
            </p>
            <Engage actif={pseudoPret && code.length === 6} type="submit">
              rejoindre le salon
            </Engage>
          </form>
        </div>

        {erreur && (
          <p className="mx-[30px] mt-4 border border-[var(--critique)] px-3 py-2 text-[12.5px]">
            {erreur}
          </p>
        )}

        <div className="mx-[30px] mt-[26px] flex items-center justify-between border-t border-[rgba(42,33,24,.35)] pt-[9px] pb-[14px] text-[10px] tracking-[.16em] text-[var(--ink-faint)] uppercase">
          <span>tour de jeu asynchrone · plage de repos respectée</span>
          <span className="font-[var(--font-mono)] tracking-[.12em]">
            région fixée au lancement
          </span>
        </div>
      </FeuilleAccueil>

      {reprise && apercu && (
        <Lancement
          region={apercu.regionJouable}
          cadence={apercu.dureeHeures === 48 ? '48 heures' : '7 jours'}
          joueurs={apercu.joueurs}
          surFin={versPlateau}
        />
      )}
    </>
  );
}

function Titre({ numero, titre }: { numero: string; titre: string }) {
  return (
    <div className="flex items-baseline gap-[10px]">
      <span className="font-[var(--font-mono)] text-[11px] text-[var(--notable)]">{numero}</span>
      <h2 className="font-[var(--font-display)] text-[21px] font-bold">{titre}</h2>
    </div>
  );
}

function Engage({
  actif,
  type,
  children,
}: {
  actif: boolean;
  type: 'submit' | 'button';
  children: string;
}) {
  return (
    <button
      type={type}
      disabled={!actif}
      className={`mt-[14px] w-full border p-[13px] text-[11px] tracking-[.22em] uppercase ${
        actif
          ? 'cursor-pointer border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--interaction)]'
          : 'cursor-not-allowed border-[rgba(42,33,24,.3)] bg-[rgba(42,33,24,.12)] text-[var(--ink-faint)]'
      }`}
    >
      {children}
    </button>
  );
}

function SansBackend() {
  return (
    <p className="px-[30px] pt-6 pb-4 text-[13.5px] leading-[1.55]">
      Aucun backend configuré (<span className="font-[var(--font-mono)]">VITE_CONVEX_URL</span>{' '}
      absent). Lancez la pile locale avec{' '}
      <span className="font-[var(--font-mono)]">docker compose up</span> — voir{' '}
      <span className="font-[var(--font-mono)]">deploiement/README.md</span>.
    </p>
  );
}

const CADENCES = [
  { heures: 48, nom: '48 heures', note: 'cadence rapide' },
  { heures: 168, nom: '7 jours', note: 'cadence longue' },
] as const satisfies ReadonlyArray<{ heures: 48 | 168; nom: string; note: string }>;

const REGIONS = [
  { nom: 'Europe', joueurs: '2–3' },
  { nom: '+ Méditerranée', joueurs: '4–6' },
  { nom: 'Monde', joueurs: '7–8' },
] as const;

const CHIFFRES_ROMAINS: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

function romain(nombre: number): string {
  return CHIFFRES_ROMAINS.reduce((accumule, [valeur, signe]) => {
    while (nombre >= valeur) {
      accumule += signe;
      nombre -= valeur;
    }
    return accumule;
  }, '');
}

function dateRomaine(date: Date): string {
  return [date.getDate(), date.getMonth() + 1, date.getFullYear()].map(romain).join(' · ');
}

function restant(lanceeLe: number | null, dureeHeures: number): string {
  if (lanceeLe === null) return '—';
  const millisecondes = lanceeLe + dureeHeures * 3_600_000 - Date.now();
  if (millisecondes <= 0) return 'terminée';
  const minutes = Math.floor(millisecondes / 60_000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}
