---
type: prompt
statut: livré
maj: 2026-10-02
code: [convex/movement/cargoReturn.ts, convex/invariants.test.ts]
decisions: []
voir: [contours-de-region-paresseux.md, ../../../../../CONVENTIONS.md]
---
# noms-de-modules-convex — un tiret dans `convex/` casse le déploiement, pas les tests

**En bref.** Renommer `convex/movement/cargo-return.ts` (le runtime Convex refuse les tirets) et poser un test d'invariant sur les noms de modules. Exécuté (46d2320, e959a08), en attente de l'acceptation du rapport pour passer en done/.

Lis `CLAUDE.md`, `CONVENTIONS.md`, `convex/invariants.test.ts`. Ne commit pas, ne push pas.
Tidy : aucun comportement ne change.

## Constat

`npx convex deploy` refuse le dépôt : `InvalidConfig: movement/cargo-return.js is not a valid
path to a Convex module. Path component cargo-return.js can only contain alphanumeric characters,
underscores, or periods.` Le runtime Convex n'accepte **ni tiret ni espace** dans le chemin d'un
module de `convex/` ; `convex-test` et `tsc` ne vérifient rien de tel, donc `npm run verifier`
est vert sur un dépôt qui ne se déploie pas. Le tiret vient de la convention de `src/domain/`
(`movement-orders.ts`, `region-crossing.ts`), reprise par Codex le 09/09 dans `convex/` où elle
est interdite. `region-geometry.ts` a déjà été renommé `regionGeometry.ts` ; il reste
`convex/movement/cargo-return.ts`. Les fichiers `*.test.ts` à tiret (`founder-absence`,
`off-season`, `view-budget`, `season-partition`) se déploient depuis des semaines : le CLI les
exclut du bundle, ils ne sont pas concernés.

## Ce qui change

1. `git mv convex/movement/cargo-return.ts convex/movement/cargoReturn.ts` et ses importeurs
   (`convex/plunder.ts` au moins — `grep -rn "cargo-return" convex src`). La casse suit les modules
   voisins (`lootCrates.ts`, `regionGeometry.ts`) : camelCase dans `convex/`, kebab-case reste
   à `src/domain/` — une ligne dans `CONVENTIONS.md` le dit, avec la raison (le runtime, pas le
   goût).
2. **Le garde-fou, pour que ça ne repasse jamais par la CI** : dans `convex/invariants.test.ts`,
   un test qui liste tous les `.ts` sous `convex/` hors `_generated/` et hors `*.test.ts`, et
   affirme que chaque segment de chemin matche `^[A-Za-z0-9_.]+$` — le message d'échec cite le
   fichier fautif et la règle. Il doit échouer avant le renommage, passer après.

## Cas d'acceptation

1. `grep -rn "cargo-return\|region-geometry" convex src` ne retourne rien.
2. Le nouveau test d'invariant échoue si l'on crée `convex/x-y.ts` vide (vérifié puis retiré).
3. `npm run verifier` vert — et, chez Pierre, `npx convex deploy` passe l'étape `evaluate_push`.

Un commit : `fix(convex): les modules de convex/ ne portent pas de tiret — le runtime les refuse`,
avec le garde-fou dans le même commit (c'est le même chantier).
