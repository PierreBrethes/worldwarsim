import type { MovementType, UnitRole } from './ids';
import { DOMAIN_BY_ROLE } from './troops';

/**
 * What a movement is aimed at, as both sides of the wire name it. The compass rose in the map
 * and the mutations that refuse an order read **this** module — a second table of what is legal
 * is how a fan offers a type the server then turns down, and the fan is the one place a refusal
 * must never happen (ADR 0015: contextual, never greyed out).
 */
export type MovementAim =
  | { readonly kind: 'region'; readonly regionId: string; readonly country: string }
  | { readonly kind: 'outpost'; readonly outpostId: string; readonly hostCountry: string };

/**
 * The column as the rule reads it: what it carries, and what its owner already holds. Plain
 * data rather than callbacks, because the server builds it from documents and the client from
 * `PlayerView` — a shape both can fill without either one importing the other.
 */
export type Column = {
  readonly roles: ReadonlyArray<UnitRole>;
  /** The regions carrying one of my buildings: marching on one of them is marching on myself. */
  readonly myRegionIds: ReadonlySet<string>;
  readonly myOutpostIds: ReadonlySet<string>;
};

export type OrderRefusal =
  | 'EMPTY_MOVEMENT'
  | 'FRIENDLY_TARGET'
  | 'INFANTRY_ONLY'
  | 'LAND_MOVEMENT_ONLY'
  | 'REGION_TARGET_ONLY'
  | 'OUTPOST_TARGET_ONLY'
  | 'NOT_ORDERABLE';

/**
 * The three marches a player orders. **The return is not among them**: it is created by the
 * resolution and by nothing else (`convex/movements.ts`), so it has no place in a fan of things
 * one can ask for — see the note in the brief's implementation.
 *
 * The agent and the decoy wait for the fog surfaces; they refuse as `NOT_ORDERABLE` rather than
 * being absent from the union, so the day they land there is a branch to fill, not one to find.
 */
export const ORDERABLE_TYPES: ReadonlyArray<MovementType> = ['attack', 'raid', 'outpost'];

export function refusalOf(
  type: MovementType,
  aim: MovementAim,
  column: Column,
): OrderRefusal | null {
  if (column.roles.length === 0) return 'EMPTY_MOVEMENT';
  switch (type) {
    /**
     * **Only infantry plants a point** (ADR 0015) — a tank column does not found anything. And
     * one plants it away from home: an outpost is what carries a build site beyond one's own
     * ground, so a region already carrying a building of mine has nothing to gain from one.
     */
    case 'outpost':
      if (aim.kind !== 'region') return 'REGION_TARGET_ONLY';
      if (mine(aim, column)) return 'FRIENDLY_TARGET';
      return column.roles.every((role) => role === 'infantry') ? null : 'INFANTRY_ONLY';
    case 'attack':
      return mine(aim, column) ? 'FRIENDLY_TARGET' : landOnly(column);
    /** A raid marches at an outpost and at nothing else: it comes to put a point out of
     *  service, and a region has no point to disable. */
    case 'raid':
      if (aim.kind !== 'outpost') return 'OUTPOST_TARGET_ONLY';
      return mine(aim, column) ? 'FRIENDLY_TARGET' : landOnly(column);
    default:
      return 'NOT_ORDERABLE';
  }
}

/** What this column may ask for on this target — and nothing else ever reaches the fan. */
export function legalMovementTypes(
  aim: MovementAim,
  column: Column,
): ReadonlyArray<MovementType> {
  return ORDERABLE_TYPES.filter((type) => refusalOf(type, aim, column) === null);
}

const mine = (aim: MovementAim, column: Column): boolean =>
  aim.kind === 'outpost'
    ? column.myOutpostIds.has(aim.outpostId)
    : column.myRegionIds.has(aim.regionId);

const landOnly = (column: Column): OrderRefusal | null =>
  column.roles.every((role) => DOMAIN_BY_ROLE[role] === 'land') ? null : 'LAND_MOVEMENT_ONLY';
