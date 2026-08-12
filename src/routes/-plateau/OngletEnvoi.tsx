import { useState } from 'react';
import { distanceKm, dureeTrajetMinutes, traverseAntimeridien } from '@/domaine/geo';
import type { Monde } from '@/domaine/monde';
import { dansLaPlage, lirePlage } from '@/domaine/plage-repos';
import { SpriteUnite } from '@/emblemes/SpriteUnite';
import type { Pile, RoleUnite, TypeMouvement, VueJoueur } from '@/domaine/vue-joueur';
import { LIBELLE_TYPE, libelleRole } from '@/domaine/vue-joueur';
import { enHeuresMinutes } from './duree';

type Cap = 'N' | 'E' | 'S' | 'O';

const NOTE_PAR_CAP: Readonly<Record<Cap, string>> = {
  N: 'cap nord — pas de bonus, exposé aux escortes en garnison',
  E: 'cap est — favorise les blindés à la première passe',
  S: 'cap sud — allonge le trajet, réduit le bonus défenseur',
  O: 'cap ouest — favorise l’appui aérien à la première passe',
};

const TYPES: ReadonlyArray<TypeMouvement> = ['attaque', 'raid', 'avantPoste', 'agent', 'leurre'];

export function OngletEnvoi({
  vue,
  monde,
  pays,
  onFermer,
}: {
  vue: VueJoueur;
  monde: Monde;
  pays: string | null;
  onFermer: () => void;
}) {
  const [type, setType] = useState<TypeMouvement>('attaque');
  const [cap, setCap] = useState<Cap>('N');
  const [pile, setPile] = useState<Pile>({});

  const domicile = (Object.entries(vue.moi.armeePresente) as ReadonlyArray<[RoleUnite, number]>).filter(
    ([, stock]) => stock > 0,
  );
  const unitesEngagees = Object.values(pile).reduce((somme, nombre) => somme + nombre, 0);

  const ajuster = (role: RoleUnite, stock: number, delta: number) =>
    setPile((precedente) => ({
      ...precedente,
      [role]: Math.max(0, Math.min(stock, (precedente[role] ?? 0) + delta)),
    }));

  const choisirType = (choisi: TypeMouvement) => {
    setType(choisi);
    if (choisi === 'leurre') setPile({});
  };

  const destination = pays ? (monde.pays.find((candidat) => candidat.nom === pays) ?? null) : null;
  const trajet = destination ? calculerTrajet(vue, destination.lonLat) : null;
  const adversaireCible = pays ? vue.adversaires.find((adversaire) => adversaire.nation === pays) : undefined;
  const reposCible = trajet && adversaireCible ? avertissementRepos(adversaireCible.plageRepos, trajet.arriveeMinutesDepuisMinuit) : null;

  const slotsDisponibles = vue.moi.slots.total - vue.moi.slots.utilises;
  const envoiPossible =
    destination !== null && slotsDisponibles > 0 && (unitesEngagees > 0 || type === 'leurre' || type === 'agent');

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-[14px] gap-y-1 border-b border-[rgba(42,33,24,.35)] px-4 py-[9px]">
        <span className="eyebrow">envoi d’un mouvement</span>
        <span className="text-[11.5px] text-[var(--ink-soft)]">
          {slotsDisponibles > 0
            ? `coût 1 slot — ${slotsDisponibles - 1} disponible${slotsDisponibles - 1 > 1 ? 's' : ''} après envoi`
            : 'aucun slot disponible'}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto @3xl:flex-row @3xl:items-stretch">
        <div className="w-full border-b border-[rgba(42,33,24,.35)] p-[14px] @3xl:w-[224px] @3xl:shrink-0 @3xl:border-r @3xl:border-b-0">
          <div className="eyebrow mb-[9px]">type</div>
          <div className="flex flex-wrap gap-[5px] @3xl:flex-col">
            {TYPES.map((candidat) => (
              <button
                key={candidat}
                type="button"
                onClick={() => choisirType(candidat)}
                className={`cursor-pointer border border-[var(--ink)] px-[6px] py-2 text-left text-[11px] tracking-[.1em] uppercase ${
                  type === candidat
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
                }`}
              >
                {LIBELLE_TYPE[candidat]}
              </button>
            ))}
          </div>
          <p className="mt-[14px] text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
            Le leurre part avec zéro unité. Il est indiscernable d’un mouvement réel côté adverse.
          </p>
        </div>

        <div className="min-w-0 flex-1 border-b border-[rgba(42,33,24,.35)] px-4 py-[14px] @3xl:border-r @3xl:border-b-0">
          <div className="mb-[9px] flex items-baseline justify-between">
            <span className="eyebrow">composition de la pile</span>
            <span className="text-[11.5px] text-[var(--ink-soft)]">reste à domicile après envoi</span>
          </div>
          <div className="flex flex-col gap-1">
            {domicile.map(([role, stock]) => {
              const engage = pile[role] ?? 0;
              return (
                <div key={role} className="flex items-center gap-[10px] border-b border-[rgba(42,33,24,.14)] py-[4px]">
                  <SpriteUnite nation={vue.moi.nation} role={role} hauteur={26} largeur={38} />
                  <span className="flex-1 text-[13.5px] text-[var(--ink)]">{libelleRole(role, 2)}</span>
                  <Pas signe="–" desactive={type === 'leurre'} onClick={() => ajuster(role, stock, -1)} />
                  <span className="w-[30px] text-center font-[var(--font-mono)] text-[14px] text-[var(--ink)]">
                    {engage}
                  </span>
                  <Pas signe="+" desactive={type === 'leurre'} onClick={() => ajuster(role, stock, 1)} />
                  <span className="w-[112px] text-right text-[12px] text-[var(--ink-soft)]">
                    {stock - engage} / {stock} à domicile
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-[10px] text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
            Les forces en transit ne défendent plus le territoire national.
          </p>

          <div className="eyebrow mt-4 mb-2">cap d’arrivée</div>
          <div className="flex gap-[5px]">
            {(Object.keys(NOTE_PAR_CAP) as ReadonlyArray<Cap>).map((candidat) => (
              <button
                key={candidat}
                type="button"
                onClick={() => setCap(candidat)}
                className={`flex-1 cursor-pointer border border-[var(--ink)] px-1 py-[9px] text-[12px] ${
                  cap === candidat
                    ? 'bg-[var(--interaction)] text-[var(--paper)]'
                    : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
                }`}
              >
                cap {candidat}
              </button>
            ))}
          </div>
          <p className="mt-[7px] text-[11.5px] text-[var(--ink-soft)]">{NOTE_PAR_CAP[cap]}</p>
        </div>

        <div className="flex w-full flex-col px-4 py-[14px] @3xl:w-[292px] @3xl:shrink-0">
          <div className="eyebrow mb-[9px]">destination</div>
          {destination ? (
            <>
              <h3 className="font-[var(--font-display)] text-[21px] font-extrabold text-[var(--ink)] uppercase">
                {destination.nom}
              </h3>
              {adversaireCible && (
                <p className="mt-[2px] text-[12px] text-[var(--ink-soft)]">nation adverse — {adversaireCible.pouvoir}</p>
              )}
            </>
          ) : (
            <p className="text-[13px] leading-[1.5] text-[var(--ink-soft)]">
              Sélectionner un pays sur le plateau pour fixer la destination.
            </p>
          )}

          {trajet && (
            <div className="mt-[14px] flex flex-col gap-[7px] border-t border-[rgba(42,33,24,.3)] pt-3 text-[13px]">
              <span className="flex justify-between">
                <span className="text-[var(--ink-soft)]">durée estimée</span>
                <span className="font-[var(--font-mono)] text-[var(--ink)]">{enHeuresMinutes(trajet.dureeMinutes)}</span>
              </span>
              <span className="flex justify-between">
                <span className="text-[var(--ink-soft)]">arrivée</span>
                <span className="font-[var(--font-mono)] text-[var(--ink)]">{trajet.arriveeAffichee}</span>
              </span>
              <span className="flex justify-between">
                <span className="text-[var(--ink-soft)]">antiméridien</span>
                <span className="text-[var(--ink)]">{trajet.traverse ? 'traversé' : 'non traversé'}</span>
              </span>
              <span className="flex justify-between">
                <span className="text-[var(--ink-soft)]">coût</span>
                <span className="text-[var(--ink)]">1 slot</span>
              </span>
            </div>
          )}

          {reposCible && (
            <div className="mt-[14px] border border-[var(--critique)] px-[11px] py-[10px]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2" style={{ background: 'var(--critique)' }} />
                <span className="text-[10px] font-bold tracking-[.16em] text-[var(--ink)] uppercase">
                  plage de repos de la cible
                </span>
              </div>
              <p className="mt-[5px] text-[12.5px] leading-[1.45] text-[var(--ink)]">
                L’arrivée tombe dans la plage publique ({adversaireCible?.plageRepos}). Le mouvement sera
                immobilisé à la frontière jusqu’à la fin de la plage.
              </p>
            </div>
          )}

          <div className="flex-1" />
          <div className="mt-[14px] flex gap-[7px]">
            <button
              type="button"
              onClick={onFermer}
              className="w-24 shrink-0 cursor-pointer border border-[var(--ink)] py-[11px] text-[10px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              annuler
            </button>
            <button
              type="button"
              disabled={!envoiPossible}
              onClick={onFermer}
              className="flex-1 cursor-pointer bg-[var(--ink)] py-[11px] text-[10px] tracking-[.2em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              envoyer — irréversible
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Pas({ signe, desactive, onClick }: { signe: string; desactive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={desactive}
      onClick={onClick}
      className="h-6 w-6 cursor-pointer border border-[var(--ink)] text-[14px] leading-none text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {signe}
    </button>
  );
}

function calculerTrajet(vue: VueJoueur, versLonLat: Monde['pays'][number]['lonLat']) {
  const km = distanceKm(vue.moi.positionDomicile, versLonLat);
  const niveauLogistique = vue.moi.batiments.find((batiment) => batiment.cle === 'logistique')?.niveau ?? 1;
  const dureeMinutes = dureeTrajetMinutes(km, {
    minutesPar1000km: vue.saison.trajetMinutesPar1000km,
    niveauLogistique,
  });
  const arrivee = new Date(Date.now() + dureeMinutes * 60_000);
  return {
    dureeMinutes,
    traverse: traverseAntimeridien(vue.moi.positionDomicile, versLonLat),
    arriveeAffichee: arrivee.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    arriveeMinutesDepuisMinuit: arrivee.getHours() * 60 + arrivee.getMinutes(),
  };
}

function avertissementRepos(plageDeclaree: string, arriveeMinutesDepuisMinuit: number): boolean | null {
  const plage = lirePlage(plageDeclaree);
  if (!plage) return null;
  return dansLaPlage(arriveeMinutesDepuisMinuit, plage) ? true : null;
}
