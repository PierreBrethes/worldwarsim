import { BUILDINGS, RESOURCES, type BuildingKey, type DepositKey, type ResourceKey } from './ids';
import { EXPLOITED_DEPOSITS, placementRefusal, type PlacementRefusal } from './economy';
import {
  currentStock,
  type Building,
  type BuildSpec,
  type Cost,
  type PlayerView,
  type RegionView,
  type Resource,
} from './player-view';

/**
 * Why a building is offered here rather than elsewhere. It is the sentence that teaches the
 * map: a player who reads "coal deposit" under a mine has understood the region, not the menu.
 */
export type BuildReason =
  { readonly kind: 'deposit'; readonly deposit: DepositKey } | { readonly kind: 'coastal' };

/**
 * What holds a line back **for now** — as opposed to what this ground can never carry, which
 * is `BlockedReason` below. The two are drawn apart and must stay apart: a hold is a deadline
 * or a remedy ("come back in twenty minutes"), a block is a fact about the region.
 */
export type BuildHold = 'constructionRunning' | 'buildingCap' | 'materials';

export type BuildOption = {
  readonly key: BuildingKey;
  readonly cost: Cost;
  readonly minutes: number;
  readonly reason: BuildReason | null;
  readonly hold: BuildHold | null;
  /** Owed by the format's foundation: placed for nothing, standing at once. */
  readonly free: boolean;
};

/** The region as placement reads it, plus what the player is: the two halves of the rule. */
export type Site = {
  readonly deposit: DepositKey | null;
  readonly coastal: boolean;
  /** The building already standing on this very region — one per region (ADR 0015). */
  readonly standing: BuildingKey | null;
  readonly standingCount: number;
  readonly cap: number;
  readonly hqLevel: number;
  readonly stocks: Readonly<Record<ResourceKey, number>>;
  readonly constructionRunning: boolean;
  /** A construction rising on **this very region**: nothing stands yet, but the ground is
   *  taken — the `finish` will fill it, and a second placement would leave two on one region. */
  readonly constructionHere: boolean;
  /** What the season still owes (`me.foundation`), served — never re-derived here. */
  readonly foundation: ReadonlyArray<BuildingKey>;
};

/**
 * What may be built on a region, and what merely holds it back. The rule is
 * `placementRefusal` — the one the server refuses with — read **twice**: once with the
 * circumstances lifted, which says what this ground can ever carry, and once as things
 * actually stand, which says what is blocked today. Two readings of one rule rather than a
 * second copy of it: a copy would offer what the server refuses, or hide what it accepts.
 *
 * Raising a building is deliberately absent. Upgrading belongs to the nation sheet — one verb
 * per surface — so the key already standing here never comes back in the list.
 */
export function buildableOn(
  site: Site,
  catalog: Readonly<Record<BuildingKey, BuildSpec>>,
): ReadonlyArray<BuildOption> {
  if (site.constructionHere) return [];

  const region = { deposit: site.deposit, coastal: site.coastal };
  return BUILDINGS.flatMap((key) => {
    if (key === site.standing) return [];
    // Nothing rises above the headquarters, and a level-1 building needs one standing.
    if (key === 'hq' ? site.hqLevel > 0 : site.hqLevel === 0) return [];

    const spec = catalog[key];
    /**
     * The tier is **not** lifted with the circumstances: a key the headquarters does not open
     * yet is not *offered*. It is not lost either — `blockedOn` picks it up for the shelf, and
     * says which tier it waits on. What holds a line back today the offer says; what the ground
     * or the season refuses outright belongs under it.
     */
    const byNature = placementRefusal(
      key,
      region,
      {
        onRegion: site.standing,
        standing: 0,
        cap: Number.POSITIVE_INFINITY,
        hqLevel: site.hqLevel,
      },
      spec.unlockedAtHqLevel,
    );
    if (byNature !== null) return [];

    const asThingsStand = placementRefusal(
      key,
      region,
      {
        onRegion: site.standing,
        standing: site.standingCount,
        cap: site.cap,
        hqLevel: site.hqLevel,
      },
      spec.unlockedAtHqLevel,
    );

    /**
     * A key the foundation still owes is placed for nothing and stands at once — so it carries
     * no bill and no delay, and neither matter nor a running site can hold it back. The
     * ceiling still can: the foundation buys the price and the wait, never a place on the map.
     */
    const free = site.foundation.includes(key);
    const cost = free ? {} : spec.cost;

    return [
      {
        key,
        cost,
        minutes: free ? 0 : spec.minutes,
        reason: reasonFor(key, site.deposit),
        free,
        hold: holdOn(site, free, cost, asThingsStand === 'BUILDING_CAP_REACHED'),
      } satisfies BuildOption,
    ];
  });
}

/**
 * Why this ground can never carry a building — the *catalogue* half of the panel, under the
 * offer. It says which single requirement the region fails, and it is only ever asked about a
 * key `buildableOn` has already left out: the decision of what is offered stays in one place,
 * and this names the cause rather than re-taking the decision.
 *
 * That ordering is what makes the fall-through sound. A key excluded with the region free and
 * the tier open has nothing left to fail but its own nature — its deposit, or a coast.
 */
export type BlockedReason =
  | { readonly kind: 'constructionHere' }
  | { readonly kind: 'standing' }
  | { readonly kind: 'regionTaken'; readonly by: BuildingKey }
  | { readonly kind: 'unique' }
  | { readonly kind: 'locked'; readonly hqLevel: number }
  | { readonly kind: 'deposit'; readonly deposits: ReadonlyArray<DepositKey> }
  | { readonly kind: 'coastal' }
  | { readonly kind: 'here' };

/** A catalogue line: the bill and the wait are served too, because they are what a player
 *  plans against — the reason says *not here*, the price says *what it will take*. */
export type BlockedOption = {
  readonly key: BuildingKey;
  readonly cost: Cost;
  readonly minutes: number;
  readonly reason: BlockedReason;
};

/**
 * **The rest of the catalogue**, in the order of `BUILDINGS` — every key the offer left out,
 * each carrying the requirement it fails. Together with `buildableOn` it partitions the
 * fifteen exactly once, by construction: the complement of a list, never a second reading of
 * the placement rule.
 *
 * ADR 0015 wanted the panel contextual and grey-free, and this walks that back on purpose: a
 * player cannot learn a catalogue he has never seen, and "no crane here" taught him nothing
 * about where the crane *would* work. The grey is a **reference shelf, kept below the offer**
 * and never mixed into it — the top of the panel is still only what the click can order.
 */
export function blockedOn(
  site: Site,
  catalog: Readonly<Record<BuildingKey, BuildSpec>>,
): ReadonlyArray<BlockedOption> {
  const offered = new Set(buildableOn(site, catalog).map((option) => option.key));
  return BUILDINGS.filter((key) => !offered.has(key)).map((key) => ({
    key,
    cost: catalog[key].cost,
    minutes: catalog[key].minutes,
    reason: blockedBecause(site, key, catalog[key]),
  }));
}

function blockedBecause(site: Site, key: BuildingKey, spec: BuildSpec): BlockedReason {
  if (site.constructionHere) return { kind: 'constructionHere' };
  if (key === site.standing) return { kind: 'standing' };
  if (site.standing !== null) return { kind: 'regionTaken', by: site.standing };
  if (key === 'hq') return { kind: 'unique' };

  // A season plants the headquarters, so level 0 refuses every other key at tier 1 — the
  // sentence is the same one the tiers say, and saying "il en faut un" instead would name a
  // second rule where there is one.
  const needed = Math.max(1, spec.unlockedAtHqLevel);
  if (site.hqLevel < needed) return { kind: 'locked', hqLevel: needed };

  const deposits = EXPLOITED_DEPOSITS[key];
  if (deposits !== undefined) return { kind: 'deposit', deposits };
  if (key === 'port') return { kind: 'coastal' };
  return { kind: 'here' };
}

/**
 * What stands between a line and the click, most immediate first. **A free placement is never
 * held by a construction**: it opens none and waits for nothing, so the single-site rule has
 * nothing to say about it — the server refuses it the same way (`constructions.start`), and a
 * playtest lost three offered buildings behind one paid mill because both said otherwise.
 */
function holdOn(site: Site, free: boolean, cost: Cost, cappedByCeiling: boolean): BuildHold | null {
  if (!free && site.constructionRunning) return 'constructionRunning';
  if (cappedByCeiling) return 'buildingCap';
  return free || affordable(cost, site.stocks) ? null : 'materials';
}

const affordable = (cost: Cost, stocks: Readonly<Record<ResourceKey, number>>): boolean =>
  Object.entries(cost).every(([key, amount]) => stocks[key as ResourceKey] >= (amount ?? 0));

function reasonFor(key: BuildingKey, deposit: DepositKey | null): BuildReason | null {
  if (deposit !== null && EXPLOITED_DEPOSITS[key]?.includes(deposit)) {
    return { kind: 'deposit', deposit };
  }
  return key === 'port' ? { kind: 'coastal' } : null;
}

/**
 * The site a player's view describes for one region, or `null` when that region is none of
 * his business — the view only carries his own ground, so absence *is* the answer to "may I
 * build there".
 */
export function siteOf(view: PlayerView, regionId: string, now: number): Site | null {
  const region: RegionView | undefined = view.me.regions.find(
    (candidate) => candidate.id === regionId,
  );
  if (region === undefined) return null;
  const stocks = Object.fromEntries(
    Object.entries(view.me.resources).map(([key, resource]) => [
      key,
      currentStock(resource, view.loadedAt, now),
    ]),
  ) as Record<ResourceKey, number>;

  return {
    deposit: region.deposit,
    coastal: region.coastal,
    standing: region.buildings[0]?.key ?? null,
    standingCount: view.me.buildings.length,
    cap: view.me.buildingCap,
    hqLevel: view.me.hqLevel,
    stocks,
    constructionRunning: view.me.construction !== null,
    constructionHere: view.me.construction?.regionId === regionId,
    foundation: view.me.foundation,
  };
}

/** The panel's list, straight from a view. Empty means the region can carry nothing, ever. */
export function buildOptionsAt(
  view: PlayerView,
  regionId: string,
  now: number,
): ReadonlyArray<BuildOption> {
  const site = siteOf(view, regionId, now);
  return site === null ? [] : buildableOn(site, view.buildCatalog);
}

/**
 * What holds a **raise** back, `null` when nothing does. Raising is not placing: the region is
 * already held and already counted, so neither the one-per-region rule nor the building ceiling
 * has anything to say — which is why this reads the three refusals `constructions.start` can
 * still raise, and not `placementRefusal`.
 *
 * None of them is re-decided here. The single construction and the headquarters ceiling arrive
 * cooked in the view (`me.construction`, `building.cappedByHq`); the bill is the served cost
 * against the served stock. A fourth rule appearing in this function would mean the view is
 * short of a field — the answer is to serve it, never to guess it.
 */
export type UpgradeHold =
  | { readonly kind: 'constructionRunning' }
  | { readonly kind: 'cappedByHq' }
  | {
      readonly kind: 'materials';
      readonly resource: ResourceKey;
      readonly needed: number;
      readonly available: number;
    };

/**
 * When the missing matter will be there. **A refusal that counts is a wall; a refusal that
 * dates itself is a plan** — "il faut 72 de charbon (0 disponibles)" tells a player he has
 * lost, "disponible dans 4 h 20" tells him to come back.
 *
 * `never` is the one that earns its place. When nothing produces the matter — no mine, so no
 * coal, ever — a countdown would be a lie, and the honest sentence names the building to
 * raise. The ceiling counts as never too: a bill above what the warehouses can hold is not
 * waiting on time, it is waiting on a warehouse.
 */
export type Availability =
  | { readonly kind: 'now' }
  | { readonly kind: 'inMinutes'; readonly minutes: number }
  | { readonly kind: 'never' };

export function availabilityOf(needed: number, held: Resource, stock: number): Availability {
  if (stock >= needed) return { kind: 'now' };
  if (needed > held.cap || held.ratePerHour <= 0) return { kind: 'never' };
  return { kind: 'inMinutes', minutes: ((needed - stock) / held.ratePerHour) * 60 };
}

export function upgradeHold(building: Building, view: PlayerView, now: number): UpgradeHold | null {
  if (view.me.construction !== null) return { kind: 'constructionRunning' };
  if (building.cappedByHq) return { kind: 'cappedByHq' };

  // The first shortfall in resource order, never a list: a bill is paid whole or not at all
  // (`debit` checks every cost before debiting any), so naming one is naming the blockage.
  for (const resource of RESOURCES) {
    const needed = building.nextLevelCost[resource] ?? 0;
    if (needed === 0) continue;
    const available = currentStock(view.me.resources[resource], view.loadedAt, now);
    if (available < needed) return { kind: 'materials', resource, needed, available };
  }
  return null;
}

/**
 * Why **no region at all** takes a key — `null` when at least one does. Where `BlockedReason`
 * above answers "not here", this answers "nowhere yet", which is the only question the
 * mobilisation order and the supply chart ever ask: they name a building, never a ground.
 */
export type PlacementCondition =
  | { readonly kind: 'locked'; readonly hqLevel: number }
  | { readonly kind: 'deposit'; readonly deposits: ReadonlyArray<DepositKey> }
  | { readonly kind: 'coastal' }
  | { readonly kind: 'cap' }
  | { readonly kind: 'regionsTaken' };

export type Placement = {
  readonly key: BuildingKey;
  /** The player's own regions that accept it right now, in the order the view serves them. */
  readonly regionIds: ReadonlyArray<string>;
  /** `null` as soon as `regionIds` holds one. */
  readonly condition: PlacementCondition | null;
  /** Owed by the season's foundation: placed for nothing and standing at once. */
  readonly free: boolean;
};

/**
 * **Where a key may go down, over the whole of the player's ground.** `buildableOn` answers
 * "what can stand here"; this answers the opposite question — "where does this go" — which is
 * the one the mobilisation order asks when a clé is clicked, and the one the supply chart asks
 * of a missing link.
 *
 * Same rule, same two readings as `buildableOn` and for the same reason: once with the
 * circumstances lifted, which says what the ground can *ever* carry, and once as things stand.
 * A key nothing can ever take names its nature — a deposit, a coast, a headquarters level; a
 * key every region merely happens to refuse today names the circumstance. Neither sentence is
 * written here twice over: `placementRefusal` is the server's own refusal.
 */
export function placementOf(view: PlayerView, key: BuildingKey): Placement {
  const unlockedAtHqLevel = view.buildCatalog[key].unlockedAtHqLevel;
  const free = view.me.foundation.includes(key);
  const hqLevel = view.me.hqLevel;
  // Nothing rises above the headquarters, and a level-1 building needs one standing — the same
  // pair of guards `buildableOn` opens on, because it is the same catalogue.
  const impossible = key === 'hq' ? hqLevel > 0 : hqLevel === 0;

  const regionIds: string[] = [];
  const natures = new Set<PlacementRefusal>();
  let carriable = false;

  for (const region of impossible ? [] : view.me.regions) {
    const byNature = placementRefusal(
      key,
      region,
      { onRegion: null, standing: 0, cap: Number.POSITIVE_INFINITY, hqLevel },
      unlockedAtHqLevel,
    );
    if (byNature !== null) {
      natures.add(byNature);
      continue;
    }
    carriable = true;

    // A region a construction is rising on is taken, though nothing stands on it yet — the
    // `finish` will fill it, and the server refuses a second placement there (`start`).
    if (view.me.construction?.regionId === region.id) continue;
    const asThingsStand = placementRefusal(
      key,
      region,
      {
        onRegion: region.buildings[0]?.key ?? null,
        standing: view.me.buildings.length,
        cap: view.me.buildingCap,
        hqLevel,
      },
      unlockedAtHqLevel,
    );
    if (asThingsStand === null) regionIds.push(region.id);
  }

  if (regionIds.length > 0) return { key, regionIds, condition: null, free };
  return { key, regionIds, condition: conditionOf(view, key, carriable, natures), free };
}

/**
 * The single sentence that would open a key. Nature before circumstance: a player told his
 * ceiling is full will raise his headquarters, and find the well still refused for want of a
 * deposit — the ground is the fact, the ceiling is only today.
 */
function conditionOf(
  view: PlayerView,
  key: BuildingKey,
  carriable: boolean,
  natures: ReadonlySet<PlacementRefusal>,
): PlacementCondition {
  if (!carriable) {
    if (natures.has('BUILDING_LOCKED')) {
      return { kind: 'locked', hqLevel: Math.max(1, view.buildCatalog[key].unlockedAtHqLevel) };
    }
    const deposits = EXPLOITED_DEPOSITS[key];
    if (deposits !== undefined) return { kind: 'deposit', deposits };
    if (key === 'port') return { kind: 'coastal' };
    // Nothing left for a key the headquarters opens and the ground never refuses: a level-0
    // headquarters, or the second headquarters that never exists.
    return { kind: 'locked', hqLevel: Math.max(1, view.buildCatalog[key].unlockedAtHqLevel) };
  }
  return view.me.buildings.length >= view.me.buildingCap
    ? { kind: 'cap' }
    : { kind: 'regionsTaken' };
}
