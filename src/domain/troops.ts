import type { BuildingKey, Medium, UnitRole, UnitTier } from './ids';
import type { ArcView, PlayerView, Stack, TroopView } from './player-view';

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
 * **A troop's address is the thing it hangs from** (decision 12a, ADR 0013 and 0014): a
 * building, the outpost its column founded, or nothing at all — which reads "at home" and is
 * what a troop whose building was razed comes back to.
 */
export type StationKind = 'building' | 'outpost' | 'home';

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
  readonly stationId: string | null;
  readonly kind: StationKind;
  readonly role: UnitRole;
  readonly unitDomain: UnitDomain;
  readonly troopIds: ReadonlyArray<string>;
  readonly count: number;
  /** Hit points against the nominal they were formed at (ADR 0014) — the whole health bar. */
  readonly strength: number;
  readonly nominalStrength: number;
};

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
  const garrisoned = new Set(me.outposts.map((outpost) => outpost.id));
  const byKey = new Map<string, StationGroup>();
  const rank: string[] = [];

  for (const troop of me.troops) {
    if (marching.has(troop.id)) continue;
    const stationId = troop.stationedAt;
    const kind: StationKind =
      stationId === null ? 'home' : garrisoned.has(stationId) ? 'outpost' : 'building';
    const key = `${stationId ?? 'home'}-${troop.role}`;
    const held = byKey.get(key);
    if (held === undefined) rank.push(key);
    byKey.set(key, {
      key,
      stationId,
      kind,
      role: troop.role,
      unitDomain: DOMAIN_BY_ROLE[troop.role],
      troopIds: [...(held?.troopIds ?? []), troop.id],
      count: (held?.count ?? 0) + 1,
      strength: (held?.strength ?? 0) + troop.strength,
      nominalStrength: (held?.nominalStrength ?? 0) + troop.nominalStrength,
    });
  }

  return rank
    .map((key) => byKey.get(key)!)
    .sort(
      (a, b) =>
        String(a.stationId).localeCompare(String(b.stationId)) ||
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
    );
}

/** The troops hanging from one address — what the garrison panel composes a column from. */
export function troopsAt(
  me: PlayerView['me'],
  stationId: string | null,
  marching: ReadonlySet<string>,
): ReadonlyArray<TroopView> {
  return me.troops
    .filter((troop) => troop.stationedAt === stationId && !marching.has(troop.id))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

/** Every troop a movement of mine carries: they have an address, but they are not standing at
 *  it, and offering them to a second order is the one thing the two sections exist to prevent. */
export function marchingTroopIds(arcs: ReadonlyArray<ArcView>): ReadonlySet<string> {
  return new Set(arcs.flatMap((arc) => (arc.state === 'mine' ? [...arc.troopIds] : [])));
}
