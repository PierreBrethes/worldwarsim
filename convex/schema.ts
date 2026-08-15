import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  BUILDING_KEY,
  DOCTRINE,
  REST_WINDOW,
  RESOURCE_KEY,
  SEASON_DURATION_HOURS,
  SEASON_STATUS,
  UNIT_ROLE,
  UNIT_TIER,
} from './validators';

// Balancing placeholders: numeric values live in constants.ts, never here.

export default defineSchema({
  seasons: defineTable({
    code: v.string(),
    status: SEASON_STATUS,
    durationHours: SEASON_DURATION_HOURS,
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
    doctrine: v.union(DOCTRINE, v.null()),
    ready: v.boolean(),
    restWindow: REST_WINDOW,
  })
    .index('byToken', ['token'])
    .index('bySeason', ['seasonId']),

  resources: defineTable({
    playerId: v.id('players'),
    key: RESOURCE_KEY,
    stock: v.number(),
    ratePerHour: v.number(),
    updatedAt: v.number(),
    cap: v.union(v.number(), v.null()),
  }).index('byPlayer', ['playerId']),

  buildings: defineTable({
    playerId: v.id('players'),
    key: BUILDING_KEY,
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
    building: BUILDING_KEY,
    finishesAt: v.number(),
  }).index('byPlayer', ['playerId']),
});
