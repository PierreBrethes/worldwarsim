import { useMemo, useState } from 'react';
import { useHorloge } from '@/coque/horloge';
import { SpriteUnite } from '@/emblemes/SpriteUnite';
import type { Monde } from '@/domaine/monde';
import type {
  DomaineUnite,
  FiltreTroupes,
  LigneTroupes,
  TriTroupes,
} from '@/domaine/troupes';
import { compterTroupes, inventorierTroupes, organiserTroupes } from '@/domaine/troupes';
import type { ArcAffiche, Pile, RoleUnite, VueJoueur } from '@/domaine/vue-joueur';
import { LIBELLE_TYPE, libellePile, libelleRole, minutesCourantes } from '@/domaine/vue-joueur';
import { enHeuresMinutes } from './duree';
import { Modale, PoigneeModale } from './Modale';
import { OngletEnvoi } from './OngletEnvoi';

type Onglet = 'inventaire' | 'envoi';

const SITUATIONS: ReadonlyArray<{ cle: FiltreTroupes['situation']; libelle: string }> = [
  { cle: 'toutes', libelle: 'toutes' },
  { cle: 'domicile', libelle: 'à domicile' },
  { cle: 'mouvement', libelle: 'en mouvement' },
  { cle: 'garnison', libelle: 'en garnison' },
];

const DOMAINES: ReadonlyArray<{ cle: DomaineUnite | 'tous'; libelle: string }> = [
  { cle: 'tous', libelle: 'tous' },
  { cle: 'terre', libelle: 'terre' },
  { cle: 'air', libelle: 'air' },
  { cle: 'mer', libelle: 'mer' },
];

const TRIS: ReadonlyArray<{ cle: TriTroupes; libelle: string }> = [
  { cle: 'role', libelle: 'rôle' },
  { cle: 'nombre', libelle: 'nombre' },
  { cle: 'echeance', libelle: 'échéance' },
];

export function ModaleTroupes({
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
  const [onglet, setOnglet] = useState<Onglet>('inventaire');

  return (
    <Modale nom="troupes" onFermer={onFermer} alignement="haut" largeur={1040}>
      <div className="trame-papier flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <EnTete onglet={onglet} onOnglet={setOnglet} vue={vue} onFermer={onFermer} />
        {onglet === 'inventaire' ? (
          <Inventaire vue={vue} />
        ) : (
          <OngletEnvoi vue={vue} monde={monde} pays={pays} onFermer={onFermer} />
        )}
      </div>
    </Modale>
  );
}

function EnTete({
  onglet,
  onOnglet,
  vue,
  onFermer,
}: {
  onglet: Onglet;
  onOnglet: (choisi: Onglet) => void;
  vue: VueJoueur;
  onFermer: () => void;
}) {
  const { slots } = vue.moi;

  return (
    <PoigneeModale className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 bg-[var(--ink)] px-[18px] py-3 text-[var(--paper)]">
      <h2 className="font-[var(--font-display)] text-[clamp(15px,2cqi,18px)] font-extrabold tracking-[.02em]">
        TROUPES
      </h2>
      <div className="flex gap-[5px]">
        <BoutonOnglet libelle="inventaire" actif={onglet === 'inventaire'} onClick={() => onOnglet('inventaire')} />
        <BoutonOnglet libelle="envoi" actif={onglet === 'envoi'} onClick={() => onOnglet('envoi')} />
      </div>
      <span className="flex-1" />
      <span className="text-[11px] text-[var(--paper-dim-2)]">
        {slots.utilises} slot{slots.utilises > 1 ? 's' : ''} engagé{slots.utilises > 1 ? 's' : ''} ·{' '}
        {slots.total - slots.utilises} disponible{slots.total - slots.utilises > 1 ? 's' : ''}
      </span>
      <button
        type="button"
        onClick={onFermer}
        className="cursor-pointer border border-[var(--paper-dim-2)] px-[10px] py-[5px] text-[10px] tracking-[.16em] uppercase hover:border-[var(--paper)]"
      >
        fermer
      </button>
    </PoigneeModale>
  );
}

function BoutonOnglet({ libelle, actif, onClick }: { libelle: string; actif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer border px-[13px] py-[6px] text-[10px] tracking-[.16em] uppercase ${
        actif
          ? 'border-[var(--paper)] bg-[var(--paper)] text-[var(--ink)]'
          : 'border-[var(--paper-dim-2)] text-[var(--paper-dim)] hover:border-[var(--paper)] hover:text-[var(--paper)]'
      }`}
    >
      {libelle}
    </button>
  );
}

function Inventaire({ vue }: { vue: VueJoueur }) {
  const maintenant = useHorloge();
  const [filtre, setFiltre] = useState<FiltreTroupes>({ situation: 'toutes', domaineUnite: 'tous' });
  const [tri, setTri] = useState<TriTroupes>('role');

  const inventaire = useMemo(() => inventorierTroupes(vue.moi, vue.arcs), [vue.moi, vue.arcs]);
  const lignes = organiserTroupes(inventaire, filtre, tri);

  return (
    <div className="flex min-h-0 flex-1 flex-col @4xl:flex-row @4xl:items-stretch">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-[rgba(42,33,24,.35)] px-4 py-[10px]">
          <Choix
            titre="situation"
            options={SITUATIONS}
            choisi={filtre.situation}
            onChoix={(situation) => setFiltre((precedent) => ({ ...precedent, situation }))}
          />
          <Choix
            titre="domaine"
            options={DOMAINES}
            choisi={filtre.domaineUnite}
            onChoix={(domaineUnite) => setFiltre((precedent) => ({ ...precedent, domaineUnite }))}
          />
          <Choix titre="tri" options={TRIS} choisi={tri} onChoix={setTri} />
          <span className="ml-auto text-[11.5px] text-[var(--ink-soft)]">
            {compterTroupes(lignes)} unités sur {compterTroupes(inventaire)}
          </span>
        </div>

        <div className="max-h-[420px] min-h-[220px] flex-1 overflow-auto @4xl:max-h-none">
          {lignes.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-[var(--ink-soft)]">
              Aucune troupe ne répond à ce filtre.
            </p>
          ) : (
            lignes.map((ligne) => (
              <LigneInventaire
                key={ligne.cle}
                ligne={ligne}
                nation={vue.moi.nation}
                chargeeA={vue.chargeeA}
                maintenant={maintenant}
              />
            ))
          )}
        </div>
      </div>

      <aside className="flex w-full min-w-0 flex-col border-t border-[rgba(42,33,24,.35)] @4xl:w-[366px] @4xl:shrink-0 @4xl:border-t-0 @4xl:border-l">
        <div className="shrink-0 border-b border-[rgba(42,33,24,.35)] px-4 py-[10px]">
          <span className="eyebrow">mouvements en cours</span>
        </div>
        <div className="max-h-[420px] flex-1 overflow-auto @4xl:max-h-none">
          {vue.arcs.map((arc) => (
            <LigneMouvement
              key={arc.id}
              arc={arc}
              nation={vue.moi.nation}
              chargeeA={vue.chargeeA}
              maintenant={maintenant}
            />
          ))}
          <p className="px-4 pt-3 pb-5 text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
            Un arc adverse n’expose ni son type ni sa composition, et n’entre donc pas à l’inventaire.
            Un arc grisé est une dernière position connue, horodatée.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Choix<Cle extends string>({
  titre,
  options,
  choisi,
  onChoix,
}: {
  titre: string;
  options: ReadonlyArray<{ cle: Cle; libelle: string }>;
  choisi: Cle;
  onChoix: (cle: Cle) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow">{titre}</span>
      <div className="flex gap-[3px]">
        {options.map((option) => (
          <button
            key={option.cle}
            type="button"
            onClick={() => onChoix(option.cle)}
            className={`cursor-pointer border border-[var(--ink)] px-[7px] py-[4px] text-[10px] tracking-[.1em] uppercase ${
              choisi === option.cle
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
            }`}
          >
            {option.libelle}
          </button>
        ))}
      </div>
    </div>
  );
}

function LigneInventaire({
  ligne,
  nation,
  chargeeA,
  maintenant,
}: {
  ligne: LigneTroupes;
  nation: string;
  chargeeA: number;
  maintenant: number;
}) {
  const situation = ligne.situation;
  return (
    <div className="flex items-center gap-3 border-b border-[rgba(42,33,24,.16)] px-4 py-[7px]">
      <SpriteUnite nation={nation} role={ligne.role} hauteur={32} largeur={46} />
      <span className="w-[42px] shrink-0 text-right font-[var(--font-mono)] text-[15px] text-[var(--ink)]">
        {ligne.nombre}
      </span>
      <span className="w-[150px] shrink-0 text-[13.5px] text-[var(--ink)]">
        {libelleRole(ligne.role, ligne.nombre)}
      </span>
      <span className="w-[42px] shrink-0 text-[10px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
        {ligne.domaineUnite}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-soft)]">
        {situation.genre === 'domicile' && 'à domicile'}
        {situation.genre === 'garnison' && `garnison — ${situation.paysHote}`}
        {situation.genre === 'mouvement' &&
          `${LIBELLE_TYPE[situation.typeMouvement]} → ${situation.destination}`}
      </span>
      <span className="w-[58px] shrink-0 text-right font-[var(--font-mono)] text-[12.5px] text-[var(--ink)]">
        {situation.genre === 'mouvement'
          ? enHeuresMinutes(minutesCourantes(situation.minutesRestantes, chargeeA, maintenant))
          : '—'}
      </span>
    </div>
  );
}

function LigneMouvement({
  arc,
  nation,
  chargeeA,
  maintenant,
}: {
  arc: ArcAffiche;
  nation: string;
  chargeeA: number;
  maintenant: number;
}) {
  const ligne = versLigne(arc, chargeeA, maintenant);
  return (
    <div className="border-b border-[rgba(42,33,24,.22)] px-4 py-[10px]">
      <div className="flex items-center gap-[9px]">
        <span className="h-[9px] w-[9px]" style={{ background: ligne.encre, opacity: ligne.opaciteEncre }} />
        <span className="text-[10px] tracking-[.18em] text-[var(--ink-soft)] uppercase">{ligne.etat}</span>
        <span className="h-px flex-1 bg-[rgba(42,33,24,.16)]" />
        <span className="font-[var(--font-mono)] text-[12.5px] text-[var(--ink)]">{ligne.eta}</span>
      </div>
      <div className="mt-[5px] text-[13px] text-[var(--ink-soft)]">{ligne.route}</div>
      {arc.etat === 'mien' ? (
        <PileEnSprites pile={arc.pile} nation={nation} />
      ) : (
        <div className="mt-[2px] text-[12px] text-[var(--ink-soft)]">{ligne.composition}</div>
      )}
    </div>
  );
}

/**
 * Réservé aux arcs `mien` : l'union discriminée est ce qui garantit qu'on ne peut pas appeler
 * cette vue sur un arc adverse, qui n'a structurellement pas de pile à montrer.
 */
function PileEnSprites({ pile, nation }: { pile: Pile; nation: string }) {
  const lignes = (Object.entries(pile) as ReadonlyArray<[RoleUnite, number]>).filter(
    ([, nombre]) => nombre > 0,
  );
  if (lignes.length === 0) {
    return <div className="mt-[2px] text-[12px] text-[var(--ink-soft)]">—</div>;
  }
  return (
    <div className="mt-[3px] flex flex-wrap items-center gap-x-[10px] gap-y-[2px]">
      {lignes.map(([role, nombre]) => (
        <span key={role} className="flex items-center gap-[4px]" title={libelleRole(role, nombre)}>
          <SpriteUnite nation={nation} role={role} hauteur={22} largeur={30} />
          <span className="font-[var(--font-mono)] text-[12px] text-[var(--ink)]">{nombre}</span>
        </span>
      ))}
    </div>
  );
}

type LigneArc = {
  etat: string;
  encre: string;
  opaciteEncre: number;
  route: string;
  composition: string;
  eta: string;
};

function versLigne(arc: ArcAffiche, chargeeA: number, maintenant: number): LigneArc {
  switch (arc.etat) {
    case 'mien':
      return {
        etat: `mien — ${LIBELLE_TYPE[arc.type]}`,
        encre: 'var(--interaction)',
        opaciteEncre: 1,
        route: `${arc.origineNom} → ${arc.destinationNom}`,
        composition: libellePile(arc.pile),
        eta: enHeuresMinutes(minutesCourantes(arc.minutesRestantes, chargeeA, maintenant)),
      };
    case 'adverseDetecte':
      return {
        etat: 'adverse détecté',
        encre: 'var(--critique)',
        opaciteEncre: 0.85,
        route: `arc relevé — cap ${Math.round(arc.capDegres)}°`,
        composition: 'composition inconnue',
        eta: arc.minutesRestantesEstimees === null ? '—' : `~${enHeuresMinutes(arc.minutesRestantesEstimees)}`,
      };
    case 'dernierePositionConnue':
      return {
        etat: 'dernière position connue',
        encre: 'var(--routine)',
        opaciteEncre: 0.45,
        route: `arc figé — cap ${Math.round(arc.capDegres)}°`,
        composition: `vu il y a ${arc.vuIlYaMinutes} min`,
        eta: '—',
      };
    case 'maitriseDesMers':
      return {
        etat: 'maîtrise des mers',
        encre: 'var(--ink-royaume-uni)',
        opaciteEncre: 0.7,
        route: 'extrémités effacées',
        composition: 'ni origine ni destination',
        eta: '—',
      };
  }
}
