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
  v.literal('industry'),
  v.literal('logistics'),
  v.literal('conscription'),
  v.literal('listening'),
);

export const RESOURCE_KEY = v.union(
  v.literal('supply'),
  v.literal('steel'),
  v.literal('manpower'),
);

export const DOCTRINE = v.union(
  v.literal('domination'),
  v.literal('hegemony'),
  v.literal('influence'),
);

export const SEASON_STATUS = v.union(
  v.literal('lobby'),
  v.literal('launched'),
  v.literal('finished'),
);

export const SEASON_DURATION_HOURS = v.union(v.literal(48), v.literal(168));

export const REST_WINDOW = v.object({
  startMinutes: v.number(),
  endMinutes: v.number(),
});
