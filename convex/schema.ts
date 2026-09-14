import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  BUILDING_KEY,
  COMBAT_SIDE,
  DETECTOR,
  LON_LAT,
  LOOT_DELIVERY,
  LOOT_COLLECTION_MISSION,
  LOOT_LOAD,
  MEDIUM,
  MOVEMENT_TARGET,
  ROUTE_LEG,
  MOVEMENT_TYPE,
  NOTICE,
  PLUNDER_MISSION,
  RESOURCE_AMOUNTS,
  REST_WINDOW,
  RESOURCE_KEY,
  SEASON_STATUS,
  SPECIALIZATION,
  SURVEYED_INSTALLATION,
  STRIKE,
  TROOP_STATE,
  TROOP_ADDRESS,
  UNIT_ROLE,
  UNIT_TIER,
} from './validators';

// Balancing placeholders: numeric values live in constants.ts, never here.

/**
 * **`seasonId` is carried by every table a rule sweeps whole**, denormalised and stamped at the
 * write — never recomputed, never joined for at the read. Several seasons stand at once since the
 * multi-game lobby, and a global `.collect()` on `troops`, `movements`, `buildings` or `outposts`
 * reads all of them together: a column of one game intercepted by a garrison of another, a defence
 * counting troops from a season nobody in this one is playing. Every such reading goes through an
 * indexed range on `bySeason` instead, one function per table.
 *
 * The tables read `byPlayer` alone — `resources`, `recruitments`, `constructions`, `orders`,
 * `notices`, `sightings`, `regionSightings` — do **not** carry it: a player belongs to exactly one
 * season, so his own index already partitions them, and a second key would be a second thing to
 * keep true.
 */

export default defineSchema({
  accounts: defineTable({
    nickname: v.string(),
    nicknameKey: v.string(),
    passwordHash: v.string(),
    salt: v.string(),
    iterations: v.number(),
    createdAt: v.number(),
  }).index('byNicknameKey', ['nicknameKey']),

  sessions: defineTable({
    accountId: v.id('accounts'),
    token: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index('byToken', ['token'])
    .index('byAccount', ['accountId']),

  seasons: defineTable({
    code: v.string(),
    status: SEASON_STATUS,
    /**
     * **Legacy — plus jamais écrit ni lu.** L'escarmouche et la campagne ont disparu le 31/08
     * (ADR 0020 §11) : il n'y a plus qu'une ligne de départ. Le champ reste au schéma parce que
     * les saisons déjà ouvertes le portent, et qu'un champ retiré d'une table déjà écrite fait
     * refuser la poussée (leçon du 27/08 sur `buildings.seasonId`). `v.string()` plutôt que
     * l'union : plus rien ne contraint une valeur que personne ne relit. Il part au prochain
     * wipe (ADR 0001).
     */
    format: v.optional(v.string()),
    /** `null` = sans horloge : la saison se clôt à la main (`seasons.conclude`). */
    durationHours: v.union(v.number(), v.null()),
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
    /**
     * **La nation du vainqueur, écrite avec sa victoire** — pas une seconde vérité mais la même,
     * figée : `winnerId` désigne une place, et lire la place pour en tirer un nom coûtait un
     * `get` par saison sur l'écran d'accueil. Ce qui est gravé ici ne bouge plus de toute façon,
     * une saison conclue ne se rejoue pas.
     */
    winnerNation: v.optional(v.union(v.string(), v.null())),
    /**
     * **Combien de places la saison porte**, tenu à l'écriture. C'est la dénormalisation qui a
     * sorti la liste des parties du compte de son délai d'une seconde (12/09) : l'accueil lit
     * une ligne par saison, et compter les joueurs de chacune y faisait un `collect()` par
     * saison, en série.
     *
     * `v.optional` par la règle du dépôt : une saison ouverte avant cette ligne ne le porte pas,
     * et son lecteur retombe alors sur le comptage (`previewOf`). La migration
     * `dev:backfillSeasonPreview` le pose sur les saisons d'avant.
     */
    playerCount: v.optional(v.number()),
  }).index('byCode', ['code']),

  players: defineTable({
    seasonId: v.id('seasons'),
    /**
     * **Le compte qui tient cette place** (ADR 0022). Obligatoire, sans repli et sans
     * migration : le jeton de partie est mort avec le wipe qui a posé ce champ (décision 85a),
     * et un `v.optional` aurait laissé vivre des places que plus aucune porte ne sait ouvrir.
     */
    accountId: v.id('accounts'),
    /**
     * **Le pseudo du compte, copié à l'entrée et figé pour la saison.** Ce n'est pas une
     * dénormalisation par confort : une saison se relit après coup, et un compte renommé
     * réécrirait l'histoire de toutes celles qu'il a jouées.
     */
    nickname: v.string(),
    creator: v.boolean(),
    nation: v.union(v.string(), v.null()),
    /**
     * **Legacy — plus jamais écrite ni lue.** Les trois doctrines de la fiche 05 sont
     * abandonnées et la domination est le mode unique (ADR 0020 §9). Le champ reste au schéma
     * parce que les sièges déjà déposés le portent, et qu'un champ retiré d'une table déjà
     * écrite fait refuser la poussée (leçon du 27/08 sur `buildings.seasonId`). `v.string()`
     * plutôt que l'union d'origine : plus rien ne contraint une valeur que personne ne relit.
     * Il part au prochain wipe, avec la saison qui l'a écrite (ADR 0001).
     */
    doctrine: v.optional(v.union(v.string(), v.null())),
    ready: v.boolean(),
    /**
     * **Il a déposé les armes.** Absent vaut « en jeu » — même tolérance que les champs posés
     * après coup (leçon du 27/08 sur `buildings.seasonId`), et ici les deux se confondent : un
     * siège écrit avant la capitulation n'a jamais capitulé.
     *
     * C'est un **fait**, jamais un état dérivé : un joueur réduit n'est pas défait (il
     * reconstruit et sort du compte), et un joueur sans troupe non plus. Rien ne le remet à
     * faux — la capitulation est irréversible (`players.surrender`).
     *
     * Ce qu'il ne dit pas : que ses troupes ont disparu. Elles tiennent, elles ripostent, ses
     * avant-postes paient leur entretien et gardent son encre. Capituler, c'est cesser
     * d'ordonner, pas s'évaporer.
     */
    defeated: v.optional(v.boolean()),
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
    /**
     * **The hour he last closed the journal**, absent while he never has. Read, never written,
     * by anything that counts: the banner's unread tally and the window's own greying both come
     * out of comparing a dispatch's hour to this one, so there is no per-dispatch read flag to
     * keep in step with a list that is rebuilt on every load.
     *
     * It is stamped at the **close** of the window, not at its opening: what one had time to
     * see is what one read, and a player who opens the journal and is called away has not read
     * the three dispatches under the fold.
     */
    journalReadAt: v.optional(v.number()),
    /**
     * **The hour he last closed the telegraph**, absent while he never has. Deliberately a
     * second field rather than a reuse of `journalReadAt`: the two windows are read at
     * different moments and for different reasons, and one hour for both would mean opening
     * the journal silences the chat's badge.
     */
    telegraphReadAt: v.optional(v.number()),
    /**
     * **L'heure où on l'a vu pour la dernière fois**, absente tant qu'il n'a rien ouvert depuis
     * que le champ existe — le lancement de la saison fait alors foi (`lastSeenOf`). `v.optional`
     * pour la raison habituelle : les sièges déjà déposés ne le portent pas, et un champ
     * obligatoire posé sans migration fait refuser la poussée (leçon du 27/08).
     *
     * **Une seule règle la lit, et pour un seul joueur** : le fondateur qui ne revient plus perd
     * l'exclusivité de la clôture (`seasons.conclude`). Elle ne sort jamais de `playerView` pour
     * un autre siège — une « dernière connexion » adverse serait un canal sur les plages de repos
     * (ADR 0005), et la seule forme qui sorte est une durée d'absence du fondateur, près du
     * seuil.
     *
     * Écrite au plus toutes les `PRESENCE_THROTTLE_MIN` minutes (`players.touch`) : c'est une
     * présence, pas un battement.
     */
    lastSeenAt: v.optional(v.number()),
  })
    .index('byAccountSeason', ['accountId', 'seasonId'])
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
    // Old depot work finishes as warehouse without losing its historical price.
    costKey: v.optional(v.literal('depot')),
    seasonId: v.id('seasons'),
    playerId: v.id('players'),
    key: BUILDING_KEY,
    regionId: v.string(),
    level: v.number(),
    /**
     * **Where the building stands, when its region's point is not enough** — the port and only
     * the port (ADR 0013, revision of 04/09). A ship leaves from the water, and a region as
     * large as Hokkaido has several coasts: the player picks the coast point at the placement
     * and it is written here, once, never moved by a raise.
     *
     * Absent everywhere else, and absent on a port put up before this landed: `pointOfBuilding`
     * falls back on the region's point, which is exactly what those rows always meant. It is
     * `v.optional` for the same reason as `outpostId` — a required field would make the
     * deployment refuse every row already written (the lesson of 27/08 on `seasonId`).
     */
    point: v.optional(LON_LAT),
    /**
     * **Which site carries this building's placement** (ADR 0020 §10): `null` is national soil,
     * an id is the outpost the placement was anchored to. Written **at the placement and never
     * recomputed** — a building put up abroad hangs from the founder's nearest outpost whose
     * reach covers the region, and it keeps hanging from it whatever is founded afterwards.
     * Otherwise a new point would silently move an old building's placement from one budget to
     * another, and a site the player never touched would fill up on its own.
     *
     * `v.optional` rather than required: rows written before this landed carry no field at all,
     * and a required one would make the deployment refuse them (the lesson of 27/08 on
     * `buildings.seasonId`). **Absent is not `null`** — it is a row read back by geography once,
     * national soil when its region is at home. Same tolerance as `seasons.format`, and it goes
     * with the next wipe.
     *
     * A destroyed outpost leaves its buildings standing and their anchor dead: nothing is
     * re-hung anywhere, and nothing more can be placed there.
     */
    outpostId: v.optional(v.union(v.id('outposts'), v.null())),
    /** A warehouse or production site can be temporarily put out of service. Absent means the
     * row predates building disruption and is active. */
    disabledUntil: v.optional(v.number()),
  })
    .index('byPlayer', ['playerId'])
    .index('bySeason', ['seasonId']),

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
    seasonId: v.id('seasons'),
    playerId: v.id('players'),
    role: UNIT_ROLE,
    tier: UNIT_TIER,
    nominalStrength: v.number(),
    currentStrength: v.number(),
    stationedAt: TROOP_ADDRESS,
  })
    .index('byPlayer', ['playerId'])
    .index('bySeason', ['seasonId'])
    /** Who defends a place is read from the place, not from a player: an engagement asks "what
     *  hangs from this outpost", and the answer must not be a scan of every troop in the game.
     *  A point is asked by distance instead — see the note above. */
    .index('byStation', ['stationedAt']),

  /** A load whose carrier is standing rather than represented by a movement. Loads in transit
   * stay on `movements.loot`; this second form prevents an arrival or an impossible return from
   * deleting real resources merely because the movement row disappears. Its reprise by a later
   * movement is the explicit S6a-4 lot. */
  stationedLoot: defineTable({
    seasonId: v.id('seasons'),
    playerId: v.id('players'),
    troopIds: v.array(v.id('troops')),
    stationedAt: TROOP_ADDRESS,
    loot: RESOURCE_AMOUNTS,
    plunderReportId: v.optional(v.id('plunderReports')),
    recoveryId: v.optional(v.id('lootRecoveries')),
    collectionId: v.optional(v.id('lootCollections')),
  })
    .index('byPlayer', ['playerId'])
    .index('bySeason', ['seasonId']),

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
    seasonId: v.id('seasons'),
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
    /** The instant the rest window held this arrival at the border. Present, it says that
     *  `arrivesAt` no longer dates a walk but the pass that will resolve it — without it the
     *  view reads a seven-hour push back as a column leaving its barracks again. Written once,
     *  by `arrive`; a return or a resolution ignores it. */
    heldAt: v.optional(v.number()),
    /**
     * The next mobile encounter reserved for this column. Optional because movements already in
     * flight predate passive ranges. A reassessment cancels the job before replacing these four
     * fields; the callback checks the expected pair and date before resolving anything.
     */
    contactJobId: v.optional(v.id('_scheduled_functions')),
    contactWithId: v.optional(v.id('movements')),
    contactAt: v.optional(v.number()),
    contactInitiatorId: v.optional(v.id('movements')),
    /** Pairs already resolved while both movements remain in flight. This prevents a
     * reassessment immediately after a pass from scheduling the same encounter again. */
    encounteredMovementIds: v.optional(v.array(v.id('movements'))),
    /** While present, the manifest stays unavailable to a second order because it still
     * belongs to this movement. Its optional return region is the automatic plan fixed before
     * the return; absence keeps pre-S6a documents readable. */
    plunder: v.optional(PLUNDER_MISSION),
    /** Cargo on a stamped return is delivered at its frontier; an unstamped load stays legacy. */
    loot: v.optional(RESOURCE_AMOUNTS),
    /** Several recovered or regrouped loads keep their own report without duplicating totals. */
    lootLoads: v.optional(v.array(LOOT_LOAD)),
    /** New returns carry the immutable frontier they must revalidate; absence is legacy cargo. */
    lootDelivery: v.optional(LOOT_DELIVERY),
    /** Internal collection mission. Optional keeps every movement already stored readable. */
    lootCollection: v.optional(LOOT_COLLECTION_MISSION),
    plunderReportId: v.optional(v.id('plunderReports')),
  })
    .index('byPlayer', ['playerId'])
    .index('bySeason', ['seasonId'])
    .index('byLootCollectionCrateArrival', ['lootCollection.crateId', 'arrivesAt']),

  /** Durable facts consumed by the S7c dispatch wiring. One successful expedition creates one
   * row; callbacks and later reads never reconstruct it from current stocks. */
  plunderReports: defineTable({
    seasonId: v.id('seasons'),
    attackerId: v.id('players'),
    defenderId: v.id('players'),
    buildingId: v.id('buildings'),
    building: BUILDING_KEY,
    regionId: v.string(),
    hostCountry: v.string(),
    at: v.number(),
    disabledUntil: v.number(),
    engagementId: v.union(v.id('engagements'), v.null()),
    taken: RESOURCE_AMOUNTS,
    storageLost: RESOURCE_AMOUNTS,
    delivered: v.optional(RESOURCE_AMOUNTS),
    lost: v.optional(RESOURCE_AMOUNTS),
    returnMovementId: v.optional(v.id('movements')),
  })
    .index('bySeason', ['seasonId'])
    .index('byAttacker', ['attackerId'])
    .index('byDefender', ['defenderId']),

  /** A destroyed carrier changes ownership without rewriting the expedition that first took
   * the goods. The uncarried share deliberately stays on this private fact until S6b-2 gives it
   * a physical crate; no player view reads this table today. */
  lootRecoveries: defineTable({
    seasonId: v.id('seasons'),
    engagementId: v.id('engagements'),
    dispossessedPlayerId: v.id('players'),
    recoveringPlayerId: v.id('players'),
    point: LON_LAT,
    at: v.number(),
    sourcePlunderReportId: v.optional(v.id('plunderReports')),
    sourceRecoveryId: v.optional(v.id('lootRecoveries')),
    sourceCollectionId: v.optional(v.id('lootCollections')),
    recovered: RESOURCE_AMOUNTS,
    remainder: RESOURCE_AMOUNTS,
    delivered: v.optional(RESOURCE_AMOUNTS),
    lost: v.optional(RESOURCE_AMOUNTS),
  })
    .index('bySeason', ['seasonId'])
    .index('byRecoveringPlayer', ['recoveringPlayerId'])
    .index('byEngagement', ['engagementId']),

  /** A crate changes carrier without changing the historical recovery that created it. This
   * fact owns the later carrier's delivery and loss counters. */
  lootCollections: defineTable({
    seasonId: v.id('seasons'),
    collectorPlayerId: v.id('players'),
    sourceCrateId: v.id('lootCrates'),
    sourceRecoveryId: v.id('lootRecoveries'),
    movementId: v.id('movements'),
    at: v.number(),
    collected: RESOURCE_AMOUNTS,
    delivered: v.optional(RESOURCE_AMOUNTS),
    lost: v.optional(RESOURCE_AMOUNTS),
  })
    .index('bySeason', ['seasonId'])
    .index('byCollector', ['collectorPlayerId'])
    .index('byCrate', ['sourceCrateId'])
    .index('byMovement', ['movementId']),

  /** The single current quantity of a battlefield remainder. Its recovery fact keeps provenance,
   * while this private row alone owns what is still physically present. */
  lootCrates: defineTable({
    seasonId: v.id('seasons'),
    recoveryId: v.id('lootRecoveries'),
    point: LON_LAT,
    appearedAt: v.number(),
    expiresAt: v.number(),
    loot: RESOURCE_AMOUNTS,
    expirationJobId: v.optional(v.id('_scheduled_functions')),
  })
    .index('bySeason', ['seasonId'])
    .index('byRecovery', ['recoveryId']),

  /** One immutable public search area for every engagement that left physical loot. The true
   * crate point never enters this table, so the public reader cannot recover it by projection. */
  lootRumors: defineTable({
    seasonId: v.id('seasons'),
    engagementId: v.id('engagements'),
    center: LON_LAT,
    radiusKm: v.number(),
    appearedAt: v.number(),
    publishAt: v.number(),
    endsAt: v.number(),
    version: v.number(),
    publishJobId: v.optional(v.id('_scheduled_functions')),
    endJobId: v.optional(v.id('_scheduled_functions')),
    publishedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  })
    .index('bySeason', ['seasonId'])
    .index('byEngagement', ['engagementId']),

  /** What one player last established about a crate. Reads stay on this observer-owned ledger:
   * the crate table remains server truth and is never filtered into a client view. */
  lootCrateSightings: defineTable({
    seasonId: v.id('seasons'),
    playerId: v.id('players'),
    crateId: v.id('lootCrates'),
    point: LON_LAT,
    loot: RESOURCE_AMOUNTS,
    seenAt: v.number(),
    present: v.boolean(),
    current: v.boolean(),
  })
    .index('byPlayer', ['playerId'])
    .index('byCrate', ['crateId'])
    .index('byPlayerCrate', ['playerId', 'crateId'])
    .index('bySeason', ['seasonId']),

  /** A prediction is deliberately separate from what an observer has seen. Only its callback may
   * turn the current board into a sighting, after checking that this exact row is still current. */
  lootCrateDetectionJobs: defineTable({
    seasonId: v.id('seasons'),
    movementId: v.id('movements'),
    crateId: v.id('lootCrates'),
    kind: v.union(v.literal('enter'), v.literal('exit')),
    at: v.number(),
    scheduledJobId: v.optional(v.id('_scheduled_functions')),
  })
    .index('bySeason', ['seasonId'])
    .index('byMovement', ['movementId'])
    .index('byCrate', ['crateId'])
    .index('byMovementCrate', ['movementId', 'crateId']),

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
    seasonId: v.id('seasons'),
    playerId: v.id('players'),
    point: LON_LAT,
    hostCountry: v.string(),
    /**
     * **La région où il se tient**, nommée par le client à la fondation (`regionAtPoint`) : le
     * serveur ne tient aucun polygone, et le pôle d'inaccessibilité d'une région sibérienne est
     * à trois cents kilomètres de sa côte — mesurer la distance à ce point-là laissait un point
     * ne pas tenir le sol qu'il occupe (précision de l'ADR 0020 du 04/09).
     *
     * `v.optional` parce que les points plantés avant ce champ ne le portent pas, et qu'un champ
     * obligatoire posé sans migration fait refuser la poussée (leçon du 27/08 sur
     * `buildings.seasonId`). Ils se relisent par la géographie (`regionOfOutpost`), et le repli
     * part au prochain wipe.
     */
    regionId: v.optional(v.string()),
    level: v.number(),
    specialization: SPECIALIZATION,
    foundedAt: v.number(),
    disabledUntil: v.union(v.number(), v.null()),
    immuneUntil: v.union(v.number(), v.null()),
  })
    .index('byPlayer', ['playerId'])
    .index('bySeason', ['seasonId']),

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
    /**
     * **Legacy, plus jamais écrit ni lu.** Le détail frappe par frappe est passé dans la table
     * `strikes` : gardé dans le document de l'engagement, il se relisait à chaque chargement du
     * plateau pour n'afficher que deux totaux. `v.optional` et non un retrait sec, pour la raison
     * habituelle — les engagements déjà écrits le portent, et un champ retiré d'une table déjà
     * écrite fait refuser la poussée (leçon du 27/08 sur `buildings.seasonId`). Il part au
     * prochain wipe (ADR 0001).
     */
    strikes: v.optional(v.array(v.object(STRIKE))),
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
   * **Le détail frappe par frappe, dans sa propre table** — la matière du rejeu visuel (surface
   * 4.7), et rien d'autre ne la lit. Elle vit à part parce que le compte rendu, lui, est relu à
   * chaque chargement du plateau : une passe à vingt-quatre pions écrit des dizaines de frappes,
   * et rangées dans le document de l'engagement elles se relisaient toutes pour afficher deux
   * totaux. Une saison de trois cents passes franchissait ainsi le plafond de lecture de Convex.
   *
   * `rank` plutôt que l'ordre d'insertion : les lignes d'une même passe sont écrites dans la même
   * mutation, et un ordre qu'on ne stocke pas est un ordre qu'on ne garantit pas.
   *
   * Pas de `seasonId` : une frappe pend à son engagement comme une dépendance, elle n'est jamais
   * balayée par saison — on la lit `byEngagement` ou pas du tout.
   */
  strikes: defineTable({
    engagementId: v.id('engagements'),
    rank: v.number(),
    ...STRIKE,
  }).index('byEngagement', ['engagementId']),

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
    /** The coast point a port was ordered on, carried through the queue so the mast is drawn
     *  there from the moment it is enqueued and `finish` has nothing left to choose. */
    point: v.optional(LON_LAT),
  }).index('byPlayer', ['playerId']),

  /**
   * **What happened to a player without him asking for it** — the journal's own ledger for the
   * things no engagement accounts for. Today it holds exactly one kind: a queued construction
   * the world took the right to before its turn came, refunded whole.
   *
   * A notice is a line of the journal and nothing else. It carries ids and numbers, never a
   * sentence (ADR 0016): the French is put on it on the client, like every other dispatch.
   */
  notices: defineTable(NOTICE)
    .index('byPlayer', ['playerId'])
    .index('byPlayerAt', ['playerId', 'at']),

  /**
   * **The telegraph — one general channel per season, and nothing else.** No private channel, no
   * mention, no moderation: the avowed purpose is that players write to each other and needle
   * each other, which is the social fuel of a game about adversity between friends.
   *
   * `seasonId` and the `bySeason` index for the reason every swept table carries them: several
   * boards stand at once, and a channel that read the table whole would serve one game's taunts
   * to another's players. `byPlayer` is the second reading — the anti-burst guard asks a player
   * for his own last message, and the wipe of a scrapped season takes his rows with him.
   *
   * The text is stored exactly as it was typed, trimmed and nothing more: it is text, never
   * markup, and the only thing that ever renders it escapes it.
   */
  messages: defineTable({
    seasonId: v.id('seasons'),
    playerId: v.id('players'),
    text: v.string(),
    at: v.number(),
  })
    .index('bySeason', ['seasonId'])
    .index('byPlayer', ['playerId']),

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
   * The rows are maintained by **board events** against stationary and mobile observers. A new
   * detector sees only the future of a movement already in flight; a future window that becomes
   * impossible is cancelled before it can be served.
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
    /**
     * **Which of his four detectors caught it first**, and the row it hangs from when it has
     * one. There is one row per observer whatever saw the thread — two would draw the same arc
     * twice on the same board — so what is kept is the earliest, which is also the only one a
     * dispatch can honestly name: *relevé par* is a first sight, not a roll call.
     *
     * Territory and troop detectors carry no source id, for opposite reasons: one is the ground
     * itself, the other may be a moving stack and a stack is not a row of its own.
     */
    detector: DETECTOR,
    detectorId: v.union(v.id('buildings'), v.id('outposts'), v.null()),
    /** Context captured from the observer, never from the detected column. Optional for rows
     * written before reassessment existed. */
    detectorHostCountry: v.optional(v.string()),
    detectorRegion: v.optional(v.union(v.string(), v.null())),
    /** A future window takes one cancellable appointment to file its dispatch at opening. */
    revealJobId: v.optional(v.id('_scheduled_functions')),
    noticeFiled: v.optional(v.boolean()),
    /**
     * **Le tronçon, figé quand le mouvement disparaît** (ADR 0024 §2). Une fenêtre ouverte laisse
     * une dernière position connue quoi qu'il arrive à ce qu'elle a vu — arrivée, retour, déroute,
     * destruction — et la ligne survivait mal à un `movements` vidé : l'arc était tiré de rien, et
     * la vue le laissait tomber (bug contre l'ADR 0005, corrigé ici).
     *
     * C'est la sortie de `seenSegment`, calculée **une fois**, à l'instant de la disparition :
     * après, il n'y a plus de route à rejouer. `closedAt` date le souvenir, et il s'efface avec
     * `LAST_KNOWN_HOURS`. Optionnel parce que les lignes vivantes n'en ont pas — le mouvement
     * répond encore pour elles.
     */
    frozen: v.optional(
      v.object({
        points: v.array(LON_LAT),
        legs: v.array(ROUTE_LEG),
        distanceUnits: v.number(),
        costUnits: v.number(),
        headingDegrees: v.number(),
        closedAt: v.number(),
      }),
    ),
  })
    .index('byPlayer', ['playerId'])
    .index('byMovement', ['movementId']),

  /**
   * **Ce qu'un joueur a relevé de posé, et depuis quand** (ADR 0024 §1). Le jumeau immobile de
   * `sightings` : là où l'un se souvient d'un fil qui est passé, celui-ci se souvient d'un camp
   * qui se tient là.
   *
   * Il existe pour la raison de son jumeau, et il faut la relire avant d'y toucher : une requête
   * « les piles posées que je vois » qui filtrerait les troupes de la table dépendrait de **toute**
   * la table, et se recalculerait pour tous à chaque pose (`WWS/docs/technique/brouillard-et-fanout.md`).
   * Une ligne appartient à un observateur, et il lit son propre index.
   *
   * `stationKey` est l'identité de ce qui est vu — la clé que `detectionBoard` fabrique pour ses
   * `posted`, c'est-à-dire le propriétaire et le point. Une garnison d'avant-poste ou de bâtiment
   * est une pile posée comme une autre, et elle se relève sous la même clé.
   *
   * `ownerId` n'est **jamais servi** : il est là pour que l'écriture sache de quel camp elle parle
   * et pour qu'un test puisse le dire — la vue ne porte ni nation, ni composition, ni effectif.
   *
   * `until` à `null` est un camp couvert à l'instant ; daté, c'est l'heure où on l'a perdu de vue,
   * et la ligne devient une dernière position connue jusqu'à `LAST_KNOWN_HOURS`.
   */
  campSightings: defineTable({
    /** L'observateur, jamais le propriétaire du camp. */
    playerId: v.id('players'),
    seasonId: v.id('seasons'),
    stationKey: v.string(),
    ownerId: v.id('players'),
    point: LON_LAT,
    /** Le milieu de la pile : la mer si elle flotte, la terre sinon. L'air n'est le milieu
     *  d'aucune pile posée — une aile au sol se tient sur un aérodrome. */
    medium: MEDIUM,
    since: v.number(),
    until: v.union(v.number(), v.null()),
    detector: DETECTOR,
    detectorId: v.union(v.id('buildings'), v.id('outposts'), v.null()),
    detectorRegion: v.union(v.string(), v.null()),
    /** Une dépêche par ligne, à l'ouverture : une réouverture ne rejoue pas la nouvelle. */
    noticeFiled: v.boolean(),
  })
    .index('byPlayer', ['playerId'])
    .index('byStation', ['stationKey']),

  /**
   * **La carte que ce joueur-là a relevée, et la date de son relevé** (ADR 0020 §5). Le jumeau au
   * sol de `sightings` : là où l'un se souvient d'un fil qui est passé, celui-ci se souvient de
   * qui tenait la terre.
   *
   * Il existe pour la même raison, et il faut la relire avant d'y toucher : une requête « les
   * régions que je connais » qui filtrerait la vérité dépendrait de la table des avant-postes, et
   * se recalculerait pour **tous** les joueurs à chaque fondation
   * (`WWS/docs/technique/brouillard-et-fanout.md`). Une ligne appartient à un observateur, et il
   * lit son propre index — la vérité n'entre jamais dans la lecture.
   *
   * Une ligne par couple observateur × région, écrasée à chaque nouvelle observation : c'est un
   * **dernier** relevé, pas un journal. Ce qui l'écrit sont les événements et rien d'autre — pose
   * d'une troupe, fondation d'un avant-poste, départ et arrivée d'un mouvement (`convex/surveys.ts`)
   * — parce qu'il n'existe aucune horloge périodique dans ce jeu et qu'on n'en invente pas une ici.
   *
   * `ownerId` à `null` est une observation qui a vu que **personne** ne tenait : c'est ce qui
   * corrige une couleur périmée, et c'est pour ça qu'elle s'écrit au lieu d'être omise. L'absence
   * de ligne, elle, est le troisième état — *vierge*, jamais observée, qui n'est pas *neutre*.
   */
  /**
   * **Une édition du classement : une ligne par joueur, à l'heure du relevé** (spécification
   * `propositions/classement-bareme.md` §3). Ce qui la rend nécessaire tient en une phrase : le
   * classement **ne bouge pas entre deux éditions**, donc il ne peut pas être une lecture de
   * l'état — une vue qui recalculerait les scores à chaque chargement ferait de la presse un
   * moniteur temps réel, ce que ce jeu n'a pas.
   *
   * Les valeurs sont **exactes**, jamais arrondies en tranche : la tranche a été abandonnée le
   * 06/09 (décision 80), et de toute façon un affichage n'a rien à faire en base.
   *
   * `final` marque l'édition écrite hors cadence à la conclusion de la saison (§5) — la dernière,
   * et celle que la page de presse tamponne. Rien ne suit une édition finale.
   *
   * Volume : huit joueurs, huit éditions par jour, sept jours — quatre cent quarante-huit lignes.
   * Rien à borner, et `destroy` l'emporte avec le reste (`convex/dev.ts`).
   */
  editions: defineTable({
    seasonId: v.id('seasons'),
    playerId: v.id('players'),
    at: v.number(),
    final: v.boolean(),
    /** La part du théâtre, en pour cent — jamais un compte de régions (contrat de vue 07 P3). */
    territory: v.number(),
    industry: v.number(),
    military: v.number(),
    deeds: v.number(),
    general: v.number(),
  })
    /** L'édition entière, par saison et par heure : ce que la page de presse sert. */
    .index('bySeasonAt', ['seasonId', 'at'])
    /** Les deux dernières lignes d'un joueur : la sienne et celle d'avant, dont sort le delta. */
    .index('byPlayerAt', ['playerId', 'at']),

  regionSightings: defineTable({
    /** L'observateur, jamais le tenant de ce qui a été vu. */
    playerId: v.id('players'),
    regionId: v.string(),
    ownerId: v.union(v.id('players'), v.null()),
    seenAt: v.number(),
    /** Snapshot at `seenAt`. Absent rows predate installation surveys and reveal nothing. */
    installations: v.optional(v.array(SURVEYED_INSTALLATION)),
    /** Indexed read gate for PlayerView; absent legacy rows are the same as false. */
    hasInstallations: v.optional(v.boolean()),
  })
    .index('byPlayer', ['playerId'])
    .index('byPlayerHasInstallations', ['playerId', 'hasInstallations'])
    /** L'écriture relit sa propre ligne avant de décider s'il y a quelque chose à écrire : sans
     *  cet index elle balaierait tout le relevé du joueur par région observée. */
    .index('byPlayerRegion', ['playerId', 'regionId']),
});
