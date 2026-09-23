# 41-validateurs-miroirs — Les sept unions de `validators.ts` qui recopient `ids.ts` sont vérifiées égales au typage, y compris dans le sens que tsc ne voit pas

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `convex/validators.test.ts` (entier, 26 lignes), `convex/validators.ts` (en-tête ~3-11,
`UNIT_ROLE` ~13, `UNIT_TIER` ~25, `BUILD_COST_KEY` ~53, `MEDIUM` ~102, `SPECIALIZATION` ~180,
`DETECTOR` ~191, `MOVEMENT_TYPE` et son commentaire ~566-589), `src/domain/ids.ts` (`UnitRole` ~20,
`UnitTier` ~31, `MovementType` ~33-52, `BuildCostKey` ~123, `Specialization` ~144, `Detector` ~160,
`Medium` ~163), `tsconfig.json` (`include`, `noUnusedLocals`), `convex/tsconfig.json` (`exclude`).

## Pourquoi

`validators.ts` se dit le miroir d'`ids.ts` (~9), mais le test de couture ne compare que
`RESOURCE_KEY` et `BUILDING_KEY` (`validators.test.ts` ~17-18). Les deux sens de dérive ne se
valent pas.
- **Validateur → domaine** : un littéral ajouté au seul validateur casse déjà tsc (vérificateur
  de l'audit : 38 erreurs pour `UNIT_ROLE`, 10 pour `UNIT_TIER`, 6 pour `MEDIUM`, 3 pour
  `DETECTOR`, 1 pour `SPECIALIZATION`).
- **Domaine → validateur** : rien ne casse dans `convex/`. Mesuré le 23/09 sur une copie :
  - `'sonde'` ajouté à `Detector` donne 4 erreurs, toutes dans des `Record` exhaustifs du front
    (`src/domain/journal.ts` ×2, `src/i18n/fr.ts`, `src/routes/-plateau/CampBadge.tsx`) ;
  - `'probe'` ajouté à `MovementType` en donne dans `compass-rose.ts`, `labels.ts`, `fr.ts` et
    `plateau.tsx`.
  Une fois ces tables complétées, le validateur reste en retard sans que rien le dise, et la
  valeur que le domaine déclare, aucune ligne ne peut la porter.
- Le seul écart voulu, `'decoy'` en plus dans `MOVEMENT_TYPE` (legacy), n'est écrit qu'en prose
  (`validators.ts` ~574-578, `ids.ts` ~47-50).

## Ce qui change

1. Les assertions vont dans `convex/validators.test.ts`. **Vérifié** : le `tsconfig.json` racine
   inclut `convex` sans exclure les tests, donc `npm run types` les type. `convex/tsconfig.json`
   les exclut, et `tsc --noEmit -p convex/tsconfig.json` (ajouté par 12) ne les voit pas : voulu.
2. Un nouvel `it` (« les unions du domaine sont celles des validateurs, au typage ») porte, avec
   `expectTypeOf` de `vitest` et `import type { Infer } from 'convex/values'`, six égalités :
   `expectTypeOf<Infer<typeof UNIT_ROLE>>().toEqualTypeOf<UnitRole>()`, puis la même forme pour
   `UNIT_TIER`/`UnitTier`, `SPECIALIZATION`/`Specialization`, `DETECTOR`/`Detector`,
   `MEDIUM`/`Medium` et `BUILD_COST_KEY`/`BuildCostKey`.
   Pas d'alias `type Equal<…>` ni d'assertion posée en `type _ = …` : sous `noUnusedLocals`, un
   alias que rien ne lit est refusé. `expectTypeOf` ne coûte rien à l'exécution.
3. `MOVEMENT_TYPE` : `expectTypeOf<Infer<typeof MOVEMENT_TYPE>>().toEqualTypeOf<MovementType | 'decoy'>()`.
   **Écart au cahier** : sa formule, `Equal<Exclude<Infer<typeof MOVEMENT_TYPE>, MovementType>,
   'decoy'>`, ne vérifie que le sens validateur → domaine. Mesuré : avec `'probe'` ajouté à
   `MovementType`, elle passe. L'égalité avec l'union couvre les deux sens et nomme l'exception.
4. Deux commentaires, qui disent un *pourquoi* :
   - au-dessus de l'`it` : ce test couvre le sens domaine → validateur, que tsc ne voit pas (l'autre
     sens casse déjà les lectures typées) ; il est jugé par `npm run types`, et vitest ne l'exécute
     que pour la forme ;
   - au-dessus de la ligne `MOVEMENT_TYPE`, une phrase sur le leurre retiré le 29/08, puis une
     dernière ligne de marqueur, sur le modèle de `@a-mesurer` et au format que 45 généralise :
     `@wipe decoy — le littéral de MOVEMENT_TYPE, et cette exception avec lui`.

## Ce que ce prompt ne fait pas

Ni `validators.ts` ni `ids.ts` ne changent, et `'decoy'` reste jusqu'au wipe. Les comparaisons à
l'exécution de `RESOURCE_KEY` et `BUILDING_KEY` restent : elles vérifient aussi l'ordre. Aucun autre
marqueur `@wipe` n'est posé (45), et aucun script npm n'est ajouté.

## Cas d'acceptation (tests d'abord)

1. Les assertions sont écrites d'abord, et `npm run types` est vert tout de suite : les unions sont
   égales aujourd'hui (vérifié sur une copie).
2. Mutation `| 'sonde'` dans `Detector` (`ids.ts` ~160) : `npm run types` nomme
   `convex/validators.test.ts` en plus de `journal.ts`, `fr.ts` et `CampBadge.tsx`. Sans ce
   prompt, il ne nommait que ces trois-là. Retirer la mutation.
3. Mutation `| 'probe'` dans `MovementType` : `convex/validators.test.ts` est nommé. Retirer.
4. Mutation : sans `v.literal('decoy')` dans `MOVEMENT_TYPE`, `convex/validators.test.ts` est
   nommé (avec `convex/movements.ts` ~439, `type === 'decoy'`, mesuré sur une copie). L'exception
   est vérifiée, pas seulement tolérée. Retirer.

## Vérifications

`npm run types` (durée avant et après), `npx vitest run convex/validators.test.ts`, puis
`npm run verifier` : verts.

## Rapport attendu

Format commun (README de la série), plus :
- les fichiers nommés par tsc pour chaque mutation ;
- **À trancher** : d'autres unions du validateur recopient un type du domaine hors d'`ids.ts`
  (`COMBAT_SIDE`/`CombatSide` et `TROOP_STATE`/`TroopState` dans `src/domain/combat.ts`,
  `SEASON_STATUS`/`SeasonStatus` dans `src/domain/off-season.ts`, la `phase` de `STRIKE` avec
  `'riposte'`). Vérifier chaque paire, puis recommander de les ajouter ou non. Ne pas le faire ici.
