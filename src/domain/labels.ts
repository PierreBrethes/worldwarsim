import { fr } from '@/i18n/fr';
import type { LonLat } from './geo';
import type { MovementType, Specialization, UnitRole } from './ids';
import type { ArcView, PlayerView, Stack } from './player-view';

/**
 * What the map knows how to plant on the ground. A discriminated union rather than a marker
 * with optional fields: an outpost has no stack headcount, a construction has no garrison,
 * so a label cannot display another kind's field by accident.
 */
export type MapMarker =
  | {
      readonly kind: 'outpost';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly hostCountry: string;
      readonly specialization: Specialization;
      readonly level: number;
      readonly garrison: number;
      readonly ink: string;
    }
  | {
      readonly kind: 'stack';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly stack: Stack;
      readonly ink: string;
    }
  | {
      readonly kind: 'construction';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly hostCountry: string;
      readonly name: string;
      readonly finishedAt: number;
      /** No order follows: once finished, the construction site idles. */
      readonly idle: boolean;
      readonly ink: string;
    };

/**
 * The face of the base plate. Provisional: it will one day follow the route's starting point
 * rather than the marker kind, hence a separate field instead of reading the label type.
 *
 * One outpost pictogram whatever the specialization: three drawings for a distinction the
 * label already spells out would cost one more vocabulary to learn, for nothing.
 */
export type LabelPictogram = 'outpost' | 'stack' | 'construction';

export type LabelType =
  | 'outpost'
  | 'stack'
  | 'construction'
  | 'my-movement'
  | 'inbound-movement'
  | 'intel';

/**
 * A line's role, not its shape: the mockup decides that a nature line is spaced capitals and
 * a figures line is tabular. The domain never fabricates countdown text — it hands the due
 * time, the display layer ticks it once per second and nothing recomputes in between.
 */
export type LabelLine =
  | { readonly role: 'nature' | 'figures' | 'headcount' | 'mention'; readonly text: string }
  | { readonly role: 'countdown'; readonly dueAt: number; readonly prefix: string };

/**
 * A mobile anchor carries no position: a movement's head travels along its arc every frame,
 * and the arc layer is the one that knows where it is. Storing a `lonLat` here would freeze
 * the label at the departure point.
 */
export type LabelAnchor =
  | { readonly kind: 'ground'; readonly lonLat: LonLat }
  | { readonly kind: 'movementHead'; readonly arc: string };

export type MapLabel = {
  readonly id: string;
  readonly type: LabelType;
  readonly priority: number;
  readonly anchor: LabelAnchor;
  /** The owning nation's ink; `null` when the label is not mine. */
  readonly ink: string | null;
  /** The ground pictogram; `null` for a movement head, whose 3D sprite stands in. */
  readonly pictogram: LabelPictogram | null;
  readonly lines: ReadonlyArray<LabelLine>;
  /** An enemy movement pierced by intelligence — the mockup marks it with a state. */
  readonly identified: boolean;
  /**
   * The movement comes to strike, and we know it. False until intelligence pierces it: the
   * alert mark only arms its triangle on an established nature, never on a suspicion.
   */
  readonly offensive: boolean;
  /** A finished construction that nothing follows — the oversight the screen edge catches. */
  readonly idle: boolean;
  /** The country a click selects; `null` when the label is not clickable. */
  readonly hostCountry: string | null;
};

export const isCountdown = (line: LabelLine): line is Extract<LabelLine, { role: 'countdown' }> =>
  line.role === 'countdown';

/**
 * The overlap-degradation order. Sheet 11 gives it for five types; intel — an enemy movement
 * not coming at me — slots below mine and above the construction: an enemy contact reads
 * before a build duration, but after what I pilot myself.
 */
const PRIORITY: Readonly<Record<LabelType, number>> = {
  'inbound-movement': 5,
  'my-movement': 4,
  intel: 3,
  construction: 2,
  outpost: 1,
  stack: 0,
};

/** Below this remainder, the label switches to the mockup's urgency accent. */
export const URGENCY_MS = 5 * 60_000;

/** Two lines, never a sentence: the composition abbreviates, "·" replaces the conjunction. */
export function abbreviateStack(stack: Stack): string {
  return (Object.entries(stack) as ReadonlyArray<[UnitRole, number]>)
    .filter(([, count]) => count > 0)
    .map(([role, count]) => `${count} ${fr.roleAbbreviations[role]}`)
    .join(' · ');
}

export const stackHeadcount = (stack: Stack): number =>
  Object.values(stack).reduce((sum, count) => sum + count, 0);

export function buildLabels(
  view: PlayerView,
  markers: ReadonlyArray<MapMarker>,
): ReadonlyArray<MapLabel> {
  return [
    ...markers.map(markerLabel),
    ...view.arcs.map((arc) => arcLabel(arc, view.loadedAt)).filter(exists),
  ];
}

const exists = <T>(value: T | null): value is T => value !== null;

function markerLabel(marker: MapMarker): MapLabel {
  const common = {
    id: marker.id,
    anchor: { kind: 'ground', lonLat: marker.lonLat },
    ink: marker.ink,
    identified: false,
    offensive: false,
    idle: false,
  } as const;

  switch (marker.kind) {
    case 'outpost':
      return {
        ...common,
        type: 'outpost',
        priority: PRIORITY.outpost,
        pictogram: 'outpost',
        hostCountry: marker.hostCountry,
        lines: [
          { role: 'nature', text: fr.specializations[marker.specialization] },
          { role: 'figures', text: fr.labels.levelAndGarrison(marker.level, marker.garrison) },
        ],
      };
    case 'stack':
      return {
        ...common,
        type: 'stack',
        priority: PRIORITY.stack,
        pictogram: 'stack',
        hostCountry: null,
        lines: [
          { role: 'headcount', text: String(stackHeadcount(marker.stack)) },
          { role: 'figures', text: abbreviateStack(marker.stack) },
        ],
      };
    case 'construction':
      return {
        ...common,
        type: 'construction',
        priority: PRIORITY.construction,
        pictogram: 'construction',
        hostCountry: marker.hostCountry,
        idle: marker.idle,
        lines: [
          { role: 'nature', text: marker.name },
          { role: 'countdown', dueAt: marker.finishedAt, prefix: fr.labels.constructionPrefix },
        ],
      };
  }
}

/**
 * The intelligence rule lives in this function and nowhere else: an unidentified enemy
 * movement structurally has neither type nor stack to leak, and its schedule comes out
 * prefixed with "~". A breakthrough gives the nature and the composition — never the watch.
 * A frozen arc or mere sea control carries no label: they have nothing to say that an
 * anonymous cone does not already.
 */
function arcLabel(arc: ArcView, loadedAt: number): MapLabel | null {
  if (arc.state === 'mine') {
    return {
      id: arc.id,
      type: 'my-movement',
      priority: PRIORITY['my-movement'],
      anchor: { kind: 'movementHead', arc: arc.id },
      ink: null,
      pictogram: null,
      identified: false,
      offensive: false,
      idle: false,
      hostCountry: null,
      lines: [{ role: 'countdown', dueAt: loadedAt + arc.minutesLeft * 60_000, prefix: '' }],
    };
  }
  if (arc.state !== 'enemyDetected') return null;

  const type = arc.headingAtMe ? 'inbound-movement' : 'intel';
  const schedule: ReadonlyArray<LabelLine> =
    arc.estimatedMinutesLeft === null
      ? []
      : [
          {
            role: 'countdown',
            dueAt: loadedAt + arc.estimatedMinutesLeft * 60_000,
            prefix: '~',
          },
        ];
  const second: LabelLine = arc.identification.pierced
    ? {
        role: 'nature',
        text: `${fr.movementTypes[arc.identification.type]} · ${abbreviateStack(arc.identification.stack)}`,
      }
    : { role: 'mention', text: fr.labels.estimated };

  return {
    id: arc.id,
    type,
    priority: PRIORITY[type],
    anchor: { kind: 'movementHead', arc: arc.id },
    ink: null,
    pictogram: null,
    identified: arc.identification.pierced,
    offensive: arc.identification.pierced && OFFENSIVE_TYPES.includes(arc.identification.type),
    idle: false,
    hostCountry: null,
    lines: [...schedule, second],
  };
}

/** Striking means attacking a nation or raiding an outpost; the rest infiltrates. */
const OFFENSIVE_TYPES: ReadonlyArray<MovementType> = ['attack', 'raid'];
