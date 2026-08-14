import { Link, useSearch } from '@tanstack/react-router';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { stockCourant } from '@/domaine/vue-joueur';
import { IconeRessource, couleurRessource, type CleRessource } from '@/emblemes/IconeRessource';
import type { RecherchePlateau } from '@/routes/plateau';
import { avecModale } from '@/routes/plateau';
import { CartoucheNation } from './CartoucheNation';
import { Picto } from './GlypheIndicateur';
import { useHorloge } from './horloge';

const HAUTEUR_BANDEAU = 42;

/**
 * Le bandeau répond à « quoi de neuf », et le cartouche dit sous quelles couleurs. Tout le
 * reste de ce qui se consulte au lieu de se surveiller — plage de repos, saison, slots,
 * échéances — vit dans la surface qui le porte. C'est ce dégraissage qui supprime le
 * débordement, pas un défilement horizontal de plus.
 */
export function BandeauNation({ vue }: { vue: VueJoueur }) {
  const { moi } = vue;
  const recherche = useSearch({ strict: false }) as RecherchePlateau;
  const maintenant = useHorloge();
  const critique = vue.journal.find((depeche) => depeche.gravite === 'critique') ?? null;
  const aSignaler = critique !== null || vue.journal.length > 0;
  return (
    <header
      className="hud flex shrink-0 items-center border-b border-[var(--ink-quiet)] bg-[var(--desk)]"
      style={{ fontFamily: 'var(--font-body)', height: HAUTEUR_BANDEAU }}
    >
      <CartoucheNation nation={moi.nation} doctrine={moi.doctrine} hauteur={HAUTEUR_BANDEAU} />

      <div className="flex-1" />

      <Groupe>
        <Compteur
          ressource="ravitaillement"
          libelle="ravitaillement"
          valeur={stockCourant(moi.ravitaillement, vue.chargeeA, maintenant)}
          debit={moi.ravitaillement.debitParHeure}
        />
        <Separateur />
        <Compteur
          ressource="acier"
          libelle="acier"
          valeur={stockCourant(moi.acier, vue.chargeeA, maintenant)}
          debit={moi.acier.debitParHeure}
        />
        <Separateur />
        <Compteur
          ressource="effectifs"
          libelle="effectifs"
          valeur={stockCourant(moi.effectifs, vue.chargeeA, maintenant)}
          debit={moi.effectifs.debitParHeure}
          plafond={moi.effectifs.plafond}
        />
      </Groupe>

      <div className="flex-1" />

      <Link
        to="/plateau"
        search={avecModale(recherche, 'journal')}
        title={aSignaler ? undefined : 'journal — rien à signaler'}
        className="flex h-full min-w-0 items-center gap-3 border-l border-[var(--ink-quiet)] px-4 whitespace-nowrap hover:bg-[var(--ink)]"
      >
        <span className="shrink-0" style={{ color: critique ? 'var(--critique)' : 'var(--routine)' }}>
          <Picto picto="journal" corps={20} taille={20} />
        </span>
        {/* La manchette vaut mieux que le compteur : un journal titre, il ne dénombre pas.
            Mais un journal sans dépêche n'a pas de titre non plus — il se tait. */}
        {aSignaler && (
          <span className="min-w-0 max-w-[260px] overflow-hidden text-[13px] text-ellipsis"
            style={{ color: critique ? 'var(--critique)' : 'var(--paper)' }}
          >
            {critique
              ? critique.texte
              : `${vue.journal.length} dépêche${vue.journal.length > 1 ? 's' : ''} non lue${vue.journal.length > 1 ? 's' : ''}`}
          </span>
        )}
      </Link>
    </header>
  );
}

// Les groupes ne portent plus de filet : ce sont les blancs qui les séparent maintenant,
// et les deux seuls filets restants tiennent aux deux extrémités du bandeau.
function Groupe({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-3 px-4 whitespace-nowrap">{children}</div>
  );
}

function Separateur() {
  return <span className="text-[12px] text-[var(--paper-dim-2)] opacity-40">·</span>;
}

/**
 * Icône et chiffre, rien d'autre : le débit se lit une fois par partie, il n'a pas à occuper
 * une ligne en permanence. Il attend le survol.
 */
function Compteur({
  ressource,
  libelle,
  valeur,
  debit,
  plafond,
}: {
  ressource: CleRessource;
  libelle: string;
  valeur: number;
  debit: number;
  plafond?: number | undefined;
}) {
  const tarie = valeur === 0 && debit === 0;
  return (
    <span
      className={`flex shrink-0 items-center gap-[6px] ${tarie ? 'ressource-tarie' : ''}`}
      title={`${libelle} — ${debit >= 0 ? '+' : ''}${Math.round(debit)}/h`}
    >
      <span className="flex" style={{ color: couleurRessource(ressource) }}>
        <IconeRessource ressource={ressource} taille={13} />
      </span>
      <span className="font-[var(--font-mono)] text-[15px] font-medium text-[var(--paper)]">
        {valeur.toLocaleString('fr-FR')}
        {plafond !== undefined && (
          <span className="text-[12px] text-[var(--paper-dim-2)]">/{plafond}</span>
        )}
      </span>
    </span>
  );
}
