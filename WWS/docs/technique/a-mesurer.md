<!-- Généré par `node scripts/generate-a-mesurer.mjs` depuis les marqueurs `@a-mesurer` — ne pas éditer à la main. Empreinte du contenu source : 279be02 -->

# Les constantes à mesurer

Une ligne de ce registre est **une valeur en attente de son instrument** : posée pour que la
règle existe et se lise, jamais pour équilibrer quoi que ce soit. Ni une dette, ni un TODO —
`WWS/QUESTIONS.md` porte les questions, les prompts portent le travail. Quand le simulateur en
mesure une, on retire son marqueur et la ligne disparaît à la régénération : le registre a
vocation à se vider, et sa taille mesure la dette de calibrage.

36 valeurs marquées dans `convex/` et `src/domain/`.

**Les tables économiques n'y figurent pas** — `BUILDING_SPEC`, `COST_BY_ROLE`,
`EXTRACTION_PER_HOUR`, `CHAINS` et leurs voisines : leur instrument existe déjà, c'est le
simulateur d'ouverture (`WWS/simulation/opening/`), et l'en-tête de `convex/constants.ts` les
déclare placeholders en bloc. Les tables de transport sans instrument y restent, une ligne
exhaustive par table. Le registre sert les valeurs que rien ne mesure encore.

| Constante | Valeur | Où | Pourquoi elle attend |
| --- | --- | --- | --- |
| `OUTPOST_RAISE_SPEC` | `{ cost: { alloy: 65, coal: 20 }, minutes: 65 }` | `convex/constants.ts:292` | calé sur le port, jamais mesuré sur une partie ; mesure attendue — avant-postes debout par joueur au jour 7 de la première saison (décision 7a du 15/09) |
| `CARRY_CAPACITY_BY_ROLE` | `{ infantry: 40, armor: 0, landTransport: 120, fighter: 0, bomber: 0, airTransport: 80, escort: 0, cargo: 240, carrier: 0 }` | `convex/constants.ts:373` | every role; no season simulation models plunder cargo yet |
| `DEFENDER_BONUS` | `1.15` | `convex/constants.ts:607` | rapport pertes attaquant / défenseur par engagement sur une saison |
| `DETECTION_RANGE_KM` | `{ infantry: 60, armor: 60, landTransport: 40, fighter: 150, bomber: 100, airTransport: 80, escort: 120, cargo: 60, carrier: 200 }` | `convex/constants.ts:630` | every value; no season simulation models detection |
| `ARRIVAL_RADIUS_KM` | `25` | `convex/constants.ts:661` | an assumed starting point; nothing measures how close is close enough on arrival |
| `LISTENING_STATION_RADIUS_KM` | `120` | `convex/constants.ts:675` | a rank in the ordering the design asks for, and nothing more |
| `FOOD_UPKEEP_PER_TROOP_PER_HOUR` | `1` | `convex/constants.ts:690` | picked to read against a farm at level one, never measured |
| `UPKEEP_UNSUPPLIED_MULTIPLIER` | `2` | `convex/constants.ts:703` | assumed; at ×2 the surcharge may drown in an economy where alloy is the bottleneck |
| `OUTPOST_DISABLED_HOURS` | `6` | `convex/constants.ts:713` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `OUTPOST_IMMUNITY_HOURS` | `3` | `convex/constants.ts:714` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `PLUNDER_HOURS_PRESENT` | `2` | `convex/constants.ts:723` | starting points only; no simulation models plunder presence or warehouse downtime |
| `PLUNDER_DISABLED_HOURS` | `12` | `convex/constants.ts:724` | starting points only; no simulation models plunder presence or warehouse downtime |
| `LAST_KNOWN_HOURS` | `24` | `convex/constants.ts:737` | une journée, choisie pour qu'un relevé du soir serve encore au matin sur une saison |
| `LOOT_CRATE_HOURS` | `2` | `convex/constants.ts:745` | provisional lifetime; no season simulation models crate discovery or collection |
| `LOOT_RUMOR_DELAY_MINUTES` | `10` | `convex/constants.ts:753` | provisional disclosure delay and search radius; no season simulation models them |
| `LOOT_RUMOR_RADIUS_KM` | `200` | `convex/constants.ts:754` | provisional disclosure delay and search radius; no season simulation models them |
| `OUTPOST_REACH_KM_BY_LEVEL` | `{ 1: 120, 2: 180, 3: 240 }` | `convex/constants.ts:768` | placeholders assumés : mesurés sur ce qu'ils couvrent d'une carte, jamais sur une partie qu'ils auraient changée |
| `RELAY_SPEED_MULTIPLIER` | `1.5` | `convex/constants.ts:800` | shaped so the relay reads as a decision rather than a rounding |
| `REDUCTION_FACTOR` | `0.5` | `convex/constants.ts:825` | the bar of a scaffold, measured by nothing — it leaves with the scaffold |
| `SURVEY_FADED_HOURS` | `24` | `convex/constants.ts:854` | choisi sur la cadence de visite attendue, jamais mesuré en partie |
| `SURVEY_REFRESH_HOURS` | `1` | `convex/constants.ts:867` | une fraction lisible de `SURVEY_FADED_HOURS`, rien de plus |
| `FOUNDER_ABSENCE_HOURS` | `48` | `convex/constants.ts:881` | choisi sur la cadence de visite d'un jeu asynchrone, jamais mesuré en partie |
| `OBJECTIVE_ARCHETYPES` | `[ { key: 'abandonedStores', tier: 'easy', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, ], depot: { alloy: 60 } }, { key: 'stalledConvoy', tier: 'medium', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, ], depot: { alloy: 150, ammunition: 40 } }, { key: 'fuelDump', tier: 'medium', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, ], depot: { alloy: 150, oil: 60 } }, { key: 'irregularArsenal', tier: 'hard', garrison: [ { role: 'infantry', tier: 1 }, { role: 'infantry', tier: 1 }, { role: 'armor', tier: 1 }, ], depot: { alloy: 300, ammunition: 80 } }, ]` | `convex/constants.ts:942` | toute la table : par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_NEAR_KM` | `1_500` | `convex/constants.ts:1016` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_SPREAD_KM` | `300` | `convex/constants.ts:1017` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_HARD_MIN_KM` | `800` | `convex/constants.ts:1018` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_HARD_FAIRNESS` | `0.75` | `convex/constants.ts:1019` | les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h |
| `OBJECTIVE_AMMUNITION_PER_TROOP` | `200` | `convex/constants.ts:1038` | une réserve tenue au doigt pour qu'une garnison ne tire jamais à sec sur une saison de 48 h |
| `REGISTRATION_WINDOW_HOURS` | `2` | `src/domain/off-season.ts:7` | before treating it as a campaign balance rule. |
| `STEP_MS` | `{ voyage: 1500, pose: 1200, salves: 900, pertes: 3000, deroute: 1400, 'compte-rendu': 2000 }` | `src/domain/replay.ts:8` | a short replay, read through in about ten seconds (grilling of 13/10). |
| `DRY_SOON_HOURS` | `24` | `src/domain/resource-band.ts:75` | a day ahead: one evening's glance covers the night. |
| `COST_BY_MEDIUM` | `{ land: 1.6, landMotorized: 1.15, sea: 1.0 }` | `src/domain/routing.ts:89` | relative prices chosen for their ordering; only the foot pace behind them is measured |
| `LIFT_CAPACITY` | `{ cargo: 12, carrier: 6, airTransport: 2 }` | `src/domain/troops.ts:89` | assumed against the troop ceiling alone — two cargos lift a whole infantry |
| `LIFT_COST` | `{ infantry: 1, armor: 3, landTransport: 2 }` | `src/domain/troops.ts:96` | the passenger half of `LIFT_CAPACITY`, assumed on the same single bearing |
| `LAND_SEATS_PER_TRANSPORT` | `2` | `src/domain/troops.ts:118` | two seats, assumed; at four, motorizing an army would be nearly free |
| `BOARDING_RADIUS_KM` | `50` | `src/domain/troops.ts:126` | 50 km, chosen so a barracks set at its region's centre still reaches the coast |
