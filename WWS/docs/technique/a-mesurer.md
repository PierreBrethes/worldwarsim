<!-- Généré par `node scripts/generate-a-mesurer.mjs` depuis les marqueurs `@a-mesurer` — ne pas éditer à la main. Empreinte du contenu source : 098b07b -->

# Les constantes à mesurer

Une ligne de ce registre est **une valeur en attente de son instrument** : posée pour que la
règle existe et se lise, jamais pour équilibrer quoi que ce soit. Ni une dette, ni un TODO —
`WWS/QUESTIONS.md` porte les questions, les prompts portent le travail. Quand le simulateur en
mesure une, on retire son marqueur et la ligne disparaît à la régénération : le registre a
vocation à se vider, et sa taille mesure la dette de calibrage.

45 valeurs marquées dans `convex/` et `src/domain/`.

**Les tables économiques n'y figurent pas** — `BUILDING_SPEC`, `COST_BY_ROLE`,
`EXTRACTION_PER_HOUR`, `CHAINS` et leurs voisines : l'en-tête de `convex/constants.ts` les
déclare placeholders en bloc, depuis le retrait du simulateur d’ouverture (17/10/2026). Les tables de transport sans instrument y restent, une ligne
exhaustive par table. Le registre sert les valeurs que rien ne mesure encore.

| Constante | Valeur | Où | Pourquoi elle attend |
| --- | --- | --- | --- |
| `OUTPOST_RAISE_SPEC` | `{ cost: { alloy: 65, coal: 20 }, minutes: 65 }` | `convex/constants.ts:274` | calé sur le port, jamais mesuré sur une partie ; mesure attendue — avant-postes debout par joueur au jour 7 de la première saison (décision 7a du 15/09) |
| `CARRY_CAPACITY_BY_ROLE` | `{ infantry: 40, armor: 0, landTransport: 120, artillery: 0, fighter: 0, bomber: 0, airTransport: 80, escort: 0, cargo: 240, carrier: 0 }` | `convex/constants.ts:356` | every role; no season simulation models plunder cargo yet |
| `MONDIALE_TROOP_BOUND` | `150` | `convex/constants.ts:454` | ADR 0028 §6 chiffre ~150 troupes par joueur ; à mesurer sur une saison avant de le tenir |
| `GARRISON_DAMAGE_TAKEN` | `0.7` | `convex/constants.ts:608` | rapport pertes attaquant / défenseur par engagement sur une saison |
| `DETECTION_RANGE_KM` | `{ infantry: 60, armor: 60, landTransport: 40, artillery: 60, fighter: 150, bomber: 100, airTransport: 80, escort: 120, cargo: 60, carrier: 200 }` | `convex/constants.ts:631` | every value; no season simulation models detection |
| `ARRIVAL_RADIUS_KM` | `25` | `convex/constants.ts:672` | an assumed starting point; nothing measures how close is close enough on arrival |
| `BLITZ_SHARE` | `{ contact: 0.0059, detection: { infantry: 0.0142, armor: 0.0142, landTransport: 0.0095, artillery: 0.0142, fighter: 0.0355, bomber: 0.0237, airTransport: 0.0189, escort: 0.0284, cargo: 0.0142, carrier: 0.0473 } as Readonly<Record<UnitRole, number>>, /** The artillery's reach, and the dead zone under it where it does not fire (B20). */ fireRange: 0.0355, deadZone: 0.0118, /** « À faire maintenant » montre les villes neutres à cette part d'un de mes bâtiments. */ nearCity: 0.142 } as const` | `convex/constants.ts:681` | every share; nothing has played an evening |
| `RELOAD_SECONDS_BY_ROLE` | `{ infantry: 40, armor: 60, landTransport: 45, artillery: 120, fighter: 50, bomber: 90, airTransport: 60, escort: 60, cargo: 60, carrier: 75 }` | `convex/constants.ts:712` | toute la table ; rien n'a encore joué une soirée |
| `INDIRECT_FIRE` | `{ emplaceSeconds: 30 } as const` | `convex/constants.ts:733` | rien n'a encore joué une soirée |
| `PURSUIT_STEP_SECONDS` | `15` | `convex/constants.ts:742` | à 200 km/min, quinze secondes font cinquante kilomètres |
| `LISTENING_STATION_RADIUS_KM` | `120` | `convex/constants.ts:756` | a rank in the ordering the design asks for, and nothing more |
| `FOOD_UPKEEP_PER_TROOP_PER_HOUR` | `1` | `convex/constants.ts:771` | picked to read against a farm at level one, never measured |
| `UPKEEP_UNSUPPLIED_MULTIPLIER` | `2` | `convex/constants.ts:784` | assumed; at ×2 the surcharge may drown in an economy where alloy is the bottleneck |
| `OUTPOST_DISABLED_HOURS` | `6` | `convex/constants.ts:794` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `OUTPOST_IMMUNITY_HOURS` | `3` | `convex/constants.ts:795` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `PLUNDER_HOURS_PRESENT` | `2` | `convex/constants.ts:804` | starting points only; no simulation models plunder presence or warehouse downtime |
| `PLUNDER_DISABLED_HOURS` | `12` | `convex/constants.ts:805` | starting points only; no simulation models plunder presence or warehouse downtime |
| `CAPTURE_MINUTES` | `{ /** Un point stratégique se prend comme un bâtiment : six heures (P1), à mesurer comme le reste. */ mondiale: { building: 360, outpost: 360, point: 360 }, /** Le QG de la Blitz, deux fois un bâtiment : sa chute élimine (B10), et le défenseur doit * avoir le temps de revenir. */ blitz: { building: 2.4, outpost: 2.4, hq: 4.8 } } as const satisfies Record<SeasonMode, Record<'building' \| 'outpost', number>> & { mondiale: { point: number }; blitz: { hq: number }; }` | `convex/constants.ts:815` | « ≈ 6 h » et « ≈ 3 min » du grilling du 14/10, « ≈ 6 min » pour le QG (lot 6), jamais |
| `LAST_KNOWN_HOURS` | `24` | `convex/constants.ts:837` | une journée, choisie pour qu'un relevé du soir serve encore au matin sur une saison |
| `LOOT_CRATE_HOURS` | `24` | `convex/constants.ts:846` | provisional lifetime; no season simulation models crate discovery or collection |
| `LOOT_RUMOR_DELAY_MINUTES` | `10` | `convex/constants.ts:854` | provisional disclosure delay and search radius; no season simulation models them |
| `LOOT_RUMOR_RADIUS_KM` | `200` | `convex/constants.ts:855` | provisional disclosure delay and search radius; no season simulation models them |
| `OUTPOST_REACH_KM_BY_LEVEL` | `{ 1: 120, 2: 180, 3: 240 }` | `convex/constants.ts:869` | placeholders assumés : mesurés sur ce qu'ils couvrent d'une carte, jamais sur une partie qu'ils auraient changée |
| `RELAY_SPEED_MULTIPLIER` | `1.5` | `convex/constants.ts:901` | shaped so the relay reads as a decision rather than a rounding |
| `MONDIALE_PACE` | `12` | `convex/constants.ts:923` | posé par la fiche pour la saison test, jamais joué |
| `SURVEY_FADED_HOURS` | `24` | `convex/constants.ts:958` | choisi sur la cadence de visite attendue, jamais mesuré en partie |
| `SURVEY_REFRESH_HOURS` | `1` | `convex/constants.ts:971` | une fraction lisible de `SURVEY_FADED_HOURS`, rien de plus |
| `FOUNDER_ABSENCE_HOURS` | `48` | `convex/constants.ts:985` | choisi sur la cadence de visite d'un jeu asynchrone, jamais mesuré en partie |
| `OBJECTIVE_ARCHETYPES` | `[ { key: 'abandonedStores', tier: 'easy', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, ], depot: { alloy: 60 } }, { key: 'stalledConvoy', tier: 'medium', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, ], depot: { alloy: 150, ammunition: 40 } }, { key: 'fuelDump', tier: 'medium', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, ], depot: { alloy: 150, oil: 60 } }, { key: 'irregularArsenal', tier: 'hard', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, { role: 'armor', tier: 1 }, ], depot: { alloy: 300, ammunition: 80 } }, ]` | `convex/constants.ts:1046` | toute la table : par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_NEAR_KM` | `1_500` | `convex/constants.ts:1120` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_SPREAD_KM` | `300` | `convex/constants.ts:1121` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_HARD_MIN_KM` | `800` | `convex/constants.ts:1122` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_HARD_FAIRNESS` | `0.75` | `convex/constants.ts:1123` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_AMMUNITION_PER_TROOP` | `200` | `convex/constants.ts:1142` | une réserve tenue au doigt pour qu'une garnison ne tire jamais à sec sur une saison de 48 h |
| `BLITZ` | `{ startingFunds: 200, fundsPerMinute: { hq: 30, city: 15 } as Readonly<Partial<Record<BuildingKey, number>>>, rolePrice: { infantry: 60, landTransport: 90, armor: 180, artillery: 160, fighter: 200, bomber: 260, airTransport: 150, escort: 200, cargo: 140, carrier: 320 } as Readonly<Record<UnitRole, number>>, recruitMinutes: 0.8, /** La borne technique, jamais affichée (R10b) : le frein est l'économie. */ troopBound: 80, mend: { stepMinutes: 0.8, /** La part de la force nominale rendue à chaque pas. */ sharePerStep: 0.1, /** Ce que coûte une remise à neuf entière, en part du prix du rôle. */ priceShare: 0.5 }, map: { /** Le cercle des QG, posé sur la terre (A2) : son rayon en part du théâtre — 950 km en * Europe —, et l'écart cible entre QG en est la corde. */ hqRadius: 0.225, hqRadiusSpread: 0.5, /** Combien de tablées on tire au plus, chacune d'une région au hasard. */ hqDraws: 1000, /** Combien de tablées régulières on éprouve en entier (E6 : une douzaine) avant de refuser. */ hqTries: 12, /** Le plus court écart de route entre QG, en part du plus long, sous lequel on refuse. */ hqEvenness: 0.6, /** L'écart permis, à pied, autour de la distance cible d'une caserne ou d'un neutre proche. */ tolerance: 0.35, /** La caserne de départ, à soi, à cette part du théâtre (A2) en route depuis le QG — 120 km * en Europe. */ starting: [{ key: 'barracks', share: 0.0284 }], /** Les neutres proches de chaque QG, chacun à la même distance de route pour tous : 250, 450, * 350 et 400 km en Europe. */ near: [ { key: 'city', share: 0.0592 }, { key: 'city', share: 0.1065 }, { key: 'port', share: 0.0828 }, { key: 'airfield', share: 0.0947 }, ], /** Les neutres disputés, par paire de voisins, au milieu de la route qui les sépare. */ disputed: ['city', 'airfield'], /** Le plus court écart à vol d'oiseau entre deux bâtiments posés — 80 km en Europe. */ spread: 0.0189, fairness: 0.8 } as const } as const` | `convex/constants.ts:1153` | toutes, posées pour qu'une partie de deux heures se lise sur le papier : le pécule |
| `BLITZ_CROSSING_MINUTES` | `14.4` | `src/domain/blitz.ts:155` | the decision says 15 to 20 minutes, sped up by a quarter; nothing has played one yet |
| `MONDIALE_DURATION_DAYS` | `[3, 5, 7, 10, 14] as const` | `src/domain/operation-order.ts:37` | posées pour la saison test, aucune saison jouée à une autre durée que sept jours |
| `REMINDER_MINUTES` | `15` | `src/domain/operation-order.ts:38` | posées pour la saison test, aucune saison jouée à une autre durée que sept jours |
| `STEP_MS` | `{ voyage: 1500, pose: 1200, frappe: 1950, riposte: 1950, deroute: 1400, 'compte-rendu': 2000 }` | `src/domain/replay.ts:8` | a short replay, read through in about ten seconds (grilling of 13/10). |
| `DRY_SOON_HOURS` | `24` | `src/domain/resource-band.ts:72` | a day ahead: one evening's glance covers the night. |
| `COST_BY_MEDIUM` | `{ land: 1.6, landMotorized: 1.15, sea: 1.0 }` | `src/domain/routing.ts:89` | relative prices chosen for their ordering; only the foot pace behind them is measured |
| `SURVEY_INK_FADED` | `0.2` | `src/domain/survey-ink.ts:4` | the ink left on a survey nobody renewed, the day it is wiped: a trace, read by eye. |
| `LIFT_CAPACITY` | `{ cargo: 12, carrier: 6, airTransport: 2 }` | `src/domain/troops.ts:91` | assumed against the troop ceiling alone — two cargos lift a whole infantry |
| `LIFT_COST` | `{ infantry: 1, armor: 3, landTransport: 2, artillery: 2 }` | `src/domain/troops.ts:98` | the passenger half of `LIFT_CAPACITY`, assumed on the same single bearing |
| `LAND_SEATS_PER_TRANSPORT` | `2` | `src/domain/troops.ts:121` | two seats, assumed; at four, motorizing an army would be nearly free |
