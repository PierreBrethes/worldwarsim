<!-- Généré par `node scripts/generate-a-mesurer.mjs` depuis les marqueurs `@a-mesurer` — ne pas éditer à la main. Empreinte du contenu source : 9edd565 -->

# Les constantes à mesurer

Une ligne de ce registre est **une valeur en attente de son instrument** : posée pour que la
règle existe et se lise, jamais pour équilibrer quoi que ce soit. Ni une dette, ni un TODO —
`WWS/QUESTIONS.md` porte les questions, les prompts portent le travail. Quand le simulateur en
mesure une, on retire son marqueur et la ligne disparaît à la régénération : le registre a
vocation à se vider, et sa taille mesure la dette de calibrage.

18 valeurs marquées dans `convex/` et `src/domain/`.

**Les tables économiques n'y figurent pas** — `BUILDING_SPEC`, `COST_BY_ROLE`,
`EXTRACTION_PER_HOUR`, `CHAINS` et leurs voisines : leur instrument existe déjà, c'est le
simulateur d'ouverture (`WWS/simulation/opening/`), et l'en-tête de `convex/constants.ts` les
déclare placeholders en bloc. Le registre sert les valeurs que rien ne mesure encore.

| Constante | Valeur | Où | Pourquoi elle attend |
| --- | --- | --- | --- |
| `DETECTION_RANGE_KM` | `{ infantry: 60, armor: 60, landTransport: 40, fighter: 150, bomber: 100, airTransport: 80, escort: 120, cargo: 60, carrier: 200 }` | `convex/constants.ts:537` | every value; no season simulation models detection |
| `ARRIVAL_RADIUS_KM` | `25` | `convex/constants.ts:568` | an assumed starting point; nothing measures how close is close enough on arrival |
| `LISTENING_STATION_RADIUS_KM` | `120` | `convex/constants.ts:582` | a rank in the ordering the design asks for, and nothing more |
| `FOOD_UPKEEP_PER_TROOP_PER_HOUR` | `1` | `convex/constants.ts:597` | picked to read against a farm at level one, never measured |
| `UPKEEP_UNSUPPLIED_MULTIPLIER` | `2` | `convex/constants.ts:610` | assumed; at ×2 the surcharge may drown in an economy where alloy is the bottleneck |
| `OUTPOST_DISABLED_HOURS` | `6` | `convex/constants.ts:620` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `OUTPOST_IMMUNITY_HOURS` | `3` | `convex/constants.ts:621` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL` | `{ food: 2, coal: 1 }` | `convex/constants.ts:638` | assumed; nothing measures what an outpost should cost to hold against a farm's yield |
| `OUTPOST_REACH_KM_BY_LEVEL` | `{ 1: 120, 2: 180, 3: 240 }` | `convex/constants.ts:652` | placeholders assumés, du même statut que l'entretien : mesurés sur ce qu'ils couvrent d'une carte, jamais sur une partie qu'ils auraient changée |
| `RELAY_SPEED_MULTIPLIER` | `1.5` | `convex/constants.ts:677` | shaped so the relay reads as a decision rather than a rounding |
| `REDUCTION_FACTOR` | `0.5` | `convex/constants.ts:703` | the bar of a scaffold, measured by nothing — it leaves with the scaffold |
| `SURVEY_FADED_HOURS` | `24` | `convex/constants.ts:730` | choisi sur la cadence de visite attendue, jamais mesuré en partie |
| `SURVEY_REFRESH_HOURS` | `1` | `convex/constants.ts:743` | une fraction lisible de `SURVEY_FADED_HOURS`, rien de plus |
| `FOUNDER_ABSENCE_HOURS` | `48` | `convex/constants.ts:757` | choisi sur la cadence de visite d'un jeu asynchrone, jamais mesuré en partie |
| `COST_BY_MEDIUM` | `{ land: 1.6, landMotorized: 1.15, sea: 1.0 }` | `src/domain/routing.ts:76` | relative prices chosen for their ordering; only the foot pace behind them is measured |
| `LIFT_CAPACITY` | `{ cargo: 6, airTransport: 2 }` | `src/domain/troops.ts:75` | assumed against the troop ceiling alone — two cargos lift half an army |
| `LIFT_COST` | `{ infantry: 1, armor: 2, landTransport: 1 }` | `src/domain/troops.ts:81` | the passenger half of `LIFT_CAPACITY`, assumed on the same single bearing |
| `LAND_SEATS_PER_TRANSPORT` | `2` | `src/domain/troops.ts:103` | two seats, assumed; at four, motorizing an army would be nearly free |
