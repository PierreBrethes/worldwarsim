import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { fr } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { asLocalTime, asHoursMinutesSeconds } from '@/domain/duration';
import {
  timelineCounters,
  buildTimeline,
  isStalled,
  filterTimeline,
  msBeforeResolution,
  elapsedShare,
  type MovementCard,
  type TimelineFilter,
} from '@/domain/timeline';
import type { PlayerView } from '@/domain/player-view';
import { UnitSprite } from '@/emblems/UnitSprite';
import { keepTimelineCollapsed, readTimelineCollapsed } from '@/data/settings';

const CARD_WIDTH = 296;
const CARD_GAP = 24;
const STEP = CARD_WIDTH + CARD_GAP;

/**
 * The timeline stays printed on the board — no frame, rules and ink, three inks and three
 * only: mine, the critical of a heading coming at me, the muted grey of what brews
 * elsewhere. But the map passes underneath, and a light ink on a light coastline stops
 * reading: hence the fade toward the desk, tall enough to carry the whole card, without an
 * edge that would betray a panel laid on top.
 */
export function MovementTimeline({
  view,
  hoveredMovement,
  mapDesignatedMovement,
  onHover,
  onSelect,
}: {
  view: PlayerView;
  hoveredMovement: string | null;
  /** Only the map may move the track: a card hover does not make it flee. */
  mapDesignatedMovement: string | null;
  onHover: (id: string | null) => void;
  onSelect: (name: string | null) => void;
}) {
  const now = useClock();
  const cards = useMemo(() => buildTimeline(view), [view]);
  const [collapsed, setCollapsed] = useState(readTimelineCollapsed);
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const track = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState({ left: 0, window: 0, length: 0 });

  const kept = useMemo(() => filterTimeline(cards, filter), [cards, filter]);

  useEffect(() => {
    keepTimelineCollapsed(collapsed);
  }, [collapsed]);

  const measure = useCallback(() => {
    const node = track.current;
    if (!node) return;
    setRun({
      left: node.scrollLeft,
      window: node.clientWidth,
      length: node.scrollWidth,
    });
  }, []);

  useEffect(() => {
    const node = track.current;
    if (!node) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, collapsed, kept.length]);

  // Highlighting a card left out of the window would highlight nothing: the hover coming
  // from the map therefore brings the track onto it, by the shortest move.
  useEffect(() => {
    const node = track.current;
    if (!node || !mapDesignatedMovement) return;
    const rank = kept.findIndex((card) => card.id === mapDesignatedMovement);
    if (rank < 0) return;
    const leftEdge = rank * STEP;
    const rightEdge = leftEdge + CARD_WIDTH;
    if (leftEdge < node.scrollLeft) {
      node.scrollTo({ left: leftEdge, behavior: 'smooth' });
    } else if (rightEdge > node.scrollLeft + node.clientWidth) {
      node.scrollTo({ left: rightEdge - node.clientWidth, behavior: 'smooth' });
    }
  }, [mapDesignatedMovement, kept]);

  // Empty sky, the timeline does not vanish: it is where the slots are read, and "no
  // movement, two free slots" is exactly the state where one needs to know.
  const empty = cards.length === 0;
  const expanded = !collapsed && !empty;

  const slide = (step: number) =>
    track.current?.scrollBy({ left: step * STEP, behavior: 'smooth' });

  const leftBefore = run.left > 1;
  const leftAfter = run.left + run.window < run.length - 1;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-4 ${
        expanded ? 'pt-16' : 'pt-6'
      }`}
      style={{
        background: expanded
          ? 'linear-gradient(to top, rgba(15,10,4,.94) 0%, rgba(15,10,4,.88) 62%, rgba(15,10,4,.55) 84%, rgba(15,10,4,0) 100%)'
          : 'linear-gradient(to top, rgba(15,10,4,.9) 0%, rgba(15,10,4,.72) 55%, rgba(15,10,4,0) 100%)',
      }}
    >
      <div className="flex items-end gap-6 border-b border-[rgba(228,216,189,.18)] pb-2">
        <button
          type="button"
          disabled={empty}
          onClick={() => setCollapsed(!collapsed)}
          title={empty ? undefined : collapsed ? fr.timeline.expand : fr.timeline.collapse}
          className="pointer-events-auto flex shrink-0 items-baseline gap-3 bg-transparent enabled:cursor-pointer"
        >
          <span className="font-[var(--font-display)] text-[12px] font-semibold tracking-[.24em] text-[rgba(228,216,189,.58)] uppercase">
            {fr.timeline.header}
          </span>
          <span className="font-[var(--font-mono)] text-[15px] text-[var(--paper)]">
            {cards.length}
          </span>
          {!empty && (
            <span className="text-[10px] text-[rgba(228,216,189,.34)]">{collapsed ? '▲' : '▼'}</span>
          )}
        </button>

        {/* Slots count what can still be launched: their place is against the number of
            movements in flight, not in a banner one does not read while sending. */}
        <span
          title={fr.timeline.slotsTitle}
          className="flex shrink-0 items-baseline gap-3"
        >
          <span className="font-[var(--font-display)] text-[12px] font-semibold tracking-[.24em] text-[rgba(228,216,189,.58)] uppercase">
            {fr.timeline.slots}
          </span>
          <span className="font-[var(--font-mono)] text-[15px] text-[var(--paper)]">
            {view.me.slots.used} / {view.me.slots.total}
          </span>
        </span>

        {empty ? (
          <span className="flex-1 text-[11px] tracking-[.14em] text-[rgba(228,216,189,.3)] uppercase">
            {fr.timeline.empty}
          </span>
        ) : (
          <>
            <CounterRow
              cards={cards}
              filter={filter}
              onFilter={(requested) => {
                setFilter(requested);
                // Filtering a collapsed track would show nothing: the request means expand.
                setCollapsed(false);
                track.current?.scrollTo({ left: 0 });
              }}
            />
            <NextArrival cards={cards} now={now} />
          </>
        )}
      </div>

      {expanded && (
        <div className="relative mt-3">
          <Track node={track} onRun={measure}>
            {kept.map((card) => (
              <Card
                key={card.id}
                card={card}
                view={view}
                now={now}
                designated={card.id === hoveredMovement}
                onHover={onHover}
                onSelect={onSelect}
              />
            ))}
          </Track>
          <Rudder side="left" visible={leftBefore} onSlide={() => slide(-1)} />
          <Rudder side="right" visible={leftAfter} onSlide={() => slide(1)} />
        </div>
      )}
    </div>
  );
}

function CounterRow({
  cards,
  filter,
  onFilter,
}: {
  cards: ReadonlyArray<MovementCard>;
  filter: TimelineFilter;
  onFilter: (filter: TimelineFilter) => void;
}) {
  return (
    <div className="pointer-events-auto flex flex-1 flex-wrap items-end gap-2">
      {timelineCounters(cards).map((counter) => {
        const active = counter.key === filter;
        return (
          <button
            key={counter.key}
            type="button"
            onClick={() => onFilter(active ? 'all' : counter.key)}
            // The chosen filter prints in negative: on paper, it is the only difference that
            // shows without adding shadow or color.
            className={`flex cursor-pointer items-baseline gap-[7px] border px-[10px] pt-[5px] pb-[6px] ${
              active ? '' : 'paper-grain'
            }`}
            style={{
              background: active ? 'var(--ink)' : undefined,
              borderColor: counter.alert && !active ? 'var(--critical)' : 'var(--ink)',
              color: active
                ? 'var(--paper)'
                : counter.alert
                  ? 'var(--critical)'
                  : 'var(--ink-soft)',
            }}
          >
            <span className="text-[9.5px] tracking-[.18em] uppercase">{counter.label}</span>
            <span className="font-[var(--font-mono)] text-[13px] font-semibold">
              {counter.count}
            </span>
            {counter.alert && (
              <span className="font-[var(--font-display)] text-[14px] leading-none font-extrabold">
                !
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The timeline is sorted by arrival: the next due time is always the first card. It is
 * repeated at the row's end because it is the only thing one rereads without reading.
 */
function NextArrival({
  cards,
  now,
}: {
  cards: ReadonlyArray<MovementCard>;
  now: number;
}) {
  const next = cards.find((card) => card.timing.known);
  if (!next) return null;
  const left = msBeforeResolution(next.timing, now) ?? 0;
  const stalled = isStalled(next.timing);
  return (
    <div className="flex shrink-0 items-baseline gap-[10px] font-[var(--font-mono)] text-[10.5px] tracking-[.1em] text-[rgba(228,216,189,.34)]">
      <span className="uppercase">{fr.timeline.nextArrival}</span>
      <span
        className="text-[14px] tracking-normal"
        style={{ color: stalled ? 'var(--notable)' : 'var(--supply)' }}
      >
        {stalled ? '⏸ ' : ''}
        {next.estimated ? '~' : ''}
        {asHoursMinutesSeconds(left)}
      </span>
    </div>
  );
}

/**
 * The timeline is grabbed and pulled, like the dispatch board it imitates: no notches, no
 * zone scrolling under a still pointer. The drag is real native scrolling — the wheel and
 * trackpad work with nothing programmed.
 */
const Track = ({
  node,
  children,
  onRun,
}: {
  node: RefObject<HTMLDivElement>;
  children: ReactNode;
  onRun: () => void;
}) => {
  const grip = useRef<{ pointer: number; start: number; left: number } | null>(null);
  const dragged = useRef(false);

  return (
    <div
      ref={node}
      onScroll={onRun}
      // A 4 px drag stays a click: without this threshold, opening a card becomes a gamble.
      onPointerDown={(pointer) => {
        if (pointer.button !== 0) return;
        const element = pointer.currentTarget;
        element.setPointerCapture(pointer.pointerId);
        grip.current = {
          pointer: pointer.pointerId,
          start: pointer.clientX,
          left: element.scrollLeft,
        };
        dragged.current = false;
      }}
      onPointerMove={(pointer) => {
        const held = grip.current;
        if (!held || held.pointer !== pointer.pointerId) return;
        const distance = pointer.clientX - held.start;
        if (Math.abs(distance) > 4) dragged.current = true;
        pointer.currentTarget.scrollLeft = held.left - distance;
      }}
      onPointerUp={(pointer) => {
        if (grip.current?.pointer === pointer.pointerId) grip.current = null;
        pointer.currentTarget.releasePointerCapture(pointer.pointerId);
      }}
      onPointerCancel={() => {
        grip.current = null;
      }}
      onClickCapture={(click) => {
        if (!dragged.current) return;
        click.preventDefault();
        click.stopPropagation();
      }}
      onWheel={(wheel) => {
        if (wheel.deltaX !== 0) return;
        wheel.currentTarget.scrollLeft += wheel.deltaY;
      }}
      className="pointer-events-auto flex cursor-grab overflow-x-auto overscroll-x-contain select-none active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ gap: CARD_GAP }}
    >
      {children}
    </div>
  );
};

/** An arrow only shows when matter remains on its side — otherwise it lies. */
function Rudder({
  side,
  visible,
  onSlide,
}: {
  side: 'left' | 'right';
  visible: boolean;
  onSlide: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={onSlide}
      className={`absolute top-1/2 z-10 h-[30px] w-[24px] -translate-y-1/2 cursor-pointer border border-[rgba(228,216,189,.28)] text-[10px] leading-none text-[rgba(228,216,189,.6)] transition-opacity duration-200 ${
        side === 'left' ? '-left-[6px]' : '-right-[6px]'
      } ${visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      style={{ background: 'rgba(15,10,4,.9)' }}
    >
      {side === 'left' ? '◀' : '▶'}
    </button>
  );
}

/**
 * The miniature arc's camber echoes the map arcs': a quadratic that lifts and falls. It is
 * the same gesture at two scales, and it is what makes the card read as an excerpt of the
 * board rather than a chart.
 */
const PLOT_WIDTH = 260;
const PLOT_HEIGHT = 46;
/** The stroke does not touch the card's edge: it enters it, as an engraving has its margin. */
const PLOT_MARGIN = 6;
const START = { x: PLOT_MARGIN, y: 38 };
const APEX = { x: PLOT_WIDTH / 2, y: -4 };
const END = { x: PLOT_WIDTH - PLOT_MARGIN, y: 38 };
const CURVE = `M${START.x} ${START.y} Q${APEX.x} ${APEX.y} ${END.x} ${END.y}`;
/**
 * The card ends its stroke as the thread does on the map: a survey ×, not an arrowhead. An
 * arrow would say "it continues that way" when this is precisely where it stops, and the
 * same sign at both scales makes the card read as a board excerpt.
 */
const HALF_CROSS = 4;
const CROSS =
  `M${END.x - HALF_CROSS} ${END.y - HALF_CROSS} ${END.x + HALF_CROSS} ${END.y + HALF_CROSS}` +
  `M${END.x + HALF_CROSS} ${END.y - HALF_CROSS} ${END.x - HALF_CROSS} ${END.y + HALF_CROSS}`;
const SPRITE_HEIGHT = 17;

const pointOnCurve = (share: number) => ({
  x: (1 - share) ** 2 * START.x + 2 * share * (1 - share) * APEX.x + share ** 2 * END.x,
  y: (1 - share) ** 2 * START.y + 2 * share * (1 - share) * APEX.y + share ** 2 * END.y,
});

function Card({
  card,
  view,
  now,
  designated,
  onHover,
  onSelect,
}: {
  card: MovementCard;
  view: PlayerView;
  now: number;
  designated: boolean;
  onHover: (id: string | null) => void;
  onSelect: (name: string | null) => void;
}) {
  const mine = card.family === 'mine';
  const ink = cardInk(card, view);
  const share = elapsedShare(card.timing, now);
  const left = msBeforeResolution(card.timing, now);
  const stalled = isStalled(card.timing);
  const marker = pointOnCurve(share);

  return (
    <div
      role={mine ? 'button' : undefined}
      tabIndex={mine ? 0 : undefined}
      onMouseEnter={() => onHover(card.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(card.id)}
      onBlur={() => onHover(null)}
      onClick={mine ? () => onSelect(mapDestination(card, view)) : undefined}
      onKeyDown={
        mine
          ? (key) => key.key === 'Enter' && onSelect(mapDestination(card, view))
          : undefined
      }
      className="paper-grain shrink-0 border px-3 pt-[6px] pb-2"
      style={{
        width: CARD_WIDTH,
        borderColor: designated ? 'var(--ink)' : 'rgba(42,33,24,.42)',
        opacity: designated ? 1 : 0.88,
        cursor: mine ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-baseline justify-between gap-2 text-[12px] tracking-[.04em]">
        <span
          className="truncate"
          style={
            mine
              ? { color: 'var(--ink-soft)' }
              : { fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--ink-faint)' }
          }
        >
          {card.origin}
        </span>
        <span
          className="shrink-0 truncate"
          style={{
            fontFamily: mine ? undefined : 'var(--font-mono)',
            fontSize: mine ? '13.5px' : '12.5px',
            color: designated ? 'var(--ink)' : 'var(--ink-soft)',
          }}
        >
          {card.destination}
        </span>
      </div>

      <div className="relative" style={{ height: PLOT_HEIGHT }}>
        <svg
          width="100%"
          height={PLOT_HEIGHT}
          viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
          preserveAspectRatio="none"
          className="block overflow-visible"
          aria-hidden
        >
          <path
            d={CURVE}
            fill="none"
            stroke="rgba(42,33,24,.22)"
            strokeWidth={mine ? 1.2 : 1}
            strokeDasharray={mine ? undefined : '2 5'}
          />
          {mine && (
            <>
              <path
                d={CURVE}
                fill="none"
                stroke={ink}
                strokeWidth={1.2}
                pathLength={100}
                strokeDasharray={`${(share * 100).toFixed(1)} 100`}
              />
              <circle cx={START.x} cy={START.y} r={2} fill="none" stroke={ink} />
            </>
          )}
          <path
            d={CROSS}
            fill="none"
            stroke={mine ? ink : 'rgba(42,33,24,.34)'}
            strokeWidth={1.3}
          />
          {/* An enemy position is a zone, never a point: the dashed frame is exactly what
              intelligence knows how to say, and it says it to scale. */}
          {!mine && (
            <rect
              x={marker.x - 18}
              y={9}
              width={36}
              height={16}
              fill="none"
              stroke={ink}
              strokeOpacity={0.5}
              strokeDasharray="3 3"
            />
          )}
        </svg>
        <span
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center"
          style={{ left: `${(marker.x / PLOT_WIDTH) * 100}%`, top: marker.y }}
        >
          {/* `UnitSprite`'s dashed-frame fallback is drawn for paper: the card is one, so it
              holds its role here without a backup diamond. */}
          {card.role ? (
            <UnitSprite nation={view.me.nation} role={card.role} height={SPRITE_HEIGHT} />
          ) : (
            <span className="block h-[8px] w-[8px] rotate-45" style={{ background: ink }} />
          )}
        </span>
      </div>

      <div className="mt-[3px] flex items-baseline justify-between gap-2">
        <span
          className="truncate text-[9.5px] tracking-[.2em] uppercase"
          style={{ color: mine ? 'var(--ink-soft)' : ink, fontWeight: mine ? undefined : 600 }}
        >
          {card.typeLabel}
          {card.identified && (
            <span className="ml-2 text-[var(--ink-faint)]">{fr.timeline.identified}</span>
          )}
        </span>
        <span
          className="shrink-0 font-[var(--font-mono)] text-[15px]"
          style={{ color: stalled ? 'var(--supply-paper)' : mine ? 'var(--ink)' : ink }}
        >
          {left === null ? '—' : `${card.estimated ? '~' : ''}${asHoursMinutesSeconds(left)}`}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span
          className="truncate text-[11.5px]"
          style={
            card.identified || mine
              ? { color: 'var(--ink-soft)' }
              : {
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  color: 'var(--ink-faint)',
                }
          }
        >
          {card.composition}
        </span>
        <Schedule card={card} stalled={stalled} />
      </div>
    </div>
  );
}

/**
 * A movement stalled at the border no longer has an arrival time that means anything: what
 * counts is when it resolves, and the mark says why it is later than the trip.
 */
function Schedule({ card, stalled }: { card: MovementCard; stalled: boolean }) {
  if (!card.timing.known) {
    return (
      <span className="shrink-0 font-[var(--font-mono)] text-[10.5px] text-[var(--ink-faint)]">
        {fr.timeline.unknownTime}
      </span>
    );
  }
  return (
    <span
      className="shrink-0 font-[var(--font-mono)] text-[10.5px] tracking-[.06em]"
      style={{ color: stalled ? 'var(--supply-paper)' : 'var(--ink-faint)' }}
      title={stalled ? fr.timeline.stalledTitle : fr.timeline.arrivalTitle}
    >
      {stalled ? '⏸ ' : '→ '}
      {card.estimated ? '~' : ''}
      {asLocalTime(card.timing.resolvesAt)}
    </span>
  );
}

const cardInk = (card: MovementCard, view: PlayerView): string => {
  if (card.family === 'mine') return view.me.ink;
  return card.family === 'inbound' ? 'var(--critical)' : 'var(--routine)';
};

/**
 * The card prints the French name; the map only knows `monde.json`'s English labels — the
 * arc carries both, the timeline re-translates nothing.
 */
const mapDestination = (card: MovementCard, view: PlayerView): string | null => {
  const arc = view.arcs.find((candidate) => candidate.id === card.id);
  return arc?.state === 'mine' ? arc.destinationCountry : null;
};
