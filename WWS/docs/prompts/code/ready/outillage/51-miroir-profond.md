# 51-miroir-profond — un test vitest compare le miroir du simulateur au jeu, tables et fonctions

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** P3 (le travail du simulateur est commité, `sweep.json` régénéré).
**Pierre d'abord :** régénérer `sweep.json` dans le travail indexé du simulateur et le commiter
(P3) ; `verify.mjs` est gardé par défaut (P4) — son retrait se demande au lancement.

**À lire :** `WWS/simulation/opening/verify.mjs` (en-tête ~1-14, `startingLine` ~139-162,
`storageCaps` ~245, la ligne `NOMINAL_STRENGTH` ~300) · `WWS/simulation/opening/constants.mjs`
(tout : 52 exports au 23/09) · `convex/constants.ts` (exports en capitales, les neuf fonctions ;
`FOUNDATION_ORDER` ~239 n'est pas exporté) · `WWS/simulation/opening/scenarios.mjs` (`seasonOf`,
`startingSites` ~114-119) · `scripts/a-mesurer.test.mjs` (forme d'un test de script) ·
`vite.config.ts` (le projet `front` n'exclut que `convex/**` et `node_modules/**`) ·
`convex/off-season.test.ts` (~402, « hands out the starting kit, plants nothing », le jumeau).

## Pourquoi
`verify.mjs` lit `convex/constants.ts` comme du texte, par regex : 145 valeurs comparées, 4 « non
vérifiées » dont `NOMINAL_STRENGTH`. Il ne lit jamais `REST_WINDOW_MINUTES`,
`TROOP_CAP_PER_BILLETS_LEVEL`, `COMMANDED_CHAINS`, `DOMAIN_BY_ROLE`, `PROJECTION_BY_DOMAIN`,
`EXPLOITED_DEPOSITS`, ni aucune des neuf fonctions que le miroir réimplémente. La dérive du 14/09
(QG planté au lancement, corrigée par 21a9a53) était une règle, pas un nombre : aucune
comparaison de valeurs ne l'aurait vue. Mesuré le 23/09 sur l'index : 52 exports au miroir, 27
capitales communes avec le jeu (25 égales en profondeur, 2 écarts de forme), 6 avec `src/domain/`,
et 9 fonctions communes (332 comparaisons, toutes égales).

## Ce qui change
- `scripts/mirror.test.mjs` (à créer), pris d'office par le projet vitest `front` (WWS/ n'héberge
  aucun test ; ceux des scripts vivent dans `scripts/`). Il importe `../convex/constants`, le
  miroir, `scenarios.mjs` et les répondants du domaine : `COST_BY_MEDIUM` (`routing.ts`),
  `LAND_SEATS_PER_TRANSPORT`, `DOMAIN_BY_ROLE`, `PROJECTION_BY_DOMAIN` (`troops.ts`),
  `EXPLOITED_DEPOSITS` (`economy.ts`), `RESOURCES` (`ids.ts`), tous sous `src/domain/`.
- **Tables.** Chaque nom en capitales exporté par le miroir est comparé par `toEqual` (message :
  le nom) à son répondant — `convex/constants.ts` d'abord, sinon le domaine ci-dessus — ou figure
  dans une liste explicite `INSTRUMENT_ONLY`, raison à l'appui : `SEASON_FORMATS`,
  `DEFAULT_TUNING` (propres à l'instrument), `FOUNDATION_ORDER` (privé dans le jeu, son ordre est
  lu par `foundationFor`). Un nom qui n'est dans aucun des trois cas fait échouer le test.
- **Deux adaptateurs de forme, pas un de plus** : `COMMANDED_CHAINS` (tableau dans le jeu, `Set`
  dans le miroir → `[...mirror.COMMANDED_CHAINS]`) ; `OUTPOST_RAISE_SPEC` (`{ cost, minutes }`
  dans le jeu, aplati dans le miroir → `{ ...cost, minutes }`).
- **La ligne de départ**, comme la lit `verify.mjs` (`startingLine`, `LEVEL_COST_FACTOR`), et deux
  dérivés qu'il ignore : `SEASON_FORMATS.campaign` contre `DEFAULT_DURATION_HOURS`,
  `HQ_LEVEL_AT_LAUNCH`, `MAX_HQ_LEVEL`, `STARTING_ALLOY`, `STARTING_OIL`, `STARTING_AMMUNITION` ;
  `DEFAULT_TUNING.levelCostFactor` contre `LEVEL_COST_FACTOR` ; `startingStock('campaign')` contre
  `STARTING_KIT` ; `tier2HqLevel('campaign')` contre `TIER_2_HQ_LEVEL`. `skirmish` et
  `buildingCap*` restent au miroir, sans comparaison.
- **Les neuf fonctions partagées**, sur tout leur domaine, les écarts de signature absorbés à
  l'appel : `buildCost` et `buildMinutes` (15 clés de `mirror.BUILDING_SPEC` × niveaux 1..5, le
  miroir reçoit `mirror.DEFAULT_TUNING`) ; `recruitmentCost` (9 rôles × paliers 1, 2 × QG 1..5,
  `minutesFactor` laissé à son défaut) ; `nominalStrength` (9 rôles × paliers 1, 2 — où le jeu
  lève, le miroir lève) ; `chainSpeed` (QG 1..5) ; `troopCap` (niveaux cumulés de baraquements
  0..12) ; `roleHqLevel` (9 rôles, le miroir reçoit `tier2HqLevel('campaign')`) ; `unlockLevel`
  (15 clés, le miroir reçoit `'campaign'`) ; `foundationFor` (les 32 sous-ensembles de
  `ore, coal, food, textile, oil`, en `Set` pour le jeu, en tableau pour le miroir). Leurs noms,
  écrits en dur, doivent égaler l'intersection des fonctions exportées des deux côtés.
- **Si 37 a supprimé** du miroir `TROOP_CAP_PER_BILLETS_LEVEL`, `REST_WINDOW_MINUTES` et
  `nominalStrength` (son point 3), ne rien rétablir : 49 exports, 25 capitales communes, 8
  fonctions, 314 comparaisons. Un `ignoreIssues` de 37 sur `constants.mjs` se signale, intact.
- **`it('le lancement ne plante rien')`** : `seasonOf('campaign').startingSites` et
  `seasonOf('skirmish').startingSites` valent `[]`, `seasonOf('campaign').foundation[0].key` vaut
  `'hq'` ; le commentaire cite la décision 1b du 13/09 et le test convex jumeau.
- `WWS/simulation/opening/README.md` (~65) et `WWS/simulation/README.md` (~32), une phrase chacun :
  la comparaison profonde est `scripts/mirror.test.mjs`, `verify.mjs` reste le filet sans dépendance.

## Ce que ce prompt ne fait pas
- Ne touche ni `verify.mjs` (P4), ni aucun module du simulateur, qui reste sans dépendance, ni
  `convex/constants.ts` (aucun export ajouté pour le test). Un retrait de `verify.mjs` demandé au
  lancement est un commit à part : le rapport en liste les points d'appel sans les toucher.
- Ne corrige aucune dérive trouvée (recopier le miroir déplace `grille.json` et `sweep.json` :
  commit du simulateur) ; les sorties suivies du simulateur, c'est 52.

## Cas d'acceptation (tests d'abord)
0. `git status --short WWS/simulation` est vide au départ ; sinon, arrête-toi (P3 pas faite).
1. `npx vitest run scripts/mirror.test.mjs` passe sur l'arbre propre.
2. Chaque altération temporaire (Edit, puis Edit inverse) fait échouer le test en nommant sa cible :
   `NOMINAL_STRENGTH.infantry[2]` 30 → 31 ; `'quartermaster'` dans le `Set` de `COMMANDED_CHAINS` ;
   `0.225` → `0.25` dans `chainSpeed` (message : fonction et argument) ; `PROBE_TABLE = {}` exporté
   en plus ; `startingSites` à `[{ key: 'hq' }]` dans `seasonOf` (« le lancement ne plante rien »).
3. À la fin, `git diff -- 'WWS/simulation/opening/*.mjs'` est vide.

## Vérifications
- `npx vitest run scripts/mirror.test.mjs` vert (durée) ; `npx eslint` et `npx prettier --check`
  sur ce fichier, propres ; `node WWS/simulation/opening/verify.mjs` inchangé (145, 4, code 0).
- `npm run verifier` vert, le décompte de tests augmenté du nouveau fichier.

## Rapport attendu
Format commun (README de la série), plus :
- décompte : capitales comparées au jeu, au domaine, laissées à l'instrument (27, 6, 3, ou 25, 6,
  3 après 37) ; comparaisons de fonctions ; durée du fichier seul ; toute dérive, non corrigée ;
- À trancher : garder `verify.mjs` ou le retirer, sachant ce qu'il vérifie encore seul
  (`storageCaps`, le plafond d'entrepôt lu sur le moteur) — avec une recommandation.
