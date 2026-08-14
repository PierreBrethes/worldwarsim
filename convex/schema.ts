import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Balancing placeholders: numeric values live in constants.ts, never here.

const UNIT_ROLE = v.union(
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

const UNIT_TIER = v.union(v.literal(1), v.literal(2));

export default defineSchema({
  seasons: defineTable({
    code: v.string(),
    status: v.union(v.literal('lobby'), v.literal('launched'), v.literal('finished')),
    durationHours: v.union(v.literal(48), v.literal(168)),
    compensation: v.number(),
    seed: v.number(),
    playableRegion: v.union(v.string(), v.null()),
    launchedAt: v.union(v.number(), v.null()),
  }).index('byCode', ['code']),

  players: defineTable({
    seasonId: v.id('seasons'),
    token: v.string(),
    nickname: v.string(),
    creator: v.boolean(),
    nation: v.union(v.string(), v.null()),
    doctrine: v.union(
      v.literal('domination'),
      v.literal('hegemony'),
      v.literal('influence'),
      v.null(),
    ),
    ready: v.boolean(),
    restWindow: v.object({ startMinutes: v.number(), endMinutes: v.number() }),
  })
    .index('byToken', ['token'])
    .index('bySeason', ['seasonId']),

  resources: defineTable({
    playerId: v.id('players'),
    key: v.union(v.literal('supply'), v.literal('steel'), v.literal('manpower')),
    stock: v.number(),
    ratePerHour: v.number(),
    updatedAt: v.number(),
    cap: v.union(v.number(), v.null()),
  }).index('byPlayer', ['playerId']),

  buildings: defineTable({
    playerId: v.id('players'),
    key: v.union(
      v.literal('hq'),
      v.literal('industry'),
      v.literal('logistics'),
      v.literal('conscription'),
      v.literal('listening'),
    ),
    level: v.number(),
  }).index('byPlayer', ['playerId']),

  /** The headcount at home, one row per role/tier pair. Neither position nor identity: a
   *  unit exists individually nowhere as long as combat is not written. */
  units: defineTable({
    playerId: v.id('players'),
    role: UNIT_ROLE,
    tier: UNIT_TIER,
    count: v.number(),
  }).index('byPlayer', ['playerId']),

  /** A queue ordered by `rank`. Only the head batch carries a `finishesAt`: the followers
   *  have not started, and they are exactly the ones that can be cancelled for a refund. */
  recruitments: defineTable({
    playerId: v.id('players'),
    role: UNIT_ROLE,
    tier: UNIT_TIER,
    count: v.number(),
    rank: v.number(),
    finishesAt: v.union(v.number(), v.null()),
  }).index('byPlayer', ['playerId']),

  constructions: defineTable({
    playerId: v.id('players'),
    building: v.union(
      v.literal('hq'),
      v.literal('industry'),
      v.literal('logistics'),
      v.literal('conscription'),
      v.literal('listening'),
    ),
    finishesAt: v.number(),
  }).index('byPlayer', ['playerId']),
});
