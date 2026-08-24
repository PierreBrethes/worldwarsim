import { fr, doctrineLabel, nationLabel } from '@/i18n/fr';
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
  onClose,
  ...windowProps
}: WindowProps & { view: PlayerView }) {
  const dispatches = view.journal;
  const lead =
    dispatches.find((dispatch) => dispatch.severity === 'critical') ?? dispatches[0] ?? null;
  const stalled = dispatches.find((dispatch) => dispatch.resolutionAt !== null);
  const embargo = dispatches.find((dispatch) => dispatch.remaining !== null);
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const day = Math.min(
    Math.ceil(view.season.durationHours / 24),
    Math.floor(view.season.elapsedHours / 24) + 1,
  );

  return (
    <FloatingWindow name="journal" onClose={onClose} {...windowProps} alignment="top" width={1040}>
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
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <div className="mt-[10px] shrink-0 border-t-2 border-b border-[var(--ink)] pt-[14px] pb-[10px] text-center">
          <h2 className="font-(family-name:--font-display) text-[clamp(26px,5.4cqi,54px)] leading-[.98] font-extrabold tracking-[.06em] text-[var(--ink)]">
            {fr.journal.masthead}
          </h2>
          <div className="mt-[9px] flex flex-wrap items-center justify-center gap-x-[14px] gap-y-1 text-[11px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            <span>
              {fr.journal.nationLine(
                nationLabel(view.me.nation),
                doctrineLabel(view.me.doctrine) ?? view.me.doctrine,
              )}
            </span>
            <span className="text-[#9d8f78]">·</span>
            <span>{fr.journal.dispatches(dispatches.length)}</span>
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
                {lead.replay && <ReplayButton full />}
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
          <span
            className="text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase"
            title={fr.journal.historyTitle}
          >
            {fr.journal.historyLabel}
          </span>
          <span className="font-(family-name:--font-display) text-[12.5px] text-[var(--ink-quiet)] italic">
            {fr.journal.keepNote}
          </span>
          <button
            type="button"
            onClick={onClose}
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

function Dispatch({ entry }: { entry: JournalDispatch }) {
  return (
    <div className="border-b border-[rgba(42,33,24,.16)] py-[10px] last:border-b-0">
      <div className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
        {entry.t}
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
      {entry.replay && <ReplayButton />}
    </div>
  );
}

function ReplayButton({ full = false }: { full?: boolean }) {
  return (
    <button
      type="button"
      disabled
      title={fr.journal.replayTitle}
      className={
        full
          ? 'mt-3 cursor-not-allowed bg-[var(--ink)] px-[13px] py-[9px] text-[10px] tracking-[.18em] text-[var(--paper)] uppercase opacity-70'
          : 'mt-[6px] cursor-not-allowed border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase opacity-70'
      }
    >
      {full ? fr.journal.seeReplay : fr.journal.replay}
    </button>
  );
}
