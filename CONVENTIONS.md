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
| utilisé par un seul composant | dans le même fichier, sous le composant | `Compteur`, `Slots` dans `BandeauNation.tsx` |
| utilisé par une seule route | `routes/-<route>/` — TanStack ignore les dossiers préfixés `-` | `routes/-plateau/PanneauMaNation.tsx` |
| utilisé par plusieurs routes | dossier de la couche concernée | `coque/`, `carte/` |
| logique de jeu, sans UI | `domaine/` | `geo.ts` |

Le fichier grossit ? Ce n'est pas un problème tant que tout ce qu'il contient sert au même endroit.
Découper un fichier en cinq pour respecter une limite de lignes déplace le désordre, il ne le
supprime pas.

## 2. Ne pas commenter le code

Un commentaire n'existe que pour expliquer **pourquoi**, quand le code seul induirait en erreur.

```ts
// ✗ décrit ce que le code dit déjà
// on parcourt les pays et on construit un mesh
for (const pays of monde.pays) { … }

// ✓ explique une décision non évidente
// La courbure est appliquée aux positions côté CPU, jamais dans un shader : sinon le
// raycasting continuerait de viser une géométrie plate et le clic tomberait à côté.
```

Si un commentaire descriptif semble nécessaire, c'est presque toujours qu'il faut renommer.

## 3. Nommer pour être repris

Le nom porte l'intention ; on doit comprendre un appel sans ouvrir la définition.

- `bordALatitude(latitude)` plutôt que `getEdge(l)`
- `construirePlateau()`, `chargerVueJoueur()`, `tronconner()` — un verbe, un complément
- Les booléens s'énoncent : `aMoi`, `plafonneParQg`, `traverseAntimeridien`
- Pas d'abréviation sauf si elle appartient au domaine (`lonLat`, `km`)

**Le nom d'un type est un garde-fou.** `VueJoueur`, jamais `EtatPartie` : le client ne reçoit pas le
monde, seulement ce qu'un joueur a le droit d'en voir. Le jour où quelqu'un écrit
`etatPartie.adversaires[0].armee`, il est trop tard.

## 4. Tidy first

**Ranger et changer le comportement sont deux commits distincts.** Jamais un renommage au milieu
d'une correction : la revue devient impossible et le `git blame` ment.

Les rangements se font petits et souvent : extraire une variable nommée, regrouper du code qui va
ensemble, supprimer un intermédiaire inutile, ordonner les paramètres. Chacun se relit en trente
secondes.

## 5. Nommer en français

Le domaine, la documentation et le glossaire sont en français. Le code aussi. Mélanger
`distanceKm` et `getDistance` crée une friction permanente et deux vocabulaires pour la même chose.

Le vocabulaire du jeu est **imposé** : *mouvement* et non convoi, *passe de résolution* et non tour
de combat, avant-poste *désactivé* ou *détruit* et jamais *pris*. Glossaire complet dans
`WWS/CONTEXT.md`.

Restent en anglais : les API tierces (`useEffect`, `Mesh`, `fetch`) et les noms de fichiers de
composants React, qui suivent la convention `PascalCase.tsx`.

## 6. Pas de fichiers barils

Aucun `index.ts` qui ne fait que ré-exporter. Ils cachent les cycles d'import, cassent le
tree-shaking et rendent impossible de savoir d'où vient réellement un symbole. Chaque import pointe
le fichier réel.

Exception : `carte/moteur/index.ts` est le point d'entrée du moteur et contient du code — ce n'est
pas un baril.

## 7. Le domaine reste pur

`src/domaine/` n'importe **ni React, ni three.js, ni le backend**. Du TypeScript et rien d'autre.

C'est le seul code qui devra un jour tourner à l'identique côté client et côté serveur — coût de
mouvement, résolution de combat, règles de visibilité. Mélangé à du React, il sera à réécrire.
C'est aussi le seul code qu'on peut tester sans navigateur, et il **doit** l'être.

## 8. Rendre les états impossibles irreprésentables

Quand une donnée a plusieurs formes exclusives, on écrit une **union discriminée**, pas un objet
avec des champs optionnels.

```ts
// ✓ un arc adverse n'a structurellement ni type ni pile
type ArcAffiche =
  | { etat: 'mien'; type: TypeMouvement; pile: Pile; … }
  | { etat: 'adverseDetecte'; nationSuspectee: string | null; capDegres: number; … }
```

Le brouillard de guerre est alors garanti par le compilateur et non par la relecture. C'est le piège
n°1 du projet ; il ne se tient pas à la vigilance.

## 9. TypeScript strict, sans exception

`strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`,
`verbatimModuleSyntax`. C'est sévère, et c'est voulu : sur du code qui indexe des tableaux de
géométrie partout, c'est exactement là que se logent les bugs silencieux.

`npm run build` lance `tsc --noEmit` avant Vite. Un build qui passe est un build typé.

## 10. Une frontière, pas dix

Le moteur de carte est une classe impérative pilotée par des appels (`afficherArcs`,
`selectionner`, `reglerCourbure`). Il ne connaît pas React ; React ne connaît pas three.js. La
couture tient dans un seul fichier, `carte/Carte.tsx`.

La même règle vaudra pour le backend : une fonction `chargerVueJoueur()` derrière laquelle on
échange le fixture contre Convex, sans toucher à une seule vue.
