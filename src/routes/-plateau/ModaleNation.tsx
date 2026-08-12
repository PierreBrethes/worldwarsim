import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { useHorloge } from '@/coque/horloge';
import { lirePlage } from '@/domaine/plage-repos';
import type { Batiment, VueJoueur } from '@/domaine/vue-joueur';
import { libellePile, minutesCourantes, stockCourant } from '@/domaine/vue-joueur';
import { Drapeau } from '@/emblemes/Drapeau';
import { IconeRessource, couleurRessource } from '@/emblemes/IconeRessource';
import { enHeuresMinutes } from './duree';
import { Modale, PoigneeModale } from './Modale';

const EFFET_PAR_BATIMENT: Readonly<Record<Batiment['cle'], string>> = {
  qg: 'débloque les paliers et relève les plafonds de stockage',
  industrie: 'vitesse et rendement de la conversion acier → unités',
  logistique: 'réduit le temps de trajet et fixe le nombre de slots',
  conscription: 'régénération et plafond des effectifs',
  ecoute: 'rayon de révélation passif autour du territoire',
};

export function ModaleNation({
  vue,
  jeton,
  onFermer,
}: {
  vue: VueJoueur;
  jeton: string | null;
  onFermer: () => void;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const maintenant = useHorloge();

  return (
    <Modale nom="nation" onFermer={onFermer} alignement="haut" largeur={880}>
      <div className="trame-papier flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)] px-[26px] pt-[18px] pb-6">
        <PoigneeModale className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>fiche de nation</span>
          <span>saison {vue.saison.numero}</span>
          <button
            type="button"
            onClick={onFermer}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            fermer
          </button>
        </PoigneeModale>

        <div className="mt-2 flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 border-t-2 border-b border-[var(--ink)] py-3">
          <span className="self-center">
            <Drapeau nation={vue.moi.nation} largeur={36} surPapier />
          </span>
          <h1 className="font-[var(--font-display)] text-[clamp(22px,4cqi,34px)] leading-none font-extrabold tracking-[.02em] text-[var(--ink)] uppercase">
            {vue.moi.nation}
          </h1>
          <span className="text-[11px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            doctrine {vue.moi.doctrine}
          </span>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-5 overflow-auto @2xl:flex-row @2xl:items-start @2xl:gap-[26px]">
          <section className="min-w-0 flex-1">
            <h2 className="eyebrow border-b border-[var(--ink)] pb-[6px]">
              bâtiments — un chantier à la fois
            </h2>
            {vue.moi.batiments.map((batiment) => (
              <LigneBatiment
                key={batiment.cle}
                batiment={batiment}
                chantier={vue.moi.chantier}
                jeton={jeton}
                surErreur={setErreur}
              />
            ))}
            {vue.moi.chantier && (
              <p className="mt-3 border border-[var(--ink)] px-3 py-2 text-[12.5px] text-[var(--ink)]">
                Chantier en cours : <strong>{vue.moi.chantier.nom}</strong> — reste{' '}
                <span className="font-[var(--font-mono)]">
                  {enHeuresMinutes(minutesCourantes(vue.moi.chantier.resteMinutes, vue.chargeeA, maintenant))}
                </span>
              </p>
            )}
            {erreur && (
              <p className="mt-3 border border-[var(--critique)] px-3 py-2 text-[12.5px] text-[var(--ink)]">
                {erreur}
              </p>
            )}
            {jeton === null && (
              <p className="mt-3 text-[11.5px] text-[var(--ink-soft)] italic">
                Démonstration sur fixture — fondez une saison pour construire réellement.
              </p>
            )}
          </section>

          <aside className="w-full @2xl:w-[280px] @2xl:shrink-0">
            <h2 className="eyebrow border-b border-[var(--ink)] pb-[6px]">pouvoir national</h2>
            <p className="mt-2 text-[13px] leading-[1.5] text-[var(--ink)]">{vue.moi.pouvoir}</p>

            <h2 className="eyebrow mt-5 border-b border-[var(--ink)] pb-[6px]">armée</h2>
            <div className="mt-2 flex flex-col gap-[5px] text-[12.5px]">
              <span className="flex justify-between gap-3">
                <span className="text-[var(--ink-soft)]">présente</span>
                <span className="text-right text-[var(--ink)]">{libellePile(vue.moi.armeePresente)}</span>
              </span>
              <span className="flex justify-between gap-3">
                <span className="text-[var(--ink-soft)]">en transit</span>
                <span className="text-right text-[var(--ink)]">{libellePile(vue.moi.armeeEnTransit)}</span>
              </span>
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-[6px]">
                  <span className="flex" style={{ color: couleurRessource('effectifs', true) }}>
                    <IconeRessource ressource="effectifs" />
                  </span>
                  <span className="text-[var(--ink-soft)]">effectifs</span>
                </span>
                <span className="font-[var(--font-mono)] text-[var(--ink)]">
                  {stockCourant(vue.moi.effectifs, vue.chargeeA, maintenant)}
                  {vue.moi.effectifs.plafond !== undefined && ` / ${vue.moi.effectifs.plafond} plafond`}
                </span>
              </span>
            </div>

            <h2 className="eyebrow mt-5 border-b border-[var(--ink)] pb-[6px]">plage de repos déclarée</h2>
            <p className="mt-2 text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
              Publique : vos adversaires la voient. Un mouvement qui arriverait pendant est immobilisé
              à la frontière jusqu’à sa fin.
            </p>
            {jeton === null ? (
              <p className="mt-2 font-[var(--font-mono)] text-[14px] text-[var(--ink)]">{vue.moi.plageRepos}</p>
            ) : (
              <FormulairePlage jeton={jeton} plageAffichee={vue.moi.plageRepos} surErreur={setErreur} />
            )}
          </aside>
        </div>
      </div>
    </Modale>
  );
}

function LigneBatiment({
  batiment,
  chantier,
  jeton,
  surErreur,
}: {
  batiment: Batiment;
  chantier: VueJoueur['moi']['chantier'];
  jeton: string | null;
  surErreur: (message: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[rgba(42,33,24,.16)] py-[9px]">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-semibold text-[var(--ink)]">{batiment.nom}</span>
          <span className="font-[var(--font-mono)] text-[12px] text-[var(--ink-soft)]">niv. {batiment.niveau}</span>
          {batiment.plafonneParQg && (
            <span className="text-[10px] tracking-[.12em] text-[var(--critique)] uppercase">plafonné par le QG</span>
          )}
        </div>
        <p className="text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">{EFFET_PAR_BATIMENT[batiment.cle]}</p>
      </div>
      <div className="shrink-0 text-right text-[11.5px] text-[var(--ink-soft)]">
        <div className="flex items-center justify-end gap-[6px] font-[var(--font-mono)] text-[14px] font-medium text-[var(--ink)]">
          <span className="flex" style={{ color: couleurRessource('ravitaillement', true) }}>
            <IconeRessource ressource="ravitaillement" taille={14} />
          </span>
          {batiment.coutNiveauSuivant}
        </div>
        <div className="font-[var(--font-mono)]">{enHeuresMinutes(batiment.dureeNiveauSuivantMinutes)}</div>
      </div>
      {jeton !== null ? (
        <BoutonChantier batiment={batiment} chantier={chantier} jeton={jeton} surErreur={surErreur} />
      ) : (
        <button type="button" disabled title="démonstration — fondez une saison pour construire" className={STYLE_BOUTON_CHANTIER}>
          chantier
        </button>
      )}
    </div>
  );
}

const STYLE_BOUTON_CHANTIER =
  'shrink-0 cursor-pointer border border-[var(--ink)] px-3 py-[7px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-35';

function BoutonChantier({
  batiment,
  chantier,
  jeton,
  surErreur,
}: {
  batiment: Batiment;
  chantier: VueJoueur['moi']['chantier'];
  jeton: string;
  surErreur: (message: string | null) => void;
}) {
  const lancer = useMutation(api.chantiers.lancer);
  const bloque = chantier !== null || batiment.plafonneParQg;
  return (
    <button
      type="button"
      disabled={bloque}
      title={
        chantier
          ? 'un chantier est déjà en cours'
          : batiment.plafonneParQg
            ? 'montez le quartier général d’abord'
            : `passer ${batiment.nom} au niveau ${batiment.niveau + 1}`
      }
      onClick={() => {
        surErreur(null);
        lancer({ jeton, batiment: batiment.cle }).catch((probleme: unknown) =>
          surErreur(probleme instanceof Error ? probleme.message : String(probleme)),
        );
      }}
      className={STYLE_BOUTON_CHANTIER}
    >
      chantier
    </button>
  );
}

function FormulairePlage({
  jeton,
  plageAffichee,
  surErreur,
}: {
  jeton: string;
  plageAffichee: string;
  surErreur: (message: string | null) => void;
}) {
  const regler = useMutation(api.joueurs.reglerPlageRepos);
  const plage = lirePlage(plageAffichee);
  const [debut, setDebut] = useState(plage ? enHeureHtml(plage.debutMinutes) : '23:00');
  const [fin, setFin] = useState(plage ? enHeureHtml(plage.finMinutes) : '07:00');
  const [enregistree, setEnregistree] = useState(false);

  return (
    <div className="mt-2 flex items-center gap-2">
      <ChampHeure valeur={debut} onChange={(valeur) => { setDebut(valeur); setEnregistree(false); }} />
      <span className="text-[12px] text-[var(--ink-soft)]">→</span>
      <ChampHeure valeur={fin} onChange={(valeur) => { setFin(valeur); setEnregistree(false); }} />
      <button
        type="button"
        onClick={() => {
          surErreur(null);
          regler({ jeton, debutMinutes: enMinutes(debut), finMinutes: enMinutes(fin) })
            .then(() => setEnregistree(true))
            .catch((probleme: unknown) =>
              surErreur(probleme instanceof Error ? probleme.message : String(probleme)),
            );
        }}
        className="cursor-pointer border border-[var(--ink)] px-2 py-[6px] text-[9px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        {enregistree ? 'enregistrée ✓' : 'déclarer'}
      </button>
    </div>
  );
}

function ChampHeure({ valeur, onChange }: { valeur: string; onChange: (valeur: string) => void }) {
  return (
    <input
      type="time"
      value={valeur}
      onChange={(evenement) => onChange(evenement.target.value)}
      className="border border-[var(--ink)] bg-transparent px-2 py-[5px] font-[var(--font-mono)] text-[13px] text-[var(--ink)] outline-none"
    />
  );
}

const enHeureHtml = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const enMinutes = (heure: string) => {
  const [heures = '0', minutes = '0'] = heure.split(':');
  return Number(heures) * 60 + Number(minutes);
};
