import { BUILDINGS, type BuildingKey, type Medium, type UnitRole, type UnitTier } from './ids';
import type { ArcView, PlayerView, Stack, TroopStation, TroopView } from './player-view';

export type { UnitTier };
export type UnitDomain = Medium;

export const DOMAIN_BY_ROLE: Readonly<Record<UnitRole, UnitDomain>> = {
  infantry: 'land',
  armor: 'land',
  landTransport: 'land',
  fighter: 'air',
  bomber: 'air',
  airTransport: 'air',
  escort: 'sea',
  cargo: 'sea',
  carrier: 'sea',
};

/**
 * Which building forms a domain's troops (ADR 0015). It names a **key**, never an instance:
 * every barracks holds its own queue, which is what makes a second one worth building.
 */
export const PROJECTION_BY_DOMAIN: Readonly<Record<UnitDomain, BuildingKey>> = {
  land: 'barracks',
  air: 'airfield',
  sea: 'port',
};

export const projectionKeyOf = (role: UnitRole): BuildingKey =>
  PROJECTION_BY_DOMAIN[DOMAIN_BY_ROLE[role]];

/**
 * **Which buildings a role may enter as a garrison** (decision 70b, 01/09). The infantry enters
 * every building of its owner — the rule « seule l'infanterie pille, capture, fonde », extended
 * — and every other role only the buildings of its own domain: armour and trucks a barracks or
 * the headquarters, hulls a port, wings an aerodrome. A mixed column enters only if **each** of
 * its roles may.
 *
 * One table, read by the refusal the compass rose shows before the click and by the one the
 * server raises after it (`refusalOf`, ADR 0015) — never two. An outpost is not in it: the
 * `outpost` aim already makes a garrison of what arrives (ADR 0019 §3).
 */
export const GARRISON_KEYS_BY_ROLE: Readonly<Record<UnitRole, ReadonlyArray<BuildingKey>>> = {
  infantry: BUILDINGS,
  armor: ['barracks', 'hq'],
  landTransport: ['barracks', 'hq'],
  fighter: ['airfield'],
  bomber: ['airfield'],
  airTransport: ['airfield'],
  escort: ['port'],
  cargo: ['port'],
  carrier: ['port'],
};

export const garrisons = (role: UnitRole, key: BuildingKey): boolean =>
  GARRISON_KEYS_BY_ROLE[role].includes(key);

/**
 * **What a transport carries, and what a passenger weighs** (design sheet 09, § "Les transports
 * sont des troupes"): a land troop crosses the sea aboard a hull and the sky aboard a wing, or
 * it does not cross. Five numbers rather than a table per role — the lesson of D1 in
 * `consommation-continue.md` — and they are **assumed, never simulated**, exactly like
 * `INTERCEPTION_RADIUS_KM`.
 *
 * The one bearing they were chosen against: the troop ceiling is 24, so two cargos lift half an
 * army. A landing is an operation one prepares, not a reflex — which is the whole point of
 * making the crossing an investment (a fleet one builds, protects, and can lose) instead of a
 * surcharge on a trip.
 *
 * A role absent from either table weighs nothing and lifts nothing: an escort is not a ferry,
 * and a fleet on its own has no passenger to answer for.
 *
 * @a-mesurer assumed against the troop ceiling alone — two cargos lift half an army
 */
export const LIFT_CAPACITY: Readonly<Partial<Record<UnitRole, number>>> = {
  cargo: 6,
  airTransport: 2,
};

/** @a-mesurer the passenger half of `LIFT_CAPACITY`, assumed on the same single bearing */
export const LIFT_COST: Readonly<Partial<Record<UnitRole, number>>> = {
  infantry: 1,
  armor: 2,
  landTransport: 1,
};

/**
 * **What a land transport seats, and it is the only thing a land transport does** (note « le
 * transport terrestre et l'allure », validated 19/08). Two places, assumed and not measured,
 * with the bearing they were chosen against: at 2, motorizing eight infantry costs four trucks —
 * a real investment — where at 4 motorization would be nearly free and the foot pace would leave
 * the game.
 *
 * **It is not an entry of `LIFT_CAPACITY`, and that is a decision.** That table means *crossing a
 * medium that is not yours*: it gates `NOT_ENOUGH_LIFT`, it prints the « places » counter, and it
 * draws who is aboard whom. A truck listed there would ferry infantry over the Channel, would be
 * offered an armour to seat, and would be both a carrier and a passenger inside one crossing.
 * Land seats answer a different question — who rolls and who walks — and it is read by
 * `motorized` alone.
 *
 * @a-mesurer two seats, assumed; at four, motorizing an army would be nearly free
 */
export const LAND_SEATS_PER_TRANSPORT = 2;

/**
 * How many equipment tiers a role knows. Two for those whose gear gets replaced mid-season,
 * one for the others: this table decides what a workshop may produce, not the presence of a
 * sprite.
 *
 * The carrier has **one**: `chiffrage-combat.md` §1 gives eleven nominal strengths and none
 * for a tier-2 carrier, so the tier is not codable without inventing a number. Its strength is
 * reach, not power (design sheet 08).
 */
export const TIERS_BY_ROLE: Readonly<Record<UnitRole, UnitTier>> = {
  infantry: 2,
  armor: 2,
  landTransport: 1,
  fighter: 1,
  bomber: 1,
  airTransport: 1,
  escort: 1,
  cargo: 1,
  carrier: 1,
};

export const tierLabel = (tier: UnitTier): string => `MK${tier}`;

/**
 * The canonical order of the roles. It orders the inventory, and since the combat pass it also
 * orders the strikes of an engagement — one table, so a column cannot fire in one order and be
 * listed in another.
 */
export const ROLE_ORDER: ReadonlyArray<UnitRole> = [
  'infantry',
  'armor',
  'landTransport',
  'fighter',
  'bomber',
  'airTransport',
  'escort',
  'cargo',
  'carrier',
];

/**
 * **A troop's address, as one string to group and select on.** The union says what the address
 * *is*; this says whether two troops share it — which is all a card, a selection and a garrison
 * panel ever ask. A point is written to one decimal, the precision a click carries: two troops
 * left at the same place are one stack on the widget, not two cards a hundred metres apart.
 */
export const stationKeyOf = (station: TroopStation): string => {
  switch (station.kind) {
    case 'building':
      return `building:${station.buildingId}`;
    case 'outpost':
      return `outpost:${station.outpostId}`;
    case 'point':
      return `point:${station.lonLat[0].toFixed(1)},${station.lonLat[1].toFixed(1)}`;
    case 'home':
      return 'home';
  }
};

/** A column is ordered out of an address, and **`home` is not one**: a troop the game cannot
 *  place is a troop it cannot route from (ADR 0019 §1). */
export type MarchStation = Exclude<TroopStation, { readonly kind: 'home' }>;

/**
 * One card of the widget's *stationnaires* section: the troops of one role standing at one
 * address. They are grouped rather than listed one by one because the ceiling is 24 and the
 * widget must never need a scrollbar — and because "Fantassins · 6" is what one selects, not
 * six identical rows.
 *
 * `troopIds` travels with the card: it is what the garrison panel pre-checks, so the two doors
 * of the flow open on **one** selection state and never on two.
 */
export type StationGroup = {
  readonly key: string;
  readonly station: TroopStation;
  /** The address alone, without the role — what a selection compares and a panel opens on. */
  readonly stationKey: string;
  readonly role: UnitRole;
  readonly unitDomain: UnitDomain;
  readonly troopIds: ReadonlyArray<string>;
  readonly count: number;
  /** Hit points against the nominal they were formed at (ADR 0014) — the whole health bar. */
  readonly strength: number;
  readonly nominalStrength: number;
  /**
   * Whether the whole group is fed at the plain rate (ADR 0019 §4). One group is one address,
   * so its troops all answer the same — the `&&` is what says that out loud rather than
   * trusting the grouping to stay that way.
   */
  readonly supplied: boolean;
};

/**
 * **The pile's units of one domain, as a stack of its own.** What a segment of a route wears is
 * decided on it and not on the whole pile: an embarked infantry crosses the water *aboard a
 * hull*, so the sea leg shows the hull. Reading the majority of the whole pile there would put
 * a rifleman on the waves — the thing the silhouettes were standing in for.
 */
export function stackInDomain(stack: Stack, domain: UnitDomain): Stack {
  return ROLE_ORDER.filter((role) => DOMAIN_BY_ROLE[role] === domain).reduce<Stack>(
    (kept, role) => (stack[role] ? { ...kept, [role]: stack[role] } : kept),
    {},
  );
}

/**
 * The role that gives a movement its face on the map: the most numerous of the stack, ties
 * broken by the canonical role order. An empty stack has no face — it is the renderer's job
 * to decide what to show, not the domain's to invent a unit.
 */
export function representativeRole(stack: Stack): UnitRole | null {
  let kept: UnitRole | null = null;
  let maximum = 0;
  for (const role of ROLE_ORDER) {
    const count = stack[role] ?? 0;
    if (count > maximum) {
      kept = role;
      maximum = count;
    }
  }
  return kept;
}

/**
 * **The troops that stand still, by address and by role.** A troop marching is not here: it
 * hangs from the movement that carries it, and the widget's other section observes those —
 * they are not selectable, and the split between the two lists is the whole point (decision
 * 13a).
 *
 * The stations come in the order the addresses were served and the roles in the canonical one,
 * so the list does not reshuffle under the pointer between two subscriptions.
 */
export function stationGroups(
  me: PlayerView['me'],
  marching: ReadonlySet<string>,
): ReadonlyArray<StationGroup> {
  const byKey = new Map<string, StationGroup>();
  const rank: string[] = [];

  for (const troop of me.troops) {
    if (marching.has(troop.id)) continue;
    const stationKey = stationKeyOf(troop.stationedAt);
    const key = `${stationKey}-${troop.role}`;
    const held = byKey.get(key);
    if (held === undefined) rank.push(key);
    byKey.set(key, {
      key,
      station: troop.stationedAt,
      stationKey,
      role: troop.role,
      unitDomain: DOMAIN_BY_ROLE[troop.role],
      troopIds: [...(held?.troopIds ?? []), troop.id],
      count: (held?.count ?? 0) + 1,
      strength: (held?.strength ?? 0) + troop.strength,
      nominalStrength: (held?.nominalStrength ?? 0) + troop.nominalStrength,
      supplied: (held?.supplied ?? true) && troop.supplied,
    });
  }

  return rank
    .map((key) => byKey.get(key)!)
    .sort(
      (a, b) =>
        a.stationKey.localeCompare(b.stationKey) ||
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
    );
}

/** The troops standing at one address — what the garrison panel composes a column from. */
export function troopsAt(
  me: PlayerView['me'],
  stationKey: string,
  marching: ReadonlySet<string>,
): ReadonlyArray<TroopView> {
  return me.troops
    .filter((troop) => stationKeyOf(troop.stationedAt) === stationKey && !marching.has(troop.id))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

/**
 * **Being aboard is a computed state, and the gesture is only a way of writing it.** There is no
 * decision behind dropping an infantry into a hull — the berths are interchangeable, the troops
 * of one role are too, and the pace is the whole column's — so the drop settles *where* a troop
 * is drawn, never *what* the pile is. The tick box and the drop are two doors on one state
 * (note « le transport terrestre et l'allure », § « À bord »).
 *
 * `placements` is what the player's gesture said, and nothing else: a passenger it names rides
 * that transport if it still fits, and everything it does not name is seated greedily in list
 * order. It is **client-only and never stored** — the day being aboard has a per-troop effect,
 * an "aboard" edge in the schema becomes the right answer, and it is an ADR.
 *
 * A row carries **its carrier** rather than a flag, because that is also the answer to "would
 * this drop be taken?": a refusal is read off the same assignment the picture is drawn from, so
 * the two doors cannot drift apart.
 */
export type StackRow<T> = { readonly troop: T; readonly carrier: T | null };

export function stackRows<T extends { readonly id: string; readonly role: UnitRole }>(
  troops: ReadonlyArray<T>,
  picked: ReadonlySet<string>,
  placements: ReadonlyMap<string, string> = new Map(),
): ReadonlyArray<StackRow<T>> {
  const carriers = troops.filter(
    (troop) => picked.has(troop.id) && (LIFT_CAPACITY[troop.role] ?? 0) > 0,
  );
  const free = carriers.map((carrier) => LIFT_CAPACITY[carrier.role] ?? 0);
  const boarded = new Map<string, T[]>();

  const seat = (troop: T, berth: number): boolean => {
    const carrier = carriers[berth];
    const cost = LIFT_COST[troop.role] ?? 0;
    if (carrier === undefined || (free[berth] ?? 0) < cost) return false;
    free[berth] = (free[berth] ?? 0) - cost;
    boarded.set(carrier.id, [...(boarded.get(carrier.id) ?? []), troop]);
    return true;
  };

  const riders = troops.filter((troop) => picked.has(troop.id) && (LIFT_COST[troop.role] ?? 0) > 0);
  const placed = new Set<string>();
  // The gesture is served first: a berth taken greedily is a berth the player never asked for.
  for (const rider of riders) {
    const named = placements.get(rider.id);
    if (named === undefined) continue;
    if (
      seat(
        rider,
        carriers.findIndex((carrier) => carrier.id === named),
      )
    )
      placed.add(rider.id);
  }
  for (const rider of riders) {
    if (placed.has(rider.id)) continue;
    seat(
      rider,
      free.findIndex((seats) => seats >= (LIFT_COST[rider.role] ?? 0)),
    );
  }

  const passengers = new Set([...boarded.values()].flat().map((troop) => troop.id));
  return troops.flatMap((troop) =>
    passengers.has(troop.id)
      ? []
      : [
          { troop, carrier: null },
          ...(boarded.get(troop.id) ?? []).map((rider) => ({ troop: rider, carrier: troop })),
        ],
  );
}

/**
 * **Whether that drop would be taken** — asked of the picture itself rather than of a second
 * rule about capacity. A transport whose berths are taken refuses the gesture, and it refuses it
 * on exactly the count the « places » counter prints, because both read the same assignment.
 *
 * The dragged troop is taken out of the pile before the berths are counted: dropping a passenger
 * back onto the transport it already rides is not an overload. **Nobody is ever bumped** — a
 * drop that would need to unseat somebody else is the full transport the player must see, not a
 * silent reshuffle behind his gesture.
 */
export function seatsFree<T extends { readonly id: string; readonly role: UnitRole }>(
  troops: ReadonlyArray<T>,
  picked: ReadonlySet<string>,
  placements: ReadonlyMap<string, string>,
  passengerId: string,
  carrierId: string,
): number {
  const carrier = troops.find((troop) => troop.id === carrierId);
  if (carrier === undefined) return 0;
  const without = new Set([...picked].filter((id) => id !== passengerId));
  const taken = stackRows(troops, without, placements)
    .filter((row) => row.carrier?.id === carrierId)
    .reduce((sum, row) => sum + (LIFT_COST[row.troop.role] ?? 0), 0);
  return (LIFT_CAPACITY[carrier.role] ?? 0) - taken;
}

/** The drop, in the one word the panel needs: the pile it answers about is the one the tick box
 *  would have made, which is the whole equality between the two doors. */
export function boards<T extends { readonly id: string; readonly role: UnitRole }>(
  troops: ReadonlyArray<T>,
  picked: ReadonlySet<string>,
  placements: ReadonlyMap<string, string>,
  passengerId: string,
  carrierId: string,
): boolean {
  const passenger = troops.find((troop) => troop.id === passengerId);
  const cost = passenger === undefined ? 0 : (LIFT_COST[passenger.role] ?? 0);
  return cost > 0 && seatsFree(troops, picked, placements, passengerId, carrierId) >= cost;
}

/** Every troop a movement of mine carries: they have an address, but they are not standing at
 *  it, and offering them to a second order is the one thing the two sections exist to prevent. */
export function marchingTroopIds(arcs: ReadonlyArray<ArcView>): ReadonlySet<string> {
  return new Set(arcs.flatMap((arc) => (arc.state === 'mine' ? [...arc.troopIds] : [])));
}
