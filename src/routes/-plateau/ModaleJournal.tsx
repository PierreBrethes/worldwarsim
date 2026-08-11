import type { DepecheJournal, GraviteDepeche, VueJoueur } from '@/domaine/vue-joueur';
import { Modale } from './Modale';

const COLONNES: ReadonlyArray<{ gravite: GraviteDepeche; encre: string }> = [
  { gravite: 'critique', encre: 'var(--critique)' },
  { gravite: 'notable', encre: 'var(--notable)' },
  { gravite: 'routine', encre: 'var(--routine)' },
];

export function ModaleJournal({ vue, onFermer }: { vue: VueJoueur; onFermer: () => void }) {
  const depeches = vue.journal;
  const une = depeches.find((depeche) => depeche.gravite === 'critique') ?? depeches[0] ?? null;
  const immobilise = depeches.find((depeche) => depeche.resolutionA !== null);
  const embargo = depeches.find((depeche) => depeche.restant !== null);
  const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = Math.min(Math.ceil(vue.saison.dureeHeures / 24), Math.floor(vue.saison.ecouleHeures / 24) + 1);

  return (
    <Modale onFermer={onFermer} alignement="haut">
      <article className="trame-papier w-[1040px] max-w-full border border-[var(--ink)] px-[30px] pt-[26px] pb-5">
        <div className="flex items-center justify-between text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>édition de {heure}</span>
          <span>
            saison {vue.saison.numero} — jour {jour} sur {Math.ceil(vue.saison.dureeHeures / 24)}
          </span>
          <button
            type="button"
            onClick={onFermer}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            fermer
          </button>
        </div>

        <div className="mt-[10px] border-t-2 border-b border-[var(--ink)] pt-[14px] pb-[10px] text-center">
          <h2 className="font-[var(--font-display)] text-[54px] leading-[.98] font-extrabold tracking-[.06em] text-[var(--ink)]">
            LE JOURNAL DES OPÉRATIONS
          </h2>
          <div className="mt-[9px] flex items-center justify-center gap-[14px] text-[11px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            <span>
              {vue.moi.nation} — doctrine {vue.moi.doctrine}
            </span>
            <span className="text-[#9d8f78]">·</span>
            <span>{depeches.length} dépêches</span>
          </div>
        </div>

        {une && (
          <div className="flex items-stretch gap-[22px] border-b border-[var(--ink)] pt-4 pb-[18px]">
            <div className="flex-1">
              <div className="flex items-center gap-[9px]">
                <span className="h-[9px] w-[9px]" style={{ background: 'var(--critique)' }} />
                <span className="text-[10px] font-bold tracking-[.22em] text-[var(--critique)] uppercase">
                  {une.gravite} — {une.t}
                </span>
              </div>
              <h3 className="mt-2 font-[var(--font-display)] text-[38px] leading-[1.02] font-extrabold text-[var(--ink)]">
                {une.texte}
              </h3>
              {une.restant && (
                <p className="mt-[7px] font-[var(--font-display)] text-[16px] leading-[1.35] text-[var(--ink-quiet)] italic">
                  L’effet court encore <span className="font-[var(--font-mono)] not-italic">{une.restant}</span>.
                </p>
              )}
              {une.rejeu && <BoutonRejeu plein />}
            </div>

            <aside className="w-[232px] shrink-0 border-l border-[rgba(42,33,24,.35)] pl-5">
              <h4 className="border-b border-[var(--ink)] pb-[6px] text-[10px] font-bold tracking-[.2em] text-[var(--ink)] uppercase">
                au réveil
              </h4>
              {immobilise ? (
                <p className="mt-[9px] text-[13px] leading-[1.5] text-[var(--ink)]">
                  {immobilise.texte}. Résolution à{' '}
                  <span className="font-[var(--font-mono)]">{immobilise.resolutionA}</span>.
                </p>
              ) : (
                <p className="mt-[9px] text-[13px] leading-[1.5] text-[var(--ink-soft)]">
                  Aucun mouvement immobilisé par une plage de repos.
                </p>
              )}
              <div className="mt-3 flex flex-col gap-[5px] text-[12.5px]">
                {embargo && (
                  <span className="flex justify-between">
                    <span className="text-[var(--ink-soft)]">embargo restant</span>
                    <span className="font-[var(--font-mono)] text-[var(--ink)]">{embargo.restant}</span>
                  </span>
                )}
                <span className="flex justify-between">
                  <span className="text-[var(--ink-soft)]">slots engagés</span>
                  <span className="text-[var(--ink)]">
                    {vue.moi.slots.utilises} / {vue.moi.slots.total}
                  </span>
                </span>
              </div>
            </aside>
          </div>
        )}

        <div className="flex items-stretch pt-[14px]">
          {COLONNES.map((colonne) => {
            const entrees = depeches.filter(
              (depeche) => depeche.gravite === colonne.gravite && depeche !== une,
            );
            return (
              <section key={colonne.gravite} className="flex-1 border-l border-[rgba(42,33,24,.3)] px-[18px] first:border-l-0">
                <div className="flex items-center gap-2 border-b border-[var(--ink)] pb-[6px]">
                  <span className="h-2 w-2" style={{ background: colonne.encre }} />
                  <span className="text-[10px] font-bold tracking-[.22em] text-[var(--ink)] uppercase">
                    {colonne.gravite}
                  </span>
                  <span className="flex-1" />
                  <span className="text-[11px] text-[var(--ink-soft)]">
                    {entrees.length} dépêche{entrees.length > 1 ? 's' : ''}
                  </span>
                </div>
                {entrees.map((entree) => (
                  <Depeche key={`${entree.t}-${entree.texte}`} entree={entree} />
                ))}
              </section>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 border-t-2 border-[var(--ink)] pt-[10px]">
          <span className="text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase" title="surface 4.7 — à venir">
            historique de la saison
          </span>
          <span className="font-[var(--font-display)] text-[12.5px] text-[var(--ink-quiet)] italic">
            les dépêches lues restent consultables, rejeu compris
          </span>
          <button
            type="button"
            onClick={onFermer}
            className="cursor-pointer bg-[var(--ink)] px-4 py-[9px] text-[10px] tracking-[.2em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)]"
          >
            retour au plateau
          </button>
        </div>
      </article>
    </Modale>
  );
}

function Depeche({ entree }: { entree: DepecheJournal }) {
  return (
    <div className="border-b border-[rgba(42,33,24,.16)] py-[10px] last:border-b-0">
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">{entree.t}</div>
      <div className="mt-[3px] font-[var(--font-display)] text-[16px] leading-[1.15] font-semibold text-[var(--ink)]">
        {entree.texte}
      </div>
      {(entree.restant || entree.resolutionA) && (
        <div className="mt-[3px] text-[12px] leading-[1.4] text-[var(--ink-soft)]">
          {entree.restant ? `restant ${entree.restant}` : `résolution à ${entree.resolutionA}`}
        </div>
      )}
      {entree.rejeu && <BoutonRejeu />}
    </div>
  );
}

function BoutonRejeu({ plein = false }: { plein?: boolean }) {
  return (
    <button
      type="button"
      disabled
      title="rejeu — surface 4.7 à venir"
      className={
        plein
          ? 'mt-3 cursor-not-allowed bg-[var(--ink)] px-[13px] py-[9px] text-[10px] tracking-[.18em] text-[var(--paper)] uppercase opacity-70'
          : 'mt-[6px] cursor-not-allowed border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase opacity-70'
      }
    >
      {plein ? 'voir le rejeu' : 'rejeu'}
    </button>
  );
}
