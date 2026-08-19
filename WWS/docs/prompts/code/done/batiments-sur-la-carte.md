# Prompt Claude Code — les bâtiments sur la carte, et la teinte des régions bâties

> **PROMPT CONSOMMÉ — passé le 15/08 (commit `30eb625`). Le corps ci-dessous est conservé tel
> qu'il a été écrit : c'est la trace de ce qui était prévu, pas la description de ce qui tourne.
> Trois écarts à l'exécution, tranchés le 16/08 et gravés dans `WWS/sprites/README.md` §7 —
> **c'est ce README qui fait foi, pas ce prompt** :**
>
> 1. **Pas de billboard 3D.** Les points 1 et 2 décrivent un sprite posé sur la région,
>    réutilisant `engine/billboard.ts` / `engine/pawn.ts`. Le code fait un **jalon DOM** :
>    une vignette au bout d'un mât dans `src/map/MapLabels.tsx` (`.label-plate`), et
>    `engine/buildings.ts` n'existe pas. Raison : les régions admin-1 varient d'un facteur
>    mille en surface, un sprite posé hérite de ce désordre — le mât découple la taille du
>    symbole de celle de la région.
> 2. **Pas de teinte sur le sprite.** Le point 1 exige un sujet teinté à l'encre nationale.
>    Il ne l'est pas, et il ne doit pas l'être : `PlayerView` ne sert jamais les bâtiments
>    adverses, donc tout ce qui s'affiche appartient déjà au joueur — la teinte porterait zéro
>    information. **Le point 3, en revanche, est bien en place** : la teinte des *régions*
>    bâties (même encre, plus dense) est appliquée, et le survol est passé sur le contour
>    comme le prévoit le point 4.
> 3. **Pas de hiérarchie de taille.** Les quinze vignettes s'affichent à la même hauteur.
>    `echelles.json` n'a jamais rien produit et a été abandonné le 16/08.

Lis `CLAUDE.md`, `WWS/CONTEXT.md`, l'[ADR 0005](../../adr/0005-brouillard-par-defaut.md) —
le brouillard, c'est la contrainte principale ici — et la fiche
[10 — Direction artistique](../../design/10-direction-artistique.md). Ne commit pas, ne push pas.

**Prérequis** : `une-batisse-par-region.md` est passé (une région, un bâtiment) et
`rose-des-vents-construire.md` aussi (on peut poser depuis la carte). Sinon il n'y a rien à
afficher.

**Ce prompt se fait en deux temps, et le premier ne demande aucun asset.**

| | contenu | prérequis |
|---|---|---|
| **A — la teinte** | points 3 et 4 : région bâtie plus dense, hiérarchie des trois teintes | aucun |
| **B — les sprites** | points 1, 2 et 5 : le billboard et son seuil | `src/emblems/buildings/` peuplé |

Fais **A maintenant**. C'est indépendant des planches, c'est visible dès qu'une saison tourne, et
c'est la première chose qui dira si la couche carte se lit — trois passes d'interface ont été
écrites sans qu'un seul pixel soit regardé.

Pour **B**, si `src/emblems/buildings/` n'existe pas, **arrête-toi et dis-le** — ne dessine pas de
forme de remplacement. Le repli en cadre pointillé des unités est le modèle : une planche absente
se voit, elle ne s'invente pas.

## Ce qu'on veut

Une région bâtie **se voit**. De près, par le bâtiment lui-même ; de loin, par une teinte.
Aujourd'hui, l'économie d'un joueur est invisible sur la carte — elle ne vit que dans une fenêtre,
alors que tout le design dit que ce qui produit doit se voir et donc s'attaquer.

## Le brouillard d'abord, parce qu'il décide du reste

**Un bâtiment adverse ne s'affiche pas, et sa région ne se teinte pas.** Savoir *où* un adversaire
a bâti vaut presque autant que savoir *quoi* : c'est une carte de ses gisements exploités, de ses
ports, de ses arsenaux. Ça se gagne par le renseignement, jamais par le rendu.

La règle n'est pas une condition d'affichage à écrire, c'est une propriété de `PlayerView` : les
bâtiments adverses n'y sont pas. Si tu dois écrire un `if` sur la nationalité pour cacher quelque
chose, c'est que la donnée n'aurait pas dû arriver au client — signale-le plutôt que de le
filtrer à l'affichage.

## Implémentation

1. **Le sprite du bâtiment**, posé sur la région, en billboard. Le moteur sait déjà le faire :
   `engine/billboard.ts` et `engine/pawn.ts` portent le jalon de mouvement, qui est exactement le
   même problème — un sprite 2D debout dans une scène 3D, lacet caméra seul. Réutilise, ne
   réinvente pas.

   Le sprite est **teinté à l'encre nationale**, comme les unités, et le filtre encre reste une
   passe d'affichage, jamais cuite dans l'asset (`WWS/sprites/README.md` §5).

2. **La disparition au dézoom** suit le seuil qui fait déjà apparaître les régions en fondu —
   celui du `RegionLayer`. Ne crée pas un second seuil : deux seuils voisins produisent une zone où
   les régions sont visibles mais leurs bâtiments non, ou l'inverse, et ça se lit comme un bug.

3. **La teinte au-delà du seuil.** Une région à soi qui porte un bâtiment se distingue d'une région
   à soi qui n'en porte pas. **Uniquement les siennes.**

   **C'est la même encre nationale, plus dense — pas plus claire.** La carte est de l'encre sur du
   papier (`neutralLand: #d5c5a0`) : plus de matière veut dire plus d'encre, donc plus sombre.
   Mesuré sur les huit nations, en composant l'encre sur la terre nue :

   | | écart au pays |
   |---|---|
   | plus claire | 1,16 à 1,31 |
   | **plus dense** | **1,24 à 1,49** |

   Plus dense gagne partout, et surtout **plus claire échoue là où il ne faut pas** : l'Italie
   (1,18) et la Chine (1,16) ont déjà une encre chaude et claire ; l'éclaircir la ramène vers le
   sable de la terre nue. Pire, l'éclaircissement **détruit la lecture nationale** — les huit
   teintes claires se ressemblent toutes, alors que la couleur du pays est le premier signal de la
   carte. Densifier garde la France bleue et l'URSS rouge.

   Ordre de grandeur : le pays autour de 0,45 d'encre, la région bâtie autour de 0,70. À l'œil
   avant de figer.

4. **La hiérarchie des trois teintes, tranchée : elles n'occupent pas le même canal.**

   | signal | canal |
   |---|---|
   | nation | remplissage — l'encre du pays |
   | région bâtie | remplissage — la même encre, plus dense |
   | survol | **contour**, pas remplissage |

   Le survol passe du remplissage au contour, et les trois cohabitent sans se disputer. Sinon le
   survol effacerait le signal « bâtie » exactement au moment où le joueur pointe dessus — ce qui
   est le pire moment.

5. **La densité.** Un joueur avec une douzaine de bâtiments répartis sur la France, ce sont douze
   billboards à l'écran au zoom rapproché. Vérifie que ça ne coûte rien — les accessoires de
   terrain (`engine/terrain.ts`) posent déjà bien plus d'objets, donc le budget existe, mais
   mesure-le plutôt que de le supposer.

## Le gabarit des sprites, pour quand ils seront dessinés

À noter dans `WWS/sprites/README.md`, en section « bâtiments », sur le modèle de celle des unités :

- **quinze visuels, pas cent vingt** — un par `BuildingKey`, neutres, teintés à l'encre nationale
  à l'affichage. Une caserne à pagode pour le Japon serait belle et coûterait huit planches ;
- même gabarit que les unités : trois-quarts à ~60°, lumière haut-gauche, fond `#4a7060`,
  1024 × 1024, sujet seul ;
- **posé sur le sol, pas flottant** : le point d'ancrage est la base du bâtiment, pas son centre —
  c'est ce qui décide s'il a l'air planté ou collé ;
- ombres portées retirées comme pour les unités (`nettoyer-ombres.py`), et contrôle sur fond clair.

## Critères d'acceptation

- Une région à soi qui porte un bâtiment l'affiche au zoom rapproché, teintée à l'encre nationale.
- Aucun bâtiment adverse n'apparaît, à aucun zoom, et aucune région adverse ne change de teinte.
- Le sprite disparaît exactement au même seuil que celui du fondu des régions.
- La hiérarchie des trois teintes est explicite et documentée d'une ligne dans le code.
- Le coût d'affichage est mesuré, pas supposé.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Tu n'affiches toujours pas les **gisements** — c'est une autre couche et un autre brief ; ne
mélange pas « ce que la terre contient » et « ce que j'y ai bâti ». Tu ne touches ni au schéma, ni
aux règles de pose, ni à la fenêtre Nation.
