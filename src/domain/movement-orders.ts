import type { BuildingKey, MovementType, UnitRole } from './ids';
import type { RouteMode } from './routing';
import { DOMAIN_BY_ROLE, LIFT_CAPACITY, LIFT_COST, PROJECTION_BY_DOMAIN } from './troops';

/**
 * What a movement is aimed at, as both sides of the wire name it. The compass rose in the map
 * and the mutations that refuse an order read **this** module — a second table of what is legal
 * is how a fan offers a type the server then turns down, and the fan is the one place a refusal
 * must never happen (ADR 0015: contextual, never greyed out).
 */
export type MovementAim =
  | { readonly kind: 'region'; readonly regionId: string; readonly country: string }
  | { readonly kind: 'outpost'; readonly outpostId: string; readonly hostCountry: string }
  /**
   * **A place, not a thing** (ADR 0019 §1). It answers everywhere the other two cannot: on the
   * open sea, and above the regions' fade-in threshold where the map draws no region to click.
   *
   * It is deliberately **not resolved** into whatever happens to stand there. Resolving it at the
   * aim would tell the player there is an outpost where he believed he was pointing at empty
   * ground — the fan would leak what the fog exists to hide (ADR 0005). What stands there is
   * discovered by the arrival, like everything else.
   */
  | { readonly kind: 'point'; readonly lon: number; readonly lat: number };

/**
 * The column as the rule reads it: what it carries, and what its owner already holds. Plain
 * data rather than callbacks, because the server builds it from documents and the client from
 * `PlayerView` — a shape both can fill without either one importing the other.
 *
 * **Where the column stands no longer restricts what it may ask for** (ADR 0019 §1): it says
 * only which doors are open under its feet. `departureBuildings` is that ground — the projection
 * buildings standing exactly where the column sets out, empty for a column standing on a point.
 */
export type Column = {
  readonly roles: ReadonlyArray<UnitRole>;
  /** The regions carrying one of my buildings: marching on one of them is marching on myself. */
  readonly myRegionIds: ReadonlySet<string>;
  readonly myOutpostIds: ReadonlySet<string>;
  readonly departureBuildings: ReadonlySet<BuildingKey>;
};

export type OrderRefusal =
  | 'EMPTY_MOVEMENT'
  | 'FRIENDLY_TARGET'
  | 'INFANTRY_ONLY'
  | 'NO_PORT_AT_DEPARTURE'
  | 'NO_AIRFIELD_AT_DEPARTURE'
  | 'NOT_ENOUGH_LIFT'
  | 'REGION_TARGET_ONLY'
  | 'OUTPOST_TARGET_ONLY'
  | 'NOT_ORDERABLE';

/**
 * The three marches a player orders. **The return is not among them**: it is created by the
 * resolution and by nothing else (`convex/movements.ts`), so it has no place in a fan of things
 * one can ask for — see the note in the brief's implementation.
 *
 * The recall left with the origin that justified it (ADR 0019 §1). It survives in `MovementType`
 * because columns already recalled are still walking, and a document the schema can no longer
 * read is a worse tidiness than a word one no longer offers.
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
     *
     * The rule is read on what **lands**, not on the whole pile: since a land troop only crosses
     * aboard a transport, demanding a pile of nothing but infantry would put every overseas
     * foundation out of reach — the ship that ferried the founders is not one of them. So the
     * land payload must be infantry and there must be some, and the gate is consulted like
     * everywhere else, for the port that ship leaves from and the places it offers.
     */
    case 'outpost': {
      if (aim.kind !== 'region') return 'REGION_TARGET_ONLY';
      if (mine(aim, column)) return 'FRIENDLY_TARGET';
      const founders = column.roles.filter((role) => DOMAIN_BY_ROLE[role] === 'land');
      if (founders.length === 0 || founders.some((role) => role !== 'infantry')) {
        return 'INFANTRY_ONLY';
      }
      return closedGate(column);
    }
    case 'attack':
      return mine(aim, column) ? 'FRIENDLY_TARGET' : closedGate(column);
    /** A raid marches at an outpost and at nothing else: it comes to put a point out of
     *  service, and a region has no point to disable. */
    case 'raid':
      if (aim.kind !== 'outpost') return 'OUTPOST_TARGET_ONLY';
      return mine(aim, column) ? 'FRIENDLY_TARGET' : closedGate(column);
    default:
      return 'NOT_ORDERABLE';
  }
}

/** What this column may ask for on this target — and nothing else ever reaches the fan. */
export function legalMovementTypes(aim: MovementAim, column: Column): ReadonlyArray<MovementType> {
  return ORDERABLE_TYPES.filter((type) => refusalOf(type, aim, column) === null);
}

/**
 * A point is **never mine**, and that is the same refusal to resolve it: saying "those are your
 * own" about a coordinate would mean matching it against my regions, which is the resolution the
 * aim declines to perform. One walks at one's own ground by naming the region, deliberately.
 */
const mine = (aim: MovementAim, column: Column): boolean =>
  aim.kind === 'outpost'
    ? column.myOutpostIds.has(aim.outpostId)
    : aim.kind === 'region' && column.myRegionIds.has(aim.regionId);

/**
 * **The door is read at departure, and the pile alone says which door** (ADR 0019 §2). A hull
 * demands a port, a wing an aerodrome, because those are their domains; a land column demands
 * nothing, because it walks. Nothing here consults a route, and that is what makes the fan
 * exact: ADR 0015 wants a refusal to be impossible in the fan, and a rule that needed a route
 * could only answer by guessing until the preview came back.
 *
 * The rule that used to make an infantry column owe a port as soon as its route touched the
 * water is gone — crossing is no longer something a trip does to a pile, it is something a
 * transport does for one, and `overloaded` below is where that is paid.
 *
 * `PROJECTION_BY_DOMAIN` answers which building goes with which domain; it is the table that
 * already gates recruitment, and there is no second one.
 */
const closedGate = (column: Column): OrderRefusal | null => {
  const domains = new Set(column.roles.map((role) => DOMAIN_BY_ROLE[role]));
  if (domains.has('air') && !column.departureBuildings.has(PROJECTION_BY_DOMAIN.air)) {
    return 'NO_AIRFIELD_AT_DEPARTURE';
  }
  if (domains.has('sea') && !column.departureBuildings.has(PROJECTION_BY_DOMAIN.sea)) {
    return 'NO_PORT_AT_DEPARTURE';
  }
  return overloaded(column);
};

/**
 * **Crossing a medium that is not yours is an investment, not a surcharge** (design sheet 09):
 * a land troop takes to the water aboard a hull and to the sky aboard a wing, and there are only
 * so many places aboard. A fleet one has to build, protect, and can lose is what makes the
 * distant action structurally expensive — the lever ADR 0013 was kept for.
 *
 * It is only asked of a pile that actually leaves its own medium: a column of pure land walks,
 * and a fleet with no passenger owes nothing. An escort is not a ferry, so a column of infantry
 * and escorts is refused here — it is at sea with nothing to ride.
 */
export function liftOf(roles: ReadonlyArray<UnitRole>): {
  readonly needed: number;
  readonly offered: number;
} {
  return {
    needed: roles.reduce((sum, role) => sum + (LIFT_COST[role] ?? 0), 0),
    offered: roles.reduce((sum, role) => sum + (LIFT_CAPACITY[role] ?? 0), 0),
  };
}

const overloaded = (column: Column): OrderRefusal | null => {
  const domains = new Set(column.roles.map((role) => DOMAIN_BY_ROLE[role]));
  if (!domains.has('land') || (!domains.has('sea') && !domains.has('air'))) return null;
  const { needed, offered } = liftOf(column.roles);
  return needed > offered ? 'NOT_ENOUGH_LIFT' : null;
};

/**
 * **The terrain is read off the domains present, and the mix is the point.** A pile of pure land
 * walks and only walks; a pile of pure hulls sails; a pile that carries both is the one ADR 0012
 * wrote the combined trip for — march, embark, cross, land. That case used to be described as
 * unreachable; it is now **the only way to another continent**, which is exactly what makes a
 * transport worth building.
 *
 * A land column with no ship therefore routes `'land'`, and where the land leads nowhere it is
 * refused by `NO_LAND_ROUTE` — a name that at last says precisely what happened.
 *
 * A wing crosses what a hull and a boot cannot, so any air aboard flies the whole column. What
 * the water costs against the road is settled by `COST_BY_MEDIUM` and `TRANSFER_COST`, which is
 * why a short hop still prefers the road with nobody forbidding the sea.
 */
export function routeModeOf(roles: ReadonlyArray<UnitRole>): RouteMode {
  const domains = new Set(roles.map((role) => DOMAIN_BY_ROLE[role]));
  if (domains.has('air')) return 'air';
  if (!domains.has('sea')) return 'land';
  return domains.has('land') ? 'combined' : 'naval';
}
