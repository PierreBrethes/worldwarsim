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
 * The five kinds of movement of the design, plus the one the resolution creates on its own, plus
 * `recall`, which nobody orders any more (ADR 0019 §1) and which stays here on purpose: a column
 * recalled before the change is still walking, and dropping the literal would make its document
 * unreadable to the very mutation that has to land it. `agent` and `decoy` wait for the fog
 * surfaces; the union is the vocabulary, and narrowing it to what is coded would make every
 * later kind a schema migration.
 */
export const MOVEMENT_TYPE = v.union(
  v.literal('march'),
  v.literal('attack'),
  v.literal('raid'),
  v.literal('outpost'),
  v.literal('recall'),
  v.literal('agent'),
  v.literal('decoy'),
  v.literal('return'),
);

/**
 * A point on the globe, in degrees. Named fields rather than the `[lon, lat]` tuple the domain
 * passes around: a two-number array is a shape a validator cannot keep in order, and the pair
 * being the wrong way round is the one mistake nothing else would catch.
 */
export const LON_LAT = v.object({ lon: v.number(), lat: v.number() });

/**
 * Where a column stands when it is ordered out. It no longer says what the column may ask for
 * (ADR 0019 §1) — only which ground the domain gates are read on, and which address the troops
 * have to be standing at. **A point is one of them**: a column left on the map is ordered from
 * where it stands, and the ground under it carries no building, hence no gate, hence it walks.
 *
 * Nothing here proves the point is the player's: it is not an owned thing. What guards it is the
 * address itself — the troops named have to be standing at exactly this coordinate, and they are
 * his (`march`, `TROOP_NOT_AT_ORIGIN`).
 */
export const MOVEMENT_ORIGIN = v.union(
  v.object({ kind: v.literal('building'), buildingId: v.id('buildings') }),
  v.object({ kind: v.literal('outpost'), outpostId: v.id('outposts') }),
  v.object({ kind: v.literal('point'), point: LON_LAT }),
);

/**
 * What a march is aimed at: a region somebody holds, an outpost, or a plain point of the map.
 * A raid only ever takes the second, and a foundation only the first — `refusalOf` says which,
 * here as on the client.
 *
 * The point is the form that answers at every scale (ADR 0019 §1), and it is stored as it was
 * aimed: nothing resolves it into the region it may fall in, so the document says exactly where
 * the player pointed.
 */
export const ATTACK_TARGET = v.union(
  v.object({ kind: v.literal('region'), regionId: v.string() }),
  v.object({ kind: v.literal('outpost'), outpostId: v.id('outposts') }),
  v.object({ kind: v.literal('point'), point: LON_LAT }),
);

/**
 * **Who a contact is with**, as the scheduled resolution reads it back hours later. Two of the
 * three are documents; the third is not — a camp is troops sharing an address, and the address
 * is the only name it has, so the coordinate travels here rather than in an identifier.
 *
 * It used to travel as `posted:<playerId>@<lon>,<lat>`, a string built by hand and taken apart
 * by hand at the other end. A second spelling of a fact already spelled by the schema is a
 * second truth: when the re-reading missed, the pass was scheduled, nobody was found, and
 * nothing happened without a word — a silent failure in the middle of a combat rule.
 */
export const CONTACT_FORCE = v.union(
  v.object({ kind: v.literal('outpost'), outpostId: v.id('outposts') }),
  v.object({ kind: v.literal('movement'), movementId: v.id('movements') }),
  v.object({ kind: v.literal('posted'), playerId: v.id('players'), point: LON_LAT }),
);

/**
 * The same, plus the one nobody orders: a column on its way back to what it hangs from. A rout
 * refluxing to one of its own outposts (ADR 0019 §3) aims at an **outpost** like anything else —
 * it is the same coordinate, read back by the arrival to know it becomes the garrison there —
 * and `home` is left for the one anchor that is not a document, the national soil.
 */
export const MOVEMENT_TARGET = v.union(ATTACK_TARGET, v.object({ kind: v.literal('home') }));

export const COMBAT_SIDE = v.union(v.literal('attacker'), v.literal('defender'));

export const TROOP_STATE = v.union(
  v.literal('standing'),
  v.literal('routed'),
  v.literal('destroyed'),
);

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
