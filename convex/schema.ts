import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  BUILDING_KEY,
  COMBAT_SIDE,
  DOCTRINE,
  LON_LAT,
  MOVEMENT_TARGET,
  ROUTE_LEG,
  MOVEMENT_TYPE,
  NOTICE_KIND,
  REST_WINDOW,
  RESOURCE_KEY,
  SEASON_DURATION_HOURS,
  SEASON_STATUS,
  SPECIALIZATION,
  TROOP_STATE,
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
    /**
     * Who took the season, and when. **No count travels beside them**: how many players one has
     * reduced is read off the troops standing at the instant (`convex/victory.ts`), and a stored
     * tally would disagree with the board at the first casualty or the first recruit. These two
     * are the opposite — a thing that happened once, which no later strength can un-happen.
     *
     * `v.optional` and not just `v.null()`: a season opened **before** the test victory landed
     * carries neither field, and a running deployment must not refuse its own rows on a push.
     * Absent and `null` mean the same thing here — nobody has won yet — so every reader answers
     * `?? null` and no branch of the game can tell them apart. A season is disposable (ADR 0001):
     * this tolerance goes with the wipe that follows the first real skirmish, together with the
     * scaffold it serves.
     */
    winnerId: v.optional(v.union(v.id('players'), v.null())),
    concludedAt: v.optional(v.union(v.number(), v.null())),
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
    /**
     * **When this player entered the war** — the hour his kit was handed out, which is the hour
     * he became a belligerent. `null` is a seat that has not entered yet: a lobby, or a
     * latecomer who joined a running season and is still choosing his nation (`seasons.join`).
     *
     * It is an event, not a second truth: nothing recomputes it, and the endowment is written
     * in the same transaction that stamps it (`seasons.ts`, `endow`).
     *
     * `v.optional` for the same reason as the season's `winnerId`: rows written before this
     * landed carry no field at all. **Absent and `null` do not mean the same thing here** —
     * absent is a legacy row, resolved against the season's own launch by `warEntryOf`, and
     * `null` is a seat explicitly still out of the war. Every reader goes through that one
     * function.
     */
    enteredWarAt: v.optional(v.union(v.number(), v.null())),
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
   * `stationedAt` is **an address**, and since ADR 0019 §1 the map is one of them: a building,
   * the outpost a column founded, or a plain point where troops were left standing. One field
   * rather than one per form: two fields would let a troop hang from a barracks *and* from a
   * point at once, and nothing in the schema could say that is wrong. The invariant is
   * unchanged — exactly one address, or in movement, never both and never neither.
   *
   * **`byStation` still answers only the two id forms**, and that is deliberate. A point address
   * cannot be looked up by equality: the question asked of it is never "who hangs from this
   * coordinate" but "who stands within `ARRIVAL_RADIUS_KM` of it", which no equality index
   * answers and which a pair of numbers would only answer along one axis. That question is
   * served by a scan bounded by the game's own ceiling — 24 troops per player (ADR 0014), eight
   * players, under two hundred rows — which is the same order of magnitude as the scan of
   * `buildings` a region-aimed arrival already runs. An index whose range still needs a distance
   * filter behind it would buy nothing and would have to be kept in step with a second table of
   * positions.
   *
   * **`null` means "on national ground, hanging from nothing that stands"** — it is the answer
   * to a troop whose building is gone: it comes home, it does not die (rule 3 of the project).
   * It is deliberately not re-hung on the headquarters, which projects nothing and whose own
   * destruction is unsettled (ADR 0015). It is kept rather than replaced by an explicit home
   * point because no such point exists to write: a nation without a standing building has no
   * coordinate the game agrees on, and inventing one — a capital, a centroid — would put troops
   * somewhere the player never sent them. Everywhere a place **is** known, the point form is now
   * written instead, so `null` is what is left when nothing at all is known.
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
    stationedAt: v.union(v.id('buildings'), v.id('outposts'), LON_LAT, v.null()),
  })
    .index('byPlayer', ['playerId'])
    /** Who defends a place is read from the place, not from a player: an engagement asks "what
     *  hangs from this outpost", and the answer must not be a scan of every troop in the game.
     *  A point is asked by distance instead — see the note above. */
    .index('byStation', ['stationedAt']),

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

  /**
   * A column on the march. It leaves **from** a projection building of its domain (ADR 0013) —
   * a barracks on land — and it carries its own route: the polyline computed on the grid at
   * departure (ADR 0012), so nothing recomputes it, and above all nothing recomputes it
   * *differently* later.
   *
   * `troopIds` is the manifest. A troop travels with the movement rather than carrying a
   * second attachment of its own: `stationedAt` says what it hangs from, and a column on the
   * road hangs from nothing.
   *
   * `target` says what the column is walking at, and it is a union rather than three nullable
   * fields: a movement marches at a region, at an outpost, or home — never at two of them, and
   * the schema is where that is said once.
   *
   * `fromBuildingId` is where the column **goes home to**, as much as where it left from: a
   * `return` movement is a movement like any other, and the building it hangs from at the end
   * is the one it hung from at the start. It is null for a column that never left a barracks —
   * a garrison routed off its own outpost.
   */
  movements: defineTable({
    playerId: v.id('players'),
    type: MOVEMENT_TYPE,
    fromBuildingId: v.union(v.id('buildings'), v.null()),
    target: MOVEMENT_TARGET,
    from: LON_LAT,
    to: LON_LAT,
    /** The country the destination point stands in, read at departure from the region that
     *  answered. The server holds no polygons, so nothing can recover it later from the point
     *  alone — and it is what the rest window and the outpost both need. */
    hostCountry: v.string(),
    points: v.array(LON_LAT),
    /** The geometry alone does not carry the trip: the legs say where the column embarks, and
     *  the two costs are what the map's segmented scale and its pawn read. Written once, at
     *  departure, from the route the server computed — never recomputed to display it. */
    legs: v.array(ROUTE_LEG),
    distanceUnits: v.number(),
    costUnits: v.number(),
    /** What a unit of ground cost this column — the pace its composition bought (note « le
     *  transport terrestre et l'allure »). Written with the route because the route was
     *  *weighted* with it: the map reprices the legs to place the pawn, and it must reprice them
     *  at what was paid. Optional, so the columns already walking when it landed still read. */
    landCost: v.optional(v.number()),
    troopIds: v.array(v.id('troops')),
    departedAt: v.number(),
    arrivesAt: v.number(),
  }).index('byPlayer', ['playerId']),

  /**
   * **A point, never a polygon** (fiche 03): an outpost sits at a lon/lat, holds no ground, and
   * colours no region. `hostCountry` is the one thing the point cannot answer on its own — the
   * server has no polygons — so it is stamped at the foundation, from the region the column
   * marched to.
   *
   * No field prepares a change of owner: an outpost is **deactivated** or **destroyed**, never
   * taken (ADR 0004). A won raid sets `disabledUntil`, and `immuneUntil` behind it — the pair is
   * one rule, since deactivation without a window of respite is destruction by relays of cheap
   * raids. Destruction itself waits for looting; nothing here counts raids towards it.
   */
  outposts: defineTable({
    playerId: v.id('players'),
    point: LON_LAT,
    hostCountry: v.string(),
    level: v.number(),
    specialization: SPECIALIZATION,
    foundedAt: v.number(),
    disabledUntil: v.union(v.number(), v.null()),
    immuneUntil: v.union(v.number(), v.null()),
  }).index('byPlayer', ['playerId']),

  /**
   * **The account of one engagement, written once and never resolved again.** It is what the
   * journal reads, and it has to hold enough for the visual replay of surface 4.7 to be built
   * on top of it later *without* replaying the pass — a second resolution is a second chance to
   * disagree with the first.
   *
   * Strike by strike, in the order they happened, in men and machines: "50 soldiers against 50,
   * I lose 16, he loses 22" is the quality ADR 0014 asks for, and a percentage would not carry
   * it. No sentence is stored — the server speaks in ids and numbers (ADR 0016), the French is
   * built on the client.
   *
   * Two indexes rather than one on a pair: both sides read their own engagements, and Convex
   * indexes no array.
   */
  engagements: defineTable({
    seasonId: v.id('seasons'),
    attackerId: v.id('players'),
    defenderId: v.id('players'),
    /** What brought them into contact — an arrival, or an interception on the road, which is
     *  the one thing that hands the initiative to the defending side (ADR 0008). */
    cause: v.union(v.literal('arrival'), v.literal('interception')),
    point: LON_LAT,
    hostCountry: v.string(),
    at: v.number(),
    winner: COMBAT_SIDE,
    outpostId: v.union(v.id('outposts'), v.null()),
    /** Set by a won raid only: the hour the outpost comes back. */
    disabledUntil: v.union(v.number(), v.null()),
    /**
     * **This pass is the one that put the defender under the bar** — he stood above it before,
     * he stands below it after. It is a fact about the engagement, settled once and never
     * recomputed: a *capacity* would drift, "who struck the blow" cannot. It is what names the
     * executioner of a reduced player and what the journal turns into "X a réduit Y".
     *
     * Test scaffolding, like everything the simplified Domination touches — see
     * `src/domain/victory.ts`. Optional for the same reason the season's outcome is: an
     * engagement filed before the bar existed carries no flag, and **absent reads as false** —
     * a pass nobody measured cannot have been the one that crossed it.
     */
    reducedDefender: v.optional(v.boolean()),
    strikes: v.array(
      v.object({
        phase: v.union(v.literal('strike'), v.literal('riposte')),
        by: v.id('troops'),
        byRole: UNIT_ROLE,
        byTier: UNIT_TIER,
        bySide: COMBAT_SIDE,
        target: v.id('troops'),
        targetRole: UNIT_ROLE,
        targetTier: UNIT_TIER,
        losses: v.number(),
      }),
    ),
    troops: v.array(
      v.object({
        troopId: v.id('troops'),
        side: COMBAT_SIDE,
        role: UNIT_ROLE,
        tier: UNIT_TIER,
        strengthBefore: v.number(),
        strengthAfter: v.number(),
        state: TROOP_STATE,
      }),
    ),
  })
    .index('byAttacker', ['attackerId'])
    .index('byDefender', ['defenderId']),

  /**
   * One sequential queue **per player**, ordered by `rank` — the patron of `recruitments`
   * above, and deliberately the same one: a second model of queue would be a second set of
   * rules to remember. "Un chantier à la fois" still holds *in execution* — only the head
   * advances — but the queue behind it is unbounded and **already paid for**.
   *
   * Only the head carries a `finishesAt`. The followers have not started, they are dated
   * nowhere, and they are exactly the ones a cancellation refunds in full without re-dating
   * anything.
   *
   * `level` is written at the enqueue and never recomputed: it is what the entry was billed
   * for, so it is what a refund hands back and what the `finish` raises the building to.
   */
  constructions: defineTable({
    playerId: v.id('players'),
    building: BUILDING_KEY,
    regionId: v.string(),
    level: v.number(),
    rank: v.number(),
    finishesAt: v.union(v.number(), v.null()),
  }).index('byPlayer', ['playerId']),

  /**
   * **What happened to a player without him asking for it** — the journal's own ledger for the
   * things no engagement accounts for. Today it holds exactly one kind: a queued construction
   * the world took the right to before its turn came, refunded whole.
   *
   * A notice is a line of the journal and nothing else. It carries ids and numbers, never a
   * sentence (ADR 0016): the French is put on it on the client, like every other dispatch.
   */
  notices: defineTable({
    playerId: v.id('players'),
    at: v.number(),
    kind: NOTICE_KIND,
    building: BUILDING_KEY,
    regionId: v.string(),
  }).index('byPlayer', ['playerId']),

  /**
   * **What one player saw pass, and when** — the fog's own ledger (ADR 0005, ADR 0019 §5).
   *
   * It exists so that no reading of the fog depends on the movements table. The naive query,
   * "every movement in flight, keep the ones crossing a detector of mine", depends on **all** of
   * it: one departure by anybody invalidates it for everybody, which is a quadratic fan-out on
   * the most frequent action of the game and a leak the day the filter moves client-side
   * (`WWS/docs/technique/brouillard-et-fanout.md`). A row here belongs to one observer, and he
   * reads his own index.
   *
   * The rows are written **at the departure of the movement, once**, against the watchers already
   * standing — the same instant and the same geometry as the interception (ADR 0018 §3). A troop
   * posted afterwards therefore never sees that movement: intelligence is a wager on what will
   * pass, not a reaction to what is passing, and the screen says so.
   *
   * `from` and `to` bound the stretch the thread spent inside the radius. Past `to` the arc is
   * not deleted but goes stale — the last known position ADR 0005 asks for — and it is the
   * movement's own end that takes the row with it.
   */
  sightings: defineTable({
    /** The observer, never the owner of what was seen. */
    playerId: v.id('players'),
    movementId: v.id('movements'),
    from: v.number(),
    to: v.number(),
  })
    .index('byPlayer', ['playerId'])
    .index('byMovement', ['movementId']),
});
