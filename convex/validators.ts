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
  v.literal('artillery'),
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
  v.literal('mine'),
  v.literal('oilWell'),
  v.literal('arsenal'),
  v.literal('barracks'),
  v.literal('airfield'),
  v.literal('port'),
  v.literal('listening'),
  v.literal('warehouse'),
  v.literal('depot'), // Persisted buildings, queues and notices remain readable.
  v.literal('city'),
);

/**
 * **Ce qu'une ligne de file peut tarifer** : un bâtiment, ou l'élévation d'un avant-poste
 * (précision du 15/09). `outpost` n'est pas un bâtiment de plus — aucune table de pose ne le
 * connaît — et c'est `constructions.outpostId` qui dit *lequel* (`schema.ts`).
 */
export const BUILD_COST_KEY = v.union(BUILDING_KEY, v.literal('outpost'));

export const SURVEYED_INSTALLATION = v.object({
  buildingId: v.id('buildings'),
  key: BUILDING_KEY,
  /** Where it stood when it was seen (ADR 0029): a capture or a strike marches at this point. */
  point: LON_LAT,
});

export const RESOURCE_KEY = v.union(
  v.literal('food'),
  v.literal('steel'),
  v.literal('coal'),
  v.literal('oil'),
  v.literal('ammunition'),
);

/**
 * **Une dette du socle**, telle qu'un bâtiment l'acquitte : une clé et le gisement sous elle
 * (`settlesDebt`). Elle ne s'écrit qu'en un endroit — la place d'un joueur, quand une démolition
 * emporte le bâtiment qui l'avait payée : le socle est un don de lancement, fait une fois, et
 * une dette relue depuis le sol seul serait redemandée au premier coup de pioche (décision 6a
 * du 15/09).
 */
export const FOUNDATION_DEBT = v.object({
  key: BUILDING_KEY,
  deposit: v.union(
    v.literal('food'),
    v.literal('iron'),
    v.literal('coal'),
    v.literal('oil'),
    v.null(),
  ),
});

export const RESOURCE_AMOUNTS = v.object({
  food: v.number(),
  steel: v.number(),
  coal: v.number(),
  oil: v.number(),
  ammunition: v.number(),
});

/** Le sol sous une chose : la route le porte par tronçon, un camp relevé une fois pour toutes. */
export const MEDIUM = v.union(v.literal('land'), v.literal('sea'), v.literal('air'));

/** One stretch of a route under one medium, shared by movements and immutable return plans. */
export const ROUTE_LEG = v.object({
  medium: MEDIUM,
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
    /** **Ce que le relevé disait de la cible au départ.** L'ordre part sur la foi du relevé, et
     *  le bâtiment peut ne plus être là à l'arrivée : c'est d'ici que la dépêche d'échec tire
     *  son nom et sa région. Absent sur une expédition partie avant le champ. */
    surveyed: v.optional(v.object({ key: BUILDING_KEY, regionId: v.string() })),
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

export const SEASON_MODE = v.union(v.literal('blitz'), v.literal('mondiale'));

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

/**
 * **Le site qu'une capture vise, tel que les deux camps le nomment** : un bâtiment par sa clé et
 * sa région, un avant-poste par son pays et son niveau. Jamais celui qui capture — le défenseur ne
 * le voit pas, il voit un bloc s'il le relève.
 */
/** Les sept du vivier (`STRATEGIC_POINTS`) : un point hors de cette liste n'a pas de règle. Une
 *  clé du domaine absente d'ici refuse son écriture au typage (`strategicPoints.layOut`). */
export const STRATEGIC_POINT_KEY = v.union(
  v.literal('tangier'),
  v.literal('istanbul'),
  v.literal('rangoon'),
  v.literal('hongKong'),
  v.literal('halifax'),
  v.literal('narvik'),
  v.literal('lisbon'),
);

export const CAPTURE_SITE = v.union(
  v.object({ kind: v.literal('building'), building: BUILDING_KEY, regionId: v.string() }),
  v.object({ kind: v.literal('outpost'), hostCountry: v.string(), level: v.number() }),
  v.object({ kind: v.literal('point'), key: STRATEGIC_POINT_KEY }),
);

export const CAPTURE_TARGET = v.union(
  v.object({ kind: v.literal('building'), buildingId: v.id('buildings') }),
  v.object({ kind: v.literal('outpost'), outpostId: v.id('outposts') }),
  v.object({ kind: v.literal('point'), pointId: v.id('strategicPoints') }),
);

const CAPTURE_SIDE = v.union(v.literal('capturer'), v.literal('defender'));

export const NOTICE = v.union(
  /** **La capture commence** (décision du 14/10) : une alarme chez le défenseur, une nouvelle
   *  chez le capteur. L'heure est celle de la perte si rien ne change. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('captureStarted'),
    side: CAPTURE_SIDE,
    site: CAPTURE_SITE,
    point: LON_LAT,
    completesAt: v.number(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('captureSucceeded'),
    side: CAPTURE_SIDE,
    site: CAPTURE_SITE,
    point: LON_LAT,
  }),
  /** Plus aucune infanterie du capteur sur place, ou le site n'est plus à qui l'on visait. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('captureCancelled'),
    side: CAPTURE_SIDE,
    site: CAPTURE_SITE,
    point: LON_LAT,
    /** `left` : plus d'infanterie sur place ; `gone` : le site rasé ou pris par un autre. */
    reason: v.optional(v.union(v.literal('left'), v.literal('gone'))),
  }),
  /** L'entrée que le monde a reprise avant son tour, remboursée entière. `BUILD_COST_KEY` parce
   *  qu'une élévation d'avant-poste se rembourse par la même porte (précision du 15/09). */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('constructionCancelled'),
    building: BUILD_COST_KEY,
    regionId: v.string(),
    /** **Perdu à la fin du chantier** (ADR 0029) : le gisement pris par un autre — relevé du même
     *  coup —, ou un bâtiment à soi venu trop près. Absent : le droit perdu avant son tour. */
    reason: v.optional(v.union(v.literal('depositTaken'), v.literal('tooClose'))),
  }),
  /** **Un bâtiment rasé par son propriétaire** (demande du 15/09). Chez lui seul : ce que la
   *  démolition change chez les autres se relève, il ne s'annonce pas (ADR 0005). */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('buildingDemolished'),
    building: BUILDING_KEY,
    regionId: v.string(),
    level: v.number(),
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
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
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
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
    resolvesAt: v.number(),
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('outpostFounded'),
    hostCountry: v.string(),
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
    specialization: SPECIALIZATION,
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('outpostDisabled'),
    hostCountry: v.string(),
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
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
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
    headingDegrees: v.number(),
    detector: DETECTOR,
    /** The region a station listens from, and nothing else: it is the one detector the player
     *  can point at on his own map by name. A country would not tell two stations apart. */
    detectorRegion: v.union(v.string(), v.null()),
  }),
  /**
   * **Une force posée relevée dans la portée** (ADR 0024 §1). La sœur immobile de la précédente,
   * et elle en dit encore moins : pas de cap, puisqu'un camp ne va nulle part. Le pays nommé est
   * celui d'où l'on regarde, jamais la nation de ce qu'on a vu.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('campSighted'),
    hostCountry: v.string(),
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
    detector: DETECTOR,
    detectorRegion: v.union(v.string(), v.null()),
  }),
  /** **La poursuite abandonnée** (Blitz, B18) : la cible est sortie de notre vue, la colonne
   *  s'arrête à sa dernière position connue. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('pursuitLost'),
    hostCountry: v.string(),
    point: LON_LAT,
  }),
  /** **Des troupes à sec** (ADR 0028 §1) : elles auraient tiré, et n'avaient plus de coups. Rien
   *  d'autre ne le dit, et c'est la différence entre une défaite et une faute de ravitaillement. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('firedDry'),
    hostCountry: v.string(),
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
    /** Combien n'ont pas tiré ; absent sur les lignes d'avant les coups (18/10). */
    troops: v.optional(v.number()),
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
  /**
   * **Un avant-poste qui a grandi** (précision du 15/09 de l'ADR 0020 §10). Chez le seul
   * propriétaire : un point qui monte se **relève** — son rayon élargi entre dans les portées de
   * qui regarde — il ne s'annonce pas (ADR 0005).
   *
   * `regionId` est `null` pour un point d'avant le champ, que seule la géographie replace.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('outpostRaised'),
    hostCountry: v.string(),
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
    regionId: v.union(v.string(), v.null()),
    level: v.number(),
  }),
  /**
   * **Le point démantelé par son propriétaire** (décision de Pierre, 16/09). Chez lui seul, comme
   * tout ce qui touche à ses points : l'adversaire voit la couleur disparaître de sa carte s'il
   * regardait, et c'est son relevé qui le lui dira (ADR 0020 §5).
   *
   * `buildings` est le nombre de mâts que le point ancrait et qui tombent avec lui (décision 1a) —
   * zéro la plupart du temps, et c'est justement quand il ne l'est pas qu'il faut le lire.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('outpostDismantled'),
    hostCountry: v.string(),
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
    level: v.number(),
    buildings: v.number(),
  }),
  /**
   * **Le chantier est devenu un point** (révision du 15/09 de l'ADR 0020 §10). Chez le seul
   * propriétaire : ce qui s'annonce est le sol qui vient de prendre sa couleur, et l'adversaire
   * le lit sur sa propre carte s'il regardait (ADR 0005).
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('outpostStands'),
    hostCountry: v.string(),
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
    specialization: SPECIALIZATION,
  }),
  /**
   * **Le chantier est mort avec sa garnison** — partie entière ou détruite avant le lever. Rien
   * n'est remboursé : ce qui est dépensé l'est (cohérence avec la file de chantier), et la
   * dépêche est ce qui rend la perte lisible plutôt qu'un point qui disparaît sans un mot.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('foundationLost'),
    hostCountry: v.string(),
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
    specialization: SPECIALIZATION,
  }),
  /**
   * **Ce que le large a pris** (règle 4 du 18/09). Chez le seul propriétaire : ce qu'un
   * adversaire en apprend, il l'a vu couler. Le lieu est un **point** et pas un pays — au large
   * il n'y en a aucun, et les degrés sont le seul nom qu'une place sans nom possède
   * (`fr.aim.pointAt`). Les hommes et les machines sont comptés séparément parce qu'une passe se
   * raconte dans ces deux unités et jamais en nombre de troupes (ADR 0014).
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('drownedAtSea'),
    point: LON_LAT,
    men: v.number(),
    machines: v.number(),
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
   * `nation` porte le drapeau du joueur, ou son pseudonyme quand il n'en a pas pris : le journal
   * n'a pas d'autre nom à donner à un siège.
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
  /** **Un QG tombé en Blitz** (B10) : public comme une capitulation, et pour la même raison. Qui
   *  l'a capturé (`by`) ne se dit qu'au perdant et au capteur : aux autres, ce serait un relevé
   *  gratuit de qui tient désormais tout ce sol. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('playerEliminated'),
    nation: v.string(),
    by: v.optional(v.string()),
    /** En Mondiale, ce qu'il tenait passe au siège irrégulier (M16) ; absent en Blitz. */
    irregulars: v.optional(v.literal(true)),
  }),
  /** **Un point stratégique change de teneur** (P2) : public, déposé chez toute la table. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('pointTaken'),
    key: STRATEGIC_POINT_KEY,
    nation: v.string(),
    point: v.optional(LON_LAT),
  }),
  /** **Les Sept sont posés** (P11) : la une du jour 0, chez toute la table. */
  v.object({ ...NOTICE_HEAD, kind: v.literal('pointsDrawn') }),
  /** **Lu à Istanbul** (P11) : au teneur, le télégramme ; aux deux correspondants, le fait. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('readAtIstanbul'),
    from: v.string(),
    to: v.string(),
    text: v.optional(v.string()),
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
  /**
   * **L'expédition est arrivée devant rien.** Le relevé datait : le bâtiment a été rasé, ou un
   * autre l'a mis à l'arrêt avant elle. L'ordre n'est plus refusé au départ pour cela — le refus
   * disait à distance ce que seul le terrain doit apprendre (ADR 0005) —, donc c'est ici que le
   * joueur l'apprend, sur place.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('expeditionFoundNothing'),
    building: BUILDING_KEY,
    regionId: v.string(),
    reason: v.union(v.literal('gone'), v.literal('disabled')),
  }),
  /**
   * **Un objectif neutre, annoncé à tout le monde au lancement** (objectifs neutres, 17/09/2026).
   * C'est le garde-fou de la proposition du 29/08 : un PVE que chacun découvre dans son coin fait
   * farmer côte à côte, un PVE public fait converger. Ce qu'elle nomme est le lieu et l'archétype,
   * jamais la garnison — on sait où aller, pas ce qu'on y trouvera.
   *
   * `objective` est la clé d'archétype, chaîne pour la raison que le schéma donne : la palette est
   * une donnée.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('objectiveRevealed'),
    objective: v.string(),
    hostCountry: v.string(),
    regionId: v.string(),
  }),
  /** **Le dépôt est vide**, et personne n'est nommé : qui l'a emporté est de l'information de
   *  position, et le brouillard la garde (ADR 0005). Le preneur, lui, lit ses dépêches de butin. */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('objectiveTaken'),
    objective: v.string(),
    hostCountry: v.string(),
    regionId: v.string(),
  }),
  /**
   * **Aucune réserve entre ces deux-là.** Une paire de voisins que la carte sépare — un océan, ou
   * simplement aucune région qui soit un détour pour les deux — n'a pas d'objectif dur, et le
   * silence se lirait comme un oubli. Les deux noms sont ceux des nations, publics comme le reste
   * de la pose.
   */
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('objectiveGap'),
    nations: v.array(v.string()),
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
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
    loot: RESOURCE_AMOUNTS,
  }),
  v.object({
    ...NOTICE_HEAD,
    kind: v.literal('lootCollected'),
    hostCountry: v.string(),
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
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
    /** Where it happened, for the journal's locate button; absent on rows written before. */
    point: v.optional(LON_LAT),
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
const STORED_TARGET = v.union(
  v.object({ kind: v.literal('region'), regionId: v.string() }),
  v.object({ kind: v.literal('outpost'), outpostId: v.id('outposts') }),
  v.object({ kind: v.literal('point'), point: LON_LAT }),
  v.object({ kind: v.literal('building'), buildingId: v.id('buildings') }),
);

/**
 * **Ce qu'un ordre peut nommer sur le fil**, qui n'est pas ce que le document garde : un camp
 * relevé (ADR 0024 §4) est une cible **et jamais une cible stockée** — `aimOf` le résout en sa
 * position, et c'est la position que la colonne marche. Le mettre dans `MOVEMENT_TARGET` aurait
 * laissé le schéma accepter une forme que rien n'écrit.
 */
export const ATTACK_TARGET = v.union(
  STORED_TARGET,
  v.object({ kind: v.literal('camp'), campId: v.id('campSightings') }),
  /** **Un objectif neutre** se nomme de la même façon et pour la raison inverse : il n'est pas
   *  stocké comme cible parce qu'il *est* un point — celui de sa région —, et c'est ce point que
   *  la colonne marche. Ce qui reste sur le document est `movements.objectiveId`, qui dit
   *  pourquoi elle y va. */
  v.object({ kind: v.literal('objective'), objectiveId: v.id('objectives') }),
  /** **Une colonne adverse en vue**, que la Blitz seule poursuit (B18) : nommée par l'arc que la
   *  vue sert, donc par son mouvement ; le serveur relit le relevé que ce joueur en tient. */
  v.object({ kind: v.literal('track'), movementId: v.id('movements') }),
);

/**
 * The same, plus the one nobody orders: a column on its way back to what it hangs from. Every
 * form of an address answers here, because a return goes back to the one it left with: an
 * **outpost** for a garrison — the same coordinate, read back by the arrival to know it becomes
 * the garrison there — a **point** for a column that was standing on plain ground, and `home`
 * for the one anchor that is not a document, the national soil.
 */
export const MOVEMENT_TARGET = v.union(STORED_TARGET, v.object({ kind: v.literal('home') }));

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
 *
 * **`'riposte'` a repris du service** avec l'initiative (grilling du 14/10, B16) : la frappe de
 * l'attaquant porte `'strike'`, la réponse du défenseur `'riposte'`. Les engagements écrits sous
 * la passe simultanée (16/09 → 14/10) portent `'strike'` des deux côtés ; le côté du tireur se lit
 * toujours dans `bySide`.
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

/** Les six genres de notification, ceux des cases des Réglages (`src/domain/push.ts`). */
export const PUSH_TYPE = v.union(
  v.literal('attack'),
  v.literal('outpost'),
  v.literal('sighting'),
  v.literal('dryFire'),
  v.literal('season'),
  v.literal('telegraph'),
);

export const PUSH_PREFERENCES = v.object({
  attack: v.boolean(),
  outpost: v.boolean(),
  sighting: v.boolean(),
  dryFire: v.boolean(),
  season: v.boolean(),
  telegraph: v.boolean(),
});

/** Pourquoi une Blitz lancée est revenue au salon (`blitz.abandon`). */
export const LAUNCH_REFUSAL = v.union(v.literal('BLITZ_MAP_UNFAIR'), v.literal('BLITZ_MAP_FAILED'));

/** `VerdictReason` (`src/domain/blitz.ts`), et le revenu du vainqueur quand l'horloge a tranché. */
export const VERDICT = v.object({
  reason: v.union(
    v.literal('hqTaken'),
    v.literal('lastStanding'),
    v.literal('income'),
    v.literal('draw'),
    /** Mondiale : quatre points tenus 24 h ; à l'horloge, le cumul d'heures, puis le territoire. */
    v.literal('points'),
    v.literal('clock'),
    v.literal('territory'),
  ),
  perMinute: v.optional(v.number()),
});
