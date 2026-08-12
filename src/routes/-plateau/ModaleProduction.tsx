import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useHorloge } from '@/coque/horloge';
import { IconeRessource, couleurRessource, type CleRessource } from '@/emblemes/IconeRessource';
import { SpriteUnite } from '@/emblemes/SpriteUnite';
import { libelleMateriel } from '@/emblemes/unites/materiel';
import type { DomaineUnite, PalierUnite } from '@/domaine/troupes';
import { DOMAINE_PAR_ROLE, FICHE_PAR_ROLE, libellePalier } from '@/domaine/troupes';
import type { RoleUnite } from '@/domaine/vue-joueur';
import { libelleRole, minutesCourantes } from '@/domaine/vue-joueur';
import { enHeuresMinutes } from './duree';
import { Modale, PoigneeModale } from './Modale';

const LOTS: ReadonlyArray<number> = [1, 5, 10, 20];

const TITRE_DOMAINE: Readonly<Record<DomaineUnite, string>> = {
  terre: 'terre',
  air: 'air',
  mer: 'mer',
};

export function ModaleProduction({
  nation,
  jeton,
  onFermer,
}: {
  nation: string;
  jeton: string | null;
  onFermer: () => void;
}) {
  return (
    <Modale nom="production" onFermer={onFermer} alignement="haut" largeur={1100}>
      <div className="trame-papier flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <PoigneeModale className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 bg-[var(--ink)] px-[18px] py-3 text-[var(--paper)]">
          <h2 className="font-[var(--font-display)] text-[clamp(15px,2cqi,18px)] font-extrabold tracking-[.02em]">
            PRODUCTION
          </h2>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onFermer}
            className="cursor-pointer border border-[var(--paper-dim-2)] px-[10px] py-[5px] text-[10px] tracking-[.16em] uppercase hover:border-[var(--paper)]"
          >
            fermer
          </button>
        </PoigneeModale>
        {jeton === null ? (
          <p className="px-4 py-6 text-[13px] text-[var(--ink-soft)]">
            La production demande une saison en cours. Fondez ou rejoignez une partie pour recruter.
          </p>
        ) : (
          <Atelier nation={nation} jeton={jeton} />
        )}
      </div>
    </Modale>
  );
}

function Atelier({ nation, jeton }: { nation: string; jeton: string }) {
  const maintenant = useHorloge();
  const atelier = useQuery(api.unites.atelier, { jeton });
  const recruter = useMutation(api.unites.recruter);
  const annuler = useMutation(api.unites.annuler);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lot, setLot] = useState(1);
  const [paliers, setPaliers] = useState<Partial<Record<RoleUnite, PalierUnite>>>({});

  if (atelier === undefined) {
    return <p className="px-4 py-6 text-[13px] text-[var(--ink-soft)]">Ouverture de l’atelier…</p>;
  }

  const surEchec = (echec: unknown) =>
    setErreur(echec instanceof Error ? echec.message : 'atelier indisponible');

  const enfiler = (role: RoleUnite) => {
    setErreur(null);
    void recruter({ jeton, role, palier: paliers[role] ?? 1, nombre: lot }).catch(surEchec);
  };

  const retirer = (recrutementId: Id<'recrutements'>) => {
    setErreur(null);
    void annuler({ jeton, recrutementId }).catch(surEchec);
  };

  const parDomaine = (domaine: DomaineUnite) =>
    atelier.grille.filter((entree) => DOMAINE_PAR_ROLE[entree.role] === domaine);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BarreRessources atelier={atelier} />

      {erreur && (
        <p className="shrink-0 border-b border-[var(--critique)] px-4 py-[9px] text-[12.5px] text-[var(--critique)]">
          {erreur}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col @4xl:flex-row @4xl:items-stretch">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b border-[rgba(42,33,24,.35)] px-4 py-[9px]">
            <span className="eyebrow">lot</span>
            <div className="flex gap-[3px]">
              {LOTS.map((taille) => (
                <button
                  key={taille}
                  type="button"
                  onClick={() => setLot(taille)}
                  className={`cursor-pointer border border-[var(--ink)] px-[10px] py-[4px] font-[var(--font-mono)] text-[11px] ${
                    lot === taille
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
                  }`}
                >
                  ×{taille}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[11.5px] text-[var(--ink-soft)]">
              chaîne ×{atelier.vitesse.toFixed(2)} — complexe industriel niveau{' '}
              {atelier.niveauIndustrie}
            </span>
          </div>

          <div className="max-h-[520px] min-h-[260px] flex-1 overflow-auto">
            {(['terre', 'air', 'mer'] as const).map((domaine) => (
              <section key={domaine}>
                <div className="sticky top-0 z-10 flex items-center gap-3 border-y border-[rgba(42,33,24,.35)] bg-[var(--paper)] px-4 py-[5px]">
                  <span className="eyebrow">{TITRE_DOMAINE[domaine]}</span>
                  <span className="h-px flex-1 bg-[rgba(42,33,24,.2)]" />
                </div>
                {parDomaine(domaine).map((entree) => (
                  <LigneRole
                    key={entree.role}
                    entree={entree}
                    nation={nation}
                    lot={lot}
                    palier={paliers[entree.role] ?? 1}
                    onPalier={(choisi) =>
                      setPaliers((precedents) => ({ ...precedents, [entree.role]: choisi }))
                    }
                    possede={atelier.effectif.filter((ligne) => ligne.role === entree.role)}
                    palier2Ouvert={atelier.palier2Ouvert}
                    niveauRequis={atelier.niveauIndustrieRequis}
                    onEnfiler={() => enfiler(entree.role)}
                  />
                ))}
              </section>
            ))}
          </div>
        </div>

        <aside className="flex w-full min-w-0 flex-col border-t border-[rgba(42,33,24,.35)] @4xl:w-[330px] @4xl:shrink-0 @4xl:border-t-0 @4xl:border-l">
          <div className="shrink-0 border-b border-[rgba(42,33,24,.35)] px-4 py-[10px]">
            <span className="eyebrow">
              file de production — {atelier.file.length} / {atelier.fileMaximum}
            </span>
          </div>
          <div className="max-h-[460px] flex-1 overflow-auto">
            {atelier.file.length === 0 ? (
              <p className="px-4 py-5 text-[12.5px] text-[var(--ink-soft)]">
                Aucun lot en chaîne. Choisissez un lot et enfilez un rôle.
              </p>
            ) : (
              atelier.file.map((lotEnFile) => (
                <LigneFile
                  key={lotEnFile.id}
                  lot={lotEnFile}
                  nation={nation}
                  chargeeA={maintenant}
                  maintenant={maintenant}
                  onAnnuler={() => retirer(lotEnFile.id)}
                />
              ))
            )}
            <div className="border-t border-[rgba(42,33,24,.35)] px-4 pt-3 pb-5">
              <span className="eyebrow">au réveil</span>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
                La file continue pendant la plage de repos, comme les chantiers. Les unités
                terminées rejoignent l’armée à domicile. Un lot déjà commencé ne s’annule plus ;
                les suivants sont remboursés intégralement.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

type Atelier = NonNullable<ReturnType<typeof useQuery<typeof api.unites.atelier>>>;

function BarreRessources({ atelier }: { atelier: Atelier }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-7 gap-y-2 border-b border-[rgba(42,33,24,.35)] px-4 py-[11px]">
      <Stock
        ressource="acier"
        stock={atelier.acier.stock}
        debitParHeure={atelier.acier.debitParHeure}
        plafond={atelier.acier.plafond}
      />
      <Stock
        ressource="effectifs"
        stock={atelier.effectifs.stock}
        debitParHeure={atelier.effectifs.debitParHeure}
        plafond={atelier.effectifs.plafond}
      />
      <Stock
        ressource="ravitaillement"
        stock={atelier.ravitaillement.stock}
        debitParHeure={atelier.ravitaillement.debitParHeure}
        plafond={atelier.ravitaillement.plafond}
      />
      <span className="ml-auto max-w-[42ch] text-right text-[11.5px] leading-[1.4] text-[var(--ink-soft)] italic">
        Les effectifs ne s’achètent pas : chaque unité produite puise dans la conscription.
      </span>
    </div>
  );
}

function Stock({
  ressource,
  stock,
  debitParHeure,
  plafond,
}: {
  ressource: CleRessource;
  stock: number;
  debitParHeure: number;
  plafond: number | null;
}) {
  return (
    <span className="flex items-baseline gap-[7px]">
      <span className="flex self-center" style={{ color: couleurRessource(ressource, true) }}>
        <IconeRessource ressource={ressource} taille={13} />
      </span>
      <span className="eyebrow">{ressource}</span>
      <span className="font-[var(--font-mono)] text-[15px] text-[var(--ink)]">{stock}</span>
      {plafond === null ? (
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">
          +{debitParHeure}/h
        </span>
      ) : (
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">
          / {plafond} plafond
        </span>
      )}
    </span>
  );
}

type EntreeGrille = Atelier['grille'][number];

function LigneRole({
  entree,
  nation,
  lot,
  palier,
  onPalier,
  possede,
  palier2Ouvert,
  niveauRequis,
  onEnfiler,
}: {
  entree: EntreeGrille;
  nation: string;
  lot: number;
  palier: PalierUnite;
  onPalier: (choisi: PalierUnite) => void;
  possede: ReadonlyArray<{ palier: number; nombre: number }>;
  palier2Ouvert: boolean;
  niveauRequis: number;
  onEnfiler: () => void;
}) {
  const { role, paliers } = entree;
  const cout = palier === 2 && entree.unitairePalier2 ? entree.unitairePalier2 : entree.unitaire;
  const fiche = FICHE_PAR_ROLE[role];
  const materiel = libelleMateriel(nation, role, palier);
  const total = possede.reduce((somme, ligne) => somme + ligne.nombre, 0);

  return (
    <div className="flex items-start gap-4 border-b border-[rgba(42,33,24,.16)] px-4 py-[10px]">
      <div className="relative shrink-0">
        <div className="flex h-[72px] w-[104px] items-end justify-center border border-[rgba(42,33,24,.28)] bg-[rgba(42,33,24,.05)] px-1">
          <SpriteUnite nation={nation} role={role} palier={palier} hauteur={66} largeur={96} />
        </div>
        {paliers === 2 && (
          <div className="absolute top-[3px] left-[3px] flex gap-[2px]">
            {([1, 2] as const).map((niveau) => {
              const verrouille = niveau === 2 && !palier2Ouvert;
              return (
                <button
                  key={niveau}
                  type="button"
                  disabled={verrouille}
                  title={
                    verrouille ? `complexe industriel niveau ${niveauRequis} requis` : `palier ${niveau}`
                  }
                  onClick={() => onPalier(niveau)}
                  className={`cursor-pointer border px-[4px] py-[1px] font-[var(--font-mono)] text-[9px] leading-none disabled:cursor-not-allowed disabled:opacity-35 ${
                    palier === niveau
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]'
                  }`}
                >
                  {libellePalier(niveau)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-[var(--font-display)] text-[15px] font-bold text-[var(--ink)]">
            {libelleRole(role, 1)}
          </span>
          {materiel && <span className="text-[12px] text-[var(--ink-soft)]">— {materiel}</span>}
          <span className="ml-auto font-[var(--font-mono)] text-[14px] text-[var(--ink)]">
            {total}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[2px] text-[var(--ink-soft)]">
          <Depense ressource="acier" valeur={cout.acier} />
          <Depense ressource="effectifs" valeur={cout.effectifs} />
          <span className="font-[var(--font-mono)] text-[11.5px]">
            {enHeuresMinutes(cout.minutes)}
          </span>
          <span className="text-[10px] tracking-[.14em] text-[var(--ink-quiet)] uppercase">
            / unité
          </span>
        </div>

        {fiche.genre === 'combat' ? (
          <div className="text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
            <div>
              fort contre <span className="text-[var(--ink)]">{fiche.fortContre.join(', ')}</span>
            </div>
            <div>
              faible contre{' '}
              <span className="text-[var(--ink)]">{fiche.faibleContre.join(', ')}</span>
            </div>
          </div>
        ) : (
          <p className="text-[11.5px] leading-[1.45] text-[var(--ink-soft)] italic">
            {fiche.apport} Ne combat pas, mais peut se faire détruire ou intercepter.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onEnfiler}
        title={`enfiler ${lot} × ${libelleRole(role, lot)} ${libellePalier(palier)}`}
        className="shrink-0 cursor-pointer self-center border border-[var(--ink)] px-[11px] py-[6px] text-[10px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        + ×{lot}
      </button>
    </div>
  );
}

function LigneFile({
  lot,
  nation,
  chargeeA,
  maintenant,
  onAnnuler,
}: {
  lot: Atelier['file'][number];
  nation: string;
  chargeeA: number;
  maintenant: number;
  onAnnuler: () => void;
}) {
  return (
    <div className="flex items-center gap-[10px] border-b border-[rgba(42,33,24,.16)] px-4 py-[8px]">
      <SpriteUnite
        nation={nation}
        role={lot.role}
        palier={lot.palier === 2 ? 2 : 1}
        hauteur={26}
        largeur={38}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-[var(--ink)]">
          {lot.nombre} × {libelleRole(lot.role, lot.nombre)}{' '}
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">
            {libellePalier(lot.palier === 2 ? 2 : 1)}
          </span>
        </div>
        <div className="text-[10px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
          {lot.commence ? 'en chaîne' : 'en attente'}
        </div>
      </div>
      <span className="shrink-0 font-[var(--font-mono)] text-[12.5px] text-[var(--ink)]">
        {enHeuresMinutes(minutesCourantes(lot.resteMinutes, chargeeA, maintenant))}
      </span>
      <button
        type="button"
        disabled={lot.commence}
        onClick={onAnnuler}
        title={lot.commence ? 'un lot commencé ne s’annule plus' : 'annuler et rembourser'}
        className="shrink-0 cursor-pointer border border-[var(--ink)] px-[7px] py-[3px] text-[9px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--critique)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-30"
      >
        annuler
      </button>
    </div>
  );
}

function Depense({ ressource, valeur }: { ressource: CleRessource; valeur: number }) {
  return (
    <span className="flex items-center gap-[4px]" title={ressource}>
      <span className="flex" style={{ color: couleurRessource(ressource, true) }}>
        <IconeRessource ressource={ressource} taille={11} />
      </span>
      <span className="font-[var(--font-mono)] text-[11.5px]">{valeur}</span>
    </span>
  );
}
