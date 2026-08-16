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

  /** No `ratePerHour`: a rate is read off the exploitation buildings and the deposits of the
   *  regions they sit on (ADR 0015), so storing it would be storing a second truth. `cap` is
   *  computed the same way, from the storage buildings — the row keeps what only it knows. */
  resources: defineTable({
    playerId: v.id('players'),
    key: RESOURCE_KEY,
    stock: v.number(),
    updatedAt: v.number(),
  }).index('byPlayer', ['playerId']),

  /** One row per building **instance**: a nation holds as many mines as it has regions with
   *  ore, each with its own level. The `regionId` is the `id` of `regions.json`. */
  buildings: defineTable({
    playerId: v.id('players'),
    key: BUILDING_KEY,
    regionId: v.string(),
    level: v.number(),
  }).index('byPlayer', ['playerId']),

  /**
   * **One row per troop** (ADR 0014): discrete, unique, never merged with another. Its hit
   * points are `currentStrength`, read against the `nominalStrength` it was formed at — 50
   * soldiers, 12 tanks, 24 embarked aircraft.
   *
   * `stationedAt` is an attachment, not a position: movements will come and carry a troop
   * around later. **`null` means "at home"**, and it is the answer to a troop whose building
   * is gone — it comes home, it does not die (rule 3 of the project). It is deliberately not
   * re-hung on the headquarters: the headquarters projects nothing, and whether it can be
   * destroyed at all is not settled (ADR 0015, sent back to `QUESTIONS.md`).
   *
   * No `specialization` field: ADR 0014 only names variants for tier-1 infantry (medic or
   * paratrooper) and defers the eight other roles, so the type would have to be invented. It
   * arrives with the research ADR.
   */
  troops: defineTable({
    playerId: v.id('players'),
    role: UNIT_ROLE,
    tier: UNIT_TIER,
    nominalStrength: v.number(),
    currentStrength: v.number(),
    stationedAt: v.union(v.id('buildings'), v.null()),
  }).index('byPlayer', ['playerId']),

  /**
   * One sequential queue **per projection building**, ordered by `rank`: two barracks form in
   * parallel, which is what makes the second one worth its slot. A batch is one troop.
   *
   * Only the head of a queue carries a `finishesAt`: the followers have not started, they are
   * dated nowhere, and they are exactly the ones a cancellation refunds in full without
   * re-dating anything.
   */
  recruitments: defineTable({
    playerId: v.id('players'),
    buildingId: v.id('buildings'),
    role: UNIT_ROLE,
    tier: UNIT_TIER,
    rank: v.number(),
    finishesAt: v.union(v.number(), v.null()),
  })
    .index('byPlayer', ['playerId'])
    .index('byBuilding', ['buildingId']),

  /**
   * A **lot** standing on a chain that does not run by itself (`COMMANDED_CHAINS`): exactly
   * this many units of output, once, and then the line falls silent again. Not a permanent
   * order and not a throughput — the rate belongs to the building's level.
   *
   * `produced` advances with the settlement, exactly as a stock does, and for the same reason:
   * `settleStocks` is the only place that decides how much came out, so a query can read the
   * lot forward without writing and a mutation banks it on its way past (`writeStocks`).
   *
   * At most one row per chain and per player: a finished lot is kept, at `produced ===
   * ordered`, because "lot terminé — 200 munitions livrées" is what the surface has to show.
   */
  orders: defineTable({
    playerId: v.id('players'),
    chain: BUILDING_KEY,
    ordered: v.number(),
    produced: v.number(),
    placedAt: v.number(),
  }).index('byPlayer', ['playerId']),

  constructions: defineTable({
    playerId: v.id('players'),
    building: BUILDING_KEY,
    regionId: v.string(),
    finishesAt: v.number(),
  }).index('byPlayer', ['playerId']),
});
