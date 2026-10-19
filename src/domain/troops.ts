import { MAX_QUEUED_BATCHES, MONDIALE_TROOP_BOUND } from '../../convex/constants';
import { shortfallOf } from './economy';
import { roleLockOf } from './research';
import { distanceKm, type LonLat } from './geo';
import {
  BUILDINGS,
  type BuildingKey,
  type Medium,
  type ResearchCard,
  type ResourceKey,
  type UnitRole,
  type UnitTier,
} from './ids';
import type {
  ArcView,
  CombatReport,
  PlayerView,
  Stack,
  TroopStation,
  TroopView,
} from './player-view';

export type { UnitTier };
export type UnitDomain = Medium;

export const DOMAIN_BY_ROLE: Readonly<Record<UnitRole, UnitDomain>> = {
  infantry: 'land',
  armor: 'land',
  landTransport: 'land',
  artillery: 'land',
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

/**
 * Whether a building has a site sheet. The sheet reads the server's `facilities`, which in a
 * Mondiale lists the forming buildings only: opened on the HQ, it waited for a row that never
 * came (#155).
 */
export const hasSiteSheet = (mode: PlayerView['mode'], key: BuildingKey): boolean =>
  mode === 'blitz' || Object.values(PROJECTION_BY_DOMAIN).includes(key);

export const projectionKeyOf = (role: UnitRole): BuildingKey =>
  PROJECTION_BY_DOMAIN[DOMAIN_BY_ROLE[role]];

export type RecruitRefusal =
  | {
      readonly code: 'WRONG_PROJECTION_BUILDING';
      readonly expected: BuildingKey;
      readonly found: BuildingKey;
    }
  | { readonly code: 'RESEARCH_REQUIRED'; readonly card: ResearchCard }
  | { readonly code: 'TROOP_BOUND_REACHED' }
  | { readonly code: 'QUEUE_FULL' }
  | {
      readonly code: 'INSUFFICIENT_RESOURCE';
      readonly resource: ResourceKey;
      readonly needed: number;
      readonly available: number;
    };

/** What a recruitment is read against, beside the site: the nation as it stands. */
export type RecruitSituation = {
  /** Les cartes de recherche acquises : un rôle à un palier qu'aucune n'ouvre attend la sienne. */
  readonly researched: ReadonlyArray<ResearchCard>;
  /** Troops standing and queued, all sites together: what the invisible bound counts. */
  readonly army: number;
  /** Batches already waiting at this site. */
  readonly siteQueue: number;
  readonly costs: Readonly<Partial<Record<ResourceKey, number>>>;
  readonly stocks: Readonly<Record<ResourceKey, number>>;
};

/**
 * **Ce qu'un site de projection refuse de former**, en Mondiale : le bon bâtiment pour le
 * domaine du rôle, la carte de recherche qui l'ouvre à ce palier, la borne invisible, la file du
 * site, enfin le prix. La pièce lâchée sur un mât le dit avant le relâché, et `troops.recruit`
 * refuse avec la même lecture ; chaque refus porte ce que sa phrase nomme.
 */
export function recruitRefusalOf(
  role: UnitRole,
  tier: UnitTier,
  site: { readonly key: BuildingKey },
  situation: RecruitSituation,
): RecruitRefusal | null {
  const expected = projectionKeyOf(role);
  if (site.key !== expected)
    return { code: 'WRONG_PROJECTION_BUILDING', expected, found: site.key };
  const card = roleLockOf(role, tier, situation.researched);
  if (card !== null) return { code: 'RESEARCH_REQUIRED', card };
  if (situation.army >= MONDIALE_TROOP_BOUND) return { code: 'TROOP_BOUND_REACHED' };
  if (situation.siteQueue >= MAX_QUEUED_BATCHES) return { code: 'QUEUE_FULL' };
  const short = shortfallOf(situation.costs, (resource) => situation.stocks[resource]);
  if (short !== null) {
    const available = situation.stocks[short.resource];
    return {
      code: 'INSUFFICIENT_RESOURCE',
      resource: short.resource,
      needed: available + short.missing,
      available,
    };
  }
  return null;
}

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
const GARRISON_KEYS_BY_ROLE: Readonly<Record<UnitRole, ReadonlyArray<BuildingKey>>> = {
  infantry: BUILDINGS,
  /** Le port et l'aérodrome s'y ajoutent (ADR 0025 §5) : une coque chargée de chars rentre à
   *  quai, un avion débarque ses passagers sur son terrain. */
  armor: ['barracks', 'hq', 'port', 'airfield'],
  /** L'entrepôt aussi : un camion s'y charge (ADR 0028 §4). */
  landTransport: ['barracks', 'hq', 'port', 'airfield', 'warehouse'],
  artillery: ['barracks', 'hq', 'port', 'airfield'],
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
 * the other assumed values in `convex/constants.ts`.
 *
 * The one bearing they were chosen against: the troop ceiling is 24, so two cargos lift half an
 * army. A landing is an operation one prepares, not a reflex — which is the whole point of
 * making the crossing an investment (a fleet one builds, protects, and can lose) instead of a
 * surcharge on a trip.
 *
 * A role absent from either table weighs nothing and lifts nothing: an escort is not a ferry,
 * and a fleet on its own has no passenger to answer for.
 *
 * **Révisé par l'ADR 0025** : la **capacité** d'un transport et l'**encombrement** d'une troupe,
 * en places. Une troupe s'assoit dans **un seul** transport (`stackRows`) — les capacités ne
 * s'additionnent pas, ce qui garde vraie la phrase « un blindé ne vole jamais ».
 *
 * @a-mesurer assumed against the troop ceiling alone — two cargos lift a whole infantry
 */
export const LIFT_CAPACITY: Readonly<Partial<Record<UnitRole, number>>> = {
  cargo: 12,
  carrier: 6,
  airTransport: 2,
};

/** @a-mesurer the passenger half of `LIFT_CAPACITY`, assumed on the same single bearing */
export const LIFT_COST: Readonly<Partial<Record<UnitRole, number>>> = {
  infantry: 1,
  armor: 3,
  landTransport: 2,
  artillery: 2,
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
 * Land seats answer a different question — who rolls and who walks — read by `motorized`, and
 * since 15/10 by the truck's own seats (`seatsOf`): infantry boards it, and only infantry.
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
  artillery: 1,
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
  'artillery',
  'fighter',
  'bomber',
  'airTransport',
  'escort',
  'cargo',
  'carrier',
];

/**
 * **A troop's address, as one string to group and select on.** The union says what the address
 * *is*; this says whether two troops share it. Coordinates keep their full precision, like
 * the server's sameStation: rounding grouped nearby troops at an address only one occupied,
 * so selecting that apparent garrison produced orders the server could never accept.
 */
export const stationKeyOf = (station: TroopStation): string => {
  switch (station.kind) {
    case 'building':
      return `building:${station.buildingId}`;
    case 'outpost':
      return `outpost:${station.outpostId}`;
    case 'point':
      return `point:${station.lonLat[0]},${station.lonLat[1]}`;
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
 * to decide what to show, not the domain's to invent a unit. **Trucks carrying all the infantry
 * wear it** (retour de Pierre, 15/10) : the riflemen are aboard, the road sees the vehicle — and
 * once some of them walk, the boots are back.
 */
export function representativeRole(stack: Stack): UnitRole | null {
  const trucks = stack.landTransport ?? 0;
  const infantry = stack.infantry ?? 0;
  const riding = Object.entries(stack).filter(([, count]) => (count ?? 0) > 0);
  if (
    trucks > 0 &&
    riding.every(([role]) => role === 'landTransport' || role === 'infantry') &&
    infantry * (LIFT_COST.infantry ?? 0) <= trucks * LAND_SEATS_PER_TRANSPORT
  )
    return 'landTransport';
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
 * **Who would sit where, if everyone picked boarded** — the greedy seating a crossing is weighed
 * on before it leaves (`strandedIn`). It is not who is aboard: that is a state (`carriedBy`,
 * révision de l'ADR 0025 du 15/10), and a column's loose troops take their seats at departure
 * (`seatLoose`). A row carries its carrier, `null` on foot.
 */
export type StackRow<T> = { readonly troop: T; readonly carrier: T | null };

export function stackRows<T extends { readonly id: string; readonly role: UnitRole }>(
  troops: ReadonlyArray<T>,
  picked: ReadonlySet<string>,
): ReadonlyArray<StackRow<T>> {
  const carriers = troops.filter(
    (troop) => picked.has(troop.id) && (LIFT_CAPACITY[troop.role] ?? 0) > 0,
  );
  const free = carriers.map((carrier) => LIFT_CAPACITY[carrier.role] ?? 0);
  const carrierOf = new Map<string, T>();

  const seat = (troop: T, berth: number): boolean => {
    const carrier = carriers[berth];
    const cost = LIFT_COST[troop.role] ?? 0;
    if (carrier === undefined || (free[berth] ?? 0) < cost) return false;
    free[berth] = (free[berth] ?? 0) - cost;
    carrierOf.set(troop.id, carrier);
    return true;
  };

  const riders = troops.filter((troop) => picked.has(troop.id) && (LIFT_COST[troop.role] ?? 0) > 0);
  // Heaviest first: seated in list order, an infantry could take the last places of a hull
  // an armour needed while another hull still had room for the infantry.
  const byWeight = [...riders].sort((a, b) => (LIFT_COST[b.role] ?? 0) - (LIFT_COST[a.role] ?? 0));
  for (const rider of byWeight) {
    seat(
      rider,
      free.findIndex((seats) => seats >= (LIFT_COST[rider.role] ?? 0)),
    );
  }

  // Passengers are listed under their transport in the pile's own order, not the seating's.
  return troops.flatMap((troop) =>
    carrierOf.has(troop.id)
      ? []
      : [
          { troop, carrier: null },
          ...troops
            .filter((rider) => carrierOf.get(rider.id) === troop)
            .map((rider) => ({ troop: rider, carrier: troop })),
        ],
  );
}

/** Une troupe et ce qui la porte : **être à bord est un état** (révision de l'ADR 0025, 15/10) —
 *  on y est parce qu'on a embarqué, plus parce qu'on se tient au point d'un transport. */
export type Seated = {
  readonly id: string;
  readonly role: UnitRole;
  readonly carriedBy?: string | undefined;
};

/** Le transport qui porte cette troupe, s'il se tient dans la même pile — un transport parti
 *  sans elle ne la porte plus. */
export const carrierIn = <T extends Seated>(troop: T, pile: ReadonlyArray<T>): T | null =>
  troop.carriedBy === undefined
    ? null
    : (pile.find((other) => other.id === troop.carriedBy) ?? null);

/** Ce qu'un transport porte, à tous les étages : un camion chargé à bord d'un cargo y est avec
 *  ses fusiliers. */
export function cargoOf<T extends Seated>(carrier: T, pile: ReadonlyArray<T>): T[] {
  return pile
    .filter((troop) => carrierIn(troop, pile)?.id === carrier.id)
    .flatMap((rider) => [rider, ...cargoOf(rider, pile)]);
}

/** Les places d'un transport : une coque ou une aile (`LIFT_CAPACITY`), ou le camion, qui
 *  n'assoit que l'infanterie (`LAND_SEATS_PER_TRANSPORT`). */
export const seatsOf = (role: UnitRole): number =>
  role === 'landTransport' ? LAND_SEATS_PER_TRANSPORT : (LIFT_CAPACITY[role] ?? 0);

/** Ce que coûte une troupe à bord de ce transport, sa propre cargaison comprise ; `null` quand il
 *  ne la prend pas — un camion ne porte que l'infanterie, une coque que ce qui marche. */
export function fareOf<T extends Seated>(
  carrier: UnitRole,
  rider: T,
  pile: ReadonlyArray<T>,
): number | null {
  if (carrier === 'landTransport')
    return rider.role === 'infantry' ? (LIFT_COST.infantry ?? 0) : null;
  if (seatsOf(carrier) === 0 || (LIFT_COST[rider.role] ?? 0) === 0) return null;
  return [rider, ...cargoOf(rider, pile)].reduce(
    (sum, troop) => sum + (LIFT_COST[troop.role] ?? 0),
    0,
  );
}

export const seatsLeft = <T extends Seated>(carrier: T, pile: ReadonlyArray<T>): number =>
  seatsOf(carrier.role) -
  pile
    .filter((troop) => carrierIn(troop, pile)?.id === carrier.id)
    .reduce((sum, rider) => sum + (fareOf(carrier.role, rider, pile) ?? 0), 0);

/**
 * **Une colonne mixte embarque au départ** (15/10) : ce qui part à pied avec un transport monte
 * s'il y a de la place, et personne ne change de banc. Le camion d'abord, qui motorise ; puis les
 * coques et les ailes, le plus lourd d'abord — servi dans l'ordre de la liste, un fantassin
 * prendrait les dernières places d'une coque qu'un blindé attendait.
 */
export function seatLoose<T extends Seated>(pile: ReadonlyArray<T>): ReadonlyMap<string, string> {
  const work = pile.map((troop) => ({ ...troop }) as T & { carriedBy?: string });
  const seated = new Map<string, string>();
  const fill = (carriers: ReadonlyArray<T & { carriedBy?: string }>) => {
    const loose = work
      .filter((troop) => carrierIn(troop, work) === null)
      .map((troop) => ({ troop, weight: fareOf('cargo', troop, work) ?? 0 }))
      .sort((a, b) => b.weight - a.weight);
    for (const { troop } of loose)
      for (const carrier of carriers) {
        const fare = carrier === troop ? null : fareOf(carrier.role, troop, work);
        if (fare === null || seatsLeft(carrier, work) < fare) continue;
        troop.carriedBy = carrier.id;
        seated.set(troop.id, carrier.id);
        break;
      }
  };
  fill(work.filter((troop) => troop.role === 'landTransport'));
  fill(work.filter((troop) => (LIFT_CAPACITY[troop.role] ?? 0) > 0));
  return seated;
}

/** La pile telle qu'elle part : ses troupes à pied montent où il y a de la place. */
export function boardedAll<T extends Seated>(pile: ReadonlyArray<T>): T[] {
  const seats = seatLoose(pile);
  return pile.map((troop) => {
    const carrier = seats.get(troop.id);
    return carrier === undefined ? troop : { ...troop, carriedBy: carrier };
  });
}

/**
 * **Les unités d'une pile** (règle de Pierre, 15/10) : une troupe seule, ou un transport et ce
 * qu'il porte, le transport en tête — deux troupes de combat ne font jamais une unité.
 */
export function unitsOf<T extends Seated>(
  troops: ReadonlyArray<T>,
): ReadonlyArray<ReadonlyArray<T>> {
  return troops
    .filter((troop) => carrierIn(troop, troops) === null)
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .map((head) => [head, ...cargoOf(head, troops)]);
}

/** Every troop a movement of mine carries: they have an address, but they are not standing at
 *  it, and offering them to a second order is the one thing the two sections exist to prevent. */
export function marchingTroopIds(arcs: ReadonlyArray<ArcView>): ReadonlySet<string> {
  return new Set(arcs.flatMap((arc) => (arc.state === 'mine' ? [...arc.troopIds] : [])));
}

/** Where an address stands on the map, as my view knows it; `null` for `home`. */
export function stationPointOf(me: PlayerView['me'], station: TroopStation): LonLat | null {
  if (station.kind === 'point') return station.lonLat;
  if (station.kind === 'outpost')
    return me.outposts.find((outpost) => outpost.id === station.outpostId)?.lonLat ?? null;
  if (station.kind === 'building')
    return me.buildings.find((building) => building.id === station.buildingId)?.point ?? null;
  return null;
}

/**
 * **La garnison qu'une dépêche de combat ouvre** (lot mobile-3, §6) : l'avant-poste visé quand
 * c'en était un des miens, sinon la plus proche de mes adresses debout qui tient encore quelqu'un
 * dans l'allonge du combat. `null` quand rien de moi ne s'y tient plus — la passe a tout emporté,
 * et une porte vers une garnison vide promettrait une composition qui n'existe pas.
 *
 * Elle ne lit que ma vue et le compte rendu : le lieu de la passe, que les deux camps ont tenu.
 */
export function stationAtCombat(
  me: PlayerView['me'],
  combat: Pick<CombatReport, 'point' | 'outpostId'>,
  marching: ReadonlySet<string>,
  reachKm: number,
): TroopStation | null {
  if (combat.outpostId !== null && me.outposts.some((outpost) => outpost.id === combat.outpostId))
    return { kind: 'outpost', outpostId: combat.outpostId };
  const where: LonLat = [combat.point.lon, combat.point.lat];
  let nearest: { readonly station: TroopStation; readonly km: number } | null = null;
  for (const troop of me.troops) {
    if (marching.has(troop.id)) continue;
    const place = stationPointOf(me, troop.stationedAt);
    if (place === null) continue;
    const km = distanceKm(place, where);
    if (km <= reachKm && (nearest === null || km < nearest.km))
      nearest = { station: troop.stationedAt, km };
  }
  return nearest?.station ?? null;
}
