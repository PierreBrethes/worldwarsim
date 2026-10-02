---
type: prompt
statut: livré
maj: 2026-10-02
code: [convex/regionGeometry.ts, convex/invariants.test.ts, convex/routes.ts, scripts/generate-regions.mjs]
decisions: []
voir: [noms-de-modules-convex.md, ../../../../../CONVENTIONS.md]
---
# contours-de-region-paresseux — un module Convex ne travaille pas à l'import

**En bref.** Rendre paresseuse la préparation des contours de `regionGeometry.ts` et poser un test d'import par module de `convex/` (le déploiement Convex a 4 s pour tout charger). Exécuté (54678c5), en attente de l'acceptation du rapport pour passer en done/.

Lis `CLAUDE.md`, `CONVENTIONS.md`, `convex/regionGeometry.ts`, `convex/routes.ts` (le modèle :
`let grid = null` puis `grid ??= buildGrid(world)` — la grille de 1,33 M de cellules ne se
construit jamais à l'import), `src/domain/region-crossing.ts` (`prepareRegionOutlines`),
`scripts/generer-regions.mjs`, `convex/invariants.test.ts`. Ne commit pas, ne push pas. Aucun
comportement de jeu ne change.

## Constat

`npx convex deploy` s'arrête à `evaluate_push` : « InvalidModules — Loading the pushed modules
encountered the following error: Function execution timed out (maximum duration: 4s) ». Au
déploiement, Convex **évalue chaque module** dans son isolat pour découvrir les fonctions, avec un
budget de 4 s pour le tout. `convex/regionGeometry.ts` (Codex, S6a-2b) fait au niveau du module,
à l'import : `prepareRegionOutlines(regionsAsset.regions…)` sur les 4 589 régions admin-1 de
`public/regions.json` (2,6 Mo, bundlé), puis un index par seaux — c'est ce calcul qui dépasse
4 s sur le serveur. `vitest` charge le module sans mesurer son temps d'import, donc le vérifieur
ne pouvait pas le voir. C'est le second défaut de la même famille en deux jours (les tirets) :
**le vérifieur est vert, le déploiement refuse**.

## Ce qui change

1. **Paresse.** Dans `regionGeometry.ts`, tout ce qui est calculé au niveau du module — `world`,
   `outlines`, `outlineById`, `buckets` — passe derrière une fonction mémoïsée
   (`let index: RegionIndex | null = null ; const indexOf = () => (index ??= buildIndex())`),
   exactement le modèle de `routes.ts`. L'import ne fait plus que déclarer. Les appelants
   (`plunder.ts`, `cargo.ts`, `movement/cargoReturn.ts`…) ne changent pas de signature.
2. **Mesure.** Un test dans `convex/invariants.test.ts` chronomètre `buildIndex()` et imprime la
   durée. Si elle dépasse **500 ms** sur ta machine (le serveur est plus lent, et une mutation
   paie ce coût à sa première demande de retour), la préparation part **hors ligne** :
   `scripts/generer-regions.mjs` cuit `public/regions-outlines.json` (anneaux déjà filtrés du
   cadre de projection, boîtes calculées, seaux) — le module ne fait plus que relire.
   `regions.json` reste ce qu'il est pour le client. Dis dans le rapport laquelle des deux voies a
   été prise, et le chiffre.
3. **Le garde-fou de la famille.** Un test d'invariant qui importe dynamiquement chaque module de
   `convex/` (hors `_generated/`, hors `*.test.ts`) et affirme que l'import prend **moins de
   300 ms** — le message cite le module. Il doit échouer avant le correctif, passer après. Avec
   le test sur les noms de fichiers (prompt `noms-de-modules-convex`), ce sont les deux règles
   que le runtime impose et que `convex-test` ignore ; une ligne dans `CONVENTIONS.md` les nomme
   toutes les deux : *un module de `convex/` porte un nom sans tiret et ne travaille pas à
   l'import*.

## Cas d'acceptation

1. Le test d'import échoue sur `regionGeometry.ts` avant le correctif, passe après.
2. `convex/plunder.test.ts` et les cas de retour (`cargoReturn`) repassent tels quels.
3. `npm run verifier` vert — et, chez Pierre, `npx convex deploy` passe `evaluate_push`.

Un commit : `fix(convex): les contours de région se préparent à la première demande, pas à
l'import — le déploiement a 4 s pour charger tous les modules`.
