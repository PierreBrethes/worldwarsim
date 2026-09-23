# 35-traducteur-de-bouton — Un bouton ne devient un rôle que par `mouse-mapping.ts`, et le test qui le garde lit tout `src/`

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 03.

**À lire :** `src/domain/mouse-mapping.ts` (`CLASSIC_MAPPING` ~18, `DEFAULT_MOUSE_MAPPING` ~23,
`buttonOfRole` ~65, le commentaire de `BY_INDEX` ~70-71, `buttonAt` ~75, `roleAt` ~77),
`src/domain/mouse-mapping.test.ts` (describe « la carte ne lit aucun numéro de bouton », ~62-84),
`src/map/MapLabels.tsx` (~305-336 : `onClick`, `onAuxClick`, `onContextMenu`),
`src/routes/-plateau/ConstructionPanel.tsx` (~87), `src/routes/-plateau/Window.tsx` (~119),
`src/routes/-plateau/dragging.ts` (~135), `src/map/engine/index.ts` (`roleOf` ~743,
`applyMapping` ~761), `src/data/settings.ts` (~84-86).

## Pourquoi

CLAUDE.md (~108) dit qu'« un seul endroit traduit un bouton en rôle (`roleOf`, un test l'exige par
grep sur `src/map`) ». `mouse-mapping.ts` (~70-71) se dit de son côté « le seul endroit du dépôt où
ces trois numéros s'écrivent ». Les deux affirmations sont fausses :
- `event.button !== 0` s'écrit trois fois ailleurs : ConstructionPanel.tsx ~87, Window.tsx ~119,
  dragging.ts ~135 ;
- MapLabels.tsx lit le mappage bouton par bouton : `mapping.left === 'act'` (~310),
  `mapping.middle !== 'act'` (~328), `mapping.right !== 'act'` (~334) ;
- `roleAt` n'a aucun appelant en production, seulement son test.

Le test (`/\bbutton\s*===\s*\d/`, sur `src/map` seul) ne voit ni `!==`, ni `==`, ni `buttons &`,
ni `src/routes` ; or une lecture parallèle est un second mappage, qui ne suivra pas le jour où la
traduction change. knip signale en plus l'export dupliqué `CLASSIC_MAPPING|DEFAULT_MOUSE_MAPPING`.

## Ce qui change

1. Les trois `event.button !== 0` deviennent `buttonAt(event.button) !== 'left'`. Le comportement
   ne change pas : une fenêtre se saisit au bouton gauche quel que soit le mappage, c'est un
   invariant de fenêtre et non un rôle de carte.
2. Dans `MapLabels.tsx`, chaque ligne garde strictement son comportement :
   - `onClick` : `roleAt(mapping, event.button) === 'act'` ;
   - `onAuxClick` : `buttonAt(event.button) !== 'middle' || roleAt(mapping, event.button) !==
     'act'`. Le filtre sur le milieu reste : sans lui, le bouton droit agirait deux fois, par
     `contextmenu` et par `auxclick` ;
   - `onContextMenu` : `buttonOfRole(mapping, 'act') !== 'right'`, et **pas** `roleAt` : un
     `contextmenu` ouvert au clavier (touche Menu, Maj+F10) ne porte pas forcément `button === 2`,
     et le lire par son numéro changerait le comportement.
3. `mouse-mapping.test.ts` : renommer le describe (par exemple « aucun fichier ne traduit un bouton
   hors de mouse-mapping.ts »).
   - Le `it` existant lit désormais tout `src/` sauf `src/domain/mouse-mapping.ts`, avec
     `/\bbuttons?\s*[!=]==?\s*\d|\bbuttons\s*&/`.
   - Un second `it`, sur le même périmètre, refuse `/\bmapping\.(left|middle|right)\b/`.
   - Le fichier de test est dans le périmètre : aucun titre ni commentaire n'y écrit ce qu'il
     cherche (`button !== 0`, `mapping.left`), sans quoi il se trouverait lui-même.
   - Pas d'exemption, vérifié : `src/map/engine/index.ts` (`roleOf`, `applyMapping`) lit
     `this.mapping[button]` sur un bouton que `buttonAt` a nommé, `SettingsWindow.tsx` (~135, ~288)
     lit `mapping[button]` parce qu'il édite la table. Ne pas élargir les motifs à `mapping[`.
4. Un seul nom : `CLASSIC_MAPPING` reste, `DEFAULT_MOUSE_MAPPING` disparaît (c'est `CLASSIC_MAPPING`
   qui fait la paire avec `WHEEL_ACTS_MAPPING` et la clé de preset `classic`). L'alias disait le
   défaut par son seul nom : une ligne au-dessus de `CLASSIC_MAPPING` le dit désormais (décision du
   30/08 ; `readMouseMapping` le rend, le moteur en part). Lecteurs : `src/data/settings.ts` (~2,
   ~86), `src/map/engine/index.ts` (~24, ~171), `mouse-mapping.test.ts` (~7, ~53).
5. Doc, là où la règle vit : `WWS/docs/ETAT-DU-CODE.md` si 24 est passé, sinon CLAUDE.md ~108.
   - La parenthèse devient « (`buttonAt` et `roleAt`, `src/domain/mouse-mapping.ts` ; un test
     l'exige par grep sur tout `src/`) ». Si 26 est passé, l'incise « **pas encore vrai** : … »
     qu'il a posée derrière elle, et qui renvoie à ce prompt, est retirée.
   - Si 25 est passé, la ligne « Bouton → rôle » du tableau de CLAUDE.md nomme d'abord `buttonAt`,
     `roleAt` (`src/domain/mouse-mapping.ts`) ; `roleOf` n'y reste que comme lecteur du moteur.
   - Rien d'autre : les autres affirmations périmées reviennent à 26.

## Ce que ce prompt ne fait pas

- Le `roleOf` privé du moteur, la grammaire des gestes et les textes de fr.ts (03) ne bougent pas.
- Aucune règle ESLint (34) ; la configuration de knip revient à 37, qui suppose ce prompt.

## Cas d'acceptation (tests d'abord)

1. Écrits avant la correction, les deux `it` sont rouges. Le premier nomme ConstructionPanel.tsx,
   Window.tsx et dragging.ts, le second MapLabels.tsx, et rien d'autre.
2. Après la correction, les deux sont verts, et ces deux recherches ne rendent rien :
   `git grep -nP "\bbuttons?\s*[!=]==?\s*\d|\bbuttons\s*&" -- src` et
   `git grep -nP "\bmapping\.(left|middle|right)\b" -- src`.
3. `git grep -n "roleAt(" -- src ':!*.test.ts'` rend MapLabels.tsx en plus de la définition, et
   `git grep -n DEFAULT_MOUSE_MAPPING -- src` ne rend rien.
4. Mutation : un `event.button !== 0` remis dans Window.tsx fait tomber le premier `it` (à retirer).

## Vérifications

- `npx vitest run src/domain/mouse-mapping.test.ts src/data/settings.test.ts` : vert.
- `npm run knip` n'affiche plus de section « Duplicate exports » ; il sort encore en erreur pour
  d'autres raisons, jusqu'à 37.
- `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : la sortie rouge des deux `it` avant la correction ;
pour les trois gestionnaires de MapLabels, l'équivalence avec l'ancienne lecture sous les deux
presets, raisonnée ligne à ligne ; toute autre lecture de bouton croisée en route, même hors des
deux motifs.
