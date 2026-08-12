# ADR 0012 — Trajets multimodaux sur grille raster, calculés dans le domaine

**Statut :** acceptée

## Contexte

Les mouvements du jeu étaient jusqu'ici un trait unique : une courbe de Bézier entre deux points,
enroulée à l'antiméridien — de fait, un trajet aérien. Le design exige trois familles de trajets :
**terrestre** (de terre à terre, sans toucher la mer), **naval** (par l'océan seulement) et
**combiné** (colonne terrestre, embarquement, traversée, débarquement). Il faut donc un graphe du
monde praticable, un algorithme de plus court chemin, et une réponse à « où ce calcul vit-il ? ».

Le monde du jeu est déjà une projection Natural Earth 1 cylindrique où la longitude s'enroule
(fiche 03) : l'enroulement divise par deux la distance Asie-Océanie ↔ Amériques et c'est un levier
d'équilibrage, pas un décor.

## Décision

**Une grille raster dérivée de `monde.json`**, pas un graphe vectoriel : les pays sont remplis par
balayage pair-impair, la sphère donne la mer, le pas est de 0,25 unité (~28 km). Terre, mer, vide ;
huit voisins ; **la première et la dernière cellule valides de chaque ligne sont voisines** —
l'enroulement est dans l'adjacence même du graphe, comme il est déjà dans le rendu des arcs.

**Les détroits et canaux plus fins que la grille sont gravés à la main** (`PORTES_MARITIMES`) :
pas de Calais, Gibraltar, Øresund, Dardanelles-Bosphore, Suez, Panama, Ormuz, Malacca,
Bab-el-Mandeb. Sans eux, le raster soude les rives et le tour de l'Afrique redevient une fatalité
géométrique — alors qu'en 1940 Suez est un choix stratégique et un point de blocus.

**Dijkstra pondéré par un coût par milieu** — terre ×1,6, mer ×1,0, transfert terre↔mer +8 unités
d'équivalent-mer. Ces constantes sont **arbitraires, jamais simulées**, au même titre que
`convex/constantes.ts`. Le mode combiné et le mode « terrestre seul » sont le même parcours avec
des milieux autorisés différents. L'aérien ne passe pas par la grille : trait direct enroulé.

**Le module vit dans `src/domaine/trajets.ts`** — TS pur, testé, zéro dépendance. C'est le
**serveur** qui l'appellera à la création d'un mouvement, quand la surface 4.7 écrira la table des
mouvements : un client qui calcule ses propres routes choisit aussi ses propres vitesses.

## Justification

**Raster plutôt que vectoriel** parce que le coût est borné et uniforme : 1,3 M de cellules se
construisent et se traversent en dizaines de millisecondes, l'ajout d'un malus de terrain (fiche
09, plus tard) est un tableau de multiplicateurs, et le même masque terre/mer sert déjà à la
bathymétrie. Un graphe de visibilité vectoriel serait plus précis et dix fois plus de code pour
une précision que le jeu n'exploite pas — les avant-postes sont des points à ~100 km près.

**Les portes maritimes gravées à la main sont une liste de design, pas une donnée.** Chacune est
un lieu de blocus potentiel (fiche 08 : l'interception donne un sens au positionnement). Les
choisir explicitement, c'est choisir où le jeu crée des goulets — l'automatique aurait ouvert ou
fermé des détroits au hasard du pas de grille.

**Coûts dans le domaine, appel côté serveur.** La règle `VueJoueur, jamais EtatPartie` a un
corollaire : le client ne décide de rien. Le module est écrit en TS pur précisément pour que
Convex l'importe tel quel.

## Conséquences

- La table des mouvements (4.7) portera le mode et la polyligne calculée, pas seulement
  l'origine et la destination ; `CoucheArcs` devra rendre des polylignes à N tronçons (elle en
  gère déjà 2 pour l'enroulement) avec une élévation quasi nulle pour le terrestre et le naval.
- Le **droit de passage** terrestre à travers les pays neutres (fiche 03) devient une question
  bloquante dès que le terrestre est jouable : la grille actuelle traverse tout. Non tranché ici.
- Le malus de terrain éventuel (montagne, forêt) a un emplacement naturel — un multiplicateur par
  cellule — mais l'introduire rouvre la fiche 09 (« ni grille, ni terrain ») : ADR requis.
- Les constantes ×1,6 / +8 devront passer par la simulation d'équilibrage avant toute saison
  réelle.
