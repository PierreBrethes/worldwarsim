import { v } from 'convex/values';

/**
 * The argument validators shared by the schema and the functions. They were duplicated —
 * one copy in `schema.ts`, another in each module that takes the value as an argument — and
 * a duplicated union is a union that drifts: adding a role in one place and forgetting the
 * other yields a row the schema accepts and no mutation can write, or the reverse.
 *
 * These mirror the id types of `src/domain/ids.ts`. That file stays the source for
 * TypeScript; this one is what Convex checks at runtime.
 */

export const UNIT_ROLE = v.union(
  v.literal('infantry'),
  v.literal('armor'),
  v.literal('landTransport'),
  v.literal('fighter'),
  v.literal('bomber'),
  v.literal('airTransport'),
  v.literal('escort'),
  v.literal('cargo'),
  v.literal('carrier'),
);

export const UNIT_TIER = v.union(v.literal(1), v.literal(2));

export const BUILDING_KEY = v.union(
  v.literal('hq'),
  v.literal('farm'),
  v.literal('mill'),
  v.literal('mine'),
  v.literal('oilWell'),
  v.literal('foundry'),
  v.literal('arsenal'),
  v.literal('quartermaster'),
  v.literal('barracks'),
  v.literal('airfield'),
  v.literal('port'),
  v.literal('listening'),
  v.literal('billets'),
  v.literal('warehouse'),
  v.literal('depot'),
);

export const RESOURCE_KEY = v.union(
  v.literal('food'),
  v.literal('textile'),
  v.literal('coal'),
  v.literal('oil'),
  v.literal('ore'),
  v.literal('alloy'),
  v.literal('ammunition'),
  v.literal('bandages'),
);

export const DOCTRINE = v.union(
  v.literal('domination'),
  v.literal('hegemony'),
  v.literal('influence'),
);

/**
 * `concluded` is a season somebody won — read on, never played on. The wipe stays manual: one
 * reads the game back before erasing it (`seasons.destroy`), so a concluded season is a normal
 * state of the board and not a missing row.
 */
export const SEASON_STATUS = v.union(
  v.literal('lobby'),
  v.literal('launched'),
  v.literal('concluded'),
);

export const SEASON_DURATION_HOURS = v.union(v.literal(48), v.literal(168));

/** Extraction is gone from the list (fiche 03, 18/08): an outpost replaces no building. */
export const SPECIALIZATION = v.union(v.literal('relay'), v.literal('listening'));

/**
 * The five kinds of movement of the design, plus the one the resolution creates on its own.
 * `agent` and `decoy` wait for the fog surfaces; the union is the vocabulary, and narrowing it
 * to what is coded would make every later kind a schema migration.
 */
export const MOVEMENT_TYPE = v.union(
  v.literal('attack'),
  v.literal('raid'),
  v.literal('outpost'),
  v.literal('agent'),
  v.literal('decoy'),
  v.literal('return'),
);

/** What an attack marches at: a region somebody else holds, or an outpost. A raid only ever
 *  takes the second. */
export const ATTACK_TARGET = v.union(
  v.object({ kind: v.literal('region'), regionId: v.string() }),
  v.object({ kind: v.literal('outpost'), outpostId: v.id('outposts') }),
);

/** The same, plus the one nobody orders: a column on its way back to what it hangs from. */
export const MOVEMENT_TARGET = v.union(ATTACK_TARGET, v.object({ kind: v.literal('home') }));

export const COMBAT_SIDE = v.union(v.literal('attacker'), v.literal('defender'));

export const TROOP_STATE = v.union(
  v.literal('standing'),
  v.literal('routed'),
  v.literal('destroyed'),
);

/**
 * A point on the globe, in degrees. Named fields rather than the `[lon, lat]` tuple the domain
 * passes around: a two-number array is a shape a validator cannot keep in order, and the pair
 * being the wrong way round is the one mistake nothing else would catch.
 */
export const LON_LAT = v.object({ lon: v.number(), lat: v.number() });

/**
 * One stretch of a route under a single medium. It travels with the movement because the map
 * draws the thread from it — a polyline alone cannot say where the column embarks, and the
 * dock is a third of what a combined trip costs (`src/domain/route-timing.ts`).
 */
export const ROUTE_LEG = v.object({
  medium: v.union(v.literal('land'), v.literal('sea'), v.literal('air')),
  distanceUnits: v.number(),
});

export const REST_WINDOW = v.object({
  startMinutes: v.number(),
  endMinutes: v.number(),
});
