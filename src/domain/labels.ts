import { fr } from '@/i18n/fr';
import type { LonLat } from './geo';
import type { BuildingKey, DepositKey, MovementType, Specialization, UnitRole } from './ids';
import type { ArcView, PlayerView, Stack, TroopStation } from './player-view';

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
      readonly reach: Reach | null;
      readonly ink: string;
    }
  | {
      /**
       * **A pile posted on the map**, and the only marker that is troops rather than a place:
       * a column left standing in the field, a hull holding a stretch of sea. Its address is
       * a point, so it carries one — a garrison at a building or on an outpost reads on the
       * mast that is already drawn there, never here.
       */
      readonly kind: 'stack';
      readonly id: string;
      readonly lonLat: LonLat;
      /** The address a click opens the garrison of, and what the camera flies to. */
      readonly station: TroopStation;
      readonly stack: Stack;
      /**
       * The pile's own portrait — the sprite of its majority role, the same plate the garrison
       * panel shows. `null` for a role its nation has no drawing for; the pictogram stands in
       * then, and nothing else changes.
       */
      readonly plate: string | null;
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
    }
  | {
      /**
       * A building stands **on a region**, never on a coordinate: the ground its callout drops
       * to is the region's interior point, and only the region layer knows it. Carrying a
       * `lonLat` for all of them would give every label a second position, free to drift from
       * its own foot.
       *
       * **Except a port** (ADR 0013, revision of 04/09): it was placed on a coast point, the
       * server serves that point, and the mast belongs on the quay rather than thirty
       * kilometres inland. `null` is every other building and keeps the region anchor.
       */
      readonly kind: 'building';
      readonly id: string;
      readonly lonLat: LonLat | null;
      /**
       * The row a click opens, `null` while the first level is still under the crane: nothing
       * stands yet, so there is no line to open anywhere. The instance and not the key — a
       * nation holding three barracks has three lines, and only one of them is this mast.
       */
      readonly buildingId: string | null;
      /** The family, which the instance alone does not say — what an order names
       *  (`constructions.start`) and what the compass rose raises a level of. */
      readonly key: BuildingKey;
      readonly regionId: string;
      readonly hostCountry: string | null;
      readonly name: string;
      /** `null` while the first level is still under the crane: nothing stands to be levelled. */
      readonly level: number | null;
      /** The plate hung at the top of the callout. `null` leaves the mast bare. */
      readonly plate: string | null;
      /**
       * A first level or an upgrade — the map says the same thing, because the region says the
       * same thing: work is going on here. The crane takes the plate's place until it is done.
       */
      readonly finishesAt: number | null;
      readonly reach: Reach | null;
      readonly ink: string;
    }
  | {
      /**
       * What the ground holds before anyone works it. Same anchor as a building — the region's
       * interior point — but neither its ink nor its words: a deposit is a potential, and only
       * what is held gets a nation's ink.
       *
       * Nor its reach. A building says what a nation *holds* and stays legible from orbit; a
       * deposit only answers "where do I build", so it comes and goes with the admin-1 layer
       * that makes building possible at all (`withRegionLayer`, `map/engine/labels.ts`).
       */
      readonly kind: 'deposit';
      readonly id: string;
      readonly regionId: string;
      readonly deposit: DepositKey;
    };

/**
 * The face of the base plate. Provisional: it will one day follow the route's starting point
 * rather than the marker kind, hence a separate field instead of reading the label type.
 *
 * One outpost pictogram whatever the specialization: three drawings for a distinction the
 * label already spells out would cost one more vocabulary to learn, for nothing.
 */
export type LabelPictogram = 'outpost' | 'stack' | 'construction';

/**
 * **The ground a thing covers, in kilometres around a point** — a listening station's radius, a
 * listening outpost's reach. It travels on the marker rather than being looked up on the map:
 * the point a rule measures from is the server's own (`regionFacts`), and the map layer holds a
 * different one — the centroid it draws the polygon around. Drawing the ring on that second
 * point would put it tens of kilometres off the radius the fog actually applies.
 */
export type Reach = {
  readonly lonLat: LonLat;
  readonly km: number;
};

export type LabelType =
  | 'outpost'
  | 'stack'
  | 'construction'
  | 'building'
  | 'deposit'
  | 'my-movement'
  | 'inbound-movement'
  | 'intel';

/**
 * A line's role, not its shape: the mockup decides that a nature line is spaced capitals and
 * a figures line is tabular. The domain never fabricates countdown text — it hands the due
 * time, the display layer counts it down once per second and nothing recomputes in between.
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
  | { readonly kind: 'movementHead'; readonly arc: string }
  /** Resolved by the region layer, the only holder of a region's interior point. */
  | { readonly kind: 'region'; readonly regionId: string };

/** A standing building, as a label hands it to whoever acts on it. */
export type BuildingHandle = {
  readonly id: string;
  readonly key: BuildingKey;
  readonly regionId: string;
  readonly level: number;
};

export type MapLabel = {
  readonly id: string;
  readonly type: LabelType;
  readonly priority: number;
  readonly anchor: LabelAnchor;
  /** What the pointer reveals under this label, `null` for everything that covers no ground. */
  readonly reach: Reach | null;
  /** The owning nation's ink; `null` when the label is not mine. */
  readonly ink: string | null;
  /** The ground pictogram; `null` for a movement head, whose 3D sprite stands in. */
  readonly pictogram: LabelPictogram | null;
  /**
   * A drawn plate hung where the pictogram would go — the building itself rather than a sign
   * for it. The two are exclusive: a plate is a portrait, a pictogram is a category, and the
   * crane is what a building wears while it has no portrait to show yet.
   */
  readonly plate: string | null;
  /**
   * The resource lying under the region. The third and last face a label can wear, and the
   * only one that belongs to the ground rather than to a nation — hence a marker that carries
   * no ink beside it.
   */
  readonly deposit: DepositKey | null;
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
  /**
   * The building this mast stands for — the surface a left click opens, and the target a right
   * click raises a level of (decision 56a). It takes precedence over `hostCountry`: a click
   * that opened a window *and* moved the country selection would do two things for one gesture,
   * and only one of them was asked for.
   *
   * The whole handle rather than an id: the compass rose has to name a **family and a level**
   * to bill a raise, and reading them back off a label's own sentences would be reading the
   * screen instead of the view. `null` while the first level is under the crane — nothing
   * stands there yet to be opened or raised.
   */
  readonly building: BuildingHandle | null;
  /**
   * The garrison a click opens, for the one label that *is* troops: a pile posted on the map.
   * Same door as the widget's *stationnaire* card — one panel, one selection state, never a
   * second read-only sheet for the same pile.
   */
  readonly station: TroopStation | null;
};

export const isCountdown = (line: LabelLine): line is Extract<LabelLine, { role: 'countdown' }> =>
  line.role === 'countdown';

/**
 * The overlap-degradation order. Sheet 11 gives it for five types; intel — an enemy movement
 * not coming at me — slots below mine and above the construction: an enemy contact reads
 * before a build duration, but after what I pilot myself. The building comes near-last: it
 * is the only label that never moves, so it is the one a player can look for at leisure.
 *
 * The deposit comes below even that, and the order is the whole rule of its layer: it says a
 * *potential* where everything above says a possession, so it never pushes anything aside.
 */
const PRIORITY: Readonly<Record<LabelType, number>> = {
  'inbound-movement': 7,
  'my-movement': 6,
  intel: 5,
  construction: 4,
  outpost: 3,
  stack: 2,
  building: 1,
  deposit: 0,
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

/** A port hangs from its quay, a deposit and every other building from their region, and
 *  everything that carries a coordinate from that coordinate. */
function anchorOf(marker: MapMarker): LabelAnchor {
  if (marker.kind === 'deposit') return { kind: 'region', regionId: marker.regionId };
  if (marker.kind === 'building') {
    return marker.lonLat === null
      ? { kind: 'region', regionId: marker.regionId }
      : { kind: 'ground', lonLat: marker.lonLat };
  }
  return { kind: 'ground', lonLat: marker.lonLat };
}

function markerLabel(marker: MapMarker): MapLabel {
  const common = {
    id: marker.id,
    anchor: anchorOf(marker),
    ink: marker.kind === 'deposit' ? null : marker.ink,
    plate: null,
    deposit: null,
    identified: false,
    offensive: false,
    idle: false,
    building: null,
    station: null,
    /** Only two things cover ground, and only while the pointer asks: everything else answers
     *  `null` and the map draws nothing (`map/engine/reach.ts`). */
    reach: marker.kind === 'outpost' || marker.kind === 'building' ? marker.reach : null,
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
        // The portrait wins over the sign, exactly as on a building's mast: the plate says
        // *what* stands there, the pictogram only that something does.
        pictogram: marker.plate === null ? 'stack' : null,
        plate: marker.plate,
        station: marker.station,
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
    case 'building':
      return {
        ...common,
        type: 'building',
        priority: PRIORITY.building,
        building:
          marker.buildingId === null || marker.level === null
            ? null
            : {
                id: marker.buildingId,
                key: marker.key,
                regionId: marker.regionId,
                level: marker.level,
              },
        // Under the crane the portrait is wrong twice over: a first level has nothing to
        // show, and an upgraded building is not the one standing there tonight.
        pictogram: marker.finishesAt === null ? null : 'construction',
        plate: marker.finishesAt === null ? marker.plate : null,
        hostCountry: marker.hostCountry,
        lines: [
          { role: 'nature', text: marker.name },
          ...(marker.level === null
            ? []
            : [{ role: 'figures', text: fr.labels.buildingLevel(marker.level) } as const]),
          ...(marker.finishesAt === null
            ? []
            : [
                {
                  role: 'countdown',
                  dueAt: marker.finishesAt,
                  prefix: fr.labels.constructionPrefix,
                } as const,
              ]),
        ],
      };
    case 'deposit':
      return {
        ...common,
        type: 'deposit',
        priority: PRIORITY.deposit,
        pictogram: null,
        deposit: marker.deposit,
        // A click on a deposit says nothing the ground does not: the region's own click
        // already selects the country, and the crane already opens on the right list.
        hostCountry: null,
        lines: [],
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
      reach: null,
      ink: null,
      pictogram: null,
      plate: null,
      deposit: null,
      identified: false,
      offensive: false,
      idle: false,
      hostCountry: null,
      building: null,
      station: null,
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
    reach: null,
    ink: null,
    pictogram: null,
    plate: null,
    deposit: null,
    identified: arc.identification.pierced,
    offensive: arc.identification.pierced && OFFENSIVE_TYPES.includes(arc.identification.type),
    idle: false,
    hostCountry: null,
    building: null,
    station: null,
    lines: [...schedule, second],
  };
}

/** Striking means attacking a nation or raiding an outpost; the rest infiltrates. */
const OFFENSIVE_TYPES: ReadonlyArray<MovementType> = ['attack', 'raid'];
