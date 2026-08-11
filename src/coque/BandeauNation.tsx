import { Link, useSearch } from '@tanstack/react-router';
import type { VueJoueur } from '@/domaine/vue-joueur';
import type { RecherchePlateau } from '@/routes/plateau';

export function BandeauNation({ vue }: { vue: VueJoueur }) {
  const { moi, saison } = vue;
  const recherche = useSearch({ strict: false }) as RecherchePlateau;
  return (
    <header
      className="flex h-[58px] min-w-max shrink-0 items-center gap-0 border-b border-[var(--ink-quiet)] bg-[var(--desk)] px-4"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <Groupe>
        <span className="inline-block h-[10px] w-[10px]" style={{ background: moi.encre }} />
        <span className="font-[var(--font-display)] text-[17px] font-semibold tracking-[.06em] text-[var(--paper)] uppercase">
          {moi.nation}
        </span>
        <span className="eyebrow-sombre">doctrine {moi.doctrine}</span>
      </Groupe>

      <Groupe>
        <Compteur libelle="Ravitaillement" valeur={moi.ravitaillement.stock} debit={moi.ravitaillement.debitParHeure} />
        <Compteur libelle="Acier" valeur={moi.acier.stock} debit={moi.acier.debitParHeure} />
        <Compteur
          libelle="Effectifs"
          valeur={moi.effectifs.stock}
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
        <span
          className="inline-block h-2 w-2"
          style={{
            background: vue.journal.some((depeche) => depeche.gravite === 'critique')
              ? 'var(--critique)'
              : 'var(--routine)',
          }}
        />
        <span className="text-left">
          <span className="eyebrow-sombre block">Journal d’événements</span>
          <span className="block text-[13px] text-[var(--paper)]">
            {vue.journal.length} dépêches non lues
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
          {saison.dureeHeures - saison.ecouleHeures} h
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
  libelle,
  valeur,
  debit,
  suffixe,
}: {
  libelle: string;
  valeur: number;
  debit: number;
  suffixe?: string | undefined;
}) {
  return (
    <div className="shrink-0">
      <div className="eyebrow-sombre">{libelle}</div>
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
