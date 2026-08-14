import { fr, stackLabel } from '@/i18n/fr';
import { asHoursMinutes } from './duration';
import type { MovementType, UnitRole } from './ids';
import type { ArcView, PlayerView } from './player-view';
import { representativeRole } from './troops';

/**
 * The timeline's three inks. This is not the arc's state: an `enemyDetected` arc reads
 * critical when it comes at me, muted grey when it passes elsewhere — same data, two
 * urgencies. The renderer picks its color here, not in a component's `if`.
 */
export type CardFamily = 'mine' | 'inbound' | 'intel';

export type TimelineFilter = 'all' | CardFamily | MovementType;

/**
 * A movement's schedule, or the admission that we do not have one. Without this union, a
 * card without an estimate would fall back on a `0` arrival and display an invented countdown.
 */
export type Timing =
  | { readonly known: false; readonly progress: number }
  | {
      readonly known: true;
      readonly departedAt: number;
      readonly arrivesAt: number;
      readonly resolvesAt: number;
    };

export type MovementCard = {
  readonly id: string;
  readonly family: CardFamily;
  readonly origin: string;
  readonly destination: string;
  /** `null` until intelligence pierces the movement — never guessed. */
  readonly type: MovementType | null;
  readonly typeLabel: string;
  readonly composition: string;
  readonly identified: boolean;
  /** An enemy schedule is always approximate: the card prefixes it with `~`. */
  readonly estimated: boolean;
  /** The stack's face; only a `mine` movement has one, the fog handles the rest. */
  readonly role: UnitRole | null;
  readonly timing: Timing;
};

/** Last known position is frozen, sea control has neither origin nor target. */
type TimelineArc = Extract<ArcView, { state: 'mine' | 'enemyDetected' }>;

const inTimeline = (arc: ArcView): arc is TimelineArc =>
  arc.state === 'mine' || arc.state === 'enemyDetected';

export function buildTimeline(view: PlayerView): ReadonlyArray<MovementCard> {
  return view.arcs
    .filter(inTimeline)
    .map((arc) => cardOfArc(arc, view.loadedAt))
    .sort((first, second) => sortInstant(first) - sortInstant(second));
}

function cardOfArc(arc: TimelineArc, loadedAt: number): MovementCard {
  if (arc.state === 'mine') {
    return {
      id: arc.id,
      family: 'mine',
      origin: arc.originLabel,
      destination: arc.destinationLabel,
      type: arc.type,
      typeLabel: fr.movementTypes[arc.type],
      composition: stackLabel(arc.stack),
      identified: false,
      estimated: false,
      role: representativeRole(arc.stack),
      timing: mineTiming(arc, loadedAt),
    };
  }

  const pierced = arc.identification.pierced;
  return {
    id: arc.id,
    family: arc.headingAtMe ? 'inbound' : 'intel',
    origin: fr.timeline.unknownOrigin,
    destination: fr.timeline.heading(String(Math.round(arc.headingDegrees)).padStart(3, '0')),
    type: pierced ? arc.identification.type : null,
    typeLabel: pierced ? fr.movementTypes[arc.identification.type] : fr.timeline.unidentified,
    composition: pierced ? stackLabel(arc.identification.stack) : fr.timeline.unknownComposition,
    identified: pierced,
    estimated: true,
    role: null,
    timing: detectedTiming(arc, loadedAt),
  };
}

/**
 * `PlayerView` only carries the time left: the total duration is derived from progress, and
 * departure by subtraction. The day the server sends both instants, all of this disappears —
 * which is exactly why the computation fits in a single function.
 */
function mineTiming(
  arc: Extract<ArcView, { state: 'mine' }>,
  loadedAt: number,
): Timing {
  const left = Math.max(0, arc.minutesLeft);
  const total = arc.progress >= 1 ? left : left / (1 - arc.progress);
  const arrivesAt = loadedAt + left * 60_000;
  return {
    known: true,
    departedAt: loadedAt - (total - left) * 60_000,
    arrivesAt,
    resolvesAt:
      arc.borderWait === null
        ? arrivesAt
        : loadedAt + arc.borderWait.resolutionInMinutes * 60_000,
  };
}

function detectedTiming(
  arc: Extract<ArcView, { state: 'enemyDetected' }>,
  loadedAt: number,
): Timing {
  if (arc.estimatedMinutesLeft === null) return { known: false, progress: arc.progress };
  const left = Math.max(0, arc.estimatedMinutesLeft);
  const total = arc.progress >= 1 ? left : left / (1 - arc.progress);
  const arrivesAt = loadedAt + left * 60_000;
  return { known: true, departedAt: loadedAt - (total - left) * 60_000, arrivesAt, resolvesAt: arrivesAt };
}

/** A card without a schedule cannot slot in: it goes to the end of the timeline. */
const sortInstant = (card: MovementCard): number =>
  card.timing.known ? card.timing.arrivesAt : Number.POSITIVE_INFINITY;

export const isStalled = (timing: Timing): boolean =>
  timing.known && timing.resolvesAt > timing.arrivesAt;

export function elapsedShare(timing: Timing, now: number): number {
  if (!timing.known) return clamp01(timing.progress);
  const { departedAt, arrivesAt } = timing;
  if (arrivesAt <= departedAt) return 1;
  return clamp01((now - departedAt) / (arrivesAt - departedAt));
}

/** The countdown targets resolution, not arrival: the instant when the movement counts. */
export const msBeforeResolution = (
  timing: Timing,
  now: number,
): number | null => (timing.known ? Math.max(0, timing.resolvesAt - now) : null);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export type TimelineCounter = {
  readonly key: TimelineFilter;
  readonly label: string;
  readonly count: number;
  /** An inbound heading carries the critical accent as soon as there is one, filter or not. */
  readonly alert: boolean;
};

/**
 * My types are itemized because they are known; the opposition's are not, and that is
 * exactly what the row must show: an inventory on one side, two heaps on the other.
 */
export function timelineCounters(
  cards: ReadonlyArray<MovementCard>,
): ReadonlyArray<TimelineCounter> {
  const byFamily = (family: CardFamily) =>
    cards.filter((card) => card.family === family).length;
  const mine = cards.filter((card) => card.family === 'mine');

  const types = (Object.keys(fr.movementTypesPlural) as ReadonlyArray<MovementType>)
    .map((type) => ({
      key: type,
      label: fr.movementTypesPlural[type],
      count: mine.filter((card) => card.type === type).length,
      alert: false,
    }))
    .filter((counter) => counter.count > 0);

  const inbound = byFamily('inbound');
  return [
    { key: 'all', label: fr.timeline.all, count: cards.length, alert: false },
    { key: 'mine', label: fr.timeline.mine, count: mine.length, alert: false },
    ...types,
    { key: 'inbound', label: fr.timeline.inbound, count: inbound, alert: inbound > 0 },
    {
      key: 'intel',
      label: fr.timeline.intel,
      count: byFamily('intel'),
      alert: false,
    },
  ];
}

export function filterTimeline(
  cards: ReadonlyArray<MovementCard>,
  filter: TimelineFilter,
): ReadonlyArray<MovementCard> {
  if (filter === 'all') return cards;
  if (filter === 'mine' || filter === 'inbound' || filter === 'intel') {
    return cards.filter((card) => card.family === filter);
  }
  return cards.filter((card) => card.family === 'mine' && card.type === filter);
}

/** The line a collapsed timeline leaves on the desk. */
export function timelineSummary(
  cards: ReadonlyArray<MovementCard>,
  now: number,
): string {
  if (!cards.length) return fr.timeline.none;
  const parts = [fr.timeline.inFlight(cards.length)];

  const next = cards.find((card) => card.timing.known);
  if (next) {
    const left = msBeforeResolution(next.timing, now) ?? 0;
    const mark = isStalled(next.timing) ? '⏸ ' : '';
    parts.push(
      fr.timeline.nextArrivalShort(`${mark}${next.estimated ? '~' : ''}${asHoursMinutes(left / 60_000)}`),
    );
  }

  const inbound = cards.filter((card) => card.family === 'inbound').length;
  if (inbound) parts.push(fr.timeline.inboundCount(inbound));
  return parts.join(' · ');
}
