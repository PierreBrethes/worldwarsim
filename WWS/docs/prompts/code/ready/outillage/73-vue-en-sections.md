# 73-vue-en-sections — `viewOf` lit et assemble, chaque section de la vue a son constructeur dans `convex/viewSections.ts`, et le fil sert exactement la même chose

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 53, 54 ; et 21 (le motif `*.sonde.test.ts` gitignoré). Optionnel, rangement pur : un commit sans
changement de comportement.

**À lire :** `convex/view.ts` en entier, par tranches (`viewOf` ~92-944 : lectures ~93-337, littéral rendu ~338-944
et ses 19 clés, `me` ~361-669 ; hors de `viewOf` : `lastEdition` ~955, `named` ~1065, `detectedArcs` ~1116 et leurs
aides jusqu'à ~1251) · `convex/view-shape.test.ts` (54 : le scénario à deux sièges) · `convex/view-adapter.test.ts`
(53) · `convex/view-budget.test.ts` (`VIEW_BYTES` ~50, `VIEW_DOCS` ~59) · `convex/invariants.test.ts` (noms de
modules ~105, travail à l'import ~144) · `convex/dev.ts` ~162 (second appelant de `viewOf`) ·
`convex/_generated/api.d.ts` (et be9fcd5, qui y ajoute `objectives` à la main) · `CONVENTIONS.md` §1.

## Pourquoi
`viewOf` fait 853 lignes (~92-944) d'un fichier de 1 251 lignes et 61 485 octets, et `convex/view.ts` a changé dans
38 des 130 commits depuis le 24/08 : chaque lot qui sert un champ relit le tout pour y ajouter quelques lignes.
CONVENTIONS §1 tolère un gros fichier dont tout sert au même endroit ; c'est la fonction qui ne se lit plus d'un
tenant. Le découpage ne se tente que filets posés : 54 fige les chemins servis à un adversaire, 53 la traduction
côté client, `view-budget.test.ts` les octets et les documents lus. Manquent un filet sur les **valeurs** servies
et un sur le **type** du fil : ce prompt les pose pour la durée du chantier, puis les retire.

## Ce qui change
1. **La sonde des valeurs, d'abord** : `convex/view-golden.sonde.test.ts` (à créer, gitignoré, supprimé à la fin).
   Le scénario de `convex/view-shape.test.ts` (par `convex/scenario.fixture.ts` s'il existe, sinon recopié),
   horloge figée, `Math.random` fixé par `vi.spyOn` (`convex/seasons.ts` ~191 et ~788 : graine et code de
   partie). À chaque lecture et pour les deux sièges, `JSON.stringify(convexToJson(vue), null, 1)` (la forme du
   fil, `convex/values`) passe à
   `expect(…).toMatchFileSnapshot('../node_modules/.cache/wws/vue-sonde/<lecture>-<siège>.json')` : le premier
   passage écrit, les suivants comparent et impriment l'écart. Jamais de `-u`.
2. **La sonde du type, d'abord** : `node_modules/.bin/tsc -p convex/tsconfig.json --noEmit false --declaration
   --emitDeclarationOnly --removeComments --outDir <scratchpad>/dts-avant` (2,7 s à la rédaction, sans erreur) ;
   `convex/view.d.ts` y porte le type entier de `playerView` et `viewOf`, d'où sort `ServerView`.
3. `convex/viewSections.ts` (à créer ; sans tiret, n'importe pas `convex/view.ts`, rien à l'import) : un
   constructeur exporté par section, nommé d'après sa clé, qui reçoit en paramètres ce qu'il met en forme. Découpe
   de départ, à ajuster au code : `season` ; `me` en groupes de clés **contiguës**, étalés dans l'ordre (identité
   et fondateur ~362-382 ; économie, slots, QG, point de capitale ~383-451 ; sol, sites, bâtiments et chantier
   ~452-568 ; troupes, entretien et cargaisons ~569-620 ; avant-postes ~621-669) ; `reports` ; les catalogues
   (`buildCatalog`, `outpostFoundation`, `storageCapPerLevel`) ; les relevés (`surveyedInstallations`,
   `lootSightings`) ; `movements` ; `camps` ; `objectives` ; `warEntries` ; `notices` ; `opponents`.
   `lastEdition`, `named`, `detectedArcs` et leurs aides suivent la section qui les appelle.
4. `viewOf` garde `playerOf`, ses refus, les lectures d'avant le littéral et l'assemblage : 19 clés dans le même
   ordre, chaque valeur un appel. **Une lecture ne change pas de rang** : ce que `viewOf` lit avant le littéral y
   reste, lu une fois, et passe aux constructeurs ; ce qu'une clé lit en ligne (`engagementsOf`, `detectedArcs`,
   `seasonObjectives`, la requête des dépêches) part avec son constructeur, appelé à la même place. Une dérivation
   pure d'une seule section la suit (`founderAbsence`, `buildCatalog`, `armyPresent`, `winner`, `nationOf`) ; une
   dérivation partagée (`stationOf` : `armyPresent` et `troops` ; `cargoView` : `stationedCargo` et `movements`)
   devient une fonction de `convex/viewSections.ts` qui reçoit ce qu'elle lisait en closure ; celle dont une
   lecture dépend (`carrying` avant `heldOver`) reste où elle est.
5. Les commentaires suivent leur code, mot pour mot. Aucun type ajouté ni annoté (le fil reste inféré), aucun
   renommage, aucune simplification au passage : un écart de sonde se corrige vers l'existant.
6. `convex/_generated/api.d.ts` : les deux lignes que la génération écrit pour un module (`import type * as
   viewSections`, `viewSections: typeof viewSections`), à leur rang, à la main comme be9fcd5 ; jamais `npx convex`.
7. **Par étapes vertes** : une section extraite, puis la sonde, `npx vitest run convex/view-shape.test.ts
   convex/view-adapter.test.ts`, et la suivante. Une session qui ne suffit pas s'arrête sur une étape verte : le
   commit vaut pour les sections faites, le rapport liste les autres.
8. Si `.claude/skills/wws-prompt/` existe (71) : la recette « champ servi » et la liste des fichiers de vue de
   `SKILL.md` nomment aussi `convex/viewSections.ts`. Les autres renvois à `convex/view.ts` restent justes.

## Ce que ce prompt ne fait pas
- `BoardContent` (`src/routes/plateau.tsx` ~357) n'est pas touché : on en extrait un hook seulement quand une
  fonctionnalité passe par la préoccupation concernée.
- Aucun changement de comportement, de forme, de valeur ni de lecture ; ni `returns:` ni type de retour sur
  `viewOf` ; aucun test ajouté au dépôt ni modifié ; ADR et fiches ne bougent pas.

## Cas d'acceptation (tests d'abord)
1. Avant toute édition : la sonde passe deux fois de suite, la seconde en comparant ; sinon la rendre
   déterministe, jamais le code.
2. Après chaque section et à la fin : la sonde, verte ; `npx vitest run convex/view-shape.test.ts
   convex/view-adapter.test.ts convex/view-budget.test.ts convex/invariants.test.ts` : vert.
3. La sonde du type (« Ce qui change », 2) relancée vers `<scratchpad>/dts-apres` : `diff` des deux `convex/view.d.ts` vide.
4. Contre-épreuve : un champ ajouté un instant au constructeur de `camps` fait échouer la sonde et
   `view-shape.test.ts` ; retiré, vert.
5. Mesure AST (API de TypeScript, script dans le scratchpad) : `viewOf` sous 200 lignes, aucune fonction de
   `convex/viewSections.ts` au-dessus de 150 ; sinon la mesure au rapport, et ce qui l'empêche.
6. Fin : la sonde et `node_modules/.cache/wws/vue-sonde/` supprimées ; `git diff --stat -- 'convex/*.test.ts'`
   vide ; `git status --short` : `convex/view.ts`, `convex/viewSections.ts`, `convex/_generated/api.d.ts` (et le skill).

## Vérifications
Les cas 1 à 6 ; `npm run verifier` vert (dont le budget d'import et `mesure-isolat`).

## Rapport attendu
Format commun (README de la série), plus : la découpe finale (constructeur → lignes) et les longueurs avant et
après (`viewOf`, `convex/view.ts`) ; la durée de la sonde ; les sections restées, s'il y a eu arrêt ; pour la
relecture de Pierre, une fois indexé : `git diff --cached --color-moved=dimmed-zebra -- convex/view.ts
convex/viewSections.ts`. « À trancher » : 1a garder `convex/viewSections.ts` à part (recommandé : `convex/view.ts`
se lit alors d'un seul Read), 1b ramener les constructeurs sous `viewOf`, comme CONVENTIONS §1 le veut pour un
seul appelant.
