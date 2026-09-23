# 03-clic-droit-du-mappage — Plus aucun libellé ne nomme un bouton en dur : la visée, la condition de pose et l'aide-mémoire lisent le mappage

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `src/domain/mouse-mapping.ts` (`buttonOfRole`, les deux presets),
`src/domain/mouse-mapping.test.ts` (« les notices lisent le mappage », ~88-113), `src/i18n/fr.ts`
(le modèle `mapUi.mouse` ~2101-2110 et `mapUi.gestures` ~2119, `upperFirst` ~55, les fautifs
nommés plus bas), `src/data/mouseMapping.ts`, et sous `src/routes/-plateau/` : `TroopBadge.tsx`
(~57-58, ~136), `EconomyWindow.tsx` (`conditionOf` ~856, `ConditionLine` ~863, `AbsentKeys` ~980),
`BriefingSheet.tsx` (~20).

## Pourquoi

CLAUDE.md (~115) affirme qu'aucune phrase du jeu n'écrit « clic droit » : les gestes sortent du
mappage (`fr.mapUi.gestures` est une fonction de `MouseMapping`). Pourtant, trois libellés vivants
l'écrivent en dur :
- `fr.troops.badgeAiming` (~1279), « choisissez la destination — clic droit sur la carte », au pied
  du cartouche en visée (TroopBadge.tsx ~136) ;
- `fr.economy.condition.free(count)` (~1688), « … — clic droit sur la carte », lu par `conditionOf` ;
- `fr.briefing.columns` (~2023), « Clic droit sur un avant-poste à vous : … ». La fonction reçoit
  déjà `mapping` et s'en sert dans sa première colonne (~2006-2008). La ligne date de 2e2da13
  (16/09), deux jours avant le preset. L'audit l'a manquée : sa recherche respectait la casse.

`fr.economy.nothingBuilt` (~1814) dit la même chose, sans aucun lecteur. Sous « molette agit »
(7bc3a69, 18/09), le clic droit déplace la carte : la consigne est fausse au moment où l'on vise.
Le seul garde-fou (mouse-mapping.test.ts ~78) ne cherche que `button === N`, et dans `src/map`.

## Ce qui change

1. `src/i18n/fr.ts` :
   - `troops.badgeAiming` devient `(mapping: MouseMapping) => string` : « choisissez la destination
     — `${fr.mapUi.mouse.click[buttonOfRole(mapping, 'act')]}` sur la carte ». Le libellé gagne le
     mot « net », celui de la fiche `?` : le joueur lit le même geste aux deux endroits.
   - `economy.condition.free` devient `(count: number, mapping: MouseMapping) => string`, construit
     de la même façon.
   - Dans `briefing.columns`, la dernière ligne de la deuxième colonne commence par
     `${upperFirst(fr.mapUi.mouse.click[buttonOfRole(mapping, 'act')])} sur un avant-poste à vous :`.
     La suite ne change pas.
   - `economy.nothingBuilt`, clé morte que le test du point 3 attraperait, est **supprimée** (du
     rangement, que le rapport signale). Les huit autres clés mortes reviennent à 40.
2. Les appelants lisent le mappage par `useMouseMapping()` (`src/data/mouseMapping.ts`), comme
   BriefingSheet et ControlsCard. Chaque appel se place **avant** le premier `return null` du
   composant (règle des hooks) :
   - `TroopBadge`, avant celui de `lead` (~58) ;
   - `conditionOf(placement, mapping)` : `ConditionLine` et `AbsentKeys` appellent chacun le hook,
     `AbsentKeys` avant son `if (absent.length === 0) return null` (~990). Aucune prop n'est
     ajoutée à EconomyWindow.
3. `src/i18n/fr-hygiene.test.ts` (à créer, 40 le complète). Une fonction locale lit fr.ts par
   `ts.createSourceFile` (`typescript` est déjà en devDependencies). Elle rend chaque
   `StringLiteral`, `NoSubstitutionTemplateLiteral` et `TemplateHead/Middle/Tail`, avec sa ligne
   et son chemin de propriétés (`fr.troops.badgeAiming`) ; les commentaires en sont exclus
   d'office. Un `it` écarte le sous-arbre `fr.mapUi.mouse` par son chemin (pas par ses lignes). Il
   échoue sur `/\bclic\s+(droit|molette)\b|\bbouton\s+(droit|du\s+milieu)\b/i` en nommant
   `fr.ts:L chemin « … »`.
4. `src/domain/mouse-mapping.test.ts`, « les notices lisent le mappage ». `badgeAiming`,
   `condition.free(3, …)` et la deuxième colonne de `briefing.columns` nomment « clic droit net »
   sous `CLASSIC_MAPPING` et « clic molette net » sous `WHEEL_ACTS_MAPPING` (« Clic … », majuscule,
   dans l'aide-mémoire : comparer sans casse), jamais le bouton de l'autre preset.
5. Doc : la phrase de CLAUDE.md ~115 devient vraie, y ajouter que `src/i18n/fr-hygiene.test.ts` la
   garde. Si 24 est passé et qu'elle vit dans `WWS/docs/ETAT-DU-CODE.md`, c'est là.

## Ce que ce prompt ne fait pas

- Les invariants du clic gauche restent en l'état : `settingsWindow.mouseNote` (~1951), la
  première colonne de l'aide-mémoire (~2006-2007) et `mapUi.gestures` (~2124, ~2129).
- Aucun commentaire ne change, ni dans fr.ts ni dans le code : ils datent des décisions.
- `event.button`, `mapping.left/middle/right` et le test des numéros de bouton reviennent à 35.
- Les autres clés mortes et le vocabulaire banni reviennent à 40.

## Cas d'acceptation (tests d'abord)

1. Écrit avant toute correction, le test du point 3 est rouge. Il nomme exactement quatre chemins,
   dont aucun ne vient de `fr.mapUi.mouse` : `fr.troops.badgeAiming`, `fr.economy.condition.free`,
   `fr.economy.nothingBuilt` et `fr.briefing.columns…`.
2. Les cas du point 4 sont rouges avant la correction, verts après.
3. `fr.troops.badgeAiming(WHEEL_ACTS_MAPPING)` rend exactement « choisissez la destination — clic
   molette net sur la carte ».
4. `git grep -n -i "clic droit\|clic molette" -- src/i18n/fr.ts` ne rend plus que des commentaires
   et la table `mapUi.mouse` ; `git grep -n nothingBuilt -- src convex` ne rend rien.
5. `npm run types` passe : les deux signatures changées n'ont plus d'appelant oublié.

## Vérifications

- `npx vitest run src/i18n/fr-hygiene.test.ts src/domain/mouse-mapping.test.ts` : vert (nombre
  de cas), puis `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : la sortie rouge du cas 1 (quatre chemins, avec leurs
lignes) ; les trois libellés rendus sous chaque preset ; tout littéral attrapé en plus des quatre,
et ce qu'on en a fait.
