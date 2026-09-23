# 39-regles-partagees — Chaque fonction de refus du domaine est déclarée partagée avec le serveur ou propre au client, et un test le vérifie

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `src/domain/movement-orders.ts` (~195-240, `refusalOf` ~276, `foundingRefusal` ~348),
`src/domain/construction.ts` (`upgradeHold` ~401, `outpostRaiseHold` ~451, `foundationHold` ~470-490),
`convex/lootCollections.ts` (~70-80), `convex/movement/orders.ts` (`march`, sa porte ~503-509),
`convex/invariants.test.ts` (~105-130, `modulePathsUnder` : lecture récursive des sources),
l'ADR 0015 (révision du 24/08, ~340-345).

## Pourquoi

CLAUDE.md et l'ADR 0015 (« la condition n'est jamais un texte écrit deux fois ») veulent le refus
de la rose et celui du serveur issus d'une seule fonction de `src/domain/`. Rien ne le vérifie :
- Des 13 exports de `src/domain/` qui répondent à `\w+(Refusal|RefusalOf|Hold)\b`, 4 n'ont aucun
  import dans `convex/` hors tests : `lootCollectionRefusalOf`, `lootCollectionOrderRefusalOf`,
  `foundationHold`, `upgradeHold`.
- `convex/lootCollections.ts` ~77 recode `if (freeCapacity <= 0) fail('NO_CARGO_CAPACITY')`, la
  condition de `lootCollectionRefusalOf` ~212, alors que CLAUDE.md ~333-334 dit la rose et le
  serveur issus de « la même fonction (`plunderOrderRefusalOf`, `lootCollectionOrderRefusalOf`…) ».
- `foundationHold` se dit « lue par les deux bouts » (~476), mais elle et `upgradeHold` lisent
  `PlayerView` : côté client par nature, un contrôle naïf les prendrait en faute. D'où deux tables.

## Ce qui change

1. `convex/lootCollections.ts` ~77 : `const refusal = lootCollectionRefusalOf(freeCapacity);` puis
   `if (refusal !== null) fail(refusal);`. Rangement : pour une capacité finie, `<= 0` ⟺ `!(> 0)`.
2. `convex/shared-rules.test.ts` (à créer) lit les sources comme `invariants.test.ts` (`node:fs`,
   `import.meta.dirname`, parcours récursif : `convex/movement/` en est).
   - **Énumération** : dans `src/domain/*.ts` hors tests,
     `/export (?:function|const) (\w*(?:[Rr]efusal(?:Of)?|Hold))\b/g`, soit 14 fonctions. **Écart au
     cahier** : le motif est élargi pour attraper `refusalOf`, la règle même de la rose.
   - **`PARTAGEES`** (fonction → modules serveur qui l'importent), vérifiée le 23/09 :
     `nicknameRefusal`, `passwordRefusal` → `convex/auth.ts` ; `placementRefusal`, `outpostRaiseHold`
     → `convex/constructions.ts` ; `demolitionRefusalOf` → `convex/buildings.ts` ;
     `outpostDismantleRefusalOf` → `convex/outposts.ts` ; `plunderRefusalOf`, `foundingRefusal` →
     `convex/movements.ts` ; `plunderOrderRefusalOf` → `convex/movement/orders.ts` (`movements.ts`
     ~516 ne fait que le citer) ; `refusalOf` → `convex/movement/orders.ts`, `convex/movements.ts` ;
     `lootCollectionRefusalOf` → `convex/lootCollections.ts`.
   - **`CLIENT_SEUL`** (fonction → raison) : `foundationHold` lit `PlayerView`, et le serveur
     débite `buildCost('outpost', 1)` par `debit` ; `upgradeHold` lit `Building` et `PlayerView`,
     et le serveur refuse par `constructions.start` (`CAPPED_BY_HQ` ~688, le même `cappedByHq` que
     sert la vue) et par `debit` ; `lootCollectionOrderRefusalOf` compose `refusalOf('march')`, que
     `march` relit, et `lootCollectionRefusalOf`, que le serveur ne peut lire qu'après le dépôt,
     sur le mouvement déposé.
   - `it` 1 : chaque fonction énumérée est dans **une seule** table, aucune entrée ne vise une
     fonction disparue ; l'échec nomme le fichier et dit de déclarer la paire (module ou raison).
   - `it` 2 : chaque module de `PARTAGEES` importe la fonction par `import { … } from '…'`
     (accolades sur plusieurs lignes, `as` géré) dont le chemin mène **au fichier qui la définit** ;
     un nom cité en commentaire ne compte pas.
   - `it` 3 : aucun module de `convex/` n'importe une fonction de `CLIENT_SEUL` — lecture récursive
     (`convex/movement/` compris), hors `_generated/`, `*.test.ts`, `*.fixture.ts`, `test.setup.ts`.
3. Le commentaire de `foundationHold` (~476-477) dit vrai : la rose la lit, et le serveur refuse la
   même facture par `buildCost('outpost', 1)` (`convex/movements.ts` ~153) et `debit`.
4. Doc, là où la phrase vit : `WWS/docs/ETAT-DU-CODE.md` si 24 est passé, sinon `CLAUDE.md` ~333.
   - La parenthèse devient « (`plunderOrderRefusalOf` ; pour le ramassage,
     `lootCollectionOrderRefusalOf`, que le serveur relit en ses deux moitiés) ». Si 26 est passé,
     l'incise « **pas encore vrai** : … » qu'il a posée derrière elle pour la caisse, et qui renvoie
     à ce prompt, est retirée.
   - Si 25 est passé, la ligne « Rose = serveur » de `## Systèmes` nomme le test et ne cite plus
     `foundationHold`, rangée dans `CLIENT_SEUL` ; `wc -m < CLAUDE.md` ≤ 8 000.

## Ce que ce prompt ne fait pas

Aucun refus redessiné : le serveur n'appelle pas `lootCollectionOrderRefusalOf` (`march` ne rend
pas sa colonne) ; `concludeRefusal` (`convex/seasons.ts`) reste hors du motif. `movements.collectLoot`,
qu'aucun test convex n'appelle, est signalé, pas testé. Ni ESLint (34), ni CONVENTIONS (68), ni récit (26).

## Cas d'acceptation (tests d'abord)

1. Le test est écrit avant le point 1. Il est rouge sur un seul constat, `lootCollectionRefusalOf`
   absente de `convex/lootCollections.ts`, et passe au vert après le point 1.
2. Mutations temporaires, retirées ensuite : `export const fooRefusal = () => null;` dans
   `src/domain/economy.ts` fait tomber l'`it` 1 ; `convex/movements.ts` ajouté à
   `plunderOrderRefusalOf` dans la table fait tomber l'`it` 2 ; `foundationHold` ajoutée à l'import
   de `../src/domain/construction` dans `convex/constructions.ts` (~9) fait tomber l'`it` 3.
3. `git grep -n "freeCapacity <= 0" -- convex` ne rend rien.
4. Si 26 est passé, `grep -n "pas encore vrai" WWS/docs/ETAT-DU-CODE.md` ne rend plus de ligne qui
   nomme 39 ; si 25 l'est, la ligne « Rose = serveur » nomme le test et plus `foundationHold`.

## Vérifications

`npx vitest run convex/shared-rules.test.ts src/domain/movement-orders.test.ts`, puis `npm run verifier` : verts.

## Rapport attendu

Format commun (README de la série), plus : la sortie rouge du cas 1 ; les deux tables telles
qu'écrites et le nombre de fonctions énumérées ; toute fonction de refus croisée hors du motif
(dans `convex/` ou sous un autre nom), signalée sans être ajoutée.
