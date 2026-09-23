# 43-compat-deploiement — `npm run compat` dit, hors ligne et avant la poussée, si le schéma exige un wipe ou si un travail planifié perd sa cible

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `scripts/mesure-isolat.mjs` (esbuild de convex ~36, `mkdtemp` ~205, bundle ~215,
`finally` ~310) ; `scripts/exporter-etat-reference.mjs` ~517 (garde « lancé directement ») ;
`node_modules/convex/dist/esm/server/schema.js` (`export()` ~148, rend une chaîne JSON) et
`node_modules/convex/dist/esm/server/impl/registration_impl.js` (`exportArgs` ~101) ;
`convex/validators.ts` (`NOTICE` ~217) ; `convex/movements.ts` (bouchons ~762-790) ;
`convex/dev.ts` (`GAME_TABLES` ~13, `reset` ~55) ; appels sur plusieurs lignes :
`convex/outposts.ts` ~84, `production.ts` ~131, `movement/detection.ts` ~652.

## Pourquoi

La règle « champ ajouté à une table existante = `v.optional` » (CLAUDE.md, § Schéma Convex) n'a
aucun garde : seul `npx convex deploy` refuse, dans le job `deployer`, après la poussée (ci.yml
~37-39). c9fee6b (26/08) ajoute quatre `seasonId` obligatoires : la casse du 27/08. 1adb0f3 (11/09)
ajoute `players.accountId` et retire `players.token` : le wipe 85a, trouvé par raisonnement.
`convex/schema.ts` compte 24 commits depuis le 04/09. Retirer ou rétrécir une cible de
`scheduler.runAt/runAfter` fait échouer les travaux en attente, et `dev:reset` ne vide que
`GAME_TABLES` : le wipe ne les annule pas. D'où les bouchons `encounter`/`intercept`, tenus de
mémoire ; cf9f0f2 et 11f72d9 ont retiré des cibles sans bouchon. Le prototype de l'audit retrouve
ces cas : 0,07 à 0,14 s pour le schéma, 0,5 à 2,7 s pour le planifié (séquentiel).

## Ce qui change

1. `scripts/compat-deploiement.mjs` (à créer), `[--contre <ref>] [--tete <ref>]`. `--contre` vaut
   `git merge-base HEAD origin/main` par défaut ; sans `origin/main`, sortie 2 : « origin/main
   introuvable — git fetch origin, ou --contre <ref> ». `--tete` vaut **l'arbre de travail**
   (celui du vérifieur, celui qu'un agent vérifie avant le commit). Une référence s'extrait par
   `git archive` (ceux des dossiers `convex`, `src`, `public` qu'elle contient ; sans
   `convex/schema.ts`, code 2) dans un `mkdtemp` préfixé `compat-deploiement-` sous `os.tmpdir()`,
   `node_modules` du dépôt lié en symbolique, supprimé en `finally` : **rien ne s'écrit dans le
   dépôt**. De chaque côté : bundle de `convex/schema.ts` par l'esbuild de convex, import,
   `JSON.parse(default.export())`.
2. Fonctions pures exportées. **Schéma** : pour chaque table commune, le `documentType` de la tête
   accepte tout document que l'ancien acceptait, par une inclusion récursive et conservatrice
   (dans le doute, erreur) — obligatoire ajouté, optionnel devenu obligatoire, champ retiré,
   littéral ou membre d'union retiré, type rétréci. Un élargissement passe ; une table ajoutée ne
   dit rien ; une table retirée est un **avertissement** (refus de `convex deploy` non vérifié) ;
   les index sont ignorés. Chemins lisibles : `players.accountId`, et une variante d'union d'objets
   par son champ littéral, `notices[kind=movementSighted].detector` (sinon « variante kind=X
   retirée »). **Cibles** : chaque `.runAt(` / `.runAfter(` de `convex/**/*.ts` hors `*.test.ts` et
   `_generated/`, retours à la ligne tolérés, dont le 2e argument est `internal.<module>.<fonction>`
   (`internal.movement.arrival.f` → `convex/movement/arrival.ts`), relevé des deux côtés ; une
   cible non littérale, d'un côté ou de l'autre, est une **erreur**, « appel planifié illisible »,
   fichier:ligne. **Planifié** : chaque cible de la **référence** reste exportée par la tête, et
   ses `exportArgs()` acceptent les anciens ; une passe esbuild par côté pour tous les modules visés.
3. Sortie : `contre` → `tête` en SHA courts (`arbre` pour l'arbre de travail), section schéma,
   section planifié (appels, cibles), verdict. Codes : 0 compatible (avertissements permis),
   1 incompatible, 2 impossible à vérifier (message d'origine). Schéma : « ce déploiement exige un
   wipe (ou v.optional + lecteur ??) », plus « le wipe ne l'efface pas : migration » pour une table
   absente de `GAME_TABLES`, lu comme texte dans `convex/dev.ts` **de la référence** : le wipe
   tourne sur l'ancien déploiement (deploiement/README.md, « le wipe de C3, et son ordre ») ; sans
   `GAME_TABLES` à la référence, pas d'annotation. Planifié : « garder la fonction exportée en
   bouchon, arguments compris (comme `encounter`), le temps que les travaux en attente passent ».
4. `package.json` : `"compat": "node scripts/compat-deploiement.mjs"`, hors de `verifier`.
5. `CLAUDE.md`, § Schéma Convex, ou là où 24-25 l'ont rangée (`git grep -n "v.optional" CLAUDE.md
   WWS/docs`) : une phrase qui nomme `npm run compat` ; `wc -m < CLAUDE.md` reste ≤ 8 000 (25).

## Ce que ce prompt ne fait pas

Aucun branchement : ni pre-push, ni CI, ni `deploiement/WIPE-REQUIS` (44) ; pas dans `verifier`,
car le script dépend de git et la CI clone en profondeur 1. Ni marqueurs de wipe (45), ni wipe
(59), ni version en prod (64). Les bouchons restent.

## Cas d'acceptation (tests d'abord)

1. `scripts/compat-deploiement.test.mjs` (à créer), d'abord rouge. Fixtures en `defineSchema`,
   `defineTable`, `v`, puis `.export()`, sans git. (a) Obligatoire ajouté : erreur ; optionnel :
   rien. (b) Optionnel → obligatoire. (c) Champ retiré. (d) Littéral retiré, nommé ; ajouté, rien.
   (e) `v.union(v.string(), v.null())` → `v.string()` erreur, l'inverse rien ; `id('a')` →
   `id('b')`, `v.any()` → `v.string()` erreurs. (f) Obligatoire ajouté dans un objet imbriqué et
   dans une variante `kind`. (g) Table retirée : avertissement, code 0. (h) Relevé sur sources
   texte : une ligne, `ctx.scheduler\n  .runAt(…)`, arguments sur trois lignes, module imbriqué,
   cible non littérale (ligne juste). (i) Arguments : optionnel ajouté rien, obligatoire erreur,
   fonction absente erreur.
2. `npm run compat -- --contre c9fee6b~1 --tete c9fee6b` : code 1, huit erreurs — `seasonId` sur
   `buildings`, `troops`, `movements` et `outposts`, puis `sightings.detector`, `sightings.detectorId`,
   `notices[kind=movementSighted].detector` et `.detectorRegion` ; planifié compatible, 5 cibles.
3. `--contre 1adb0f3~1 --tete 1adb0f3` : code 1, exactement `players.accountId` et `players.token`.
4. `--contre 11f72d9~1 --tete 11f72d9` : code 1, `recruitments.buildingId` ajouté,
   `recruitments.count` retiré, table `units` en avertissement, cible `units.deliver` disparue.
5. Code 0 pour `--contre e008b32~1` (14 cibles, dont `movements.encounter` gardée en bouchon),
   `--contre 2b096ba` (13 cibles) et `--contre HEAD` (24 appels, 16 cibles). Vrai à 7bc3a69 : si
   un commit de la série a changé le schéma depuis, nommer la ligne et le commit.
6. Code 2, message clair : `--contre nimportequoi` ; `--contre ffe311a` (premier commit, sans
   `convex/`). Après chaque cas 2 à 6, atelier supprimé : `ls "$(node -p 'require("os").tmpdir()')"
   | grep -c '^compat-deploiement-'` rend 0, et `git status --short` ne montre aucun bundle.

## Vérifications

`npx vitest run scripts/compat-deploiement.test.mjs` vert ; cas 2 à 6 sous `/usr/bin/time -p`,
moins de 5 s chacun ; `npm run verifier` vert ; `git status --short` : le script, son test,
`package.json`, `CLAUDE.md` (ou le fichier où 24-25 ont rangé la règle).

## Rapport attendu

Format commun (README de la série), plus : la sortie brute des cas 2 à 4, les durées des cas 2 à
6, les faux positifs de l'inclusion conservatrice rencontrés. « À trancher » : 1a une table
retirée devient erreur (non vérifié, jamais contre la prod) ; 1b la tête par défaut reste l'arbre
de travail plutôt que `HEAD`.
