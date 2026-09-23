# 12-types-de-convex — `npm run types` type aussi `convex/tsconfig.json`, le projet que `convex deploy` type avant de pousser

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `package.json` (`types` ~11, `build` ~7, `verifier` ~17), `convex/tsconfig.json`
(entier : ni `paths` ni `types`, commentaire ~24-29, `exclude` ~30), `tsconfig.json` (`types` ~8,
`paths` ~21-23), `node_modules/convex/dist/cli.bundle.cjs` (`--typecheck` de deploy, défaut
`"try"`, ~132628 ; `typecheckFailed` fatal même en `try`, ~124790 ; `--project convex`,
~124818-124832), `convex/combat.ts` (~3-9, import de `../src/domain/combat`).

## Pourquoi

`npm run types` ne lance `tsc` qu'avec le tsconfig racine, qui déclare l'alias `@/*` et les types
`vite/client`. `convex deploy` lance, lui, `tsc --project convex` sur `convex/tsconfig.json`, qui
n'a ni l'un ni les autres. Et il s'arrête si ce typage échoue : le mode `try` par défaut ne
tolère que l'absence de tsc, pas un échec. Deux cas passent donc le vérifieur, le pre-push et la
CI, puis cassent le déploiement :

- un fichier de `src/domain/` atteint par `convex/` qui importe par `@/` ;
- un fichier serveur qui lit `import.meta.env`.

Vérifié à la rédaction sur une copie :

- ajouter `export { asDuration as probeDuration } from '@/domain/duration';` à
  `src/domain/combat.ts` laisse le `tsc --noEmit` racine à 0 erreur. Le projet convex rend
  `src/domain/combat.ts(…): error TS2307: Cannot find module '@/domain/duration'` ;
- ajouter `export const probeMode = import.meta.env.MODE;` à `convex/constants.ts` laisse la
  racine à 0 erreur. Le projet convex rend `error TS2339: Property 'env' does not exist on type
  'ImportMeta'`.

Aujourd'hui, `tsc --noEmit -p convex/tsconfig.json` passe en 2,4 s, contre 7,6 s pour la racine.

## Ce qui change

1. Dans `package.json`, `"types"` devient
   `npm run routes && tsc --noEmit && tsc --noEmit -p convex/tsconfig.json`.
   `build` et `verifier` ne bougent pas. Ils passent par `types`, et le pre-push et la CI aussi,
   par `verifier`. Coût : +2,4 s par appel. Le vérifieur l'appelle deux fois (`types` puis
   `build`) jusqu'au 13.
2. `convex/tsconfig.json` : le commentaire ~24-29 ajoute une phrase. `npm run types` lance aussi
   ce projet-ci, tel que `convex deploy` le type. La raison de l'`exclude` ne change pas.
3. `CONVENTIONS.md` §9 : la phrase ~142 devient
   « `npm run types` type deux projets : la racine, puis `convex/tsconfig.json`, celui que
   `convex deploy` type avant de pousser, sans alias `@/` ni types de Vite. `npm run build` le
   lance avant Vite. Un build qui passe est un build typé. »
4. **Décision : `convex/tsconfig.json` ne gagne ni `paths` ni `types`.** Il décrit
   l'environnement des fonctions serveur (commentaire ~24-29). Lui ajouter l'alias ou Vite ferait
   passer ici ce que le déploiement refuserait.

## Ce que ce prompt ne fait pas

- Pas de `tsc` unique, de cache incrémental ni de retrait du doublon `types`/`build` : c'est le 13.
- Pas de règle eslint contre `@/` dans `src/domain/`, sauf `@/i18n/fr` : c'est le 34. Les cinq
  fichiers du domaine qui l'emploient (`compass-rose`, `labels`, `next-actions`,
  `resource-band`, `station-name`) ne sont pas atteints par `convex/` et restent tels quels.
  La phrase de `src/domain/ids.ts` ~4 ne change pas.
- Pas de validateur `returns:` ni de forme servie (54). Rien dans `ci.yml` ni dans le hook : le
  `--typecheck disable` de `convex deploy` est au 66, qui s'appuie sur ce prompt.

## Cas d'acceptation (tests d'abord)

Pas de test vitest : le garde-fou est la commande elle-même, et l'injection tient lieu de test
rouge. Chaque injection se fait par Read puis Edit et s'annule de la même façon.

1. Avant tout changement, sur l'arbre propre : `npm run types` est vert. Noter sa durée, puis
   celle de `tsc --noEmit -p convex/tsconfig.json` seul.
2. Avec l'ancien script, l'injection A (le `export … from '@/domain/duration'` en fin de
   `src/domain/combat.ts`) laisse `npm run types` vert : c'est le trou. Le même `tsc`, lancé à la
   main avec `-p convex/tsconfig.json`, échoue en TS2307.
3. Nouveau script, injection A : `npm run types` sort en erreur et nomme
   `src/domain/combat.ts` et `'@/domain/duration'`. Annuler l'injection.
4. Nouveau script, injection B (le `import.meta.env.MODE` en fin de `convex/constants.ts`) :
   `npm run types` sort en erreur, TS2339. Annuler l'injection.
5. `git diff --stat src/ convex/` ne montre que `convex/tsconfig.json`, et `npm run types` est
   vert.

## Vérifications

- Les cas 1 à 5, dans l'ordre, avec leurs codes de sortie.
- `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus :

- les durées de `npm run types`, avant et après, et celle du projet convex seul ;
- les deux messages d'erreur des injections, verbatim ;
- si le nouveau script rougit sur l'arbre propre (cas 5), le fichier fautif et l'erreur : ne pas
  le corriger ici, le mettre en « À trancher ».
