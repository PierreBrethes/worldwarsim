import { useMutation } from 'convex/react';
import { useCallback, useState, type ReactNode } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { isAlarm } from '@/domain/journal';
import {
  groupJournal,
  journalLines,
  passesFilter,
  type JournalBundle,
  retainBundles,
  type JournalFilter,
} from '@/domain/journal-lines';
import { asDayAndTime } from '@/domain/duration';
import { Stamp } from '@/shell/Stamp';
import {
  seasonDayOf,
  type CombatReport,
  type JournalDispatch,
  type DispatchSeverity,
  type PlayerView,
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

const keyOf = (dispatch: JournalDispatch): string => `${dispatch.at}-${dispatch.text}`;

/** **La clé d'une liasse est celle de sa plus ancienne dépêche** : une dépêche qui arrive en tête ne
 *  change ni la clé d'une liasse dépliée, ni son état. Deux dépêches de même heure et même phrase se
 *  départagent par leur rang depuis le bas : une clé ne se répète pas. */
const bundleKeysOf = (bundles: ReadonlyArray<JournalBundle>): string[] => {
  const seen = new Map<string, number>();
  const keys = bundles.map(() => '');
  for (let rank = bundles.length - 1; rank >= 0; rank--) {
    const base = keyOf(bundles[rank]!.oldest.dispatch);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    keys[rank] = `${base}#${n}`;
  }
  return keys;
};

const FILTERS: ReadonlyArray<JournalFilter> = ['all', 'unread', 'critical', 'notable', 'routine'];

/**
 * **Le journal en télex, une seule mise en page pour toutes les largeurs** (refonte mobile, #180) :
 * une ligne par dépêche — l'heure, la sorte, le titre —, les cinq cases de filtre avec leur compte,
 * et le détail qui monte en feuille au pied de la fenêtre, où ‹ › se lisent à la suite. Ce que la
 * fenêtre est (feuille pleine page sous le seuil, marge à droite au-dessus) tient au cadre, pas à
 * son contenu.
 *
 * **Lu à la fermeture, jamais à l'ouverture** : ce qu'on a eu le temps de voir est lu, et une
 * fenêtre ouverte par erreur ne vide pas le bandeau. Le refus n'a rien à dire au joueur — la pire
 * suite est un compteur qui reste allumé, jamais une action perdue.
 *
 * **Ce qui mène à la carte referme le journal sous le seuil** : il y couvre la carte entière ;
 * au bureau il reste en marge, et on lit trois dépêches à la suite sans perdre le fil.
 */
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
   *  engagement : sa feuille s'ouvre d'emblée. */
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
  const close = useCallback(() => {
    void markRead(seat).catch(() => undefined);
    onClose();
  }, [markRead, seat, onClose]);
  const leaving =
    <T,>(then: (subject: T) => void) =>
    (subject: T) => {
      if (narrow) close();
      then(subject);
    };

  const lines = journalLines(view.journal);
  const [filter, setFilter] = useState<JournalFilter>('all');
  const [picked, setPicked] = useState<string | null>(() => {
    const lead =
      leadReport === null
        ? undefined
        : lines.find((line) => line.dispatch.combat?.id === leadReport);
    return lead === undefined ? null : keyOf(lead.dispatch);
  });
  /** Les liasses se forment sur l'ordre entier, puis le filtre en retire des lignes ; ‹ › lit leurs
   *  dépêches aplaties, dans l'ordre du journal. */
  const bundles = retainBundles(groupJournal(lines), filter);
  const bundleKeys = bundleKeysOf(bundles);
  const shown = bundles.flatMap((bundle) => bundle.lines);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  /** Ouvrir une dépêche déplie la liasse qui la porte : ‹ › y entre sans la chercher. */
  const pick = (dispatch: JournalDispatch) => {
    setPicked(keyOf(dispatch));
    const at = bundles.findIndex((bundle) =>
      bundle.lines.some((line) => line.dispatch === dispatch),
    );
    const key = bundleKeys[at];
    if (key !== undefined && bundles[at]!.lines.length > 1) setOpen((was) => new Set(was).add(key));
  };
  const at = shown.findIndex((line) => keyOf(line.dispatch) === picked);
  const sheet = at < 0 ? null : shown[at];
  const unread = lines.filter((line) => line.dispatch.unread).length;
  const count = (key: JournalFilter) =>
    lines.filter((line) => passesFilter(line.dispatch, key)).length;
  /** Ce que le serveur a daté d'une heure à venir (`resolutionAt`) : « au réveil » ne trie rien. */
  const stalled = view.journal.filter((dispatch) => dispatch.resolutionAt !== null);
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const { day, totalDays } = seasonDayOf(view.season);
  const season =
    totalDays === null
      ? fr.journal.seasonDayNoClock(view.season.number, day)
      : fr.journal.seasonDay(view.season.number, day, totalDays);
  const revealRumor = (rumor: LootRumor) => {
    onSelectRumor(rumor);
    close();
  };

  return (
    /** Une clé de géométrie propre au dock : celle de l'ancienne modale centrée, relue ici, posait
     *  le panneau à sa taille et poussait son décalage hors de l'écran. */
    <FloatingWindow
      name={narrow ? 'journal' : 'journal-dock'}
      onClose={close}
      {...windowProps}
      alignment="right"
      width={narrow ? 1040 : 440}
    >
      <article className="paper-grain @container relative flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)] text-[var(--ink)]">
        <WindowHead
          eyebrow={
            <>
              {fr.journal.editionOf(time)}
              {view.mode !== 'blitz' && <span className="block">{season}</span>}
            </>
          }
          title={fr.journal.title}
          dense
          onClose={close}
        >
          {view.season.outcome.concludedAt !== null && (
            <Stamp label={fr.stamps.seasonClosed} size="small" />
          )}
        </WindowHead>

        <div
          role="radiogroup"
          className="mx-[10px] my-2 grid shrink-0 grid-cols-5 border border-[var(--ink)]"
        >
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={filter === key}
              onClick={() => setFilter(key)}
              className={`flex min-h-[30px]! cursor-pointer flex-col items-center gap-[2px] border-l border-[var(--ink)] pt-1 pb-[5px] first:border-l-0 ${
                filter === key ? 'bg-[var(--ink)] text-[var(--paper)]' : ''
              }`}
            >
              <b
                className="font-(family-name:--font-mono) text-[13px] leading-none font-semibold"
                style={
                  key === 'unread' && filter !== key && unread > 0
                    ? { color: 'var(--critical)' }
                    : undefined
                }
              >
                {count(key)}
              </b>
              <span className="text-[8.5px] leading-none font-semibold tracking-[.12em] uppercase">
                {fr.journal.filters[key]}
              </span>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[var(--ink)]">
          {view.mode !== 'blitz' && <Waking view={view} stalled={stalled} />}
          {bundles.map((bundle, rank) => {
            const head = bundle.head.dispatch;
            const key = bundleKeys[rank] ?? '';
            return bundle.lines.length === 1 ? (
              <TelexLine
                key={key}
                dispatch={head}
                picked={keyOf(head) === picked}
                onOpen={() => pick(head)}
              />
            ) : (
              <Bundle
                key={key}
                bundle={bundle}
                expanded={open.has(key)}
                picked={picked}
                onToggle={() => toggle(key)}
                onOpen={pick}
              />
            );
          })}
          {shown.length === 0 && (
            <p className="px-4 py-6 text-center font-(family-name:--font-text) text-[14px] text-[var(--ink-soft)] italic">
              {lines.length === 0 ? fr.journal.none : fr.journal.noneFiltered}
            </p>
          )}
          <div className="px-4 pb-5">
            <WorldEvents rumors={rumors} selectedRumorId={selectedRumorId} onSelect={revealRumor} />
          </div>
        </div>

        {sheet !== null && sheet !== undefined && (
          <DispatchReader
            line={sheet}
            rank={at}
            total={shown.length}
            station={sheet.dispatch.combat ? garrisonAt(sheet.dispatch.combat) : null}
            onStep={(step) => {
              const next = shown[at + step];
              if (next !== undefined) pick(next.dispatch);
            }}
            onShowCombat={leaving(onShowCombat)}
            onLocate={leaving(onLocate)}
            onOpenGarrison={leaving(onOpenGarrison)}
            onClose={() => setPicked(null)}
          />
        )}
      </article>
    </FloatingWindow>
  );
}

/** **Le réveil reste en tête** : le seul compteur qui décide de la visite. Une Blitz n'a ni slots
 *  ni plage de repos (B2, B5) : rien à y dire. */
function Waking({ view, stalled }: { view: PlayerView; stalled: ReadonlyArray<JournalDispatch> }) {
  return (
    <div className="flex flex-col gap-[3px] border-b border-(color:--ink)/30 bg-(--paper-pile)/40 px-3 py-[7px]">
      <div className="flex items-baseline gap-2">
        <span className="text-[9px] font-bold tracking-[.18em] uppercase">
          {fr.journal.atWaking}
        </span>
        <span className="flex-1" />
        <span className="text-[11px] text-[var(--ink-soft)]">{fr.journal.slotsEngaged}</span>
        <span className="font-(family-name:--font-mono) text-[12px]">
          {view.me.slots.used} / {view.me.slots.total}
        </span>
      </div>
      {stalled.length > 0 ? (
        stalled.map((entry) => (
          <p
            key={keyOf(entry)}
            className="font-(family-name:--font-text) text-[12.5px] leading-[1.35] break-words"
          >
            {entry.text}
            {fr.journal.stalledResolution}
            <span className="font-(family-name:--font-mono)">{entry.resolutionAt}</span>.
          </p>
        ))
      ) : (
        <p className="font-(family-name:--font-text) text-[12.5px] leading-[1.35] text-[var(--ink-soft)]">
          {fr.journal.noneStalled}
        </p>
      )}
    </div>
  );
}

/** **Une ligne, une dépêche** : l'heure, la barre de gravité — pleine quand elle est neuve, en
 *  pointillé quand elle est lue —, la sorte, le titre. Le non lu se lit au gras. Sur deux lignes
 *  quand la fenêtre est étroite (l'heure et la sorte, puis la phrase), sur une au bureau : c'est la
 *  largeur de la fenêtre qui décide, jamais celle de l'écran, et à `@[420px]` plutôt qu'à `@md` (448 px) : le dock du bureau ne fait que ≈ 438 px et resterait sur deux lignes, un téléphone (≈ 388 px) y reste. `end` est la queue d'une
 *  liasse (« depuis », « × N », ▾) ; `tint` la distingue d'une dépêche seule. */
function TelexLine({
  dispatch,
  picked,
  onOpen,
  unread = dispatch.unread,
  end,
  expanded,
  tint = false,
}: {
  dispatch: JournalDispatch;
  picked: boolean;
  onOpen: () => void;
  unread?: boolean;
  end?: ReactNode;
  expanded?: boolean;
  tint?: boolean;
}) {
  const ink = SEVERITY_INK[dispatch.severity];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={picked}
      aria-expanded={expanded}
      className={`grid min-h-[56px]! w-full cursor-pointer grid-cols-[3px_44px_minmax(0,1fr)_auto] items-center gap-x-[6px] gap-y-[2px] border-b border-(color:--ink)/16 py-[7px] pr-[10px] pl-3 text-left @[420px]:h-[30px] @[420px]:min-h-[30px]! @[420px]:grid-cols-[36px_3px_96px_minmax(0,1fr)_auto] @[420px]:py-0 ${
        picked
          ? 'bg-(--paper-pile)/70'
          : tint
            ? 'bg-(--paper-pile)/35 hover:bg-(--paper-pile)/60'
            : ''
      }`}
    >
      <span
        aria-hidden
        className="col-start-1 row-span-2 row-start-1 my-[2px] self-stretch @[420px]:col-start-2 @[420px]:row-span-1 @[420px]:my-[7px]"
        style={unread ? { background: ink } : { borderLeft: `2px dotted ${ink}` }}
      />
      <span
        className="col-start-2 row-start-1 font-(family-name:--font-mono) text-[11px] @[420px]:col-start-1"
        style={{
          color: unread ? 'var(--ink)' : 'var(--ink-soft)',
          fontWeight: unread ? 600 : 400,
        }}
      >
        {dispatch.t.slice(0, 5)}
      </span>
      <span
        className="col-start-3 row-start-1 line-clamp-2 text-[9px] leading-[1.25] font-semibold tracking-[.08em] uppercase"
        style={{ color: isAlarm(dispatch.kind) ? 'var(--critical)' : 'var(--ink-soft)' }}
      >
        {fr.stamps.dispatches[dispatch.kind]}
      </span>
      <span
        className="col-span-3 col-start-2 row-start-2 line-clamp-2 font-(family-name:--font-text) text-[14px] leading-[1.3] @[420px]:col-span-1 @[420px]:col-start-4 @[420px]:row-start-1 @[420px]:line-clamp-1 @[420px]:text-[13.5px]"
        style={{
          color: unread ? 'var(--ink)' : 'var(--ink-soft)',
          fontWeight: unread ? 600 : 400,
        }}
      >
        {dispatch.text}
      </span>
      {end !== undefined && (
        <span className="col-start-4 row-start-1 flex items-center gap-[6px] font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)] @[420px]:col-start-5">
          {end}
        </span>
      )}
    </button>
  );
}

/** **Une liasse** (`groupJournal`) : la ligne de sa dépêche la plus récente, « × N » et ▾ ; non lue
 *  si l'une des siennes l'est. Dépliée, ses dépêches suivent en lignes serrées sous un filet, et
 *  chacune s'ouvre dans la feuille. */
function Bundle({
  bundle,
  expanded,
  picked,
  onToggle,
  onOpen,
}: {
  bundle: JournalBundle;
  expanded: boolean;
  picked: string | null;
  onToggle: () => void;
  onOpen: (dispatch: JournalDispatch) => void;
}) {
  const head = bundle.head.dispatch;
  const oldest = bundle.oldest.dispatch;
  return (
    <>
      <TelexLine
        dispatch={head}
        picked={false}
        tint
        expanded={expanded}
        unread={bundle.lines.some((line) => line.dispatch.unread)}
        onOpen={onToggle}
        end={
          <>
            {oldest.t.slice(0, 5) !== head.t.slice(0, 5) && (
              <span className="@[420px]:hidden">
                {fr.journal.bundleSince(oldest.t.slice(0, 5))}
              </span>
            )}
            <b className="font-semibold text-[var(--ink)]">
              {fr.journal.bundleCount(bundle.lines.length)}
            </b>
            <span aria-hidden>{expanded ? '▴' : '▾'}</span>
          </>
        }
      />
      {expanded && (
        <div className="ml-3 border-b border-[var(--ink)] border-l-[3px] bg-(--paper-pile)/20">
          {bundle.lines.map(({ dispatch }, rank) => (
            <button
              key={`${keyOf(dispatch)}#${bundle.lines.length - rank}`}
              type="button"
              onClick={() => onOpen(dispatch)}
              aria-current={keyOf(dispatch) === picked}
              className={`grid min-h-[44px]! w-full cursor-pointer grid-cols-[44px_minmax(0,1fr)] items-center gap-x-[6px] border-b border-(color:--ink)/16 py-1 pr-[10px] pl-[9px] text-left last:border-b-0 @[420px]:min-h-[28px]! @[420px]:grid-cols-[40px_minmax(0,1fr)] ${
                keyOf(dispatch) === picked ? 'bg-(--paper-pile)/70' : ''
              }`}
            >
              <span
                className="font-(family-name:--font-mono) text-[11px]"
                style={{
                  color: dispatch.unread ? 'var(--ink)' : 'var(--ink-soft)',
                  fontWeight: dispatch.unread ? 600 : 400,
                }}
              >
                {dispatch.t.slice(0, 5)}
              </span>
              <span
                className="line-clamp-2 font-(family-name:--font-text) text-[13.5px] leading-[1.3] @[420px]:line-clamp-1"
                style={{
                  color: dispatch.unread ? 'var(--ink)' : 'var(--ink-soft)',
                  fontWeight: dispatch.unread ? 600 : 400,
                }}
              >
                {dispatch.text}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** **La feuille d'une dépêche**, au pied de la fenêtre : le détail, ses gestes, et ‹ › pour lire
 *  la suivante sans refermer. Une dépêche de combat mène à son lieu et porte ses deux gestes — voir
 *  sur la carte, ouvrir la garnison ; les autres se lisent, et ne mènent qu'où leur `place` va. */
function DispatchReader({
  line,
  rank,
  total,
  station,
  onStep,
  onShowCombat,
  onLocate,
  onOpenGarrison,
  onClose,
}: {
  line: { readonly dispatch: JournalDispatch; readonly earlier: number };
  rank: number;
  total: number;
  station: TroopStation | null;
  onStep: (step: -1 | 1) => void;
  onShowCombat: (combat: CombatReport) => void;
  onLocate: (place: Place) => void;
  onOpenGarrison: (station: TroopStation) => void;
  onClose: () => void;
}) {
  const { dispatch, earlier } = line;
  const { combat, place } = dispatch;
  const step =
    'grid h-8 w-9 cursor-pointer place-items-center border border-[var(--ink)] text-[16px] leading-none disabled:cursor-default disabled:opacity-35';
  const act = 'min-h-[42px] flex-1 cursor-pointer text-[10px] font-bold tracking-[.14em] uppercase';
  return (
    <aside
      aria-label={fr.journal.dispatchLabel}
      className="absolute inset-x-0 bottom-0 z-[3] flex max-h-[56%] flex-col border-t-2 border-[var(--ink)] paper-grain shadow-[var(--shadow-float)]"
    >
      <div className="flex items-center gap-[6px] border-b border-(color:--ink)/30 py-2 pr-[10px] pl-[14px]">
        <span className="flex-1 font-(family-name:--font-mono) text-[10px] tracking-[.1em] text-[var(--ink-soft)] uppercase">
          {fr.journal.sheetKicker(dispatch.t, rank + 1, total)}
        </span>
        <button
          type="button"
          disabled={rank === 0}
          onClick={() => onStep(-1)}
          aria-label={fr.journal.previous}
          className={step}
        >
          ‹
        </button>
        <button
          type="button"
          disabled={rank === total - 1}
          onClick={() => onStep(1)}
          aria-label={fr.journal.next}
          className={step}
        >
          ›
        </button>
        <button type="button" onClick={onClose} aria-label={fr.common.close} className={step}>
          ×
        </button>
      </div>
      <div className="flex flex-col gap-[9px] overflow-y-auto overscroll-contain px-[14px] pt-[10px] pb-[14px]">
        <div className="flex items-center gap-2">
          <span
            className="h-[9px] w-[9px]"
            style={{ background: SEVERITY_INK[dispatch.severity] }}
          />
          <span
            className="text-[9.5px] font-bold tracking-[.18em] uppercase"
            style={{ color: SEVERITY_INK[dispatch.severity] }}
          >
            {fr.journal.severities[dispatch.severity]}
          </span>
          <span className="flex-1" />
          <Stamp
            label={fr.stamps.dispatches[dispatch.kind]}
            tone={isAlarm(dispatch.kind) ? 'critical' : 'ink'}
            size="small"
          />
        </div>
        <h3 className="font-(family-name:--font-display) text-[16px] leading-[1.25] font-bold text-pretty break-words">
          {dispatch.text}
        </h3>
        {dispatch.resolutionAt && (
          <span className="font-(family-name:--font-text) text-[12.5px] text-[var(--ink-soft)]">
            {fr.journal.resolutionAt(dispatch.resolutionAt)}
          </span>
        )}
        {earlier > 0 && (
          <span className="font-(family-name:--font-text) text-[12.5px] text-[var(--ink-soft)] italic">
            {fr.journal.earlierEditions(earlier)}
          </span>
        )}
        {(combat !== null || place !== null) && (
          <div className="flex gap-[6px]">
            <button
              type="button"
              onClick={() =>
                combat !== null ? onShowCombat(combat) : place !== null && onLocate(place)
              }
              className={`${act} bg-[var(--ink)] text-[var(--paper)]`}
            >
              {fr.journal.showOnMap}
            </button>
            {station !== null && (
              <button
                type="button"
                onClick={() => onOpenGarrison(station)}
                className={`${act} border border-[var(--ink)]`}
              >
                {fr.dispatchSheet.openGarrison}
              </button>
            )}
          </div>
        )}
        <ReplayButton dispatch={dispatch} className={`${act} w-full border border-[var(--ink)]`} />

        {combat !== null && <CombatLines combat={combat} />}
      </div>
    </aside>
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
