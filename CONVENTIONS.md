# Conventions de code

Ce document fait autorité sur la façon d'écrire dans ce dépôt. Il est court exprès : une règle qu'on
ne retient pas n'est pas appliquée.

---

## 1. Penser local

**Un sous-composant ou une fonction vit à côté de son unique usage.** On ne le remonte que le jour
où un deuxième appelant apparaît — et on le remonte alors **du bon nombre de crans**, pas jusqu'à la
racine par réflexe.

En pratique :

| Portée | Où | Exemple |
|---|---|---|
| utilisé par un seul composant | dans le même fichier, sous le composant | `Counter`, `Slots` dans `NationBanner.tsx` |
| utilisé par une seule route | `routes/-<route>/` — TanStack ignore les dossiers préfixés `-` | `routes/-plateau/SelectedCountryPanel.tsx` |
| utilisé par plusieurs routes | dossier de la couche concernée | `shell/`, `map/` |
| logique de jeu, sans UI | `domain/` | `geo.ts` |

Le fichier grossit ? Ce n'est pas un problème tant que tout ce qu'il contient sert au même endroit.
Découper un fichier en cinq pour respecter une limite de lignes déplace le désordre, il ne le
supprime pas.

## 2. Ne pas commenter le code

Un commentaire n'existe que pour expliquer **pourquoi**, quand le code seul induirait en erreur.

```ts
// ✗ décrit ce que le code dit déjà
// on parcourt les pays et on construit un mesh
for (const country of world.countries) { … }

// ✓ explique une décision non évidente
// La courbure est appliquée aux positions côté CPU, jamais dans un shader : sinon le
// raycasting continuerait de viser une géométrie plate et le clic tomberait à côté.
```

Si un commentaire descriptif semble nécessaire, c'est presque toujours qu'il faut renommer.

## 3. Nommer pour être repris

Le nom porte l'intention ; on doit comprendre un appel sans ouvrir la définition.

- `edgeAtLatitude(latitude)` plutôt que `getEdge(l)`
- `buildBoard()`, `loadPlayerView()`, `cutIntoLegs()` — un verbe, un complément
- Les booléens s'énoncent : `isMine`, `cappedByHq`, `crossesAntimeridian`
- Pas d'abréviation sauf si elle appartient au domaine (`lonLat`, `km`)

**Un module de `convex/` porte un nom sans tiret, ne travaille pas à l'import, et ne calcule pas
dans une query ce qu'un script peut cuire.** Ce sont les règles que le runtime impose et que
`tsc`, `eslint` et `convex-test` ignorent — le vérifieur est vert et le déploiement refuse, ou
bien la query expire une fois sur trois en production. Le nom d'abord : un chemin qui n'est pas alphanumérique, tiret
bas ou point s'arrête sur `InvalidConfig`, donc camelCase sous `convex/` (`cargoReturn.ts`,
`regionGeometry.ts`), kebab-case sous `src/domain/` (`movement-orders.ts`) où rien ne l'interdit.
Le travail ensuite : le push évalue chaque module dans un isolat pour y découvrir les fonctions,
avec quatre secondes pour l'ensemble, et un calcul au niveau du module s'arrête sur
`InvalidModules — Function execution timed out`. Un asset se prépare donc derrière une
mémoïsation (`let grid = null` puis `grid ??= decodeGrid(gridAsset, world)`, `convex/routes.ts`),
jamais à l'import. Le budget ensuite : une query a **une seconde**, et rasteriser 1,33 M de
cellules la dépasse à froid, sans JIT — d'où `public/grid.json`, cuit par
`scripts/generate-grid.mjs`, dont l'égalité avec `buildGrid` est vérifiée octet à octet. Ce qui
ne dépend que des assets se cuit hors ligne ; la fonction de référence reste dans
`src/domain/`, seule et testée. Quatre invariants les vérifient (`convex/invariants.test.ts`,
`convex/view-budget.test.ts`).

**Le nom d'un type est un garde-fou.** `PlayerView`, jamais `GameState` : le client ne reçoit pas le
monde, seulement ce qu'un joueur a le droit d'en voir. Le jour où quelqu'un écrit
`gameState.opponents[0].army`, il est trop tard.

## 4. Tidy first

**Ranger et changer le comportement sont deux commits distincts.** Jamais un renommage au milieu
d'une correction : la revue devient impossible et le `git blame` ment.

Les rangements se font petits et souvent : extraire une variable nommée, regrouper du code qui va
ensemble, supprimer un intermédiaire inutile, ordonner les paramètres. Chacun se relit en trente
secondes.

## 5. Code en anglais, jeu en français

**Le code est en anglais** : identifiants, types, noms de fichiers, commentaires, messages
d'erreur serveur (codes uniquement — voir `convex/errors.ts`). Mélanger `distanceKm` et
`obtenirDistance` crée une friction permanente et deux vocabulaires pour la même chose.

**Tout texte affiché au joueur passe par `src/i18n/fr.ts`.** C'est la seule table de
traduction, et le jeu ne parle que français pour l'instant — pas de bascule de langue à
l'exécution. Un composant qui affiche du texte importe `fr` et n'écrit jamais une chaîne
française en dur (sauf JSX statique de mise en page sans portée lexicale, ex. `·`).

Le domaine a le droit d'importer `i18n/fr` — c'est un module de constantes pures, aucune
dépendance React ni Convex. Ce qui reste interdit au domaine, c'est React, three.js et le
backend (§7).

Le vocabulaire du jeu reste **imposé** dans les libellés : *mouvement* et non convoi, *passe de
résolution* et non tour de combat, avant-poste *désactivé* ou *détruit* et jamais *pris*.
Glossaire complet dans `WWS/CONTEXT.md`. Les identifiants anglais correspondants ne cherchent
pas à traduire ce glossaire mot pour mot (`decoy` pour *leurre*, `outpost` pour *avant-poste*) —
seule la table `fr.ts` porte le vocabulaire imposé.

## 6. Pas de fichiers barils

Aucun `index.ts` qui ne fait que ré-exporter. Ils cachent les cycles d'import, cassent le
tree-shaking et rendent impossible de savoir d'où vient réellement un symbole. Chaque import pointe
le fichier réel.

Exception : `map/engine/index.ts` est le point d'entrée du moteur et contient du code — ce n'est
pas un baril.

## 7. Le domaine reste pur

`src/domain/` n'importe **ni React, ni three.js, ni le backend**. Du TypeScript et rien d'autre
(l'import de `src/i18n/fr.ts` est l'exception du §5 — c'est aussi un module de constantes pures).

C'est le seul code qui devra un jour tourner à l'identique côté client et côté serveur — coût de
mouvement, résolution de combat, règles de visibilité. Mélangé à du React, il sera à réécrire.
C'est aussi le seul code qu'on peut tester sans navigateur, et il **doit** l'être.

## 8. Rendre les états impossibles irreprésentables

Quand une donnée a plusieurs formes exclusives, on écrit une **union discriminée**, pas un objet
avec des champs optionnels.

```ts
// ✓ un arc adverse n'a structurellement ni type ni pile
type ArcView =
  | { state: 'mine'; type: MovementType; stack: Stack; … }
  | { state: 'enemyDetected'; suspectedNation: string | null; headingDegrees: number; … }
```

Le brouillard de guerre est alors garanti par le compilateur et non par la relecture. C'est le piège
n°1 du projet ; il ne se tient pas à la vigilance.

## 9. TypeScript strict, sans exception

`strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`,
`verbatimModuleSyntax`. C'est sévère, et c'est voulu : sur du code qui indexe des tableaux de
géométrie partout, c'est exactement là que se logent les bugs silencieux.

`npm run build` lance `tsc --noEmit` avant Vite. Un build qui passe est un build typé.

## 10. Une frontière, pas dix

Le moteur de carte est une classe impérative pilotée par des appels (`displayArcs`,
`select`, `setCurvature`). Il ne connaît pas React ; React ne connaît pas three.js. La
couture tient dans un seul fichier, `map/WorldMap.tsx`.

La même règle vaut pour le backend : `loadGame()` est la seule porte par où le serveur entre
dans le client. Changer de source ne toucherait pas une seule vue.

## 11. Les erreurs serveur sont des codes, jamais des phrases

Toute mutation ou query Convex qui échoue le fait via `fail(code, details?)`
(`convex/errors.ts`), jamais `throw new Error('phrase en français')`. Le code — `NATION_TAKEN`,
`INSUFFICIENT_RESOURCE`, etc. — traverse le réseau tel quel ; c'est `fr.errors` côté client qui
le transforme en phrase. Un test qui vérifie une erreur attend le code (`rejects.toThrow('NATION_TAKEN')`),
jamais un fragment de phrase.
