import { useMutation } from 'convex/react';
import { useCallback } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr, doctrineLabel, nationLabel } from '@/i18n/fr';
import { isAlarm } from '@/domain/journal';
import { Stamp } from '@/shell/Stamp';
import type {
  JournalDispatch,
  DispatchSeverity,
  PlayerView,
  ReductionBoard,
} from '@/domain/player-view';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';

const COLUMNS: ReadonlyArray<{ severity: DispatchSeverity; ink: string }> = [
  { severity: 'critical', ink: 'var(--critical)' },
  { severity: 'notable', ink: 'var(--notable)' },
  { severity: 'routine', ink: 'var(--routine)' },
];

export function JournalWindow({
  view,
  token,
  onClose,
  ...windowProps
}: WindowProps & { view: PlayerView; token: string }) {
  const markRead = useMutation(api.journal.markRead);
  const dispatches = view.journal;
  const unread = dispatches.filter((dispatch) => dispatch.unread);

  /**
   * **Lu à la fermeture, jamais à l'ouverture** : ce qu'on a eu le temps de voir est lu, et une
   * fenêtre ouverte par erreur ne vide pas le bandeau. Le refus n'a rien à dire au joueur —
   * la pire suite est un compteur qui reste allumé, jamais une action perdue.
   */
  const close = useCallback(() => {
    void markRead({ token }).catch(() => undefined);
    onClose();
  }, [markRead, token, onClose]);

  /** La manchette est **la première non lue**, pas la première critique : le journal s'ouvre sur
   *  ce qui a changé depuis la dernière visite, ce qui est toute sa raison d'être. */
  const lead =
    unread.find((dispatch) => dispatch.severity === 'critical') ??
    unread[0] ??
    dispatches.find((dispatch) => dispatch.severity === 'critical') ??
    dispatches[0] ??
    null;
  const stalled = dispatches.find((dispatch) => dispatch.resolutionAt !== null);
  const embargo = dispatches.find((dispatch) => dispatch.remaining !== null);
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const day = Math.min(
    Math.ceil(view.season.durationHours / 24),
    Math.floor(view.season.elapsedHours / 24) + 1,
  );

  return (
    <FloatingWindow name="journal" onClose={close} {...windowProps} alignment="top" width={1040}>
      <article className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)] px-[30px] pt-[26px] pb-5">
        <DragHandle className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>{fr.journal.editionOf(time)}</span>
          <span>
            {fr.journal.seasonDay(
              view.season.number,
              day,
              Math.ceil(view.season.durationHours / 24),
            )}
          </span>
          <button
            type="button"
            onClick={close}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <div className="mt-[10px] shrink-0 border-t-2 border-b border-[var(--ink)] pt-[14px] pb-[10px] text-center">
          <div className="flex items-center justify-center gap-[18px]">
            <h2 className="font-(family-name:--font-display) text-[clamp(26px,5.4cqi,54px)] leading-[.98] font-extrabold tracking-[.06em] text-[var(--ink)]">
              {fr.journal.masthead}
            </h2>
            {/* **Le seul tampon de l'en-tête**, et il ne paraît qu'une fois : une saison prise se
                relit, elle ne se joue plus. À l'encre — il ne demande plus rien à personne. */}
            {view.season.reduction.concludedAt !== null && <Stamp label={fr.stamps.seasonClosed} />}
          </div>
          <div className="mt-[9px] flex flex-wrap items-center justify-center gap-x-[14px] gap-y-1 text-[11px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            <span>
              {fr.journal.nationLine(
                nationLabel(view.me.nation),
                doctrineLabel(view.me.doctrine) ?? view.me.doctrine,
              )}
            </span>
            <span className="text-[#9d8f78]">·</span>
            <span>{fr.journal.dispatches(dispatches.length)}</span>
            <span className="text-[#9d8f78]">·</span>
            <span style={{ color: unread.length > 0 ? 'var(--critical)' : undefined }}>
              {unread.length > 0 ? fr.journal.unread(unread.length) : fr.journal.allRead}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {lead && (
            <div className="flex flex-col gap-4 border-b border-[var(--ink)] pt-4 pb-[18px] @3xl:flex-row @3xl:items-stretch @3xl:gap-[22px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-[9px]">
                  <span className="h-[9px] w-[9px]" style={{ background: 'var(--critical)' }} />
                  <span className="text-[10px] font-bold tracking-[.22em] text-[var(--critical)] uppercase">
                    {fr.journal.severities[lead.severity]} — {lead.t}
                  </span>
                  <span className="flex-1" />
                  <Stamp
                    label={fr.stamps.dispatches[lead.kind]}
                    tone={isAlarm(lead.kind) ? 'critical' : 'ink'}
                    size="small"
                  />
                </div>
                <h3 className="mt-2 font-(family-name:--font-display) text-[clamp(22px,3.7cqi,38px)] leading-[1.02] font-extrabold text-[var(--ink)]">
                  {lead.text}
                </h3>
                {lead.remaining && (
                  <p className="mt-[7px] font-(family-name:--font-display) text-[16px] leading-[1.35] text-[var(--ink-quiet)] italic">
                    {fr.journal.effectRunning}
                    <span className="font-(family-name:--font-mono) not-italic">
                      {lead.remaining}
                    </span>
                    .
                  </p>
                )}
              </div>

              <aside className="w-full border-t border-[rgba(42,33,24,.35)] pt-3 @3xl:w-[232px] @3xl:shrink-0 @3xl:border-t-0 @3xl:border-l @3xl:pt-0 @3xl:pl-5">
                <h4 className="border-b border-[var(--ink)] pb-[6px] text-[10px] font-bold tracking-[.2em] text-[var(--ink)] uppercase">
                  {fr.journal.atWaking}
                </h4>
                {stalled ? (
                  <p className="mt-[9px] text-[13px] leading-[1.5] text-[var(--ink)]">
                    {stalled.text}
                    {fr.journal.stalledResolution}
                    <span className="font-(family-name:--font-mono)">{stalled.resolutionAt}</span>.
                  </p>
                ) : (
                  <p className="mt-[9px] text-[13px] leading-[1.5] text-[var(--ink-soft)]">
                    {fr.journal.noneStalled}
                  </p>
                )}
                <div className="mt-3 flex flex-col gap-[5px] text-[12.5px]">
                  {embargo && (
                    <span className="flex justify-between">
                      <span className="text-[var(--ink-soft)]">{fr.journal.embargoLeft}</span>
                      <span className="font-(family-name:--font-mono) text-[var(--ink)]">
                        {embargo.remaining}
                      </span>
                    </span>
                  )}
                  <span className="flex justify-between">
                    <span className="text-[var(--ink-soft)]">{fr.journal.slotsEngaged}</span>
                    <span className="text-[var(--ink)]">
                      {view.me.slots.used} / {view.me.slots.total}
                    </span>
                  </span>
                </div>
              </aside>
            </div>
          )}

          <div className="flex flex-col pt-[14px] @3xl:flex-row @3xl:items-stretch">
            {COLUMNS.map((column) => {
              const entries = dispatches.filter(
                (dispatch) => dispatch.severity === column.severity && dispatch !== lead,
              );
              return (
                <section
                  key={column.severity}
                  className="min-w-0 flex-1 border-t border-[rgba(42,33,24,.3)] pt-3 first:border-t-0 first:pt-0 @3xl:border-t-0 @3xl:border-l @3xl:px-[18px] @3xl:pt-0 @3xl:first:border-l-0"
                >
                  <div className="flex items-center gap-2 border-b border-[var(--ink)] pb-[6px]">
                    <span className="h-2 w-2" style={{ background: column.ink }} />
                    <span className="text-[10px] font-bold tracking-[.22em] text-[var(--ink)] uppercase">
                      {fr.journal.severities[column.severity]}
                    </span>
                    <span className="flex-1" />
                    <span className="text-[11px] text-[var(--ink-soft)]">
                      {fr.journal.dispatches(entries.length)}
                    </span>
                  </div>
                  {entries.map((entry) => (
                    <Dispatch key={`${entry.t}-${entry.text}`} entry={entry} />
                  ))}
                </section>
              );
            })}
          </div>

          <ReductionTable board={view.season.reduction} />
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t-2 border-[var(--ink)] pt-[10px]">
          <span className="text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
            {fr.journal.historyLabel}
          </span>
          <span className="font-(family-name:--font-display) text-[12.5px] text-[var(--ink-quiet)] italic">
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

/**
 * **Le tableau de la victoire de test — public et nominatif, et c'est voulu.** La fiche 05 tient
 * la doctrine secrète ; ici il n'y a pas de doctrine, donc rien à protéger, et un test entre amis
 * veut qu'on se chambre (`src/domain/victory.ts`). Ce bloc disparaît avec l'échafaudage le jour
 * où les trois doctrines arrivent — il ne se transforme pas en barre de progression.
 */
function ReductionTable({ board }: { board: ReductionBoard }) {
  if (board.standings.length === 0) return null;
  return (
    <section className="mt-4 border-t border-[var(--ink)] pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[10px] font-bold tracking-[.22em] text-[var(--ink)] uppercase">
          {fr.victory.kicker}
        </span>
        <span className="font-(family-name:--font-display) text-[12.5px] text-[var(--ink-quiet)] italic">
          {fr.victory.scaffold}
        </span>
      </div>
      <div className="mt-[7px] flex flex-wrap gap-x-5 gap-y-[6px]">
        {board.standings.map((standing) => (
          <span key={standing.nickname} className="flex items-baseline gap-[7px] text-[13px]">
            <span
              className="h-2 w-2 shrink-0 self-center"
              style={{
                background: standing.isReduced ? 'var(--critical)' : 'transparent',
                border: standing.isReduced ? 'none' : '1px solid rgba(42,33,24,.5)',
              }}
            />
            <span className={standing.isMine ? 'font-bold text-[var(--ink)]' : 'text-[var(--ink)]'}>
              {standing.nation === null ? standing.nickname : nationLabel(standing.nation)}
            </span>
            <span className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
              {fr.victory.tally(standing.reduced, board.target)}
            </span>
            <span className="text-[10px] tracking-[.16em] text-[var(--ink-faint)] uppercase">
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
      className="border-b border-[rgba(42,33,24,.16)] py-[10px] last:border-b-0"
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
      <div className="mt-[3px] font-(family-name:--font-display) text-[16px] leading-[1.15] font-semibold text-[var(--ink)]">
        {entry.text}
      </div>
      {(entry.remaining || entry.resolutionAt) && (
        <div className="mt-[3px] text-[12px] leading-[1.4] text-[var(--ink-soft)]">
          {entry.remaining
            ? fr.journal.remaining(entry.remaining)
            : fr.journal.resolutionAt(entry.resolutionAt ?? '')}
        </div>
      )}
    </div>
  );
}
