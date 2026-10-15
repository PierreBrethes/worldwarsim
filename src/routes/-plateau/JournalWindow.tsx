import { useMutation } from 'convex/react';
import { useCallback, useState, type ReactNode } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr, nationLabel } from '@/i18n/fr';
import { isAlarm } from '@/domain/journal';
import { journalSections } from '@/domain/journal-sections';
import { asDayAndTime } from '@/domain/duration';
import { Stamp } from '@/shell/Stamp';
import {
  seasonDayOf,
  type CombatReport,
  type JournalDispatch,
  type DispatchSeverity,
  type PlayerView,
  type ReductionBoard,
  type TroopStation,
} from '@/domain/player-view';
import { useNarrowScreen } from '@/shell/viewport';
import { CombatLines } from './DispatchSheet';
import { ReplayButton } from './ReplayDeck';
import { FloatingWindow, type WindowProps, WindowHead } from './Window';
import type { Seat } from '@/data/session';

const SEVERITY_INK: Readonly<Record<DispatchSeverity, string>> = {
  critical: 'var(--critical)',
  notable: 'var(--notable-paper)',
  routine: 'var(--routine)',
};

type Place = NonNullable<JournalDispatch['place']>;

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
  garrisonAt,
  onShowCombat,
  onLocate,
  onOpenGarrison,
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
  /** Ce qui se tient encore à soi au lieu d'un combat — `null` quand il n'y a rien à ouvrir. */
  garrisonAt: (combat: CombatReport) => TroopStation | null;
  onShowCombat: (combat: CombatReport) => void;
  onLocate: (place: Place) => void;
  onOpenGarrison: (station: TroopStation) => void;
}) {
  const narrow = useNarrowScreen();
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
  const { day, totalDays } = seasonDayOf(view.season);
  const seasonDay =
    totalDays === null
      ? fr.journal.seasonDayNoClock(view.season.number, day)
      : fr.journal.seasonDay(view.season.number, day, totalDays);

  if (narrow) {
    /** Ce qui mène à la carte referme le journal : sur un téléphone il couvre la carte entière. */
    const leaving =
      <T,>(then: (subject: T) => void) =>
      (subject: T) => {
        close();
        then(subject);
      };
    return (
      <FloatingWindow name="journal" onClose={close} {...windowProps} width={1040}>
        <NarrowJournal
          view={view}
          edition={`${fr.journal.editionOf(time)} · ${seasonDay}`}
          lead={lead}
          stalled={stalled}
          garrisonAt={garrisonAt}
          onShowCombat={leaving(onShowCombat)}
          onOpenGarrison={leaving(onOpenGarrison)}
          onClose={close}
        >
          <div className="px-4 pb-6">
            <WorldEvents rumors={rumors} selectedRumorId={selectedRumorId} onSelect={revealRumor} />
            <ReductionLine board={view.season.reduction} />
          </div>
        </NarrowJournal>
      </FloatingWindow>
    );
  }

  return (
    /** Une clé de géométrie neuve : celle de l'ancienne modale centrée de 1040 px, relue ici,
     *  posait le panneau à sa taille et poussait son décalage hors de l'écran. */
    <FloatingWindow
      name="journal-dock"
      onClose={close}
      {...windowProps}
      alignment="right"
      width={440}
    >
      <DeskJournal
        view={view}
        edition={`${fr.journal.editionOf(time)} · ${seasonDay}`}
        selected={leadReport === null ? null : lead}
        stalled={stalled}
        onLocate={onLocate}
        onClose={close}
      >
        <div className="px-5 pb-5">
          <WorldEvents rumors={rumors} selectedRumorId={selectedRumorId} onSelect={revealRumor} />
          <ReductionLine board={view.season.reduction} />
        </div>
      </DeskJournal>
    </FloatingWindow>
  );
}

/**
 * **Le journal du bureau tient en marge, et la carte reste à côté** (piste 1c du 12/10). Il
 * répondait à « qu'est-ce qui a changé ? » par une manchette, trois colonnes et une modale qui
 * couvrait la carte ; or presque tout ce qu'il dit a eu lieu *quelque part*. En marge, « localiser »
 * recentre la carte sans refermer la liste, et on lit trois dépêches à la suite sans perdre le fil.
 *
 * **Une ligne par dépêche, les rubriques empilées, la routine repliée** (piste 1a) : une rubrique
 * vide n'a pas de titre, et une dépêche lue passe à l'encre douce au lieu de s'estomper jusqu'à
 * l'illisible.
 */
function DeskJournal({
  view,
  edition,
  selected,
  stalled,
  onLocate,
  onClose,
  children,
}: {
  view: PlayerView;
  edition: string;
  selected: JournalDispatch | null;
  stalled: ReadonlyArray<JournalDispatch>;
  onLocate: (place: Place) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [routineOpen, setRoutineOpen] = useState(false);
  /** Par sa clé et non par l'objet : la vue se reconstruit à chaque écriture du serveur, et la
   *  ligne localisée perdait sa surbrillance au premier pas d'une colonne. */
  const [picked, setPicked] = useState(selected === null ? null : keyOf(selected));
  const sections = journalSections(view.journal);
  const unread = sections
    .flatMap(({ lines }) => lines)
    .filter(({ dispatch }) => dispatch.unread).length;
  const locate = (dispatch: JournalDispatch, place: Place) => {
    setPicked(keyOf(dispatch));
    onLocate(place);
  };

  return (
    <article className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)] text-[var(--ink)]">
      <WindowHead
        eyebrow={
          <>
            {edition} ·{' '}
            {unread > 0 ? (
              <span className="text-[var(--critical)]">
                {unread} {fr.journal.unreadLabel(unread)}
              </span>
            ) : (
              fr.journal.allRead
            )}
          </>
        }
        title={fr.journal.masthead}
        onClose={onClose}
      >
        {view.season.reduction.concludedAt !== null && (
          <Stamp label={fr.stamps.seasonClosed} size="small" />
        )}
      </WindowHead>

      {/* **Le réveil reste en tête** : c'est le seul compteur qui décide de la visite. Une Blitz
          n'a ni slots ni plage de repos (B2, B5) : rien à y dire. */}
      {view.mode !== 'blitz' && (
        <div className="flex shrink-0 flex-col gap-1 border-b border-(color:--ink)/30 px-5 py-[9px]">
          <div className="flex items-baseline gap-3">
            <span className="text-[10px] font-bold tracking-[.18em] uppercase">
              {fr.journal.atWaking}
            </span>
            <span className="flex-1" />
            <span className="text-[12px] text-[var(--ink-soft)]">{fr.journal.slotsEngaged}</span>
            <span className="font-(family-name:--font-mono) text-[13px]">
              {view.me.slots.used} / {view.me.slots.total}
            </span>
          </div>
          {stalled.length > 0 ? (
            stalled.map((entry) => (
              <p
                key={`${entry.at}-${entry.text}`}
                className="font-(family-name:--font-text) text-[13.5px] leading-[1.4] break-words"
              >
                {entry.text}
                {fr.journal.stalledResolution}
                <span className="font-(family-name:--font-mono)">{entry.resolutionAt}</span>.
              </p>
            ))
          ) : (
            <p className="font-(family-name:--font-text) text-[13.5px] leading-[1.4] text-[var(--ink-soft)]">
              {fr.journal.noneStalled}
            </p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {sections.map(({ severity, lines }) => {
          const folds = severity === 'routine';
          const open = !folds || routineOpen;
          return (
            <section key={severity}>
              <button
                type="button"
                disabled={!folds}
                aria-expanded={folds ? open : undefined}
                onClick={() => setRoutineOpen(!routineOpen)}
                className="flex w-full items-center gap-[10px] border-b border-[var(--ink)] px-5 pt-[14px] pb-[6px] text-left enabled:cursor-pointer"
              >
                <span
                  className="h-[9px] w-[9px] shrink-0"
                  style={{ background: SEVERITY_INK[severity] }}
                />
                <span className="text-[11px] font-bold tracking-[.2em] uppercase">
                  {fr.journal.severities[severity]}
                </span>
                <span className="flex-1" />
                <span className="text-[12px] text-[var(--ink-soft)]">
                  {fr.journal.dispatches(lines.length)}
                  {folds && ` · ${open ? fr.journal.fold.hide : fr.journal.fold.show}`}
                </span>
              </button>
              {open &&
                lines.map(({ dispatch, earlier }) => (
                  <DeskLine
                    key={keyOf(dispatch)}
                    dispatch={dispatch}
                    earlier={earlier}
                    picked={keyOf(dispatch) === picked}
                    onLocate={(place) => locate(dispatch, place)}
                  />
                ))}
            </section>
          );
        })}
        {children}
      </div>
    </article>
  );
}

const keyOf = (dispatch: JournalDispatch): string => `${dispatch.at}-${dispatch.text}`;

function DeskLine({
  dispatch,
  earlier,
  picked,
  onLocate,
}: {
  dispatch: JournalDispatch;
  earlier: number;
  picked: boolean;
  onLocate: (place: Place) => void;
}) {
  const { place } = dispatch;
  return (
    <div
      className="flex flex-col gap-[3px] border-b border-(color:--ink)/16 px-5 py-[9px]"
      style={picked ? { background: 'color-mix(in srgb, var(--paper-pile) 85%, transparent)' } : {}}
    >
      <div className="flex items-center gap-2">
        <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
          {dispatch.t}
        </span>
        <span className="flex-1" />
        <Stamp
          label={fr.stamps.dispatches[dispatch.kind]}
          tone={isAlarm(dispatch.kind) ? 'critical' : 'ink'}
          size="small"
        />
        {place !== null && (
          <button
            type="button"
            onClick={() => onLocate(place)}
            className="cursor-pointer text-[10.5px] tracking-[.14em] uppercase underline underline-offset-[3px] hover:text-[var(--critical)]"
          >
            {fr.journal.locate}
          </button>
        )}
        <ReplayButton
          dispatch={dispatch}
          className="cursor-pointer text-[10.5px] tracking-[.14em] uppercase underline underline-offset-[3px] hover:text-[var(--critical)]"
        />
      </div>
      <span
        className="font-(family-name:--font-text) text-[15px] leading-[1.3] text-pretty break-words"
        style={
          dispatch.unread ? { fontWeight: 600, color: 'var(--ink)' } : { color: 'var(--ink-soft)' }
        }
      >
        {dispatch.text}
      </span>
      {dispatch.resolutionAt && (
        <span className="font-(family-name:--font-text) text-[12px] text-[var(--ink-soft)]">
          {fr.journal.resolutionAt(dispatch.resolutionAt)}
        </span>
      )}
      {earlier > 0 && (
        <span className="font-(family-name:--font-text) text-[12px] text-[var(--ink-soft)] italic">
          {fr.journal.earlierEditions(earlier)}
        </span>
      )}
    </div>
  );
}

type JournalFilter = 'all' | 'unread' | DispatchSeverity;

const passes = (dispatch: JournalDispatch, filter: JournalFilter): boolean =>
  filter === 'all' || (filter === 'unread' ? dispatch.unread : dispatch.severity === filter);

/**
 * **Le journal du téléphone : un seul défilement** (refonte mobile, 1h). Restent collés en tête
 * l'édition, « fermer » et les filtres ; la manchette défile avec le reste. Les trois colonnes du
 * bureau deviennent des filtres — trois défilements dans 390 px n'en font aucun de lisible — et
 * le fil se coupe en deux : ce qui est arrivé depuis la dernière visite, puis ce qui est lu.
 *
 * **Une dépêche de combat mène à son lieu**, et la manchette d'une attaque porte ses deux gestes
 * — voir sur la carte, ouvrir la garnison. Les autres dépêches n'ont pas d'adresse servie : elles
 * se lisent, elles ne mènent nulle part. Le pied fixe « retour au plateau » est parti : « fermer »
 * est en tête, et la barre de pied reste sous le pouce.
 */
function NarrowJournal({
  view,
  edition,
  lead,
  stalled,
  garrisonAt,
  onShowCombat,
  onOpenGarrison,
  onClose,
  children,
}: {
  view: PlayerView;
  edition: string;
  lead: JournalDispatch | null;
  stalled: ReadonlyArray<JournalDispatch>;
  garrisonAt: (combat: CombatReport) => TroopStation | null;
  onShowCombat: (combat: CombatReport) => void;
  onOpenGarrison: (station: TroopStation) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [filter, setFilter] = useState<JournalFilter>('all');
  const listed = new Set(
    journalSections(view.journal).flatMap(({ lines }) => lines.map((line) => line.dispatch)),
  );
  const dispatches = view.journal.filter((dispatch) => listed.has(dispatch));
  const unread = dispatches.filter((dispatch) => dispatch.unread);
  const shown = dispatches.filter((dispatch) => dispatch !== lead && passes(dispatch, filter));
  const fresh = shown.filter((dispatch) => dispatch.unread);
  const earlier = shown.filter((dispatch) => !dispatch.unread);
  const leadShown = lead !== null && passes(lead, filter);
  const station = lead?.combat ? garrisonAt(lead.combat) : null;
  const filters: ReadonlyArray<readonly [JournalFilter, string]> = [
    ['all', fr.journal.filters.all],
    ['unread', fr.journal.filters.unread(unread.length)],
    ['critical', fr.journal.filters.critical],
    ['notable', fr.journal.filters.notable],
    ['routine', fr.journal.filters.routine],
  ];

  return (
    <article className="paper-grain min-h-0 w-full flex-1 overflow-y-auto overscroll-contain text-[var(--ink)]">
      <div className="paper-grain sticky top-0 z-[2] border-b border-[var(--ink)]">
        <div className="flex h-[46px] items-center gap-[10px] pr-3 pl-4">
          <span className="flex-1 font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
            {edition}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer border border-[var(--ink)] px-3 text-[10px] font-semibold tracking-[.18em] uppercase"
          >
            {fr.common.close}
          </button>
        </div>
        <div className="flex gap-[5px] overflow-x-auto px-3 pb-[10px]">
          {filters.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`shrink-0 cursor-pointer border border-[var(--ink)] px-[9px] text-[10.5px] font-semibold tracking-[.1em] whitespace-nowrap uppercase ${
                filter === key ? 'bg-[var(--ink)] text-[var(--paper)]' : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-[14px]">
        <div className="border-t-[3px] border-[var(--ink)] pt-[2px]">
          <div className="border-t border-[var(--ink)]" />
        </div>
        <div className="flex items-center gap-3 border-b border-[var(--ink)] pt-[10px] pb-[9px]">
          <h2 className="min-w-0 flex-1 font-(family-name:--font-display) text-[29px] leading-[1.14] font-extrabold tracking-[.04em] uppercase">
            {fr.journal.masthead}
          </h2>
          {unread.length > 0 && (
            <span className="flex shrink-0 flex-col items-end gap-[4px] text-[var(--critical)]">
              <span className="font-(family-name:--font-display) text-[44px] leading-[.8] font-extrabold">
                {unread.length}
              </span>
              <span className="text-[9px] leading-none tracking-[.18em] whitespace-nowrap uppercase">
                {fr.journal.unreadLabel(unread.length)}
              </span>
            </span>
          )}
        </div>
        <div className="pt-[7px] text-center text-[10.5px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
          {nationLabel(view.me.nation)} · {fr.journal.dispatches(dispatches.length)}
          {view.season.reduction.concludedAt !== null && (
            <span className="ml-2 inline-block align-middle">
              <Stamp label={fr.stamps.seasonClosed} size="small" />
            </span>
          )}
        </div>
      </div>

      {leadShown && (
        <section className="mx-4 mt-[14px] border-b border-[var(--ink)] pb-[14px]">
          <div className="flex items-center gap-2">
            <span
              className="h-[9px] w-[9px] shrink-0"
              style={{ background: SEVERITY_INK[lead.severity] }}
            />
            <span
              className="text-[10px] font-bold tracking-[.2em] uppercase"
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
          <h3 className="mt-2 font-(family-name:--font-display) text-[23px] leading-[1.15] font-bold text-pretty break-words">
            {lead.text}
          </h3>
          {lead.combat !== null && (
            <>
              <div className="mt-2">
                <CombatLines combat={lead.combat} />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => lead.combat && onShowCombat(lead.combat)}
                  className="min-h-[44px] flex-1 cursor-pointer bg-[var(--ink)] text-[10.5px] font-bold tracking-[.16em] text-[var(--paper)] uppercase"
                >
                  {fr.journal.showOnMap}
                </button>
                {station !== null && (
                  <button
                    type="button"
                    onClick={() => onOpenGarrison(station)}
                    className="min-h-[44px] flex-1 cursor-pointer border border-[var(--ink)] text-[10.5px] font-bold tracking-[.16em] uppercase"
                  >
                    {fr.dispatchSheet.openGarrison}
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <ReplayButton
                  dispatch={lead}
                  className="min-h-[44px] w-full cursor-pointer border border-[var(--ink)] text-[10.5px] font-bold tracking-[.16em] uppercase"
                />
              </div>
            </>
          )}
        </section>
      )}

      {view.mode !== 'blitz' && (
        <section className="mx-4 mt-[14px] border border-[var(--ink)] px-3 py-[10px]">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold tracking-[.2em] uppercase">
              {fr.journal.atWaking}
            </span>
            <span className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-quiet)]">
              {fr.journal.slotsEngaged} {view.me.slots.used} / {view.me.slots.total}
            </span>
          </div>
          {stalled.length > 0 ? (
            stalled.map((entry) => (
              <p
                key={`${entry.at}-${entry.text}`}
                className="mt-[6px] font-(family-name:--font-text) text-[14px] leading-[1.45] break-words"
              >
                {entry.text}
                {fr.journal.stalledResolution}
                <span className="font-(family-name:--font-mono)">{entry.resolutionAt}</span>.
              </p>
            ))
          ) : (
            <p className="mt-[6px] font-(family-name:--font-text) text-[14px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.journal.noneStalled}
            </p>
          )}
        </section>
      )}

      {fresh.length > 0 && (
        <DispatchList
          title={fr.journal.sinceLastVisit}
          entries={fresh}
          onShowCombat={onShowCombat}
        />
      )}
      {earlier.length > 0 && (
        <DispatchList title={fr.journal.earlier} entries={earlier} onShowCombat={onShowCombat} />
      )}
      {shown.length === 0 && !leadShown && (
        <p className="px-4 py-6 text-center font-(family-name:--font-text) text-[14px] text-[var(--ink-soft)] italic">
          {fr.journal.noneFiltered}
        </p>
      )}
      {children}
    </article>
  );
}

/**
 * **Une liste de dépêches, une ligne chacune** : la gravité en carré — plein quand elle est
 * neuve, au trait quand elle est lue —, l'heure, la sorte en cachet, la phrase en vedette. Une
 * dépêche de combat porte son chevron : elle mène au lieu.
 */
function DispatchList({
  title,
  entries,
  onShowCombat,
}: {
  title: string;
  entries: ReadonlyArray<JournalDispatch>;
  onShowCombat: (combat: CombatReport) => void;
}) {
  return (
    <section className="mt-4">
      <h3 className="border-t-2 border-b border-[var(--ink)] px-4 py-[6px] text-[10px] font-bold tracking-[.18em] uppercase">
        {title}
      </h3>
      {entries.map((entry) => {
        const { combat } = entry;
        const line = (
          <>
            <span
              className="mt-[5px] h-[8px] w-[8px] shrink-0"
              style={
                entry.unread
                  ? { background: SEVERITY_INK[entry.severity] }
                  : { border: `1.5px solid ${SEVERITY_INK[entry.severity]}` }
              }
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
                  {entry.t}
                </span>
                <span className="flex-1" />
                <Stamp
                  label={fr.stamps.dispatches[entry.kind]}
                  tone={isAlarm(entry.kind) ? 'critical' : 'ink'}
                  size="small"
                />
              </span>
              <span
                className="mt-1 block font-(family-name:--font-display) text-[16.5px] leading-[1.3] font-semibold text-pretty break-words"
                style={{ color: entry.unread ? 'var(--ink)' : 'var(--ink-soft)' }}
              >
                {entry.text}
              </span>
              {entry.resolutionAt && (
                <span className="mt-[3px] block font-(family-name:--font-text) text-[12px] text-[var(--ink-soft)]">
                  {fr.journal.resolutionAt(entry.resolutionAt)}
                </span>
              )}
            </span>
          </>
        );
        const row =
          'flex w-full items-start gap-[10px] border-b border-(color:--ink)/16 py-3 pr-[14px] pl-4 text-left';
        return combat === null ? (
          <div key={`${entry.at}-${entry.text}`} className={row}>
            {line}
          </div>
        ) : (
          <div key={`${entry.at}-${entry.text}`}>
            <button
              type="button"
              title={fr.journal.showOnMap}
              onClick={() => onShowCombat(combat)}
              className={`${row} cursor-pointer`}
            >
              {line}
              <span
                aria-hidden
                className="self-center text-[20px] leading-none text-[var(--ink-soft)]"
              >
                ›
              </span>
            </button>
            {/* À côté de la ligne et non dedans : un bouton ne se pose pas dans un bouton. */}
            <div className="flex flex-col items-end gap-1 border-b border-(color:--ink)/16 px-4 py-[6px]">
              <ReplayButton
                dispatch={entry}
                className="min-h-[44px] cursor-pointer border border-[var(--ink)] px-4 text-[10.5px] font-bold tracking-[.16em] uppercase"
              />
            </div>
          </div>
        );
      })}
    </section>
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
