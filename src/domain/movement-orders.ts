import type { BuildingKey, MovementType, UnitRole } from './ids';
import type { RouteMode } from './routing';
import { COST_BY_MEDIUM } from './routing';
import type { UnitDomain } from './troops';
import {
  DOMAIN_BY_ROLE,
  LAND_SEATS_PER_TRANSPORT,
  LIFT_CAPACITY,
  LIFT_COST,
  PROJECTION_BY_DOMAIN,
} from './troops';

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
  /**
   * **Whether the column is already in the water it would be asked to embark on.** Read off the
   * departure point and nowhere else — the open sea is the one place `hostAtPoint` answers the
   * empty string — and **never stored**: a column is a reading made at the moment an order is
   * weighed, and a troop's address is the only durable fact behind it. A persisted flag would be
   * a second truth to keep in step with `stationedAt`, which is exactly the divergence ADR 0015
   * exists to forbid.
   */
  readonly afloat: boolean;
};

export type OrderRefusal =
  | 'EMPTY_MOVEMENT'
  | 'FRIENDLY_TARGET'
  | 'INFANTRY_ONLY'
  | 'NO_PORT_AT_DEPARTURE'
  | 'NO_AIRFIELD_AT_DEPARTURE'
  | 'NOT_ENOUGH_LIFT'
  | 'OUTPOST_TARGET_ONLY'
  | 'POINT_TARGET_ONLY'
  | 'NOT_ORDERABLE';

/**
 * **The movement slots, carried by the headquarters** (ADR 0006, reindexed by 0015). One slot
 * outlives the building: a nation always has one movement to make, even with its capital
 * flattened.
 *
 * It lives in the domain so that the count `convex/view.ts` serves and the count `march`
 * refuses on are one reading of one rule. They were two — a placeholder constant capped the
 * server at one movement while the banner promised `1 + hqLevel` — and a screen that promises
 * what the server turns down is exactly the fault ADR 0015 exists to forbid.
 *
 * **A return holds no slot**, and that is not said here: it is a property of the movement, not
 * of the ceiling, so the callers filter their own list before counting it.
 */
export const movementSlots = (hqLevel: number): number => 1 + hqLevel;

/**
 * The three marches a player orders. **The return is not among them**: it is created by the
 * resolution and by nothing else (`convex/movements.ts`), so it has no place in a fan of things
 * one can ask for — see the note in the brief's implementation.
 *
 * **The foundation left too**, and for a better reason than tidiness: one does not walk *at* a
 * place to found there, one founds where one already stands (`foundOutpostHere`). The recall
 * left with the origin that justified it (ADR 0019 §1). Both survive in `MovementType` because
 * columns already sent are still walking, and a document the schema can no longer read is a
 * worse tidiness than a word one no longer offers.
 *
 * **Le leurre a été retiré du jeu le 29/08/2026** (révision d'une décision livrée, fiche 04) :
 * il n'est plus ici, et il n'est plus nulle part ailleurs que dans le validateur Convex, qui
 * garde son littéral le temps d'un wipe. Ce qu'il emportait avec lui : la pile vide n'est plus
 * un ordre, elle redevient un refus franc (`EMPTY_MOVEMENT`, ci-dessous).
 *
 * The agent still waits for the fog surfaces and refuses as `NOT_ORDERABLE` rather than being
 * absent from the union, so the day it lands there is a branch to fill, not one to find.
 */
export const ORDERABLE_TYPES: ReadonlyArray<MovementType> = ['march', 'attack', 'raid'];

export function refusalOf(
  type: MovementType,
  aim: MovementAim,
  column: Column,
): OrderRefusal | null {
  /**
   * **Une pile vide ne part pas.** C'était la porte du leurre — le seul ordre dont le manifeste
   * était vide exprès — et le leurre a été retiré le 29/08/2026 : le refus redevient franc, pour
   * tous les types et sans exception. C'est aussi ce qui referme la porte dérobée que la fiche 04
   * signalait, « à zéro troupe » comme moyen d'obtenir une marche gratuite.
   */
  if (column.roles.length === 0) return 'EMPTY_MOVEMENT';
  switch (type) {
    /**
     * **The plain one, and the only one that refuses nothing for allegiance** (ADR 0019 §7): one
     * walks on one's own ground exactly as on somebody else's, which is what separates it from
     * an attack. Its target is a place and only a place — an outpost is a thing one comes to
     * fight, and marching *at* one would be an attack under another word.
     */
    case 'march':
      return aim.kind === 'point' ? closedGate(column) : 'POINT_TARGET_ONLY';
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

/**
 * **Founding is not a march any more, it is what a column does where it stands** (ADR 0019 §1).
 * The two rules are the ones the `outpost` movement carried, moved rather than rewritten:
 *
 * — **only infantry plants a point**: a tank column founds nothing. It is read on the **whole**
 *   pile now, and that is not a hardening: the pile is what stands on the ground, and the ship
 *   that ferried the founders is at sea, not among them. There is no crossing left to excuse.
 * — **one plants it away from home**: an outpost is what carries a build site beyond one's own
 *   ground (ADR 0004), so ground already carrying a building of mine has nothing to gain.
 *
 * What this **gains**, and it was nobody's plan: the player sees the terrain before choosing the
 * specialisation. He used to name it at departure, hours of marching from a place he had not
 * seen. Do not move that choice back to a departure to "simplify" — the choice being late is the
 * feature.
 */
export function foundingRefusal(
  roles: ReadonlyArray<UnitRole>,
  onMyGround: boolean,
): OrderRefusal | null {
  if (roles.length === 0) return 'EMPTY_MOVEMENT';
  if (roles.some((role) => role !== 'infantry')) return 'INFANTRY_ONLY';
  return onMyGround ? 'FRIENDLY_TARGET' : null;
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
  if (domains.has('sea') && embarking(column, domains)) {
    if (!column.departureBuildings.has(PROJECTION_BY_DOMAIN.sea)) return 'NO_PORT_AT_DEPARTURE';
  }
  return overloaded(column);
};

/**
 * **A quay is what one takes to the water from, not what one sails from.** A fleet posted at sea
 * has no ground under it and never will — reading the port gate on it left every hull that
 * reached the open sea stranded there for the rest of the season, an address the game could
 * write and no order could ever leave.
 *
 * **The combined column is exempted too, and it is the same reason rather than a softening**:
 * the port was paid at the first departure (ADR 0019 §2), when the boots actually left the
 * ground for the water. Asking a second quay of a hull that never touched one again turned a
 * transport moored offshore into a **mouvement fantôme** — troops the game holds, places, feeds,
 * and cannot move. The passage of ADR 0013 stays bought where it is bought, at the embarkation,
 * and `overloaded` still counts the berths on every order.
 *
 * The air keeps its own clause because it is the one domain nothing is ever posted in: a wing
 * standing on water is a wing at a station, and its aerodrome is read as it always was.
 */
const embarking = (column: Column, domains: ReadonlySet<UnitDomain>): boolean =>
  !column.afloat || domains.has('air');

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
/**
 * **A land column whose infantry fits in its trucks rolls, and that is the whole effect of the
 * land transport** (note « le transport terrestre et l'allure », validated 19/08). The armour and
 * the trucks are motorized by nature — a tank column with no truck rolls — so **only the infantry
 * asks for a seat**, and "projecting infantry further" is exactly what that says.
 *
 * The pace is the **whole column's**, set on its slowest element, the same way the route is the
 * whole pile's: one infantry too many puts everybody at a walk. No individual pace, no column cut
 * in two — and no stored relation either, since there is nothing to decide.
 *
 * A column with no infantry is motorized on 0 ≤ 0, which is the tank column above and not an
 * accident of the arithmetic.
 */
export function motorized(roles: ReadonlyArray<UnitRole>): boolean {
  const seats = roles.filter((role) => role === 'landTransport').length * LAND_SEATS_PER_TRANSPORT;
  const walkers = roles
    .filter((role) => role === 'infantry')
    .reduce((sum) => sum + (LIFT_COST.infantry ?? 0), 0);
  return walkers <= seats;
}

/**
 * What a unit of ground costs this pile — the second reading of the composition, next to the
 * first. It sits here rather than in `routing.ts` for the reason `routeModeOf` does: the grid
 * knows how to weigh an edge, it does not know what a column is made of.
 */
export const landCostOf = (roles: ReadonlyArray<UnitRole>): number =>
  motorized(roles) ? COST_BY_MEDIUM.landMotorized : COST_BY_MEDIUM.land;

export function routeModeOf(roles: ReadonlyArray<UnitRole>): RouteMode {
  const domains = new Set(roles.map((role) => DOMAIN_BY_ROLE[role]));
  if (domains.has('air')) return 'air';
  if (!domains.has('sea')) return 'land';
  return domains.has('land') ? 'combined' : 'naval';
}
