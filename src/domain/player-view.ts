import type { LonLat } from './geo';
import type { BuildingKey, Doctrine, MovementType, Specialization, UnitRole } from './ids';
import type { ComputedRoute } from './routing';

export type { Doctrine, MovementType, UnitRole };

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
      // `…Country` names the `monde.json` country, in English: it is the key that selects the
      // country on the map. `…Label` is what gets printed, in French. Both exist because
      // Natural Earth has no translations while the screen is French; mixing them up would
      // put "United Kingdom" back on a card.
      readonly originCountry: string;
      readonly destinationCountry: string;
      readonly originLabel: string;
      readonly destinationLabel: string;
      readonly type: MovementType;
      readonly stack: Stack;
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

export type OutpostView = {
  readonly id: string;
  readonly hostCountry: string;
  readonly lonLat: LonLat;
  readonly specialization: Specialization;
  readonly garrison: number;
  readonly isMine: boolean;
};

export type Resource = {
  readonly stock: number;
  readonly ratePerHour: number;
  readonly cap?: number | undefined;
};

export type Building = {
  readonly key: BuildingKey;
  readonly name: string;
  readonly level: number;
  readonly nextLevelCost: number;
  readonly nextLevelMinutes: number;
  readonly cappedByHq: boolean;
};

export type OpponentBar =
  | { readonly state: 'anonymous'; readonly progress: number }
  | { readonly state: 'attributed'; readonly progress: number; readonly doctrine: Doctrine }
  | { readonly state: 'exposed'; readonly progress: number; readonly doctrine: Doctrine; readonly frozenUntil: string };

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

export type PlayerView = {
  readonly season: {
    readonly number: number;
    readonly durationHours: number;
    readonly elapsedHours: number;
    readonly players: number;
    readonly playableRegion: string;
    readonly travelMinutesPer1000km: number;
  };
  readonly me: {
    readonly nation: string;
    readonly homePosition: LonLat;
    readonly ink: string;
    readonly power: string;
    readonly doctrine: Doctrine;
    readonly progress: number;
    readonly restWindow: string;
    readonly supply: Resource;
    readonly steel: Resource;
    readonly manpower: Resource;
    readonly slots: { readonly total: number; readonly used: number };
    readonly buildings: ReadonlyArray<Building>;
    readonly construction: { readonly name: string; readonly minutesLeft: number } | null;
    readonly armyPresent: Stack;
    readonly armyInTransit: Stack;
    readonly outposts: ReadonlyArray<OutpostView>;
  };
  readonly arcs: ReadonlyArray<ArcView>;
  readonly journal: ReadonlyArray<JournalDispatch>;
  readonly opponents: ReadonlyArray<Opponent>;
  readonly coverage: { readonly visible: number; readonly total: number };
  readonly loadedAt: number;
};

export function currentStock(
  resource: { readonly stock: number; readonly ratePerHour: number; readonly cap?: number | undefined },
  loadedAt: number,
  now: number,
): number {
  const raw = resource.stock + (resource.ratePerHour * Math.max(0, now - loadedAt)) / 3_600_000;
  return Math.floor(resource.cap === undefined ? raw : Math.min(resource.cap, raw));
}

export function currentMinutes(minutesLeft: number, loadedAt: number, now: number): number {
  return Math.max(0, minutesLeft - Math.max(0, now - loadedAt) / 60_000);
}
