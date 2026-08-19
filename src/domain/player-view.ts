import type { LonLat } from './geo';
import type {
  BuildingKey,
  DepositKey,
  Doctrine,
  MovementType,
  ResourceKey,
  SeasonFormat,
  Specialization,
  UnitRole,
  UnitTier,
} from './ids';
import type { ChainState } from './economy';
import type { ComputedRoute } from './routing';

export type { ChainState, Doctrine, MovementType, UnitRole };

export type Stack = Partial<Record<UnitRole, number>>;

/**
 * What intelligence has pierced of an enemy movement. A nested union rather than a boolean
 * with optional fields: until the breakthrough happens, the card structurally has neither a
 * type nor a composition to leak.
 */
export type MovementIdentification =
  | { readonly pierced: false }
  | { readonly pierced: true; readonly type: MovementType; readonly stack: Stack };

/**
 * The four display states of an arc. The discriminated union is the fog of war's guardrail:
 * an enemy arc structurally has neither `type` nor `stack`, so they cannot be displayed by
 * accident.
 *
 * `route` is present in all four states, enemy included: the medium — land, sea or air — of a
 * detected movement is visible (design sheet 04). The thread would betray it anyway, and the
 * decoy gains a bluffing option. The type and the composition stay out of reach.
 * `from` and `to` remain alongside: they are the declared endpoints, not the polyline followed.
 */
export type ArcView =
  | {
      readonly state: 'mine';
      readonly id: string;
      readonly from: LonLat;
      readonly to: LonLat;
      readonly route: ComputedRoute;
      // `…Country` names the `world.json` country, in English: it is the key that selects the
      // country on the map. `…Label` is what gets printed, in French. Both exist because
      // Natural Earth has no translations while the screen is French; mixing them up would
      // put "United Kingdom" back on a card.
      readonly originCountry: string;
      readonly destinationCountry: string;
      readonly originLabel: string;
      readonly destinationLabel: string;
      readonly type: MovementType;
      readonly stack: Stack;
      /**
       * The troops this movement carries. They keep their address — a movement never takes it
       * from them — so without this list the widget would offer a marching column to a second
       * order, from the very building it left.
       */
      readonly troopIds: ReadonlyArray<string>;
      readonly minutesLeft: number;
      /**
       * An arrival falling inside the target's rest window stalls the movement at the
       * border: it only resolves when the window ends. `null` when resolution happens on
       * arrival — see `windowExit`.
       */
      readonly borderWait: { readonly resolutionInMinutes: number } | null;
      readonly progress: number;
    }
  | {
      readonly state: 'enemyDetected';
      readonly id: string;
      readonly from: LonLat;
      readonly to: LonLat;
      readonly route: ComputedRoute;
      readonly suspectedNation: string | null;
      readonly headingDegrees: number;
      /** The heading cuts through my territory or one of my outposts: the card turns critical. */
      readonly headingAtMe: boolean;
      readonly identification: MovementIdentification;
      readonly estimatedMinutesLeft: number | null;
      readonly progress: number;
    }
  | {
      readonly state: 'lastKnown';
      readonly id: string;
      readonly from: LonLat;
      readonly to: LonLat;
      readonly route: ComputedRoute;
      readonly headingDegrees: number;
      readonly seenMinutesAgo: number;
      readonly progress: number;
    }
  | {
      readonly state: 'seaControl';
      readonly id: string;
      readonly from: LonLat;
      readonly to: LonLat;
      readonly route: ComputedRoute;
      readonly progress: number;
    };

/**
 * **Where a troop stands, and the map is one of the answers** (ADR 0019 §1): a building, the
 * outpost a column founded, a plain point of the map, or nothing standing at all. A discriminated
 * union rather than an id and a kind beside it — a point carries coordinates no id has, `home`
 * carries nothing, and the compiler is what keeps a reader from asking one for the other.
 *
 * `country` is the host of the point as every rule keys it, an `adm0_a3`, empty on the open sea
 * (`hostAtPoint`). It travels with the address because the screen names the place a column was
 * left in — "en campagne · Arabie saoudite" — and the client holds no geometry to find it.
 */
export type TroopStation =
  | { readonly kind: 'building'; readonly buildingId: string }
  | { readonly kind: 'outpost'; readonly outpostId: string }
  | { readonly kind: 'point'; readonly lonLat: LonLat; readonly country: string }
  | { readonly kind: 'home' };

/**
 * One troop, as its owner sees it (ADR 0014). Its hit points **are** its strength, read
 * against the nominal it was formed at: "32 / 50 soldats" is the whole health bar.
 *
 * `stationedAt` is its address, `home` meaning the troop whose building is gone. No enemy troop
 * ever travels in this list.
 */
export type TroopView = {
  readonly id: string;
  readonly role: UnitRole;
  readonly tier: UnitTier;
  readonly strength: number;
  readonly nominalStrength: number;
  readonly stationedAt: TroopStation;
};

export type OutpostView = {
  readonly id: string;
  readonly hostCountry: string;
  readonly lonLat: LonLat;
  readonly specialization: Specialization;
  readonly level: number;
  readonly garrison: number;
  /** A raid puts a point out of service for a while; `null` is a point that is standing. It is
   *  **deactivated**, never taken — nothing here says who put it out. */
  readonly disabledMinutesLeft: number | null;
  readonly isMine: boolean;
};

/**
 * One engagement as its own participant reads it afterwards: what each side brought, what each
 * side left on the ground. Never the enemy's composition by role — the fog does not lift because
 * shots were exchanged (ADR 0005); a head count and a butcher's bill is what a commander gets.
 */
export type CombatReport = {
  readonly id: string;
  readonly at: number;
  readonly cause: 'arrival' | 'interception';
  readonly side: 'attacker' | 'defender';
  readonly won: boolean;
  readonly hostCountry: string;
  readonly outpostDisabled: boolean;
  readonly mine: CombatTally;
  readonly theirs: CombatTally;
  /**
   * Set when this pass is the one that put the defender under the bar of the **test victory**
   * (`victory.ts`) — scaffolding, and named on both sides on purpose: the progress of the
   * simplified Domination is public, which is where it departs from design sheet 05.
   */
  readonly reduced: { readonly by: string; readonly whom: string } | null;
};

export type CombatTally = {
  readonly troops: number;
  /** In men and machines, never in percent (ADR 0014). */
  readonly lost: number;
  readonly routed: number;
  readonly destroyed: number;
};

export type Resource = {
  readonly stock: number;
  readonly ratePerHour: number;
  readonly cap: number;
};

/** What a building costs, in materials — never one number since supply disappeared. */
export type Cost = Readonly<Partial<Record<ResourceKey, number>>>;

export type Building = {
  /** The row's own identifier — what a deep link carries, since a key names a family. */
  readonly id: string;
  readonly key: BuildingKey;
  readonly name: string;
  readonly regionId: string;
  readonly level: number;
  readonly nextLevelCost: Cost;
  readonly nextLevelMinutes: number;
  readonly cappedByHq: boolean;
};

/**
 * A conversion chain as the industry window reads it, standing or not. `state` is served, never
 * re-derived here: it is the settlement's own arbitration (`settleStocks`), and a second guess
 * made from the stocks would contradict the numbers it sits next to.
 */
export type ChainView = {
  readonly by: BuildingKey;
  readonly output: ResourceKey;
  readonly inputs: ReadonlyArray<{ readonly resource: ResourceKey; readonly quantity: number }>;
  /** **What actually comes out**, per hour. A chain out of matter reads zero here and keeps
   *  its `nominalPerHour` beside it — printing the nominal alone is a lie the player acts on. */
  readonly perHour: number;
  readonly nominalPerHour: number;
  /** Summed over the sites, like the rate: zero means nobody built it, and the line reads off. */
  readonly level: number;
  readonly state: ChainState;
  readonly missing: ResourceKey | null;
  /** Runs on a lot rather than on its own, because its input is spent elsewhere too
   *  (`COMMANDED_CHAINS`). Nothing else about the line changes. */
  readonly commanded: boolean;
  /** The standing lot — `null` when none was ever placed. `produced === ordered` is a lot
   *  delivered, kept so the surface can say so rather than falling silent. */
  readonly order: { readonly ordered: number; readonly produced: number } | null;
  /** The largest lot the input reserve allows right now, in units of output. */
  readonly maxOrder: number;
};

/** One exploitation and its yield. `deposit` is what the region holds — a building over a
 *  deposit it cannot work reads with a rate of zero, never as an absent line. */
export type ExtractionSiteView = {
  readonly key: BuildingKey;
  readonly regionId: string;
  readonly level: number;
  readonly deposit: DepositKey | null;
  readonly perHour: number;
};

/**
 * What a first level of a building costs and takes, per key: the construction panel's price
 * list. `unlockedAtHqLevel` travels with the price because it decides the same thing — whether
 * a line exists at all — and a client-side copy of the tier table is how the panel and the
 * server stop refusing the same things.
 */
export type BuildSpec = {
  readonly cost: Cost;
  readonly minutes: number;
  readonly unlockedAtHqLevel: number;
};

/**
 * A region the player may build on: his own country, plus wherever he has already built. What
 * lies under it and what he has put on it. Only his own — a region held by anyone else carries
 * no deposit and no building here, structurally, which is the same guard as the arc union.
 */
export type RegionView = {
  readonly id: string;
  readonly name: string;
  readonly deposit: DepositKey | null;
  readonly coastal: boolean;
  readonly buildings: ReadonlyArray<{ readonly key: BuildingKey; readonly level: number }>;
};

export type OpponentBar =
  | { readonly state: 'anonymous'; readonly progress: number }
  | { readonly state: 'attributed'; readonly progress: number; readonly doctrine: Doctrine }
  | {
      readonly state: 'exposed';
      readonly progress: number;
      readonly doctrine: Doctrine;
      readonly frozenUntil: string;
    };

export type Opponent = {
  readonly nation: string;
  readonly ink: string;
  readonly power: string;
  readonly bar: OpponentBar;
  readonly restWindow: string;
  readonly lastIntel: string;
};

export type DispatchSeverity = 'critical' | 'notable' | 'routine';

export type JournalDispatch = {
  readonly t: string;
  readonly severity: DispatchSeverity;
  readonly text: string;
  readonly replay: string | null;
  readonly remaining: string | null;
  readonly resolutionAt: string | null;
};

/**
 * **The board of the test victory — scaffolding, to be replaced whole** by the three doctrines
 * of design sheet 05 (`domain/victory.ts` says why). It is the one place this type hands over
 * something about everybody: the simplified Domination is public and named, deliberately, and
 * a capacity is neither a position nor a composition — the fog loses nothing.
 */
export type ReductionBoard = {
  /** How many distinct players one has to hold under the bar, `⌈(n−1)/2⌉`. */
  readonly target: number;
  readonly concludedAt: number | null;
  readonly winnerNation: string | null;
  readonly standings: ReadonlyArray<ReductionStanding>;
};

export type ReductionStanding = {
  readonly nation: string | null;
  readonly nickname: string;
  readonly isMine: boolean;
  /** Read at the instant: he rebuilds over the bar, he leaves his executioner's count. */
  readonly isReduced: boolean;
  readonly reduced: number;
};

export type PlayerView = {
  readonly season: {
    readonly number: number;
    readonly format: SeasonFormat;
    readonly durationHours: number;
    readonly elapsedHours: number;
    readonly players: number;
    readonly playableRegion: string;
    readonly travelMinutesPer1000km: number;
    readonly reduction: ReductionBoard;
  };
  readonly me: {
    readonly nation: string;
    readonly homePosition: LonLat;
    readonly ink: string;
    readonly power: string;
    readonly doctrine: Doctrine;
    readonly progress: number;
    readonly restWindow: string;
    readonly resources: Readonly<Record<ResourceKey, Resource>>;
    readonly slots: { readonly total: number; readonly used: number };
    /** Zero until the headquarters is built — and until then nothing else can be. */
    readonly hqLevel: number;
    /**
     * How many buildings may stand at once, carried by the headquarters (ADR 0015). The count
     * standing against it is `buildings.length`: the list is complete, so it holds the count.
     */
    readonly buildingCap: number;
    /** The headquarters level that opens mark 2 in this format — served, never derived here. */
    readonly tier2HqLevel: number;
    /**
     * The buildings the season still owes, in placement order — placed for nothing and at
     * once, wherever the player decides. Empty once the foundation stands.
     */
    readonly foundation: ReadonlyArray<BuildingKey>;
    readonly buildings: ReadonlyArray<Building>;
    readonly chains: ReadonlyArray<ChainView>;
    readonly extraction: ReadonlyArray<ExtractionSiteView>;
    readonly regions: ReadonlyArray<RegionView>;
    readonly construction: {
      readonly name: string;
      readonly key: BuildingKey;
      readonly regionId: string;
      readonly regionName: string;
      readonly minutesLeft: number;
    } | null;
    readonly armyPresent: Stack;
    readonly armyInTransit: Stack;
    /** How many troops may stand at once, carried by the billets. `troops` holds the count. */
    readonly troopCap: number;
    readonly troops: ReadonlyArray<TroopView>;
    readonly outposts: ReadonlyArray<OutpostView>;
  };
  /** Level-one price list, served by the server: balance numbers have one home, `constants.ts`. */
  readonly buildCatalog: Readonly<Record<BuildingKey, BuildSpec>>;
  readonly arcs: ReadonlyArray<ArcView>;
  readonly journal: ReadonlyArray<JournalDispatch>;
  readonly opponents: ReadonlyArray<Opponent>;
  readonly coverage: { readonly visible: number; readonly total: number };
  readonly loadedAt: number;
};

export function currentStock(resource: Resource, loadedAt: number, now: number): number {
  const raw = resource.stock + (resource.ratePerHour * Math.max(0, now - loadedAt)) / 3_600_000;
  return Math.floor(Math.min(resource.cap, raw));
}

export function currentMinutes(minutesLeft: number, loadedAt: number, now: number): number {
  return Math.max(0, minutesLeft - Math.max(0, now - loadedAt) / 60_000);
}
