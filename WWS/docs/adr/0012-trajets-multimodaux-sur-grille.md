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

## Révision du 04/09 — une route combinée finit à la côte

> ⚠️ **Révision (04/09/2026, décision 72a, ADR 0019 §2).** Le parcours combiné ne marche plus
> après avoir navigué : le seul pas mer → terre qu'une route puisse contenir est son
> **débarquement**, donc son dernier. Sans cette porte, Dijkstra posait la colonne sur la plage
> la moins chère et lui faisait finir le chemin à pied — le cargo roulait, et la plage se
> choisissait toute seule au lieu d'être visée.
>
> Deux conséquences sur le coût, toutes deux dans `computeRoute` :
>
> - **Le milieu d'un pas se lit sur ses deux bouts** : un pas qui touche l'eau est fait en
>   bateau. La dernière foulée d'un débarquement appartient donc à la jambe de mer, et une route
>   combinée ne porte plus jamais de jambe de terre après une jambe de mer.
> - **Le transfert de +8 se paie au franchissement de la ligne d'eau**, et non plus au changement
>   de jambe. Les deux coïncidaient tant qu'une jambe de terre suivait la mer ; facturé sur la
>   jambe, l'embarquement depuis un quai (ADR 0013, révision du 04/09 : le port est sur une
>   cellule de côte) devenait gratuit et le débarquement disparaissait avec la jambe. Un aller
>   par la mer coûte toujours ses deux transferts.
>
> Ce que cela ferme : un point intérieur n'est plus routable en mode combiné — la visée le
> refusait déjà (`LANDING_NEEDS_A_COAST`), la grille ne fait que refuser de la contourner.

## Révision du 18/09 — une route combinée peut finir en mer

> ⚠️ **Révision (18/09/2026, décision de Pierre, ADR 0019 §2).** « Un cargo peut rester en mer
> avec des unités dedans. » Une route combinée peut donc **finir sur une cellule d'eau**, et pas
> seulement à la côte : le mode combiné foule déjà terre, mer et canal, et l'eau était refusée par
> la seule visée, jamais par la recherche.
>
> **Rien ne change dans `computeRoute`**, et c'est le point : les deux lectures du 04/09 tiennent
> telles quelles et suffisent. Un pas qui touche la mer est fait en bateau, donc une route
> combinée ne porte toujours **aucune jambe de terre après une jambe de mer** — ce qui interdit
> mécaniquement à une colonne embarquée de finir à l'intérieur des terres, et ce qui laisse le
> départ **depuis** une cellule d'eau se porter à la mer dès son premier pas (`carriedInto`
> répond `'sea'` sur une cellule de mer). Les deux transferts de +8 restent payés là où la ligne
> d'eau se franchit : un mouillage au large en coûte un, son débarquement l'autre.
>
> Ce que cela ouvre en revanche, et qui n'était pas routable avant le 18/09 : **mer → mer** en
> mode combiné, une route de pure jambe de mer pour une pile qui porte des bottes.
