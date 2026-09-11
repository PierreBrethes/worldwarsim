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

/** A point on the globe, in degrees; named fields keep longitude and latitude ordered. */
export const LON_LAT = v.object({ lon: v.number(), lat: v.number() });

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
  v.literal('depot'), // Persisted buildings, queues and notices remain readable.
);

export const SURVEYED_INSTALLATION = v.object({
  buildingId: v.id('buildings'),
  key: BUILDING_KEY,
});

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

export const RESOURCE_AMOUNTS = v.object({
  food: v.number(),
  textile: v.number(),
  coal: v.number(),
  oil: v.number(),
  ore: v.number(),
  alloy: v.number(),
  ammunition: v.number(),
  bandages: v.number(),
});

/** One stretch of a route under one medium, shared by movements and immutable return plans. */
export const ROUTE_LEG = v.object({
  medium: v.union(v.literal('land'), v.literal('sea'), v.literal('air')),
  distanceUnits: v.number(),
});

const PLUNDER_RETURN_PLAN = v.union(
  v.object({
    kind: v.literal('standing'),
    regionId: v.string(),
    point: LON_LAT,
  }),
  v.object({
    kind: v.literal('route'),
    regionId: v.string(),
    point: LON_LAT,
    hostCountry: v.string(),
    points: v.array(LON_LAT),
    legs: v.array(ROUTE_LEG),
    distanceUnits: v.number(),
    costUnits: v.number(),
    landCost: v.number(),
    minutes: v.number(),
  }),
);

export const LOOT_DELIVERY = v.object({
  regionId: v.string(),
  point: LON_LAT,
});

export const LOOT_LOAD = v.object({
  loot: RESOURCE_AMOUNTS,
  plunderReportId: v.optional(v.id('plunderReports')),
  recoveryId: v.optional(v.id('lootRecoveries')),
  collectionId: v.optional(v.id('lootCollections')),
});

export const LOOT_COLLECTION_MISSION = v.object({
  sightingId: v.id('lootCrateSightings'),
  crateId: v.id('lootCrates'),
  orderedAt: v.number(),
});

export const PLUNDER_MISSION = v.union(
  v.object({
    phase: v.literal('outbound'),
    buildingId: v.id('buildings'),
    returnRegionId: v.optional(v.union(v.string(), v.null())),
  }),
  v.object({
    phase: v.literal('presence'),
    buildingId: v.id('buildings'),
    until: v.number(),
    engagementId: v.union(v.id('engagements'), v.null()),
    returnRegionId: v.optional(v.union(v.string(), v.null())),
    returnPlan: v.optional(v.union(PLUNDER_RETURN_PLAN, v.null())),
  }),
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

/** L'horloge d'une saison, `null` quand elle n'en a pas : on la clôt à la main
 *  (`seasons.conclude`). Aucun écran n'affiche alors de compte à rebours. */
export const SEASON_CLOCK_HOURS = v.union(v.literal(48), v.literal(168), v.null());

/** Extraction is gone from the list (fiche 03, 18/08): an outpost replaces no building. */
export const SPECIALIZATION = v.union(v.literal('relay'), v.literal('listening'));

/**
 * **What saw a movement go past** (design sheet 04). Four detectors, in the order the sheet
 * ranks them: the soil itself, the listening station, the listening outpost, and the posted
 * troop that was the only one in the code until now.
 *
 * The territory has no radius and no document — it is the ground, not a thing standing on it —
 * so `detectorId` is null for it, as it is for a camp: a posted force is a pile at a point, and
 * a pile is not a row (`postedForces`).
 */
export const DETECTOR = v.union(
  v.literal('territory'),
  v.literal('station'),
  v.literal('outpost'),
  v.literal('troop'),
);

/**
 * **What the journal owes a player, one shape per kind** — a union of whole documents rather
 * than one document with nine optional fields (convention §8). A sighting structurally carries
 * no building and a finished site no heading, so no job can file a row half-filled and no
 * reader can print a field its kind never had.
 *
 * Every kind is written by the job that *does* the thing, never derived on reading: the journal
 * answers "what changed while I was away", and a client that recomputed it would answer "what
 * is true now" — two different questions, and only the first one is the game's.
 *
 * Ids and numbers only, like everything else that crosses the wire (ADR 0016): the French is
 * put on these by `src/domain/journal.ts`.
 */
const NOTICE_HEAD = { playerId: v.id('players'), at: v.number() };

/** Where a delivered batch came out of, `null` when the site was razed while it was forming —
 *  the troop comes home rather than dying for it (`troops.deliver`), and the dispatch says so. */
const NOTICE_SITE = v.union(v.object({ building: BUILDING_KEY, regionId: v.string() }), v.null());

export const NOTICE = v.union(
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('constructionCancelled'),
    building: BUILDING_KEY,
    regionId: v.string(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('constructionFinished'),
    building: BUILDING_KEY,
    regionId: v.string(),
    level: v.number(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('recruitmentDelivered'),
    role: UNIT_ROLE,
    site: NOTICE_SITE,
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('columnArrived'),
    movementType: v.union(v.literal('march'), v.literal('recall'), v.literal('return')),
    hostCountry: v.string(),
    troops: v.number(),
  }),
  /** **A march that ended inside one of the player's buildings** (decision 64b): the address is
   *  named, building and region, because « a pris position — France » would not say which port
   *  now holds the infantry the cargo is waiting for. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('garrisonEntered'),
    building: BUILDING_KEY,
    regionId: v.string(),
    troops: v.number(),
  }),
  /** The hour the border lets it through — what a player discovers on waking, and the one
   *  thing the journal's own "au réveil" column is for (fiche 11 §4.1). */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('movementStalled'),
    hostCountry: v.string(),
    resolvesAt: v.number(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('outpostFounded'),
    hostCountry: v.string(),
    specialization: SPECIALIZATION,
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('outpostDisabled'),
    hostCountry: v.string(),
    specialization: SPECIALIZATION,
  }),
  /**
   * **La production reliée qui mord, et qui lâche** (ADR 0020 §6). Le compte, jamais la liste :
   * la dépêche dit qu'il faut aller voir, la carte « à faire maintenant » dit lesquels. Chez le
   * seul propriétaire — l'adversaire qui a coupé la frontière le lit sur sa carte, et une ligne
   * chez lui lui donnerait ce que son renseignement n'a pas payé.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('productionCut'),
    sites: v.number(),
    hostCountry: v.string(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('productionRestored'),
    sites: v.number(),
    hostCountry: v.string(),
  }),
  /**
   * **A thread, a place and a heading — nothing else exists to file** (fiche 04). No type, no
   * composition, no nation: the row carries what a sentry can honestly report, so the dispatch
   * could not leak what the fog hides even if its sentence tried.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('movementSighted'),
    hostCountry: v.string(),
    headingDegrees: v.number(),
    detector: DETECTOR,
    /** The region a station listens from, and nothing else: it is the one detector the player
     *  can point at on his own map by name. A country would not tell two stations apart. */
    detectorRegion: v.union(v.string(), v.null()),
  }),
  /** A pass fought at `DRY_AMMUNITION_FACTOR` because the magazine could not cover it. Nothing
   *  else on the board says it, and it is the difference between a defeat and a supply fault. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('firedDry'),
    hostCountry: v.string(),
  }),
  /**
   * **Legacy — plus jamais écrites.** Les trois dépêches du leurre, retiré du jeu le 29/08/2026.
   * Rien ne les insère plus et `convex/view.ts` ne les sert plus ; elles restent ici parce que
   * les lignes déjà déposées dans le journal d'une saison en cours les portent, et qu'un
   * littéral retiré d'une union fait refuser la poussée du schéma (leçon du 27/08). Elles
   * partent au prochain wipe, avec la saison qui les a écrites (ADR 0001).
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('decoyExposed'),
    hostCountry: v.string(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('decoyBlown'),
    hostCountry: v.string(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('decoyArrived'),
    hostCountry: v.string(),
  }),
  /** **La saison close à la main par son fondateur** (`seasons.conclude`) — la seule fin qui ne
   *  désigne personne : elle n'a pas de vainqueur, et le journal ne doit pas en inventer un. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('seasonClosed'),
  }),
  /**
   * **Une capitulation, et la main qu'elle passe** (`players.surrender`). Publiques toutes les
   * deux, et déposées chez tout le monde : qui ne joue plus change la table, et qui commande la
   * partie décide de sa fin — aucun des deux n'est un secret que le brouillard aurait à garder.
   *
   * `nation` porte le drapeau du joueur, ou son pseudonyme quand il n'en a pas pris : c'est la
   * même paire que `warEntries` sert, et le journal n'a pas d'autre nom à donner à un siège.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('playerSurrendered'),
    nation: v.string(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('commandTransferred'),
    nation: v.string(),
  }),
  /**
   * **L'édition du classement a paru** (`propositions/classement-bareme.md` §4). Le rendez-vous
   * collectif que l'audit du 25/08 réclamait, à coût nul : tout le monde la reçoit à la même
   * heure, et c'est la seule chose du jeu qui arrive à tout le monde en même temps.
   *
   * **Un rang, et rien d'autre.** Pas de score, et surtout pas celui des autres : la page de
   * presse est là pour ça, et une dépêche qui chiffrerait la table ferait du journal une seconde
   * source à tenir d'accord avec la première.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('editionPublished'),
    rank: v.number(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('lootTaken'),
    building: BUILDING_KEY,
    regionId: v.string(),
    loot: RESOURCE_AMOUNTS,
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('sitePlundered'),
    building: BUILDING_KEY,
    regionId: v.string(),
    taken: RESOURCE_AMOUNTS,
    storageLost: RESOURCE_AMOUNTS,
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('siteSabotaged'),
    building: BUILDING_KEY,
    regionId: v.string(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('lootLost'),
    loot: RESOURCE_AMOUNTS,
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('lootRecovered'),
    hostCountry: v.string(),
    loot: RESOURCE_AMOUNTS,
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('lootCollected'),
    hostCountry: v.string(),
    loot: RESOURCE_AMOUNTS,
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('lootDelivered'),
    regionId: v.string(),
    delivered: RESOURCE_AMOUNTS,
    lost: RESOURCE_AMOUNTS,
  }),
  /**
   * **The one event of the game that used to leave no trace at all.** An attack or a raid that
   * walks onto empty ground files no engagement — there was no pass — so without this row the
   * player reads "rien à signaler" after the longest march of his season.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('columnFoundNothing'),
    movementType: v.union(v.literal('attack'), v.literal('raid')),
    hostCountry: v.string(),
    troops: v.number(),
    /**
     * **Ce que la colonne a trouvé debout, quand personne ne le gardait** (retours du 11/09,
     * ligne 5). Une attaque vise un point ou une pile, jamais un bâtiment : sur une région
     * adverse sans garnison elle est bredouille, et le joueur qui venait pour la mine relit
     * « n'a trouvé personne » sans savoir que l'ordre qu'il cherchait existe. C'est la clé du
     * bâtiment **déjà relevé** par cette colonne — rien de neuf ne sort du serveur, le relevé
     * le sert depuis S8 — et la dépêche dit par où l'atteindre.
     */
    installation: v.optional(BUILDING_KEY),
  }),
);

/**
 * The five kinds of movement of the design, plus the one the resolution creates on its own, plus
 * `recall`, which nobody orders any more (ADR 0019 §1) and which stays here on purpose: a column
 * recalled before the change is still walking, and dropping the literal would make its document
 * unreadable to the very mutation that has to land it. `agent` alone still waits for the fog
 * surfaces; the union is the vocabulary, and narrowing it to what is coded would make every
 * later kind a schema migration.
 *
 * **`decoy` est legacy — plus jamais écrit.** Le leurre a été retiré du jeu le 29/08/2026 et il
 * a quitté le vocabulaire du domaine (`src/domain/ids.ts`) ; le littéral reste ici seul, parce
 * qu'un leurre encore en vol porte ce mot en base et qu'une union rétrécie fait refuser la
 * poussée du schéma (leçon du 27/08). `convex/view.ts` ne sert plus ces lignes, leur arrivée les
 * efface sans rien faire, et le mot partira au prochain wipe.
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

export const TROOP_ADDRESS = v.union(v.id('buildings'), v.id('outposts'), LON_LAT, v.null());

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
 * What a march is aimed at: a region somebody holds, an outpost, a plain point of the map, or
 * **a building of the player's own** (decision 64b) — the one target a column enters rather
 * than stands at. A raid only ever takes the second, a garrison entry only the last —
 * `refusalOf` says which, here as on the client.
 *
 * The point is the form that answers at every scale (ADR 0019 §1), and it is stored as it was
 * aimed: nothing resolves it into the region it may fall in, so the document says exactly where
 * the player pointed.
 */
export const ATTACK_TARGET = v.union(
  v.object({ kind: v.literal('region'), regionId: v.string() }),
  v.object({ kind: v.literal('outpost'), outpostId: v.id('outposts') }),
  v.object({ kind: v.literal('point'), point: LON_LAT }),
  v.object({ kind: v.literal('building'), buildingId: v.id('buildings') }),
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
 * The same, plus the one nobody orders: a column on its way back to what it hangs from. Every
 * form of an address answers here, because a return goes back to the one it left with: an
 * **outpost** for a garrison — the same coordinate, read back by the arrival to know it becomes
 * the garrison there — a **point** for a column that was standing on plain ground, and `home`
 * for the one anchor that is not a document, the national soil.
 */
export const MOVEMENT_TARGET = v.union(ATTACK_TARGET, v.object({ kind: v.literal('home') }));

export const COMBAT_SIDE = v.union(v.literal('attacker'), v.literal('defender'));

export const TROOP_STATE = v.union(
  v.literal('standing'),
  v.literal('routed'),
  v.literal('destroyed'),
);

/**
 * One strike of a resolution pass, in men and machines. Shared between the table that holds the
 * detail (`strikes`) and the legacy array still lying in the engagements written before it — one
 * shape, so a row of one is readable as a row of the other for as long as both exist.
 */
export const STRIKE = {
  phase: v.union(v.literal('strike'), v.literal('riposte')),
  by: v.id('troops'),
  byRole: UNIT_ROLE,
  byTier: UNIT_TIER,
  bySide: COMBAT_SIDE,
  target: v.id('troops'),
  targetRole: UNIT_ROLE,
  targetTier: UNIT_TIER,
  losses: v.number(),
};

/**
 * One stretch of a route under a single medium. It travels with the movement because the map
 * draws the thread from it — a polyline alone cannot say where the column embarks, and the
 * dock is a third of what a combined trip costs (`src/domain/route-timing.ts`).
 */
export const REST_WINDOW = v.object({
  startMinutes: v.number(),
  endMinutes: v.number(),
});
