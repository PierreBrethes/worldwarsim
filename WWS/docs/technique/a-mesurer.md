<!-- Généré par `node scripts/generate-a-mesurer.mjs` depuis les marqueurs `@a-mesurer` — ne pas éditer à la main. Empreinte du contenu source : 845b15e -->

# Les constantes à mesurer

Une ligne de ce registre est **une valeur en attente de son instrument** : posée pour que la
règle existe et se lise, jamais pour équilibrer quoi que ce soit. Ni une dette, ni un TODO —
`WWS/QUESTIONS.md` porte les questions, les prompts portent le travail. Quand le simulateur en
mesure une, on retire son marqueur et la ligne disparaît à la régénération : le registre a
vocation à se vider, et sa taille mesure la dette de calibrage.

154 valeurs marquées dans `convex/` et `src/domain/`.

**Les tables économiques n'y figurent pas** — `BUILDING_SPEC`, `COST_BY_ROLE`,
`EXTRACTION_PER_HOUR`, `FACTORY_LINES` et leurs voisines : l'en-tête de `convex/constants.ts` les
déclare placeholders en bloc, depuis le retrait du simulateur d’ouverture (17/10/2026). Les tables de transport sans instrument y restent, une ligne
exhaustive par table. Le registre sert les valeurs que rien ne mesure encore.

| Constante | Valeur | Où | Pourquoi elle attend |
| --- | --- | --- | --- |
| `HEAP_CAP_HOURS` | `24` | `convex/constants.ts:55` | l'ADR le pose, aucune partie ne l'a joué |
| `FACTORY_LINES` | `{ ammunition: { output: 'ammunition', inputs: [ ['coal', 1], ['steel', 1], ], perHourPerLevel: 3 }, oil: { output: 'oil', inputs: [['coal', 3]], perHourPerLevel: 3 } }` | `convex/constants.ts:66` | one of each a round, three an hour and a level, and three coal for one oil: set by |
| `DAKAR_SPARED_PER_RESOURCE` | `600` | `convex/constants.ts:111` | 600 de la décision du 20/10, jamais joué |
| `STORAGE_CAP_PER_LEVEL` | `600` | `convex/constants.ts:112` | 600 de la décision du 20/10, jamais joué |
| `BUILDING_SPEC` | `{ hq: { cost: { steel: 60, coal: 40 }, minutes: 45 }, farm: { cost: { steel: 20, coal: 8 }, minutes: 20 }, mine: { cost: { steel: 30, coal: 10 }, minutes: 30 }, oilWell: { cost: { steel: 45, coal: 12 }, minutes: 40 }, arsenal: { cost: { steel: 60, coal: 20 }, minutes: 55 }, barracks: { cost: { steel: 40, food: 30 }, minutes: 40 }, airfield: { cost: { steel: 70, oil: 20 }, minutes: 70 }, port: { cost: { steel: 65, coal: 20 }, minutes: 65 }, listening: { cost: { steel: 35, coal: 15 }, minutes: 40 }, // De l'ordre de la caserne (#123), à mesurer comme le reste du barème. researchCenter: { cost: { steel: 45, coal: 30 }, minutes: 45 }, warehouse: { cost: { steel: 30, coal: 10 }, minutes: 25 }, // Legacy tariffs still price queued work, refunds and industry. depot: { cost: { steel: 40, coal: 15 }, minutes: 30 }, // La ville de la Blitz ne se bâtit pas (`BUILDABLE_BUILDINGS`) : le barème l'exige, rien ne le lit. city: { cost: {}, minutes: 0 } }` | `convex/constants.ts:122` | the second figure of the three extractors is new; set by eye against their steel, |
| `STARTING_OIL` | `90` | `convex/constants.ts:173` | 90 depuis le modèle de #158, jamais joué |
| `STARTING_AMMUNITION` | `80` | `convex/constants.ts:181` | never calibrated; the simulator does not model combat |
| `LEVEL_COST_FACTOR` | `2.0` | `convex/constants.ts:233` | 2,0 depuis le modèle de #158, jamais joué |
| `OUTPOST_RAISE_SPEC` | `{ cost: { steel: 65, food: 20 }, minutes: 65 }` | `convex/constants.ts:251` | calé sur le port, jamais mesuré sur une partie ; mesure attendue — avant-postes debout par joueur au jour 7 de la première saison (décision 7a du 15/09) |
| `RESPECIALTY_STEEL_SHARE` | `0.5` | `convex/constants.ts:276` | la moitié : tranchée au grilling (Q13), aucune partie ne l'a jouée |
| `STARTING_STOCK` | `{ food: 120, coal: 140 }` | `convex/constants.ts:300` | the coal was 20 when only steel priced a projection; 140 is the sea route's bill |
| `CARRY_CAPACITY_BY_ROLE` | `{ infantry: 40, armor: 0, landTransport: 120, artillery: 0, fighter: 0, bomber: 0, airTransport: 80, escort: 0, cargo: 240, carrier: 0 }` | `convex/constants.ts:349` | every role; no season simulation models plunder cargo yet |
| `COST_BY_ROLE` | `{ infantry: { steel: 18, family: 10, minutes: 20 }, armor: { steel: 95, family: 30, minutes: 70 }, landTransport: { steel: 40, family: 12, minutes: 45 }, artillery: { steel: 80, family: 25, minutes: 60 }, fighter: { steel: 110, family: 35, minutes: 90 }, bomber: { steel: 160, family: 50, minutes: 120 }, airTransport: { steel: 90, family: 30, minutes: 75 }, escort: { steel: 175, family: 55, minutes: 180 }, cargo: { steel: 120, family: 40, minutes: 100 }, carrier: { steel: 430, family: 130, minutes: 480 } }` | `convex/constants.ts:387` | the family figure is about a third of the steel for machines and ships, and ten |
| `RESEARCH_SPEC` | `{ infantryMk2: { hours: 8, cost: { steel: 60, food: 40 } }, armor: { hours: 16, cost: { steel: 120, oil: 60 } }, armorMk2: { hours: 28, cost: { steel: 180, oil: 80 } }, artillery: { hours: 12, cost: { steel: 100, oil: 40 } }, escort: { hours: 12, cost: { steel: 120, coal: 60 } }, carrier: { hours: 36, cost: { steel: 400, coal: 150 } }, aviation: { hours: 12, cost: { steel: 100, oil: 60 } }, bomber: { hours: 20, cost: { steel: 140, oil: 80 } }, airlift: { hours: 10, cost: { steel: 80, oil: 40 } }, syntheticOil: { hours: 18, cost: { steel: 100, coal: 100 } }, listening: { hours: 10, cost: { steel: 60, coal: 60 } }, transmissions1: { hours: 10, cost: { steel: 60, coal: 60 } }, transmissions2: { hours: 16, cost: { steel: 100, coal: 90 } }, transmissions3: { hours: 24, cost: { steel: 160, coal: 130 } } }` | `convex/constants.ts:414` | l'artefact ×10, jamais joué |
| `SUPPLY_BY_ROLE` | `{ infantry: { rounds: 3, fuel: 0 }, armor: { rounds: 2, fuel: 3 }, landTransport: { rounds: 0, fuel: 4 }, artillery: { rounds: 2, fuel: 2 }, fighter: { rounds: 2, fuel: 3 }, bomber: { rounds: 2, fuel: 3 }, airTransport: { rounds: 0, fuel: 3 }, escort: { rounds: 3, fuel: 6 }, cargo: { rounds: 0, fuel: 6 }, carrier: { rounds: 3, fuel: 6 } }` | `convex/constants.ts:441` | la table de la proposition (Q20), jamais jouée |
| `SUPPLY_STEP_COST` | `10` | `convex/constants.ts:459` | la proposition le pose, aucune partie ne l'a joué |
| `FUEL_STEP_KM` | `500` | `convex/constants.ts:466` | ≈ 500 km de l'ADR 0028, jamais joué |
| `SINGAPORE_FUEL_DISCOUNT_PCT` | `20` | `convex/constants.ts:473` | −20 % de la décision du 20/10, jamais joué |
| `NARVIK_UNLINKED_SHARE` | `0.25` | `convex/constants.ts:481` | 25 % de la décision du 20/10, jamais joué |
| `BAKU_REFUEL_MS` | `12 * 3_600_000` | `convex/constants.ts:489` | 12 h de la décision du 20/10, jamais joué |
| `DEPOT_CAPACITY_PER_LEVEL` | `400` | `convex/constants.ts:497` | la proposition le pose, aucune partie ne l'a joué |
| `STORE_DEPOT_FACTOR` | `2` | `convex/constants.ts:504` | le double : ce que le POC a pris (`WWS/prototypes/avant-postes/commun/rules.js`) |
| `PASSING_RESUPPLY_PER_MINUTE` | `2` | `convex/constants.ts:512` | 2 de la décision du 01/11, l'échelle que le POC a réglée pour « un peu » |
| `LOAD_CAPACITY_BY_ROLE` | `{ infantry: 0, armor: 0, landTransport: 200, artillery: 0, fighter: 0, bomber: 0, airTransport: 120, escort: 0, cargo: 800, carrier: 0 }` | `convex/constants.ts:529` | la proposition le pose, aucune partie ne l'a joué |
| `TOUR_RETRY_MINUTES` | `30` | `convex/constants.ts:555` | aucune partie ne l'a joué |
| `TOUR_CRAWL_FACTOR` | `2` | `convex/constants.ts:563` | aucune partie ne l'a joué |
| `TOUR_ROAD_WAITS` | `3` | `convex/constants.ts:571` | aucune partie ne l'a joué |
| `PATROL_HALT_MINUTES` | `60` | `convex/constants.ts:578` | aucune partie ne l'a joué |
| `MONDIALE_TROOP_BOUND` | `150` | `convex/constants.ts:595` | ADR 0028 §6 chiffre ~150 troupes par joueur ; à mesurer sur une saison avant de le tenir |
| `DAMAGE_TABLE` | `{ infantry1: { infantry1: 0.5, infantry2: 0.55, armor1: 0.15, armor2: 0.05, landTransport: 0.7, artillery: 0.7 }, infantry2: { infantry1: 0.35, infantry2: 0.4, armor1: 0.65, armor2: 0.45, landTransport: 0.6, artillery: 0.6, fighter: 0.06, bomber: 0.1, airTransport: 0.12 }, armor1: { infantry1: 0.7, /** #126, à mesurer : sous les 0,65 de l'antichar, pour que l'infanterie MK2 contre le blindé */ infantry2: 0.55, armor1: 0.5, armor2: 0.25, landTransport: 0.85, artillery: 0.8 }, armor2: { infantry1: 0.75, infantry2: 0.7, armor1: 0.75, armor2: 0.5, landTransport: 0.9, artillery: 0.85 }, landTransport: { infantry1: 0.1, infantry2: 0.1, armor1: 0.05, armor2: 0.02, landTransport: 0.15, artillery: 0.1 }, artillery: { infantry1: 0.6, infantry2: 0.55, armor1: 0.5, armor2: 0.4, landTransport: 0.7, artillery: 0.5, escort: 0.15, cargo: 0.3, carrier: 0.1 }, fighter: { infantry1: 0.25, infantry2: 0.25, armor1: 0.1, armor2: 0.05, landTransport: 0.45, artillery: 0.3, fighter: 0.5, bomber: 0.75, airTransport: 0.85, escort: 0.1, cargo: 0.25, carrier: 0.12 }, bomber: { infantry1: 0.45, infantry2: 0.45, armor1: 0.6, armor2: 0.55, landTransport: 0.6, artillery: 0.6, fighter: 0.08, bomber: 0.2, airTransport: 0.25, escort: 0.55, cargo: 0.6, carrier: 0.65 }, airTransport: {}, escort: { infantry1: 0.1, infantry2: 0.1, armor1: 0.05, armor2: 0.02, landTransport: 0.12, artillery: 0.15, /** Revu le 19/10 (#158), à mesurer : l'escorte est le contre du chasseur (DCA navale), à égalité avec le bombardier : sinon le cycle escorte > chasseur > bombardier revient */ fighter: 0.12, bomber: 0.55, airTransport: 0.18, escort: 0.5, cargo: 0.7, carrier: 0.45 }, cargo: { escort: 0.05, cargo: 0.1, carrier: 0.05 }, carrier: { infantry1: 0.15, infantry2: 0.15, armor1: 0.08, armor2: 0.04, landTransport: 0.25, artillery: 0.2, /** #126, à mesurer : sous les 0,12 du chasseur, pour que le chasseur contre le porte-avions */ fighter: 0.1, bomber: 0.35, airTransport: 0.45, escort: 0.3, cargo: 0.4, carrier: 0.3 } }` | `convex/constants.ts:630` | trois cases revues le 19/10 pour les contres (#126), jamais jouées |
| `GARRISON_DAMAGE_TAKEN` | `0.7` | `convex/constants.ts:762` | rapport pertes attaquant / défenseur par engagement sur une saison |
| `SALVO_TARGETS` | `4` | `convex/constants.ts:773` | rien n'a encore tiré dans une Mondiale |
| `DETECTION_RANGE_KM` | `{ infantry: 60, armor: 60, landTransport: 40, artillery: 60, fighter: 150, bomber: 100, airTransport: 80, escort: 120, cargo: 60, carrier: 200 }` | `convex/constants.ts:788` | every value; no season simulation models detection |
| `RANGOON_SIGHTING_SHARE` | `0.5` | `convex/constants.ts:824` | mi-portée de la décision du 20/10 (Q23), jamais joué |
| `ARRIVAL_RADIUS_KM` | `25` | `convex/constants.ts:845` | an assumed starting point; nothing measures how close is close enough on arrival |
| `BLITZ_SHARE` | `{ contact: 0.0059, detection: { infantry: 0.0142, armor: 0.0142, landTransport: 0.0095, artillery: 0.0142, fighter: 0.0355, bomber: 0.0237, airTransport: 0.0189, escort: 0.0284, cargo: 0.0142, carrier: 0.0473 } as Readonly<Record<UnitRole, number>>, /** The artillery's reach, and the dead zone under it where it does not fire (B20). */ fireRange: 0.0355, deadZone: 0.0118, /** « À faire maintenant » montre les villes neutres à cette part d'un de mes bâtiments. */ nearCity: 0.142 } as const` | `convex/constants.ts:854` | every share; nothing has played an evening |
| `RELOAD_SECONDS_BY_ROLE` | `{ infantry: 40, armor: 60, landTransport: 45, artillery: 120, fighter: 50, bomber: 90, airTransport: 60, escort: 60, cargo: 60, carrier: 75 }` | `convex/constants.ts:886` | toute la table, Blitz comme Mondiale ; rien n'a encore joué une soirée |
| `INDIRECT_FIRE` | `{ emplaceSeconds: 30 } as const` | `convex/constants.ts:907` | rien n'a encore joué une soirée |
| `MONDIALE_FIRE_REACH` | `{ rangeKm: 150, deadZoneKm: 30 } as const` | `convex/constants.ts:916` | rien n'a encore tiré dans une Mondiale |
| `PURSUIT_STEP_SECONDS` | `15` | `convex/constants.ts:925` | à 200 km/min, quinze secondes font cinquante kilomètres |
| `LISTENING_STATION_RADIUS_KM` | `120` | `convex/constants.ts:939` | a rank in the ordering the design asks for, and nothing more |
| `UPKEEP_STEPS` | `[ { upTo: 10, rate: 1 }, { upTo: 25, rate: 2 }, { upTo: Number.POSITIVE_INFINITY, rate: 3 }, ]` | `convex/constants.ts:953` | the three rates and the two thresholds are set by eye against a farm at level one |
| `OUTPOST_FOOD_PER_HOUR_PER_LEVEL` | `3` | `convex/constants.ts:966` | set by eye: a level-one point against the twelve of a farm |
| `LISTENING_COAL_PER_HOUR` | `1` | `convex/constants.ts:975` | set by eye: a post against the twelve an hour of a coal mine at level one |
| `LOOKOUT_COAL_PER_HOUR_PER_LEVEL` | `1` | `convex/constants.ts:983` | 1, 2, 3 par heure : un point contre les douze d'une mine de charbon au niveau 1 |
| `LOOKOUT_REACH_SHARE` | `0.5` | `convex/constants.ts:991` | la moitié : ce que le POC a montré lisible, une vigie qui ne couvre pas tout ce qu'elle tient |
| `FORT_SLOWDOWN_MULTIPLIER` | `1.5` | `convex/constants.ts:999` | ×1,5 : le pendant de l'accélération des liaisons, aucune partie ne l'a joué |
| `UPKEEP_UNSUPPLIED_MULTIPLIER` | `2` | `convex/constants.ts:1012` | assumed; at ×2 the surcharge may drown in an economy where steel is the bottleneck |
| `OUTPOST_DISABLED_HOURS` | `6` | `convex/constants.ts:1022` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `OUTPOST_IMMUNITY_HOURS` | `3` | `convex/constants.ts:1023` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `PLUNDER_HOURS_PRESENT` | `2` | `convex/constants.ts:1032` | starting points only; no simulation models plunder presence or warehouse downtime |
| `PLUNDER_DISABLED_HOURS` | `12` | `convex/constants.ts:1033` | starting points only; no simulation models plunder presence or warehouse downtime |
| `CAPTURE_MINUTES` | `{ /** Un point stratégique se prend comme un bâtiment : six heures (P1), à mesurer comme le reste. */ mondiale: { building: 360, outpost: 360, point: 360 }, /** Le QG de la Blitz, deux fois un bâtiment : sa chute élimine (B10), et le défenseur doit * avoir le temps de revenir. */ blitz: { building: 2.4, outpost: 2.4, hq: 4.8 } } as const satisfies Record<SeasonMode, Record<'building' \| 'outpost', number>> & { mondiale: { point: number }; blitz: { hq: number }; }` | `convex/constants.ts:1043` | « ≈ 6 h » et « ≈ 3 min » du grilling du 14/10, « ≈ 6 min » pour le QG (lot 6), jamais |
| `LAST_KNOWN_HOURS` | `24` | `convex/constants.ts:1065` | une journée, choisie pour qu'un relevé du soir serve encore au matin sur une saison |
| `LOOT_CRATE_HOURS` | `24` | `convex/constants.ts:1074` | provisional lifetime; no season simulation models crate discovery or collection |
| `LOOT_RUMOR_DELAY_MINUTES` | `10` | `convex/constants.ts:1082` | provisional disclosure delay and search radius; no season simulation models them |
| `LOOT_RUMOR_RADIUS_KM` | `200` | `convex/constants.ts:1083` | provisional disclosure delay and search radius; no season simulation models them |
| `OUTPOST_REACH_KM_BY_LEVEL` | `{ 1: 120, 2: 180, 3: 240 }` | `convex/constants.ts:1097` | placeholders assumés : mesurés sur ce qu'ils couvrent d'une carte, jamais sur une partie qu'ils auraient changée |
| `RELAY_SPEED_MULTIPLIER` | `1.5` | `convex/constants.ts:1129` | shaped so the relay reads as a decision rather than a rounding |
| `MONDIALE_PACE` | `12` | `convex/constants.ts:1151` | posé par la fiche pour la saison test, jamais joué |
| `SURVEY_REFRESH_HOURS` | `1` | `convex/constants.ts:1185` | une durée lisible, rien de plus |
| `FOUNDER_ABSENCE_HOURS` | `48` | `convex/constants.ts:1199` | choisi sur la cadence de visite d'un jeu asynchrone, jamais mesuré en partie |
| `OBJECTIVE_ARCHETYPES` | `[ { key: 'abandonedStores', tier: 'easy', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, ], depot: { steel: 60 } }, { key: 'stalledConvoy', tier: 'medium', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, ], depot: { steel: 150, ammunition: 40 } }, { key: 'fuelDump', tier: 'medium', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, ], depot: { steel: 150, oil: 60 } }, { key: 'irregularArsenal', tier: 'hard', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, { role: 'armor', tier: 1 }, ], depot: { steel: 300, ammunition: 80 } }, ]` | `convex/constants.ts:1260` | toute la table : par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_NEAR_KM` | `1_500` | `convex/constants.ts:1334` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_SPREAD_KM` | `300` | `convex/constants.ts:1335` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_HARD_MIN_KM` | `800` | `convex/constants.ts:1336` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_HARD_FAIRNESS` | `0.75` | `convex/constants.ts:1337` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_AMMUNITION_PER_TROOP` | `200` | `convex/constants.ts:1357` | une réserve tenue au doigt pour qu'une garnison ne tire jamais à sec sur une saison de 48 h |
| `BLITZ` | `{ startingFunds: 200, fundsPerMinute: { hq: 30, city: 15 } as Readonly<Partial<Record<BuildingKey, number>>>, rolePrice: { infantry: 60, landTransport: 90, armor: 180, artillery: 160, fighter: 200, bomber: 260, airTransport: 150, escort: 200, cargo: 140, carrier: 320 } as Readonly<Record<UnitRole, number>>, recruitMinutes: 0.8, /** La borne technique, jamais affichée (R10b) : le frein est l'économie. */ troopBound: 80, mend: { stepMinutes: 0.8, /** La part de la force nominale rendue à chaque pas. */ sharePerStep: 0.1, /** Ce que coûte une remise à neuf entière, en part du prix du rôle. */ priceShare: 0.5 }, map: { /** Le cercle des QG, posé sur la terre (A2) : son rayon en part du théâtre — 950 km en * Europe —, et l'écart cible entre QG en est la corde. */ hqRadius: 0.225, hqRadiusSpread: 0.5, /** Combien de tablées on tire au plus, chacune d'une région au hasard. */ hqDraws: 1000, /** Combien de tablées régulières on éprouve en entier (E6 : une douzaine) avant de refuser. */ hqTries: 12, /** Le plus court écart de route entre QG, en part du plus long, sous lequel on refuse. */ hqEvenness: 0.6, /** L'écart permis, à pied, autour de la distance cible d'une caserne ou d'un neutre proche. */ tolerance: 0.35, /** La caserne de départ, à soi, à cette part du théâtre (A2) en route depuis le QG — 120 km * en Europe. */ starting: [{ key: 'barracks', share: 0.0284 }], /** Les neutres proches de chaque QG, chacun à la même distance de route pour tous : 250, 450, * 350 et 400 km en Europe. */ near: [ { key: 'city', share: 0.0592 }, { key: 'city', share: 0.1065 }, { key: 'port', share: 0.0828 }, { key: 'airfield', share: 0.0947 }, ], /** Les neutres disputés, par paire de voisins, au milieu de la route qui les sépare. */ disputed: ['city', 'airfield'], /** Le plus court écart à vol d'oiseau entre deux bâtiments posés — 80 km en Europe. */ spread: 0.0189, fairness: 0.8 } as const } as const` | `convex/constants.ts:1368` | toutes, posées pour qu'une partie de deux heures se lise sur le papier : le pécule |
| `MESSAGES_PAGE` | `2000` | `convex/finalEdition.ts:42` | posés à l'œil, sans banc sur une saison de huit joueurs |
| `NOTICES_PAGE` | `2000` | `convex/finalEdition.ts:43` | posés à l'œil, sans banc sur une saison de huit joueurs |
| `PASSES_PAGE` | `100` | `convex/finalEdition.ts:44` | posés à l'œil, sans banc sur une saison de huit joueurs |
| `ERASE_FALLBACK_MS` | `30 * 60_000` | `convex/finalEdition.ts:52` | assez pour que la chaîne de clôture compte les dépêches avant |
| `INTRO_MS` | `1400` | `src/domain/absence-tour.ts:18` | le minutage de la maquette (`scenes.js`, la tournée) — l'intro, un arrêt, un vol. |
| `STOP_MS` | `1600` | `src/domain/absence-tour.ts:19` | le minutage de la maquette (`scenes.js`, la tournée) — l'intro, un arrêt, un vol. |
| `FLY_MS` | `700` | `src/domain/absence-tour.ts:20` | le minutage de la maquette (`scenes.js`, la tournée) — l'intro, un arrêt, un vol. |
| `REDUCED_LAND_MS` | `250` | `src/domain/absence-tour.ts:22` | réduites, pas de vol ; le tampon se pose un quart de seconde après l'arrêt. |
| `LAST_HOLD_MS` | `1400` | `src/domain/absence-tour.ts:24` | du dernier tampon au retour, sous `SETTLE_MS` pour que le moteur ne s'endorme pas. |
| `RETURN_MS` | `1400` | `src/domain/absence-tour.ts:26` | le vol du retour, et la bande de fin qui le suit. |
| `END_BAND_MS` | `1600` | `src/domain/absence-tour.ts:27` | le vol du retour, et la bande de fin qui le suit. |
| `TOUR_HOLD_MS` | `2200` | `src/domain/absence-tour.ts:29` | le maintien d'un tampon du rejeu, et l'écart du second (« terrain tenu »). |
| `SECOND_STAMP_MS` | `800` | `src/domain/absence-tour.ts:30` | le maintien d'un tampon du rejeu, et l'écart du second (« terrain tenu »). |
| `BLITZ_CROSSING_MINUTES` | `14.4` | `src/domain/blitz.ts:152` | the decision says 15 to 20 minutes, sped up by a quarter; nothing has played one yet |
| `STALE_MARGIN_MS` | `30_000` | `src/domain/combat-on-map.ts:28` | un |
| `FINAL_POSE_MS` | `STEP_MS['compte-rendu']` | `src/domain/combat-on-map.ts:32` | le temps du compte-rendu, assez pour lire qui reste debout ? |
| `REPORT_HOLD_MS` | `STEP_MS['compte-rendu'] + 6000` | `src/domain/combat-on-map.ts:200` | le temps de lire « nos pièces » et de l'ouvrir. |
| `STAMP_NEAR_SHARE` | `0.5` | `src/domain/combat-on-map.ts:272` | « voir » |
| `PLACING_SNAP_KM` | `60` | `src/domain/construction.ts:72` | choisi à l'œil pour qu'un gisement se prenne sans viser au pixel |
| `BEFORE_CITY_KM` | `30` | `src/domain/contacts.ts:35` | la maquette C le pose à 0,35 unité, environ 30 km |
| `MOON_AZIMUTH_DEG` | `315` | `src/domain/daylight.ts:102` | posée à l'œil sur la maquette ; rien ne mesure d'où la lune éclaire le mieux les pièces |
| `MOON_ELEVATION_DEG` | `53` | `src/domain/daylight.ts:103` | posée à l'œil sur la maquette ; rien ne mesure d'où la lune éclaire le mieux les pièces |
| `BASIN_KM` | `24` | `src/domain/deposit-basins.ts:22` | le rayon du bassin dessiné : plus étroit que l'aimant, c'est le terrain qu'on lit. |
| `SWEEP_RANGE_KM` | `1000` | `src/domain/deposit-sweep.ts:16` | décisions du 23/10 sur #249 : l'Europe de l'Ouest d'un coup d'œil |
| `SWEEP_MS` | `3000` | `src/domain/deposit-sweep.ts:19` | décisions du 23/10 sur #249 : assez long pour suivre le front |
| `BUILDING_SPACING_KM` | `30` | `src/domain/economy.ts:90` | l'ordre de grandeur de l'ADR 0029, à rejouer sur une saison test |
| `FRAMES` | `{ world: [0, 0, 400, 208], europe: [187, 14, 248, 61], 'europe-med': [180, 14, 271, 89] }` | `src/domain/final-edition-read.ts:66` | cadres posés à l'œil, sans capture |
| `NEAR_KM` | `250` | `src/domain/front-sound.ts:43` | 250 et 550 km, maquette D du 02/11, jamais jouée |
| `MID_KM` | `550` | `src/domain/front-sound.ts:44` | 250 et 550 km, maquette D du 02/11, jamais jouée |
| `QUEUE_MAX` | `6` | `src/domain/front-sound.ts:148` | six en file, trois au retour, six secondes entre deux phrases (maquette D) |
| `HEARD_ON_RETURN` | `3` | `src/domain/front-sound.ts:149` | six en file, trois au retour, six secondes entre deux phrases (maquette D) |
| `PHRASE_GAP_MS` | `6_000` | `src/domain/front-sound.ts:150` | six en file, trois au retour, six secondes entre deux phrases (maquette D) |
| `FLAG_SWAP_MS` | `1600` | `src/domain/ink-bursts.ts:68` | `storyboard-moments/commun/scenes.js`, un des Sept — le drapeau descend puis |
| `SEAL_HOLD_MS` | `3400` | `src/domain/ink-bursts.ts:69` | `storyboard-moments/commun/scenes.js`, un des Sept — le drapeau descend puis |
| `TWIN_DEGREES` | `0.5` | `src/domain/ink-bursts.ts:72` | la capture que la prise d'un point ou la chute d'un QG dit déjà, au même instant |
| `TAKEN_UP_MS` | `250` | `src/domain/ink-bursts.ts:75` | un geste lève tout en 0,25 s (#439, la maquette « la tournée »). |
| `LEVEL_SPEEDUP` | `0.2` | `src/domain/level-speed.ts:11` | 0,20 depuis le modèle de #158, jamais joué |
| `LEVEL_SPEED_FLOOR` | `0.4` | `src/domain/level-speed.ts:14` | la durée ne descend jamais sous cette part de la base |
| `FLY_MS` | `1000` | `src/domain/moments.ts:96` | le minutage du storyboard (`scenes.js`, `qg` et `victoire`), en ms. |
| `FALL_HOLD_MS` | `3200` | `src/domain/moments.ts:97` | le minutage du storyboard (`scenes.js`, `qg` et `victoire`), en ms. |
| `PULL_MS` | `2000` | `src/domain/moments.ts:98` | le minutage du storyboard (`scenes.js`, `qg` et `victoire`), en ms. |
| `SEAL_GAP_MS` | `450` | `src/domain/moments.ts:99` | le minutage du storyboard (`scenes.js`, `qg` et `victoire`), en ms. |
| `TRACE_AFTER_MS` | `1900` | `src/domain/moments.ts:100` | le minutage du storyboard (`scenes.js`, `qg` et `victoire`), en ms. |
| `TRACE_PEN_MS` | `1200` | `src/domain/moments.ts:101` | le minutage du storyboard (`scenes.js`, `qg` et `victoire`), en ms. |
| `BIG_AFTER_MS` | `{ full: 1400, reduced: 300 } as const` | `src/domain/moments.ts:102` | le minutage du storyboard (`scenes.js`, `qg` et `victoire`), en ms. |
| `SEPIA_AFTER_MS` | `600` | `src/domain/moments.ts:103` | le minutage du storyboard (`scenes.js`, `qg` et `victoire`), en ms. |
| `OPEN_AFTER_MS` | `1600` | `src/domain/moments.ts:104` | le minutage du storyboard (`scenes.js`, `qg` et `victoire`), en ms. |
| `STARTING_MOVEMENT_SLOTS` | `2` | `src/domain/movement-orders.ts:355` | deux, d'après la décision du 19/10, jamais joué |
| `DISBAND_RING_SPANS` | `2.1` | `src/domain/movement-orders.ts:908` | assez pour que les pièces se lisent à part, assez peu pour rester à portée de soutien ; plafonné au camion, une coque y chevauche ses voisines |
| `MONDIALE_DURATION_DAYS` | `[3, 5, 7, 10, 14] as const` | `src/domain/operation-order.ts:37` | posées pour la saison test, aucune saison jouée à une autre durée que sept jours |
| `REMINDER_MINUTES` | `15` | `src/domain/operation-order.ts:38` | posées pour la saison test, aucune saison jouée à une autre durée que sept jours |
| `MIN_PIECE_SCALE` | `80` | `src/domain/piece-scale.ts:11` | recommandation du designer (POC de lisibilité, 23/10), Q3 ouverte à Pierre |
| `MAX_PIECE_SCALE` | `125` | `src/domain/piece-scale.ts:12` | recommandation du designer (POC de lisibilité, 23/10), Q3 ouverte à Pierre |
| `ARMOR_METRES` | `{ france: [4.02, 6.37], // Renault R35, Char B1 bis uk: [3.96, 5.61], // Vickers Light Tank Mk VI, Matilda II usa: [4.84, 5.84], // M5 Stuart, M4 Sherman ussr: [5.66, 6.68], // BT-7, T-34 (1941) germany: [4.81, 5.92], // Panzer II, Panzer IV japan: [4.38, 5.52], // Type 95 Ha-Go, Type 97 Chi-Ha italy: [3.17, 4.92], // L3/35, M13/40 china: [4.88, 4.62], // Vickers 6-Ton, T-26 }` | `src/domain/piece-size.ts:41` | longueurs de caisse publiées (fiches Wikipédia des modèles), sans canon ni garde-boue |
| `BUILDING_METRES` | `{ hq: 60, farm: 40, mine: 50, oilWell: 25, arsenal: 80, barracks: 50, airfield: 110, port: 210, listening: 30, researchCenter: 50, warehouse: 60, depot: 60, city: 50 }` | `src/domain/piece-size.ts:58` | la ville seule, un symbole sans mesure réelle ; le reste suit l'ADR 0035 |
| `OBJECTIVE_METRES` | `{ abandonedStores: 40, stalledConvoy: 30, fuelDump: 40, irregularArsenal: 40 }` | `src/domain/piece-size.ts:131` | lus sur les modèles (un convoi de quelques camions, un dépôt), sans plan réel |
| `DRAWN_SHARE` | `0.25` | `src/domain/piece-size.ts:186` | 0,25, choix de Pierre du 11/11/2026 après captures à 0,5, 0,35 et 0,25 ; à revoir en partie |
| `NAMES_GONE_DISTANCE` | `65` | `src/domain/place-names.ts:117` | paliers lus sur les captures de la maquette A, aucune mesure de lisibilité |
| `CITY_TIERS` | `[NAMES_GONE_DISTANCE, 55, 34, 0]` | `src/domain/place-names.ts:118` | paliers lus sur les captures de la maquette A, aucune mesure de lisibilité |
| `MILLION` | `1_000_000` | `src/domain/place-names.ts:119` | paliers lus sur les captures de la maquette A, aucune mesure de lisibilité |
| `SMALL_CAPITAL` | `300_000` | `src/domain/place-names.ts:120` | paliers lus sur les captures de la maquette A, aucune mesure de lisibilité |
| `SEA_TIERS` | `[NAMES_GONE_DISTANCE, 45, 0]` | `src/domain/place-names.ts:161` | paliers lus sur la maquette A, aucune capture des mers seules |
| `SEA_RANKS` | `[2, 4]` | `src/domain/place-names.ts:162` | paliers lus sur la maquette A, aucune capture des mers seules |
| `SEA_BUDGET` | `{ desk: 6, touch: 3 }` | `src/domain/place-names.ts:176` | lu sur la maquette A, qui en écrit onze sur l'Europe |
| `STEP_MS` | `{ voyage: 1500, pose: 1200, frappe: 1950, riposte: 1950, deroute: 1400, 'compte-rendu': 2000 }` | `src/domain/replay.ts:9` | a short replay, read through in about ten seconds (grilling of 13/10). |
| `SINK_HOLD_MS` | `2000` | `src/domain/replay.ts:41` | le tampon se pose 0,4 s après la coulée, soit à la fin du compte-rendu, et tient 2 s |
| `HEEL` | `(14 * Math.PI) / 180` | `src/domain/replay.ts:214` | la gîte à la chute, 14° sur le bord touché (storyboard) |
| `PITCH` | `(9 * Math.PI) / 180` | `src/domain/replay.ts:216` | le tangage de la coulée par l'arrière, 9° (storyboard) |
| `FINAL_HEEL` | `(22 * Math.PI) / 180` | `src/domain/replay.ts:218` | la gîte où la coque finit, 22° (storyboard), tenue par l'épave de la pose finale |
| `SINK_MS` | `1600` | `src/domain/replay.ts:220` | la coulée finit 1,6 s après le début du compte-rendu : à juger à l'œil, avant l'effacement du tampon |
| `SINK_LAG_MS` | `1000` | `src/domain/replay.ts:222` | la coulée commence 1 s après la fin de la chute de la coque (storyboard : `P.sink[0] = P.hit + 1,0`) |
| `SLICK_TAIL_MS` | `1500` | `src/domain/replay.ts:247` | la nappe s'étale jusqu'à 1,5 s après la fin de la coulée (storyboard : `sink[1] + 1,5`) |
| `BUBBLES_LEAD_MS` | `600` | `src/domain/replay.ts:249` | les bulles montent 0,6 s avant la fin de la coulée (storyboard : `sink[1] - 0,6`) |
| `BUBBLES_MS` | `1400` | `src/domain/replay.ts:251` | les bulles vivent 1,4 s (storyboard : `life: 1.4`) |
| `STRIKE_MS` | `1600` | `src/domain/replay.ts:253` | l'étiquette de places se barre 1,6 s après le début de la coulée (storyboard : `sink[0] + 1,6`) |
| `DRY_SOON_HOURS` | `24` | `src/domain/resource-band.ts:72` | a day ahead: one evening's glance covers the night. |
| `COST_BY_MEDIUM` | `{ land: 1.6, landMotorized: 1.15, sea: 1.0 }` | `src/domain/routing.ts:93` | relative prices chosen for their ordering; only the foot pace behind them is measured |
| `THREAD_PIECE_CELLS` | `2` | `src/domain/routing.ts:978` | measured against the medium on 340 routes (#231), not against a play need |
| `POINT_TRAITS` | `{ tangier: { family: 'economy', stars: 2 }, istanbul: { family: 'intel', stars: 2 }, rangoon: { family: 'diplomacy', stars: 1 }, hongKong: { family: 'intel', stars: 1 }, halifax: { family: 'sea', stars: 1 }, narvik: { family: 'economy', stars: 2 }, lisbon: { family: 'intel', stars: 2 }, baku: { family: 'supply', stars: 3 }, dakar: { family: 'economy', stars: 2 }, singapore: { family: 'supply', stars: 1 } } as const satisfies Record<StrategicPointKey, { family: PointFamily; stars: 1 \| 2 \| 3 }>` | `src/domain/strategic-points.ts:40` | familles et étoiles posées par jugement, aucune doc ne les fixait |
| `TANGIER_LOT` | `{ give: 300, get: 100 } as const` | `src/domain/strategic-points.ts:146` | posé pour la saison test ; rien ne mesure ce que vaut un échange par édition |
| `SURVEY_INK_FADED` | `0.2` | `src/domain/survey-ink.ts:4` | the ink left on a survey nobody renewed, the day it is wiped: a trace, read by eye. |
| `DETOUR` | `{ land: 1.02, sea: 1.4, air: 1 } as const` | `src/domain/tour-sheet.ts:98` | un cargo qui double un cap dépasse largement la médiane |
| `LIFT_CAPACITY` | `{ cargo: 12, carrier: 6, airTransport: 2 }` | `src/domain/troops.ts:175` | assumed against the troop ceiling alone — two cargos lift a whole infantry |
| `LIFT_COST` | `{ infantry: 1, armor: 3, landTransport: 2, artillery: 2 }` | `src/domain/troops.ts:182` | the passenger half of `LIFT_CAPACITY`, assumed on the same single bearing |
| `LAND_SEATS_PER_TRANSPORT` | `2` | `src/domain/troops.ts:205` | two seats, assumed; at four, motorizing an army would be nearly free |
