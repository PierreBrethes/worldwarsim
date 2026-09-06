<!-- Généré par `node scripts/generate-a-mesurer.mjs` depuis les marqueurs `@a-mesurer` — ne pas éditer à la main. Empreinte du contenu source : 624b28d -->

# Les constantes à mesurer

Une ligne de ce registre est **une valeur en attente de son instrument** : posée pour que la
règle existe et se lise, jamais pour équilibrer quoi que ce soit. Ni une dette, ni un TODO —
`WWS/QUESTIONS.md` porte les questions, les prompts portent le travail. Quand le simulateur en
mesure une, on retire son marqueur et la ligne disparaît à la régénération : le registre a
vocation à se vider, et sa taille mesure la dette de calibrage.

19 valeurs marquées dans `convex/` et `src/domain/`.

**Les tables économiques n'y figurent pas** — `BUILDING_SPEC`, `COST_BY_ROLE`,
`EXTRACTION_PER_HOUR`, `CHAINS` et leurs voisines : leur instrument existe déjà, c'est le
simulateur d'ouverture (`WWS/simulation/opening/`), et l'en-tête de `convex/constants.ts` les
déclare placeholders en bloc. Le registre sert les valeurs que rien ne mesure encore.

| Constante | Valeur | Où | Pourquoi elle attend |
| --- | --- | --- | --- |
| `INTERCEPTION_RADIUS_KM` | `200` | `convex/constants.ts:541` | no measurement whatsoever; the simulator does not model interception at all |
| `ARRIVAL_RADIUS_KM` | `25` | `convex/constants.ts:554` | an assumed starting point; nothing measures how close is close enough on arrival |
| `SCOUT_RADIUS_KM` | `60` | `convex/constants.ts:570` | picked for realism and for its rank among the detectors, never measured |
| `LISTENING_STATION_RADIUS_KM` | `120` | `convex/constants.ts:584` | a rank in the ordering the design asks for, and nothing more |
| `FOOD_UPKEEP_PER_TROOP_PER_HOUR` | `1` | `convex/constants.ts:599` | picked to read against a farm at level one, never measured |
| `UPKEEP_UNSUPPLIED_MULTIPLIER` | `2` | `convex/constants.ts:612` | assumed; at ×2 the surcharge may drown in an economy where alloy is the bottleneck |
| `OUTPOST_DISABLED_HOURS` | `6` | `convex/constants.ts:622` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `OUTPOST_IMMUNITY_HOURS` | `3` | `convex/constants.ts:623` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL` | `{ food: 2, coal: 1 }` | `convex/constants.ts:640` | assumed; nothing measures what an outpost should cost to hold against a farm's yield |
| `OUTPOST_REACH_KM_BY_LEVEL` | `{ 1: 120, 2: 180, 3: 240 }` | `convex/constants.ts:654` | placeholders assumés, du même statut que l'entretien : mesurés sur ce qu'ils couvrent d'une carte, jamais sur une partie qu'ils auraient changée |
| `RELAY_SPEED_MULTIPLIER` | `1.5` | `convex/constants.ts:679` | shaped so the relay reads as a decision rather than a rounding |
| `REDUCTION_FACTOR` | `0.5` | `convex/constants.ts:705` | the bar of a scaffold, measured by nothing — it leaves with the scaffold |
| `SURVEY_FADED_HOURS` | `24` | `convex/constants.ts:732` | choisi sur la cadence de visite attendue, jamais mesuré en partie |
| `SURVEY_REFRESH_HOURS` | `1` | `convex/constants.ts:745` | une fraction lisible de `SURVEY_FADED_HOURS`, rien de plus |
| `FOUNDER_ABSENCE_HOURS` | `48` | `convex/constants.ts:759` | choisi sur la cadence de visite d'un jeu asynchrone, jamais mesuré en partie |
| `COST_BY_MEDIUM` | `{ land: 1.6, landMotorized: 1.15, sea: 1.0 }` | `src/domain/routing.ts:76` | relative prices chosen for their ordering; only the foot pace behind them is measured |
| `LIFT_CAPACITY` | `{ cargo: 6, airTransport: 2 }` | `src/domain/troops.ts:75` | assumed against the troop ceiling alone — two cargos lift half an army |
| `LIFT_COST` | `{ infantry: 1, armor: 2, landTransport: 1 }` | `src/domain/troops.ts:81` | the passenger half of `LIFT_CAPACITY`, assumed on the same single bearing |
| `LAND_SEATS_PER_TRANSPORT` | `2` | `src/domain/troops.ts:103` | two seats, assumed; at four, motorizing an army would be nearly free |
