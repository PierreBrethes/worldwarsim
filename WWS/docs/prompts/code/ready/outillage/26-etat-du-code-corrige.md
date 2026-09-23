# 26-etat-du-code-corrige — le récit de `WWS/docs/ETAT-DU-CODE.md` ne se contredit plus : une seule liste d'événements de couleur, les vrais noms, deux règles marquées « pas encore vraies »

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 23, 24, 25.

**À lire :** `WWS/docs/ETAT-DU-CODE.md` (entier) ; `CLAUDE.md` (`## Systèmes`, `## Où lire`) ; `convex/production.ts`
(~11-31, ~102-124) et les appelants de `reportChange` (`convex/outposts.ts` ~42, ~156 ; `convex/movement/arrival.ts`
~391 ; `convex/constructions.ts` ~384-408), `convex/plunder.ts` ~215, ~368 ; `src/emblems/units/manifest.ts` ~209 ;
`src/domain/movement-orders.ts` ~606 ; `convex/validators.ts` ~580 ; `convex/lootCollections.ts` ~77 ; la fiche 11 (bandeaux de 23).

## Pourquoi

24 a déplacé le récit tel quel, erreurs comprises (numéros de `CLAUDE.md` à 7bc3a69) :
- Couleur : « trois événements — fondation, désactivation, fin » (~385), « le seul … que personne
  n'ordonne » (~389), « la fondation ou la perte » (~413), « de plus » (~436), « quatrième » (~468),
  « cinquième » (~510). Le code en a cinq, tous `settleBeforeChange` puis `reportChange`, et la
  fondation n'en est plus un depuis le 15/09 (un chantier ne tient rien). Cinq commentaires répètent
  le compte : `convex/production.ts` ~17, ~104, `constructions.ts` ~384, `production.test.ts` ~48, ~508.
- « cinq nations sont dessinées … les trois nations restantes » (~215-219) : les huit de `NATIONS`
  sont dans `SPRITES_BY_NATION` (fd65d52). « Pas de naval, pas d'aérien » (~27), « mode terrestre
  seul » (~264) : aucun type de mouvement n'est naval ou aérien (`MOVEMENT_TYPE`), mais le serveur
  route en `land`, `naval`, `air`, `combined` par `routeModeOf` (`convex/movements.ts` ~449).
- « le rail les affiche grisées » (~370) : retirées le 26/08 (bf3ca07) ; « le flux … a remplacé la
  [§4.5] » (~371) : il remplace l'envoi, §4.3 (23). `generer-monde.mjs`, `generer-regions.mjs`,
  `monde.json` (~241-246) : `generate-*.mjs` et `world.json` depuis f6e10fc. « la fiche 08 est figée
  « ni grille, ni terrain » » (~244) : aucune fiche ne l'écrit (formule de l'ADR 0012 ~63 sur la fiche
  09 ~12). `unites`, `recrutements` (~184) : noms de l'ADR 0011 (le schéma a `troops`,
  `recruitments`), et « la règle de `WWS/CLAUDE.md` », que 22 a retirée.
- Deux règles écrites comme des faits : `lootCollectionOrderRefusalOf` partagé (~333), quand
  `convex/lootCollections.ts` ~77 recode `freeCapacity <= 0` ; « un seul endroit traduit un bouton »
  (~108), quand `event.button !== 0` s'écrit dans trois fichiers de `src/routes/-plateau/` et que
  `MapLabels.tsx` lit `mapping.left/middle/right`.

## Ce qui change

Chaque phrase se corrige là où elle vit (`grep -n`) : `ETAT-DU-CODE.md`, ou `CLAUDE.md` si 25 l'y a laissée (qui ne grossit pas).

1. **Événements de couleur, une liste**, au paragraphe « Et un bâtiment ne produit que relié » : la
   couleur ne bouge qu'aux événements qui règlent à l'ancienne couleur puis rapportent
   (`settleBeforeChange`, `reportChange`) — le lever d'un avant-poste (`standOutpost`), sa désactivation
   par raid (`deactivate`), la fin de cette désactivation (`restoreAfterDisabling`, rendez-vous pris par
   le raid ; le pillage prend le même pour rendre la production d'un site, sans toucher à la couleur),
   la fin d'une élévation (`finishRaise`), le démantèlement (`dismantle`). Sans nombre ; ailleurs,
   « un événement de couleur ». « Le seul que personne n'ordonne » tombe : le lever et l'élévation sont
   aussi des rendez-vous (`scheduleStand`, `constructions.finish`). Dans `convex/`, **commentaires
   seuls** : `production.ts` ~17 reçoit la liste ; les quatre autres perdent leur ordinal ou leur « seul ».
2. **Sprites** : chaque nation de `NATIONS` a sa planche dans `SPRITES_BY_NATION`, un rôle sans
   planche vaut `null` (repli en cadre pointillé) ; ni décompte ni liste des trous.
3. **Routage** : ~27 « aucun type de mouvement naval ni aérien (`MOVEMENT_TYPE`) » ; ~264 « le
   serveur route en `land`, `naval`, `air` ou `combined` selon `routeModeOf` ».
4. **Rail, fiche 11** : le rail ne les montre pas (retirées le 26/08, `src/shell/SurfaceRail.tsx`) ; sections
   périmées et remplaçants comme les bandeaux de 23 (§4.3, §4.5, §4.6), et `CLAUDE.md` § « Où lire » s'il les nomme.
5. **Noms** : `scripts/generate-world.mjs` écrit `public/world.json`, `scripts/generate-regions.mjs`
   `public/regions.json` ; « figée « ni grille, ni terrain » » → « le terrain de la fiche 08 §5 attend cet ADR ».
6. **Tables** : « `unites`, `recrutements` dans l'ADR 0011, aujourd'hui `troops`, `recruitments` » ;
   « la règle de `WWS/CLAUDE.md` » → « la règle d'alors (le schéma de jeu attendait le dernier 🔴 ;
   depuis la décision 3a du 16/09, un 🔴 ne bloque que ce qu'il nomme, `WWS/QUESTIONS.md`) ».
7. **Deux incises**, derrière la règle intacte, ouvertes par « **pas encore vrai** : », le fait puis
   le correctif : « le prompt outillage 35 rend la règle vraie et retire cette incise » (bouton) ;
   « le prompt outillage 39 branche le serveur sur `lootCollectionRefusalOf`, réécrit la parenthèse et
   retire cette incise » (caisse). Pas de chemin vers `ready/` ; pas d'incise pour 35 ou 39 déjà passé.

## Ce que ce prompt ne fait pas

Aucune règle rendue vraie (35, 39), aucun comportement : seuls des commentaires de `convex/` bougent.
Ni les ADR (leurs ordinaux sont datés), ni `RESTE-A-CODER.md` ~297 (30), ni `GarrisonPanel.tsx`
~139-141 (relevé par 24) : au rapport. Aucun récit réécrit au-delà de ces phrases, aucun décompte.

## Cas d'acceptation (tests d'abord)

Chaque cas est une commande, lancée d'abord **avant** l'édition (chiffre de départ).

1. `cat WWS/docs/ETAT-DU-CODE.md CLAUDE.md | tr '\n' ' ' | grep -oE "(trois|quatrième|cinquième) +\**événements?|couleur\** de plus|fondation ou à la perte|seul de ces événements|cinq nations|trois nations restantes|terrestre seul|affiche +grisées|generer-(monde|regions)|monde\.json|ni grille, ni terrain"` :
   16 à 7bc3a69 (15 si 25 a corrigé l'arborescence), rien après.
2. `git grep -nE "trois événements|quatrième événement|comme les deux autres" -- convex` : 5, puis rien.
3. `for f in standOutpost deactivate restoreAfterDisabling finishRaise dismantle; do grep -qw "$f" WWS/docs/ETAT-DU-CODE.md || echo "$f"; done` : rien ;
   `git grep -l "reportChange(" -- convex ':!*.test.ts' ':!convex/production.ts'` : `constructions.ts`, `movement/arrival.ts`, `outposts.ts`, rien d'autre.
4. `grep -c "pas encore vrai" WWS/docs/ETAT-DU-CODE.md` : 2 (une de moins par prompt 35 ou 39 déjà passé) ; l'une nomme 35, l'autre 39.
5. `grep -nwE "unites|recrutements" WWS/docs/ETAT-DU-CODE.md CLAUDE.md` : la seule phrase qui les rend à l'ADR 0011 et nomme `troops`.
6. `git diff -U0 -- convex | grep -E '^[-+][^-+]' | grep -vE '^[-+]\s*(\*|//|/\*)'` : rien.

## Vérifications

Les cas 1 à 6 ; `npx vitest run convex/production.test.ts` vert ; `npm run verifier` vert.

## Rapport attendu

Format commun (README de la série), plus : chaque phrase corrigée, avant → après ; les appelants de
`reportChange` relus ; les affirmations périmées croisées sans correction, avec leur preuve (dont
`convex/movement/arrival.ts` ~388-390, « Destruction waits for looting »).
