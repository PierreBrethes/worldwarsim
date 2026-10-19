import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  BUILDING_KEY,
  LINE_KEY,
  BUILD_COST_KEY,
  CAPTURE_SITE,
  CAPTURE_TARGET,
  COMBAT_SIDE,
  DETECTOR,
  FIRST_STEP,
  FIRST_STEPS_SHOWN,
  FOUNDATION_DEBT,
  LON_LAT,
  LOOT_DELIVERY,
  LOOT_COLLECTION_MISSION,
  LOOT_LOAD,
  MEDIUM,
  MOVEMENT_TARGET,
  ROUTE_LEG,
  MOVEMENT_TYPE,
  STRATEGIC_POINT_KEY,
  NOTICE,
  PUSH_PREFERENCES,
  PUSH_TYPE,
  PLUNDER_MISSION,
  RESOURCE_AMOUNTS,
  SUPPLY_LOAD,
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
  RESEARCH_CARD,
  SEASON_MODE,
  LAUNCH_REFUSAL,
  VERDICT,
  TOUR_WAIT,
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
    /** Les six interrupteurs du compte, absents tant qu'il n'en a touché aucun : un compte sans
     *  ligne a tout coché (`pushPreferencesOf`, `convex/notifications.ts`). */
    pushPreferences: v.optional(PUSH_PREFERENCES),
    /** Le vidage de la file d'envoi qui attend ce compte — un seul à la fois, et c'est cette
     *  trace qui permet de le déplacer plutôt que d'en empiler un second. */
    pushFlushJobId: v.optional(v.id('_scheduled_functions')),
    /** Le dernier essai de notification demandé, pour n'en laisser partir qu'un à la fois
     *  (`PUSH_TEST_INTERVAL_MS`). */
    pushTestAt: v.optional(v.number()),
    /** La dernière tentative de connexion **examinée** sur ce pseudo (`LOGIN_MIN_INTERVAL_MS`). */
    loginAttemptAt: v.optional(v.number()),
  }).index('byNicknameKey', ['nicknameKey']),

  /** **Le dernier passage de l'inscription** (clé `register`, une seule ligne). */
  authThrottle: defineTable({
    key: v.string(),
    at: v.number(),
  }).index('byKey', ['key']),

  sessions: defineTable({
    accountId: v.id('accounts'),
    /** L'empreinte du jeton quand `hashed` est vrai, le jeton lui-même sur une ligne d'avant
     *  (`convex/sessions.ts`) — une ligne en clair se convertit à sa première écriture. */
    token: v.string(),
    hashed: v.optional(v.boolean()),
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
     * reduced was read off the troops standing at the instant (the retired test victory), and a stored
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
     * **Pourquoi la Blitz s'est conclue** (B10, B11) : le dernier debout après une chute de QG
     * ou une capitulation, le plus gros revenu à l'horloge, ou l'égalité. Absent en Mondiale et
     * sur toute saison d'avant le lot 6 : l'édition finale ne dit alors que le vainqueur.
     */
    verdict: v.optional(VERDICT),
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
    /** Absent reads as `'mondiale'` (`modeOf`): seasons older than the modes are Mondiales. */
    mode: v.optional(SEASON_MODE),
    /** A `THEATRES` id; set on a Blitz only. */
    theatre: v.optional(v.string()),
    /** Why the last launch of a Blitz came back to the lobby; cleared by the next launch. */
    launchRefusal: v.optional(LAUNCH_REFUSAL),
    /** **L'ordre d'opérations**, réglé par le fondateur jusqu'au lancement
     *  (`src/domain/operation-order.ts`). Absent se lit comme les défauts : pas de rendez-vous,
     *  pas de rappel, prise d'un QG en 12 h, la table pleine. `scheduledAt: null` est une Blitz
     *  « dès que la table est complète ». */
    scheduledAt: v.optional(v.union(v.number(), v.null())),
    remind: v.optional(v.boolean()),
    /** Mondiale (M15) : ce que dure la capture d'un QG, 12 ou 24 h (`captures.startCapture`). */
    hqCaptureHours: v.optional(v.number()),
    /**
     * **Le meneur de la course aux Sept, et depuis quand** (M1, P3) : celui qui tient quatre
     * points, `raceSince` l'heure où il les a atteints. Absents tant que personne n'en tient
     * quatre ; un seul meneur à la fois (4 + 4 > 7). Le travail `race.closeRace` le relit à
     * l'échéance des 24 h.
     */
    raceLeaderId: v.optional(v.id('players')),
    raceSince: v.optional(v.number()),
    seatCap: v.optional(v.number()),
    /** Le travail du rappel en attente, qu'un changement de l'ordre annule (`planReminder`). */
    reminderJobId: v.optional(v.id('_scheduled_functions')),
    /** Le théâtre a été tiré au sort au lancement : un lancement défait le remet au sort. */
    theatreDrawn: v.optional(v.boolean()),
  }).index('byCode', ['code']),

  players: defineTable({
    seasonId: v.id('seasons'),
    /**
     * **Le compte qui tient cette place** (ADR 0022). Aucun repli et aucune migration : le jeton
     * de partie est mort avec le wipe qui a posé ce champ (décision 85a).
     *
     * **Absent est le siège irrégulier, et lui seul** (objectifs neutres, 17/09/2026) : la
     * garnison locale d'un objectif est une force posée comme une autre, donc elle appartient à
     * un `players` — mais il n'y a derrière lui aucun compte, aucune session, aucune porte.
     * Copier celui du fondateur aurait donné deux places au même compte dans la même saison, et
     * `seatOf` lit ce couple en `.unique()` : la partie entière serait tombée à la connexion.
     */
    accountId: v.optional(v.id('accounts')),
    /**
     * **Ce siège n'est pas un joueur** (objectifs neutres, 17/09/2026) : il ne tient que les
     * garnisons locales des objectifs neutres. Absent vaut « un vrai joueur », comme tout champ
     * posé après coup (leçon du 27/08 sur `buildings.seasonId`).
     *
     * C'est le drapeau que tout comptage de joueurs relit — le salon, l'accueil, la presse, le
     * classement, la dominance, le doyen, l'entretien — parce que le brouillard, le combat et la
     * carte, eux, n'ont **rien** à en savoir : une troupe irrégulière se relève, se bat et meurt
     * exactement comme une autre, et c'est tout l'intérêt (ADR 0019 §3).
     */
    irregular: v.optional(v.boolean()),
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
    /** **L'heure où son QG de départ est tombé** (Blitz) : jamais écrite par une capitulation. */
    eliminatedAt: v.optional(v.number()),
    /**
     * **Les dettes du socle qu'un bâtiment rasé avait acquittées** (décision 6a du 15/09). Le
     * socle se lit sur le sol — `foundationOwed` retranche de la liste due ce qui est debout —,
     * donc sans cette trace une mine de fondation rasée serait redemandée, et le socle
     * deviendrait un don renouvelable. Absent vaut « rien de rasé », comme tout champ posé après
     * coup (leçon du 27/08 sur `buildings.seasonId`).
     *
     * Ce sont des couples `(clé, gisement)` et pas des clés : la dette de la mine de fer ne
     * s'acquitte que sur du fer (`settlesDebt`), et une clé seule en solderait deux.
     */
    settledFoundation: v.optional(v.array(FOUNDATION_DEBT)),
    /** **Les fonds de la Blitz** à `fundsAt` : le débit se relit sur les villes et le QG tenus
     *  (`convex/blitz.ts`), donc rien d'autre n'est stocké. Absent hors Blitz. */
    funds: v.optional(v.number()),
    fundsAt: v.optional(v.number()),
    /** **Les cartes de recherche acquises** (ADR 0028 §5), dans l'ordre où elles ont abouti.
     *  Absent vaut « aucune ». Jamais servi qu'à son joueur. */
    researched: v.optional(v.array(RESEARCH_CARD)),
    /**
     * **La carte posée sur le QG**, une seule à la fois : ce qu'il lui reste à courir, et depuis
     * quand — `null` quand son QG manque et qu'elle attend (`research.ts`). Absent : aucune.
     */
    research: v.optional(
      v.object({
        card: RESEARCH_CARD,
        remainingMs: v.number(),
        since: v.union(v.number(), v.null()),
      }),
    ),
    restWindow: REST_WINDOW,
    /**
     * **When this player entered the war** — the hour his kit was handed out, which is the hour
     * he became a belligerent. `null` is a seat that has not entered yet: a lobby, or the
     * irregular seat. Nobody enters after the launch (ADR 0027 §4).
     *
     * It is an event, not a second truth: nothing recomputes it, and the endowment is written
     * in the same transaction that stamps it (`seasons.ts`, `endow`).
     *
     * `v.optional` for the same reason as the season's `winnerId`: rows written before this
     * landed carry no field at all. **Absent and `null` do not mean the same thing here** —
     * absent is a legacy row, resolved against the season's own launch by `isAtWar`, and
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
    /** L'heure du dernier télégraphe parti en notification pour cette place : le télégraphe
     *  n'en déclenche qu'une par heure (`convex/notifications.ts`). */
    telegraphPushedAt: v.optional(v.number()),
    /** **À la table du salon d'une Blitz**, au dernier battement (`players.beatLobby`). Jamais
     *  écrit ni servi en Mondiale : la présence y serait un canal sur les plages de repos
     *  (ADR 0005). */
    lobbySeenAt: v.optional(v.number()),
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
   *  iron or coal, each with its own level. The `regionId` is the `id` of `regions.json`. */
  buildings: defineTable({
    // Old depot work finishes as warehouse without losing its historical price.
    costKey: v.optional(v.literal('depot')),
    seasonId: v.id('seasons'),
    playerId: v.id('players'),
    key: BUILDING_KEY,
    regionId: v.string(),
    level: v.number(),
    /**
     * **Where the building stands** (ADR 0029 §1): the exact point the player aimed at, written
     * once at the placement and never moved by a raise. `regionId` is the region that point lies
     * in, read at the placement too: it carries the colour, the point carries everything else —
     * the spacing, the deposit, the quay of a port, the march of a capture or a strike.
     */
    point: LON_LAT,
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
    /** **L'heure où il a été capturé** (décision M8 du 14/10) : un bâtiment capturé colore sa
     *  région pour son tenant, sol national compris (`heldRegions`, `occupations`), et n'occupe
     *  aucun emplacement. Absent : bâti par celui qui le tient. */
    capturedAt: v.optional(v.number()),
    /** **Posé neutre par la carte de départ d'une Blitz**, et resté marqué après sa prise : la
     *  liste des neutres se sert figée, et seul un relevé apprend qu'un autre l'a pris. */
    startedNeutral: v.optional(v.literal(true)),
    /** **Le QG de départ, et de qui** — posé par la carte d'une Blitz, ou par le joueur au socle
     *  d'une Mondiale : sa chute élimine ce joueur-là (B10, M2a), pas celui qui le tenait après
     *  l'avoir pris. */
    homeOf: v.optional(v.id('players')),
  })
    .index('byPlayer', ['playerId'])
    .index('bySeason', ['seasonId'])
    /** La couleur relit les bâtiments capturés à chaque lecture : un intervalle sur ce seul champ
     *  ne se réinvalide pas au moindre niveau gravi ailleurs dans la saison. */
    .index('bySeasonCaptured', ['seasonId', 'capturedAt'])
    .index('bySeasonStartedNeutral', ['seasonId', 'startedNeutral']),

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
   * coordinate" but "who stands within `contactKm(theatre)` of it", which no equality index
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
    /** **Blitz** (B19) : jusqu'à quand la troupe recharge après une frappe — elle bouge, elle
     *  n'attaque pas. Absent, elle n'a jamais frappé. */
    reloadUntil: v.optional(v.number()),
    /** **L'artillerie** (B20) : l'heure où elle s'est posée, d'où se compte sa mise en batterie.
     *  Absent, depuis sa formation (`_creationTime`). */
    settledAt: v.optional(v.number()),
    /** **Le transport qui la porte** (révision de l'ADR 0025, 15/10) : on est à bord parce qu'on
     *  a embarqué, plus parce qu'on se tient au point d'un transport. Absent, à pied. Il ne vaut
     *  qu'à la même adresse que son transport (`carrierIn`). */
    carriedBy: v.optional(v.id('troops')),
    /** **Coups et plein, en crans** (ADR 0028 §3, Mondiale) : ce qu'elle porte encore. Absents,
     *  pleins — elle n'a rien dépensé depuis sa formation (`SUPPLY_BY_ROLE`). */
    rounds: v.optional(v.number()),
    fuel: v.optional(v.number()),
    /** **La charge d'un transport** (ADR 0028 §4) : munitions, pétrole et charbon dans une seule
     *  capacité (`LOAD_CAPACITY_BY_ROLE`), séparée de ses places. Absente, vide. */
    load: v.optional(SUPPLY_LOAD),
    /**
     * **Sa tournée** (ADR 0028, précision du 18/10) : une boucle depuis son point de chargement
     * (`base`), quatre dépôts au plus, et la **consigne** qu'elle recharge à chaque tour. `next`
     * est l'arrêt que le tour en cours visite après celui-ci, `skipped` les dépôts pleins qu'il
     * saute ; `waiting` dit qu'elle attend au chargement, depuis quand, pourquoi et combien de fois sa route a été refusée d'affilée, `recalled`
     * qu'on l'a rappelée et qu'elle finit au chargement. Elle garde son slot tant qu'elle tourne.
     */
    tour: v.optional(
      v.object({
        base: v.union(v.id('buildings'), v.id('outposts')),
        stops: v.array(v.id('outposts')),
        consigne: SUPPLY_LOAD,
        next: v.number(),
        skipped: v.optional(v.array(v.id('outposts'))),
        waiting: v.optional(
          v.object({ since: v.number(), roads: v.optional(v.number()), ...TOUR_WAIT.fields }),
        ),
        recalled: v.optional(v.boolean()),
        retryJobId: v.optional(v.id('_scheduled_functions')),
      }),
    ),
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
    /** The line of the chain the lot runs on (`FACTORY_LINES`); absent reads `DEFAULT_LINE`. */
    line: v.optional(LINE_KEY),
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
    /**
     * **L'objectif neutre que cette colonne est venue réduire** (objectifs neutres, 17/09/2026).
     * La cible **stockée** reste un point — c'est le point que la colonne marche, et l'arrivée
     * engage ce qui s'y tient (ADR 0024 §4) —, mais le dépôt ne se prend que si l'ordre le
     * nommait : sans ce champ, une attaque qui passe par là emporterait un butin que personne
     * n'est venu chercher.
     */
    objectiveId: v.optional(v.id('objectives')),
    /** **La colonne vient capturer** ce site : à l'arrivée elle engage ce qui le tient, et si son
     *  infanterie reste debout la capture commence (`convex/captures.ts`). */
    capture: v.optional(CAPTURE_TARGET),
    /**
     * **La poursuite d'une Blitz** (B18) : la troupe adverse visée — jamais servie au client — et
     * l'échéance du prochain regard, seul rendez-vous de la colonne (`movement/pursuit.ts`). La
     * cible stockée n'est que sa dernière position connue.
     */
    pursuit: v.optional(v.object({ troopId: v.id('troops'), checkAt: v.number() })),
    /** **Le transport où la colonne monte en arrivant** (15/10) : lâchée de loin sur un
     *  transport, elle y marche et embarque s'il y est encore et s'il a de la place. */
    boardsOn: v.optional(v.id('troops')),
    /** **Une livraison** (ADR 0028 §4) : à l'arrivée sur cet avant-poste, les transports
     *  déchargent dans la limite du dépôt, puis rentrent seuls ; ce qu'ils portaient d'autre y
     *  reste en garnison. */
    delivery: v.optional(v.object({ outpostId: v.id('outposts') })),
    /** **Un largage** (ADR 0028 §4) : à l'arrivée, l'avion lâche son paquet sur cet avant-poste ou
     *  sur l'escouade isolée de ce point, sans se poser, puis rentre ; son retour porte `back`,
     *  pour que le fil le dessine en vol. */
    airdrop: v.optional(
      v.union(
        v.object({ leg: v.literal('out'), outpostId: v.id('outposts') }),
        v.object({ leg: v.literal('out'), point: LON_LAT }),
        v.object({ leg: v.literal('back') }),
      ),
    ),
    /** **Un pas de tournée** : vers un de ses dépôts (`stop`), ou de retour au chargement
     *  (`base`), où elle recharge sa consigne et repart. */
    tourLeg: v.optional(v.union(v.literal('stop'), v.literal('base'))),
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
    /**
     * **L'heure où le chantier devient un point** (révision du 15/09 de l'ADR 0020 §10). Tant
     * qu'elle est devant, le point ne tient rien, n'atteint rien, ne détecte rien et n'offre
     * aucun emplacement — c'est la fenêtre qu'achète la fondation, et celle où un voisin peut
     * réagir. Le lever l'**efface** : un point debout ne porte plus de date, ce qui rend le
     * rendez-vous idempotent et laisse `isStanding` répondre sur le seul champ.
     *
     * `v.optional` parce que les points plantés avant ce champ ne le portent pas, et qu'ils sont
     * debout : le repli est `foundedAt`, qui est toujours passé.
     */
    standsAt: v.optional(v.number()),
    disabledUntil: v.union(v.number(), v.null()),
    immuneUntil: v.union(v.number(), v.null()),
    /** **Le dépôt d'avant-poste** (ADR 0028 §4) : munitions, pétrole et charbon, une seule charge
     *  maximale partagée (`depotCapacity`). Il se capture avec le point. Absent, vide. */
    depot: v.optional(SUPPLY_LOAD),
  })
    .index('byPlayer', ['playerId'])
    .index('bySeason', ['seasonId']),

  /**
   * **Les objectifs neutres de la saison** (`propositions/objectifs-neutres.md`, réécrit le
   * 17/09/2026) : une région de pays sans siège, un archétype, et le dépôt qu'il reste à prendre.
   *
   * **La garnison n'est pas ici**, et c'est la règle du brouillard mise dans la forme : l'objectif
   * est public — dépêche à tous, marqueur pour tous, dépôt restant lisible —, ce qui le tient ne
   * l'est pas. Ce sont des `troops` ordinaires du siège irrégulier, relevées comme n'importe
   * quelle force posée (ADR 0024 §1) et pas autrement. Une garnison portée par cette ligne aurait
   * été servie avec elle à tout le monde.
   *
   * `key` est une chaîne et non une union : l'archétype est une donnée (`OBJECTIVE_ARCHETYPES`),
   * et ajouter une entrée à la palette ne doit toucher ni le schéma ni une branche.
   *
   * Aucun index par joueur : un objectif n'appartient à personne. La saison le balaye whole, et
   * `destroy` l'emporte par le même index.
   */
  /**
   * **Les points stratégiques d'une Mondiale** (P1-P12, ADR 0027 §4), posés neutres au lancement
   * (`strategicPoints.layOut`). Publics par nature : chacun sait où ils sont et qui les tient ;
   * seul celui qui en conteste un reste caché jusqu'à la prise (P2).
   *
   * `heldSince` est l'heure de la prise du teneur, `null` sur un point neutre.
   */
  strategicPoints: defineTable({
    seasonId: v.id('seasons'),
    key: STRATEGIC_POINT_KEY,
    regionId: v.string(),
    point: LON_LAT,
    holderId: v.union(v.id('players'), v.null()),
    heldSince: v.union(v.number(), v.null()),
    /** **Les heures que chaque teneur y a tenues et perdues**, en ms : la fiche les dit (P2),
     *  l'horloge en départage la saison (M12). Ce que le teneur tient encore court depuis
     *  `heldSince`. */
    heldMs: v.optional(v.record(v.id('players'), v.number())),
    /** **L'heure où son pouvoir a servi, et à qui** (Istanbul, Tanger) : il revient à la période
     *  suivante (`powerReady`) ; un nouveau teneur ne l'hérite pas usé. */
    usedAt: v.optional(v.number()),
    usedBy: v.optional(v.id('players')),
  }).index('bySeason', ['seasonId']),

  objectives: defineTable({
    seasonId: v.id('seasons'),
    key: v.string(),
    regionId: v.string(),
    /** Le pôle de la région (`regionFacts`), comme tout ce qui se pose sur une région. */
    point: LON_LAT,
    /** Ce qu'il **reste** à prendre : chaque prise le décrémente, et le reste attend le suivant. */
    depot: RESOURCE_AMOUNTS,
    status: v.union(v.literal('standing'), v.literal('taken')),
    takenAt: v.union(v.number(), v.null()),
  }).index('bySeason', ['seasonId']),

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
    cause: v.union(v.literal('arrival'), v.literal('interception'), v.literal('bombardment')),
    point: LON_LAT,
    /** **D'où la batterie a tiré** (B20), pour le trait d'encre de l'attaquant — jamais servi à
     *  la cible, qui ne sait pas d'où le coup est parti. */
    firedFrom: v.optional(LON_LAT),
    hostCountry: v.string(),
    at: v.number(),
    winner: COMBAT_SIDE,
    outpostId: v.union(v.id('outposts'), v.null()),
    /** Set by a won raid only: the hour the outpost comes back. */
    disabledUntil: v.union(v.number(), v.null()),
    /** **Legacy — plus jamais écrit ni lu** : la domination de test par réduction, remplacée par
     *  les points stratégiques (ADR 0027 §4). Il reste au schéma pour les engagements déjà
     *  écrits, et part au wipe de la saison test. */
    reducedDefender: v.optional(v.boolean()),
    /** **Un choc** (B17) : charge contre charge, les deux camps ont tiré ensemble. Absent, une
     *  passe à l'initiative. */
    shock: v.optional(v.boolean()),
    /**
     * **Au feu, on voit l'ennemi** (F1, 14/10/2026) : la nation de chaque camp au moment de la
     * passe — ses rôles et effectifs sont déjà dans `troops`. Servie à l'autre participant
     * seulement, jamais à la cible d'un bombardement (`facedOf`, `convex/view.ts`). Absente sur
     * un engagement d'avant ce lot, qui garde ses blocs et ses totaux.
     */
    nations: v.optional(
      v.object({
        attacker: v.union(v.string(), v.null()),
        defender: v.union(v.string(), v.null()),
      }),
    ),
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
        /** **À sec** (ADR 0028 §1) : elle aurait tiré, et n'avait plus de coups. */
        dry: v.optional(v.literal(true)),
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
    /** Un bâtiment, ou `outpost` — l'élévation d'un point, qui prend sa place dans la même file
     *  et sous le même `rank` (précision du 15/09 de l'ADR 0020 §10). */
    building: BUILD_COST_KEY,
    regionId: v.string(),
    /**
     * **Quel avant-poste cette ligne monte**, et rien d'autre ne la distingue d'un chantier de
     * bâtiment. `v.optional` sans migration (leçon du 27/08) : les lignes déjà en file n'en
     * portent aucun, et n'en ont aucun besoin — elles bâtissent.
     *
     * `regionId` reste rempli pour l'écran, qui nomme le lieu de tout ce qui est en file ; ce
     * n'est pas une réservation de sol — une élévation ne pose rien, et ni l'espacement ni la
     * règle « une entrée par point » ne la voient (`constructions.ts`).
     */
    outpostId: v.optional(v.id('outposts')),
    level: v.number(),
    rank: v.number(),
    finishesAt: v.union(v.number(), v.null()),
    /** The point the building is ordered on (ADR 0029), carried through the queue so the mast
     *  is drawn there from the moment it is enqueued and `finish` has nothing left to choose.
     *  Absent on an outpost's raise only: the point already stands on its own row. */
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
   * **Un appareil abonné aux notifications, pour un compte** (décision notif-1a). L'`endpoint`
   * est l'identité de l'appareil : un endpoint déjà connu d'un autre compte change de compte, il
   * ne se double pas. Durable comme le compte — la saison qui s'efface ne désabonne personne.
   */
  pushSubscriptions: defineTable({
    accountId: v.id('accounts'),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    deviceLabel: v.string(),
    createdAt: v.number(),
    lastSentAt: v.optional(v.number()),
  })
    .index('byEndpoint', ['endpoint'])
    .index('byAccount', ['accountId']),

  /**
   * **Ce qui attend de partir** : un événement qui compte, déjà mis en phrase, déposé pour un
   * compte et une saison. Le vidage le groupe, le tait ou le retient (repos, présence, heure du
   * télégraphe) ; il n'est jamais relu après son envoi.
   */
  pushQueue: defineTable({
    accountId: v.id('accounts'),
    seasonId: v.id('seasons'),
    type: PUSH_TYPE,
    at: v.number(),
    phrase: v.string(),
    label: v.string(),
    url: v.string(),
  })
    .index('byAccount', ['accountId'])
    .index('bySeason', ['seasonId']),

  /**
   * **Présent à l'écran, à la minute près** — la présence que `players.lastSeenAt` ne peut pas
   * donner, écrite toutes les demi-heures pour ne pas réinvalider la vue de tous. Une table à
   * part, jamais lue par `playerView` : battre toutes les minutes n'invalide personne.
   */
  presences: defineTable({
    playerId: v.id('players'),
    at: v.number(),
  }).index('byPlayer', ['playerId']),

  /**
   * **Ce qu'un joueur a lu** — la fermeture du journal, celle du télégraphe, et l'heure du
   * dernier télégraphe parti en notification. Une ligne par place, hors de `players` pour la
   * raison de `presences` : une écriture ici ne réveille que son lecteur (`convex/readMarks.ts`).
   * Les champs du même nom restent sur `players`, legacy et relus en repli seulement.
   */
  readMarks: defineTable({
    playerId: v.id('players'),
    journalReadAt: v.optional(v.number()),
    telegraphReadAt: v.optional(v.number()),
    /** The hour each private channel was last closed, keyed by the other player's id. */
    telegraphDirectReadAt: v.optional(v.record(v.string(), v.number())),
    telegraphPushedAt: v.optional(v.number()),
    /** **La dernière ouverture du plateau personnel, et les stocks qu'il montrait alors** : la
     *  récolte de la visite suivante est l'écart entre ces stocks et ceux de l'heure. */
    boardReadAt: v.optional(v.number()),
    boardReadStocks: v.optional(v.record(v.string(), v.number())),
    /** **Les premiers pas** (ADR 0027 §2) : les gestes vus faits, et la liste dépliée, repliée
     *  ou passée. Absent : rien de fait, la liste ouverte. */
    firstSteps: v.optional(v.object({ done: v.array(FIRST_STEP), shown: FIRST_STEPS_SHOWN })),
  }).index('byPlayer', ['playerId']),

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
    /** Private message: the only other reader. Absent on the general channel. */
    to: v.optional(v.id('players')),
    /** The lobby's thread, apart from the season's: `true` there, absent in war and on rows
     *  written before the split. Erased at the launch, as the war thread is at the conclusion. */
    lobby: v.optional(v.boolean()),
    /** **Lu à Istanbul** (P11) : le teneur l'a lu ; les deux correspondants voient le tampon. */
    readAtIstanbul: v.optional(v.literal(true)),
  })
    .index('bySeason', ['seasonId'])
    .index('byChannel', ['seasonId', 'lobby', 'to', 'at'])
    .index('byPair', ['seasonId', 'lobby', 'to', 'playerId', 'at'])
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
    /** **Whose column it was**, kept for the memory once the movement is gone. Never served —
     *  except as a nation to the holder of Lisbon (P11). Absent on rows written before it. */
    ownerId: v.optional(v.id('players')),
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

  /**
   * **Les captures en cours** (décision du 14/10) — une ligne par capteur et par site. L'horloge
   * est celle de `src/domain/capture.ts` : ce qui était fait (`progress`) à `progressAt`, et le
   * rythme depuis ; une perte de force relit la ligne au lieu de la remettre à zéro. Arrêtée, la
   * ligne reste datée (`stoppedAt`) le temps que le capteur le lise à « à faire maintenant ».
   */
  captures: defineTable({
    seasonId: v.id('seasons'),
    playerId: v.id('players'),
    defenderId: v.id('players'),
    target: CAPTURE_TARGET,
    site: CAPTURE_SITE,
    /** Où l'infanterie du capteur se tient — le point que sa colonne a marché. */
    point: LON_LAT,
    progress: v.number(),
    progressAt: v.number(),
    rate: v.number(),
    durationMs: v.number(),
    rest: v.union(REST_WINDOW, v.null()),
    completesAt: v.number(),
    stoppedAt: v.optional(v.number()),
  })
    .index('bySeason', ['seasonId'])
    .index('byPlayer', ['playerId'])
    .index('byDefender', ['defenderId']),
});
