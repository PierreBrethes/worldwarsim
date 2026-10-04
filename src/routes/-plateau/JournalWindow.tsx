import { useMutation } from 'convex/react';
import { useCallback } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr, nationLabel } from '@/i18n/fr';
import { isAlarm } from '@/domain/journal';
import { asDayAndTime } from '@/domain/duration';
import { Stamp } from '@/shell/Stamp';
import type {
  JournalDispatch,
  DispatchSeverity,
  PlayerView,
  ReductionBoard,
} from '@/domain/player-view';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';
import type { Seat } from '@/data/session';

/** L'ordre des colonnes est celui de la gravité, jamais celui des dépêches : ce qui range la
 *  page est la sorte, et le journal sert déjà chaque liste dans son ordre d'heure. */
const COLUMNS: ReadonlyArray<DispatchSeverity> = ['critical', 'notable', 'routine'];

const SEVERITY_INK: Readonly<Record<DispatchSeverity, string>> = {
  critical: 'var(--critical)',
  notable: 'var(--notable-paper)',
  routine: 'var(--routine)',
};

export type LootRumor = {
  readonly id: string;
  readonly publishedAt: number;
  readonly center: { readonly lon: number; readonly lat: number };
  readonly radiusKm: number;
  readonly state: 'active' | 'ended';
};

export function JournalWindow({
  view,
  seat,
  rumors,
  selectedRumorId,
  onSelectRumor,
  leadReport = null,
  onClose,
  ...windowProps
}: WindowProps & {
  view: PlayerView;
  seat: Seat;
  /** **La dépêche qu'une notification d'attaque a ouverte** (lot mobile-3, §6), par son
   *  engagement : elle prend la manchette, quoi qu'il y ait de non lu à côté. */
  leadReport?: string | null;
  rumors: ReadonlyArray<LootRumor> | undefined;
  selectedRumorId: string | null;
  onSelectRumor: (rumor: LootRumor) => void;
}) {
  const markRead = useMutation(api.journal.markRead);
  const dispatches = view.journal;
  const unread = dispatches.filter((dispatch) => dispatch.unread);

  /**
   * **Lu à la fermeture, jamais à l'ouverture** : ce qu'on a eu le temps de voir est lu, et une
   * fenêtre ouverte par erreur ne vide pas le bandeau. Le refus n'a rien à dire au joueur —
   * la pire suite est un compteur qui reste allumé, jamais une action perdue.
   */
  const close = useCallback(() => {
    void markRead(seat).catch(() => undefined);
    onClose();
  }, [markRead, seat, onClose]);
  const revealRumor = useCallback(
    (rumor: LootRumor) => {
      onSelectRumor(rumor);
      close();
    },
    [close, onSelectRumor],
  );

  /** La manchette est **la première non lue**, pas la première critique : le journal s'ouvre sur
   *  ce qui a changé depuis la dernière visite, ce qui est toute sa raison d'être. */
  const lead =
    (leadReport === null
      ? undefined
      : dispatches.find((dispatch) => dispatch.combat?.id === leadReport)) ??
    unread.find((dispatch) => dispatch.severity === 'critical') ??
    unread[0] ??
    dispatches.find((dispatch) => dispatch.severity === 'critical') ??
    dispatches[0] ??
    null;
  /** **« Au réveil » ne trie rien** : il retient les dépêches que le serveur a datées d'une heure
   *  à venir (`resolutionAt`), dans l'ordre où le journal les sert. */
  const stalled = dispatches.filter((dispatch) => dispatch.resolutionAt !== null);
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  /** Sans horloge il n'y a pas de « sur n » : le jour se compte encore, la fin ne se promet pas. */
  const totalDays =
    view.season.durationHours === null ? null : Math.ceil(view.season.durationHours / 24);
  const elapsedDay = Math.floor(view.season.elapsedHours / 24) + 1;
  const day = totalDays === null ? elapsedDay : Math.min(totalDays, elapsedDay);

  return (
    <FloatingWindow name="journal" onClose={close} {...windowProps} alignment="top" width={1040}>
      <article className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)] px-[30px] pt-[26px] pb-5">
        <DragHandle className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>{fr.journal.editionOf(time)}</span>
          <span>
            {totalDays === null
              ? fr.journal.seasonDayNoClock(view.season.number, day)
              : fr.journal.seasonDay(view.season.number, day, totalDays)}
          </span>
          <button
            type="button"
            onClick={close}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        {/* **Le compte de non-lues est un chiffre, pas une phrase.** C'est la seule chose que le
            joueur cherche en ouvrant : posé en gros, à l'encre rouge, il se lit avant le titre.
            Les deux joues de la grille tiennent la manchette centrée même quand l'une est vide —
            le cachet à gauche, le compte à droite, là où l'œil retombe après le titre. */}
        <div className="mt-[10px] shrink-0 border-t-2 border-b border-[var(--ink)] pt-[14px] pb-[10px]">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-[18px] max-md:gap-x-[8px]">
            {/* **Le seul tampon de l'en-tête**, et il ne paraît qu'une fois : une saison prise se
                relit, elle ne se joue plus. À l'encre — il ne demande plus rien à personne. */}
            <div className="justify-self-start">
              {view.season.reduction.concludedAt !== null && (
                <Stamp label={fr.stamps.seasonClosed} />
              )}
            </div>
            <h2 className="font-(family-name:--font-display) text-[clamp(24px,5cqi,54px)] leading-[.98] font-extrabold tracking-[.06em] text-[var(--ink)]">
              {fr.journal.masthead}
            </h2>
            <div className="flex items-end justify-end gap-[8px]">
              {unread.length > 0 && (
                <>
                  <span className="font-(family-name:--font-display) text-[clamp(28px,4.6cqi,46px)] leading-[.8] font-extrabold text-[var(--critical)]">
                    {unread.length}
                  </span>
                  <span className="max-w-[52px] pb-[3px] text-[9px] leading-[1.25] tracking-[.18em] text-[var(--critical)] uppercase">
                    {fr.journal.unreadLabel(unread.length)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-[9px] flex shrink-0 flex-wrap items-center justify-center gap-x-[14px] gap-y-1 text-[11px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
          <span>{nationLabel(view.me.nation)}</span>
          <span className="text-[#9d8f78]">·</span>
          <span>{fr.journal.dispatches(dispatches.length)}</span>
          {unread.length === 0 && (
            <>
              <span className="text-[#9d8f78]">·</span>
              <span>{fr.journal.allRead}</span>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {lead && (
            <div className="flex flex-col gap-4 border-b border-[var(--ink)] pt-4 pb-[18px] @3xl:flex-row @3xl:items-stretch @3xl:gap-[22px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-[9px]">
                  <span
                    className="h-[9px] w-[9px] shrink-0"
                    style={{ background: SEVERITY_INK[lead.severity] }}
                  />
                  <span
                    className="text-[10px] font-bold tracking-[.22em] uppercase"
                    style={{ color: SEVERITY_INK[lead.severity] }}
                  >
                    {fr.journal.severities[lead.severity]} — {lead.t}
                  </span>
                  <span className="flex-1" />
                  <Stamp
                    label={fr.stamps.dispatches[lead.kind]}
                    tone={isAlarm(lead.kind) ? 'critical' : 'ink'}
                    size="small"
                  />
                </div>
                {/* **La manchette ne porte que sa phrase.** Une heure de résolution sous le titre
                    la redirait deux fois : si la manchette est immobilisée, l'encart du réveil
                    la reprend juste à côté, avec son heure. */}
                <h3 className="mt-2 font-(family-name:--font-display) text-[clamp(21px,3.4cqi,34px)] leading-[1.15] font-bold text-pretty break-words text-[var(--ink)]">
                  {lead.text}
                </h3>
              </div>

              {/* **L'encart du réveil, à droite de la manchette** : ce qui se résoudra sans qu'on
                  y touche, et le seul compteur qui décide de la visite — les slots engagés. */}
              <aside className="w-full border-t border-(color:--ink)/35 pt-3 @3xl:w-[232px] @3xl:shrink-0 @3xl:border-t-0 @3xl:border-l @3xl:border-[var(--ink)] @3xl:pt-0 @3xl:pl-5">
                <h4 className="border-b border-[var(--ink)] pb-[6px] text-[10px] font-bold tracking-[.2em] text-[var(--ink)] uppercase">
                  {fr.journal.atWaking}
                </h4>
                {stalled.length > 0 ? (
                  <div className="mt-[9px] flex flex-col gap-[7px]">
                    {stalled.map((entry) => (
                      <p
                        key={`${entry.t}-${entry.text}`}
                        className="font-(family-name:--font-text) text-[14px] leading-[1.5] break-words text-[var(--ink)]"
                      >
                        {entry.text}
                        {fr.journal.stalledResolution}
                        <span className="font-(family-name:--font-mono)">{entry.resolutionAt}</span>
                        .
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-[9px] font-(family-name:--font-text) text-[14px] leading-[1.5] text-[var(--ink-soft)]">
                    {fr.journal.noneStalled}
                  </p>
                )}
                <div className="mt-3 flex justify-between text-[12.5px]">
                  <span className="text-[var(--ink-soft)]">{fr.journal.slotsEngaged}</span>
                  <span className="font-(family-name:--font-mono) text-[var(--ink)]">
                    {view.me.slots.used} / {view.me.slots.total}
                  </span>
                </div>
              </aside>
            </div>
          )}

          {/* Trois colonnes sans cadre : le filet vertical suffit à les tenir, et une boîte teintée
              autour d'elles ferait du corps du journal un encart de plus. */}
          <div className="flex flex-col pt-[14px] @3xl:flex-row @3xl:items-stretch">
            {COLUMNS.map((severity) => {
              const entries = dispatches.filter(
                (dispatch) => dispatch.severity === severity && dispatch !== lead,
              );
              const holdsLead = lead !== null && lead.severity === severity;
              return (
                <section
                  key={severity}
                  className="min-w-0 flex-1 border-t border-(color:--ink)/30 pt-3 first:border-t-0 first:pt-0 @3xl:border-t-0 @3xl:border-l @3xl:border-l-(color:--ink)/30 @3xl:px-[18px] @3xl:pt-0 @3xl:first:border-l-0 @3xl:first:pl-0 @3xl:last:pr-0"
                >
                  <div className="flex items-center gap-2 border-b border-[var(--ink)] pb-[6px]">
                    <span
                      className="h-2 w-2 shrink-0"
                      style={{ background: SEVERITY_INK[severity] }}
                    />
                    <span className="text-[10px] font-bold tracking-[.22em] text-[var(--ink)] uppercase">
                      {fr.journal.severities[severity]}
                    </span>
                    <span className="flex-1" />
                    <span className="text-[11px] whitespace-nowrap text-[var(--ink-soft)]">
                      {holdsLead
                        ? fr.journal.others(entries.length)
                        : fr.journal.dispatches(entries.length)}
                    </span>
                  </div>
                  {entries.map((entry) => (
                    <Dispatch key={`${entry.t}-${entry.text}`} entry={entry} />
                  ))}
                </section>
              );
            })}
          </div>

          <WorldEvents rumors={rumors} selectedRumorId={selectedRumorId} onSelect={revealRumor} />

          <ReductionLine board={view.season.reduction} />
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t-2 border-[var(--ink)] pt-[10px]">
          <span className="text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
            {fr.journal.historyLabel}
          </span>
          <span className="font-(family-name:--font-text) text-[13px] text-[var(--ink-quiet)] italic">
            {fr.journal.keepNote}
          </span>
          <button
            type="button"
            onClick={close}
            className="cursor-pointer bg-[var(--ink)] px-4 py-[9px] text-[10px] tracking-[.2em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)]"
          >
            {fr.journal.backToBoard}
          </button>
        </div>
      </article>
    </FloatingWindow>
  );
}

function WorldEvents({
  rumors,
  selectedRumorId,
  onSelect,
}: {
  rumors: ReadonlyArray<LootRumor> | undefined;
  selectedRumorId: string | null;
  onSelect: (rumor: LootRumor) => void;
}) {
  return (
    <section className="mt-4 border-t-2 border-[var(--ink)] pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--ink)] pb-2">
        <h3 className="text-[11px] font-bold tracking-[.22em] text-[var(--ink)] uppercase">
          {fr.journal.worldEvents.title}
        </h3>
        <span className="font-(family-name:--font-text) text-[13px] text-[var(--ink-quiet)] italic">
          {fr.journal.worldEvents.note}
        </span>
      </div>
      {rumors === undefined ? (
        <p className="py-3 font-(family-name:--font-text) text-[14px] text-[var(--ink-soft)]">
          {fr.journal.worldEvents.loading}
        </p>
      ) : rumors.length === 0 ? (
        <p className="py-3 font-(family-name:--font-text) text-[14px] text-[var(--ink-soft)]">
          {fr.journal.worldEvents.empty}
        </p>
      ) : (
        <div className="grid gap-2 py-3 @3xl:grid-cols-2">
          {[...rumors].reverse().map((rumor) => {
            const selected = rumor.id === selectedRumorId;
            return (
              <button
                key={rumor.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(rumor)}
                className={`cursor-pointer border px-3 py-[10px] text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interaction)] ${
                  rumor.state === 'ended' ? 'border-dashed' : ''
                } ${
                  selected
                    ? 'border-[var(--interaction)] bg-[rgba(176,116,52,.12)]'
                    : 'border-(color:--ink)/35 hover:border-[var(--ink)] hover:bg-(--ink)/5'
                }`}
              >
                <span className="flex items-center justify-between gap-3 text-[10px] tracking-[.16em] uppercase">
                  <span className="font-(family-name:--font-mono) text-[var(--ink-soft)]">
                    {fr.journal.worldEvents.published(asDayAndTime(rumor.publishedAt))}
                  </span>
                  <span
                    className={
                      rumor.state === 'active'
                        ? 'font-bold text-[var(--interaction)]'
                        : 'text-[var(--ink-soft)]'
                    }
                  >
                    {fr.journal.worldEvents.states[rumor.state]}
                  </span>
                </span>
                <span className="mt-[5px] block font-(family-name:--font-display) text-[16px] leading-[1.3] font-semibold text-[var(--ink)]">
                  {fr.journal.worldEvents.report}
                </span>
                <span className="mt-1 block font-(family-name:--font-text) text-[12.5px] text-[var(--ink-soft)]">
                  {selected ? fr.journal.worldEvents.dismiss : fr.journal.worldEvents.locate}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * **Le tableau de la victoire de test — public et nominatif, et c'est voulu.** La condition est
 * unique (ADR 0020 §9), donc rien à protéger, et un test entre amis veut qu'on se chambre
 * (`src/domain/victory.ts`). Ce bloc disparaît avec l'échafaudage le jour où la part de carte
 * arrive — il ne se transforme pas en barre de progression.
 *
 * **Il tient en pied du fil et au défilement** — jamais posé à demeure sous les colonnes : c'est
 * un état de table qu'on longe du regard en sortant, et une bande permanente en ferait un P1 qui
 * disputerait la manchette. Le titre porte l'aveu de l'échafaudage sur sa propre ligne, et les
 * nations coulent en dessous : à huit joueurs elles passent à la ligne au lieu de pousser un
 * défilement latéral que personne ne va chercher.
 */
function ReductionLine({ board }: { board: ReductionBoard }) {
  if (board.standings.length === 0) return null;
  return (
    <section className="mt-4 border-t border-[var(--ink)] pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[10px] font-bold tracking-[.22em] text-[var(--ink)] uppercase">
          {fr.victory.kicker}
        </span>
        <span className="font-(family-name:--font-text) text-[13px] text-[var(--ink-quiet)] italic">
          {fr.victory.scaffold}
        </span>
      </div>
      <div className="mt-[7px] flex flex-wrap gap-x-5 gap-y-[6px]">
        {board.standings.map((standing) => (
          <span
            key={standing.nickname}
            className="flex items-baseline gap-[7px] text-[13px] whitespace-nowrap"
          >
            <span
              className="h-2 w-2 shrink-0 self-center"
              style={{
                background: standing.isReduced ? 'var(--critical)' : 'transparent',
                border: standing.isReduced
                  ? 'none'
                  : '1px solid color-mix(in srgb, var(--ink) 50%, transparent)',
              }}
            />
            <span className={standing.isMine ? 'font-bold text-[var(--ink)]' : 'text-[var(--ink)]'}>
              {standing.nation === null ? standing.nickname : nationLabel(standing.nation)}
            </span>
            <span className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
              {fr.victory.tally(standing.reduced, board.target)}
            </span>
            <span className="text-[10px] tracking-[.16em] text-[var(--ink-note)] uppercase">
              {standing.isReduced ? fr.victory.reducedMark : fr.victory.standingMark}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}

/** **Une dépêche lue s'efface, elle ne disparaît pas** : l'historique de la saison est ce qu'on
 *  relit, et une pile qui se vide en se lisant ne raconte plus rien (fiche 11 §4.1). */
function Dispatch({ entry }: { entry: JournalDispatch }) {
  return (
    <div
      className="border-b border-(color:--ink)/16 py-[10px] last:border-b-0"
      style={{ opacity: entry.unread ? 1 : 0.5 }}
    >
      {/* **La sorte dans la marge, la manchette en vedette.** Un cachet en petit corps à côté de
          l'heure dit *de quoi il s'agit* avant qu'on ait lu la phrase — c'est ce qu'on cherche en
          parcourant une colonne. Un seul par dépêche : deux cachets sur trois lignes de texte
          feraient de la colonne un formulaire. */}
      <div className="flex items-center gap-3">
        <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
          {entry.t}
        </span>
        <span className="flex-1" />
        <Stamp
          label={fr.stamps.dispatches[entry.kind]}
          tone={isAlarm(entry.kind) ? 'critical' : 'ink'}
          size="small"
        />
      </div>
      <div className="mt-[3px] font-(family-name:--font-display) text-[16.5px] leading-[1.35] font-semibold text-pretty break-words text-[var(--ink)]">
        {entry.text}
      </div>
      {/* **Le titre est en didone, son corps ne l'est pas** (retour de Pierre, 04/09). Deux
          dessins, sinon la ligne sous le titre se lit comme un second titre plus petit — et
          l'`Archivo Narrow` qu'elle portait est une condensée de titraille, faite pour les
          capitales espacées et non pour une phrase. */}
      {entry.resolutionAt && (
        <div className="mt-[3px] font-(family-name:--font-text) text-[12px] leading-[1.4] break-words text-[var(--ink-soft)]">
          {fr.journal.resolutionAt(entry.resolutionAt)}
        </div>
      )}
    </div>
  );
}
