import type { DepecheJournal, GraviteDepeche, VueJoueur } from '@/domaine/vue-joueur';
import { Modale, PoigneeModale, type ProprietesFenetre } from './Modale';

const COLONNES: ReadonlyArray<{ gravite: GraviteDepeche; encre: string }> = [
  { gravite: 'critique', encre: 'var(--critique)' },
  { gravite: 'notable', encre: 'var(--notable)' },
  { gravite: 'routine', encre: 'var(--routine)' },
];

export function ModaleJournal({
  vue,
  onFermer,
  ...fenetre
}: ProprietesFenetre & { vue: VueJoueur }) {
  const depeches = vue.journal;
  const une = depeches.find((depeche) => depeche.gravite === 'critique') ?? depeches[0] ?? null;
  const immobilise = depeches.find((depeche) => depeche.resolutionA !== null);
  const embargo = depeches.find((depeche) => depeche.restant !== null);
  const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = Math.min(Math.ceil(vue.saison.dureeHeures / 24), Math.floor(vue.saison.ecouleHeures / 24) + 1);

  return (
    <Modale nom="journal" onFermer={onFermer} {...fenetre} alignement="haut" largeur={1040}>
      <article className="trame-papier flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)] px-[30px] pt-[26px] pb-5">
        <PoigneeModale className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
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
        </PoigneeModale>

        <div className="mt-[10px] shrink-0 border-t-2 border-b border-[var(--ink)] pt-[14px] pb-[10px] text-center">
          <h2 className="font-[var(--font-display)] text-[clamp(26px,5.4cqi,54px)] leading-[.98] font-extrabold tracking-[.06em] text-[var(--ink)]">
            LE JOURNAL DES OPÉRATIONS
          </h2>
          <div className="mt-[9px] flex flex-wrap items-center justify-center gap-x-[14px] gap-y-1 text-[11px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            <span>
              {vue.moi.nation} — doctrine {vue.moi.doctrine}
            </span>
            <span className="text-[#9d8f78]">·</span>
            <span>{depeches.length} dépêches</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {une && (
            <div className="flex flex-col gap-4 border-b border-[var(--ink)] pt-4 pb-[18px] @3xl:flex-row @3xl:items-stretch @3xl:gap-[22px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-[9px]">
                  <span className="h-[9px] w-[9px]" style={{ background: 'var(--critique)' }} />
                  <span className="text-[10px] font-bold tracking-[.22em] text-[var(--critique)] uppercase">
                    {une.gravite} — {une.t}
                  </span>
                </div>
                <h3 className="mt-2 font-[var(--font-display)] text-[clamp(22px,3.7cqi,38px)] leading-[1.02] font-extrabold text-[var(--ink)]">
                  {une.texte}
                </h3>
                {une.restant && (
                  <p className="mt-[7px] font-[var(--font-display)] text-[16px] leading-[1.35] text-[var(--ink-quiet)] italic">
                    L’effet court encore <span className="font-[var(--font-mono)] not-italic">{une.restant}</span>.
                  </p>
                )}
                {une.rejeu && <BoutonRejeu plein />}
              </div>

              <aside className="w-full border-t border-[rgba(42,33,24,.35)] pt-3 @3xl:w-[232px] @3xl:shrink-0 @3xl:border-t-0 @3xl:border-l @3xl:pt-0 @3xl:pl-5">
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

          <div className="flex flex-col pt-[14px] @3xl:flex-row @3xl:items-stretch">
            {COLONNES.map((colonne) => {
              const entrees = depeches.filter(
                (depeche) => depeche.gravite === colonne.gravite && depeche !== une,
              );
              return (
                <section
                  key={colonne.gravite}
                  className="min-w-0 flex-1 border-t border-[rgba(42,33,24,.3)] pt-3 first:border-t-0 first:pt-0 @3xl:border-t-0 @3xl:border-l @3xl:px-[18px] @3xl:pt-0 @3xl:first:border-l-0"
                >
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

        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t-2 border-[var(--ink)] pt-[10px]">
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
