import { Link, useSearch } from '@tanstack/react-router';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { stockCourant } from '@/domaine/vue-joueur';
import { IconeRessource, couleurRessource, type CleRessource } from '@/emblemes/IconeRessource';
import type { RecherchePlateau } from '@/routes/plateau';
import { CartoucheNation } from './CartoucheNation';
import { IconeJournal } from './Glyphe';
import { useHorloge } from './horloge';

const HAUTEUR_BANDEAU = 58;

export function BandeauNation({ vue }: { vue: VueJoueur }) {
  const { moi, saison } = vue;
  const recherche = useSearch({ strict: false }) as RecherchePlateau;
  const maintenant = useHorloge();
  const restantMinutes = Math.max(
    0,
    (saison.dureeHeures - saison.ecouleHeures) * 60 - (maintenant - vue.chargeeA) / 60_000,
  );
  const critique = vue.journal.find((depeche) => depeche.gravite === 'critique') ?? null;
  return (
    <header
      className="hud flex min-w-max shrink-0 items-center gap-0 border-b border-[var(--ink-quiet)] bg-[var(--desk)] pr-4"
      style={{ fontFamily: 'var(--font-body)', height: HAUTEUR_BANDEAU }}
    >
      <div className="flex h-full shrink-0 items-center border-r border-[var(--ink-quiet)]">
        <CartoucheNation nation={moi.nation} doctrine={moi.doctrine} hauteur={HAUTEUR_BANDEAU} />
      </div>

      <Groupe>
        <Compteur
          ressource="ravitaillement"
          libelle="Ravitaillement"
          valeur={stockCourant(moi.ravitaillement, vue.chargeeA, maintenant)}
          debit={moi.ravitaillement.debitParHeure}
        />
        <Compteur
          ressource="acier"
          libelle="Acier"
          valeur={stockCourant(moi.acier, vue.chargeeA, maintenant)}
          debit={moi.acier.debitParHeure}
        />
        <Compteur
          ressource="effectifs"
          libelle="Effectifs"
          valeur={stockCourant(moi.effectifs, vue.chargeeA, maintenant)}
          debit={moi.effectifs.debitParHeure}
          suffixe={moi.effectifs.plafond ? `/ ${moi.effectifs.plafond} plafond` : undefined}
        />
      </Groupe>

      <Groupe>
        <Slots total={moi.slots.total} utilises={moi.slots.utilises} />
      </Groupe>

      <div className="flex-1" />

      <Link
        to="/plateau"
        search={{ ...recherche, modale: 'journal' as const }}
        className="flex h-full shrink-0 items-center gap-3 border-r border-[var(--ink-quiet)] px-5 whitespace-nowrap hover:bg-[var(--ink)]"
      >
        <span style={{ color: critique ? 'var(--critique)' : 'var(--routine)' }}>
          <IconeJournal taille={22} />
        </span>
        <span className="text-left">
          <span className="eyebrow-sombre block">
            {critique ? 'Dernière heure' : 'Journal d’événements'}
          </span>
          {/* La manchette vaut mieux que le compteur : un journal titre, il ne dénombre pas. */}
          <span
            className="block max-w-[300px] overflow-hidden text-[13px] text-ellipsis"
            style={{ color: critique ? 'var(--critique)' : 'var(--paper)' }}
          >
            {critique
              ? critique.texte
              : vue.journal.length
                ? `${vue.journal.length} dépêche${vue.journal.length > 1 ? 's' : ''} non lue${vue.journal.length > 1 ? 's' : ''}`
                : 'rien à signaler'}
          </span>
        </span>
      </Link>

      <Groupe>
        <div className="eyebrow-sombre">Plage de repos déclarée</div>
        <div className="font-[var(--font-mono)] text-[12px] text-[var(--paper)]">{moi.plageRepos}</div>
      </Groupe>
      <Groupe dernier>
        <div className="eyebrow-sombre">Saison {saison.numero} — fin dans</div>
        <div className="font-[var(--font-mono)] text-[12px] text-[var(--paper)]">
          {Math.floor(restantMinutes / 60)} h {String(Math.floor(restantMinutes % 60)).padStart(2, '0')}
        </div>
      </Groupe>
    </header>
  );
}

function Groupe({ children, dernier = false }: { children: React.ReactNode; dernier?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center gap-3 px-5 whitespace-nowrap ${
        dernier ? '' : 'border-r border-[var(--ink-quiet)]'
      }`}
    >
      {children}
    </div>
  );
}

function Compteur({
  ressource,
  libelle,
  valeur,
  debit,
  suffixe,
}: {
  ressource: CleRessource;
  libelle: string;
  valeur: number;
  debit: number;
  suffixe?: string | undefined;
}) {
  return (
    <div className="shrink-0">
      <div className="flex items-center gap-[6px]" style={{ color: couleurRessource(ressource) }}>
        <IconeRessource ressource={ressource} />
        <span className="eyebrow-sombre">{libelle}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-[var(--font-mono)] text-[17px] font-medium text-[var(--paper)]">
          {valeur.toLocaleString('fr-FR')}
        </span>
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--notable)]">
          +{Math.round(debit)}/h
        </span>
        {suffixe && <span className="text-[11px] text-[var(--paper-dim-2)]">{suffixe}</span>}
      </div>
    </div>
  );
}

function Slots({ total, utilises }: { total: number; utilises: number }) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="eyebrow-sombre max-w-[52px] leading-tight whitespace-normal">Slots de mouvement</div>
      <div className="flex gap-[3px]">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className="h-[22px] w-[11px] border"
            style={
              index < utilises
                ? { background: 'var(--interaction)', borderColor: 'var(--paper)' }
                : { background: 'transparent', borderColor: '#6b6252' }
            }
          />
        ))}
      </div>
      <span className="font-[var(--font-mono)] text-[15px] font-medium text-[var(--paper)]">
        {utilises} / {total}
      </span>
    </div>
  );
}
