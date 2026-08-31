<!-- Généré par `node scripts/generate-a-mesurer.mjs` depuis les marqueurs `@a-mesurer` — ne pas éditer à la main. Empreinte du contenu source : 0421567 -->

# Les constantes à mesurer

Une ligne de ce registre est **une valeur en attente de son instrument** : posée pour que la
règle existe et se lise, jamais pour équilibrer quoi que ce soit. Ni une dette, ni un TODO —
`WWS/QUESTIONS.md` porte les questions, les prompts portent le travail. Quand le simulateur en
mesure une, on retire son marqueur et la ligne disparaît à la régénération : le registre a
vocation à se vider, et sa taille mesure la dette de calibrage.

17 valeurs marquées dans `convex/` et `src/domain/`.

**Les tables économiques n'y figurent pas** — `BUILDING_SPEC`, `COST_BY_ROLE`,
`EXTRACTION_PER_HOUR`, `CHAINS` et leurs voisines : leur instrument existe déjà, c'est le
simulateur d'ouverture (`WWS/simulation/opening/`), et l'en-tête de `convex/constants.ts` les
déclare placeholders en bloc. Le registre sert les valeurs que rien ne mesure encore.

| Constante | Valeur | Où | Pourquoi elle attend |
| --- | --- | --- | --- |
| `BUILDING_CAP_BASE` | `5` | `convex/constants.ts:156` | the pair a single format leaves behind, never simulated — ADR 0020 §10 replaces it |
| `BUILDING_CAP_PER_HQ_LEVEL` | `2` | `convex/constants.ts:157` | the pair a single format leaves behind, never simulated — ADR 0020 §10 replaces it |
| `INTERCEPTION_RADIUS_KM` | `200` | `convex/constants.ts:520` | no measurement whatsoever; the simulator does not model interception at all |
| `ARRIVAL_RADIUS_KM` | `25` | `convex/constants.ts:533` | an assumed starting point; nothing measures how close is close enough on arrival |
| `SCOUT_RADIUS_KM` | `60` | `convex/constants.ts:548` | picked for realism and for its rank among the detectors, never measured |
| `LISTENING_STATION_RADIUS_KM` | `120` | `convex/constants.ts:562` | a rank in the ordering the design asks for, and nothing more |
| `FOOD_UPKEEP_PER_TROOP_PER_HOUR` | `1` | `convex/constants.ts:577` | picked to read against a farm at level one, never measured |
| `UPKEEP_UNSUPPLIED_MULTIPLIER` | `2` | `convex/constants.ts:590` | assumed; at ×2 the surcharge may drown in an economy where alloy is the bottleneck |
| `OUTPOST_DISABLED_HOURS` | `6` | `convex/constants.ts:600` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `OUTPOST_IMMUNITY_HOURS` | `3` | `convex/constants.ts:601` | neither figure is in the design; shaped only so the pair reads on a 48-hour season |
| `OUTPOST_REACH_KM` | `400` | `convex/constants.ts:610` | sized against what it covers on a map, never against a game it changed |
| `RELAY_SPEED_MULTIPLIER` | `1.5` | `convex/constants.ts:624` | shaped so the relay reads as a decision rather than a rounding |
| `REDUCTION_FACTOR` | `0.5` | `convex/constants.ts:650` | the bar of a scaffold, measured by nothing — it leaves with the scaffold |
| `COST_BY_MEDIUM` | `{ land: 1.6, landMotorized: 1.15, sea: 1.0 }` | `src/domain/routing.ts:76` | relative prices chosen for their ordering; only the foot pace behind them is measured |
| `LIFT_CAPACITY` | `{ cargo: 6, airTransport: 2 }` | `src/domain/troops.ts:49` | assumed against the troop ceiling alone — two cargos lift half an army |
| `LIFT_COST` | `{ infantry: 1, armor: 2, landTransport: 1 }` | `src/domain/troops.ts:55` | the passenger half of `LIFT_CAPACITY`, assumed on the same single bearing |
| `LAND_SEATS_PER_TRANSPORT` | `2` | `src/domain/troops.ts:77` | two seats, assumed; at four, motorizing an army would be nearly free |
