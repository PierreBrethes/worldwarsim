# canaux-franchissables — un canal gravé laisse passer les navires sans couper le continent

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0012 et la décision 72a (commentaire
de `dijkstra`, `src/domain/routing.ts`). Ne commit pas, ne push pas. Indépendant des lots UI.
Un chantier, un commit.

## Le constat (Pierre, partie en cours, 15/09)

Une compagnie d'infanterie ne peut pas passer du Panama à la Colombie. La carte ne montre aucun
canal ; la route, elle, refuse.

Cause : `SEA_GATES` (`routing.ts:113`) grave les détroits et canaux plus fins que la grille en
**cellules `SEA`**, sur trois cellules de large (`engravePassage`, `routing.ts:814`, `dr/dc` de
−1 à +1). Une cellule n'a qu'un type. Pour Gibraltar, le Pas de Calais, Ormuz ou Malacca, c'est
juste : il y a de l'eau. Pour **Panama et Suez**, la gravure remplace une bande de terre par de
la mer, et la route terrestre (`allowed = [LAND]`, lignes 331 et 373) n'a plus de pont :
l'Amérique du Nord est coupée de l'Amérique du Sud, l'Afrique de l'Asie (le tracé de Suez
descend jusqu'à 29.9° N, tout l'isthme y passe). Le serveur ne route qu'en terrestre
aujourd'hui, donc aucune colonne ne franchit. Ce n'est pas ce que le commentaire de
`SEA_GATES` promet — « en 1940, contourner l'Afrique est un choix de blocus, pas de la
géométrie » — la géométrie coupe désormais dans l'autre sens.

## La règle

Un canal est de l'eau **et** un passage à gué : les navires le transitent, les colonnes le
franchissent (ferries et ponts tournants existaient à Panama comme à Suez en 1940). Un détroit
naturel reste de la mer. Aucune règle de jeu ne change ; c'est la grille qui disait faux.

## Ce qu'il faut

- Un troisième type de cellule, `CANAL = 3`, à côté de `LAND` et `SEA`. `SEA_GATES` gagne un
  champ `kind: 'strait' | 'canal'` ; `engravePassage` écrit `SEA` pour l'un, `CANAL` pour
  l'autre. Panama et Suez sont des canaux ; tout le reste est détroit.
- `allowed` : terrestre `[LAND, CANAL]`, naval `[SEA, CANAL]`, combiné les trois.
- **Le milieu d'un pas ne se lit plus des seules cellules** (`routing.ts:509`,
  `SEA || SEA → 'sea'`) : un pas `CANAL → CANAL` est un transit naval pour un navire et une
  traversée à pied pour une colonne. Le milieu doit suivre **ce que la recherche a autorisé**
  (une colonne terrestre ne met jamais un pied en mer ; un navire ne roule jamais), ou, en
  combiné, le dernier milieu porté. La 72a tient telle quelle : le seul pas mer → terre reste
  le débarquement — un `CANAL` n'est pas une plage.
- `coastal` (`routing.ts:556-560`, `589-592`) : une cellule de terre qui touche un `CANAL`
  est côtière — Colón, Balboa, Port-Saïd, Suez sont des ports. Le dire dans le commentaire.
- **Régénérer `public/grid.json`** (`scripts/generate-grid.mjs`, chaîné par
  `generate-world.mjs`) : le vérifieur compare la cuisson à `buildGrid` octet à octet et doit
  rester vert. `encodeGrid` accepte déjà n'importe quelle valeur.
- **Si la route terrestre Panama → Colombie manque encore après ça**, c'est que le raster
  lui-même casse au Darién (l'isthme fait 50 km au plus étroit, la grille n'a pas vu la terre) :
  le dire, et ajouter le symétrique de `SEA_GATES` — des `LAND_BRIDGES` gravés `LAND` — plutôt
  que d'élargir le pas de la grille. Même test pour Suez → Sinaï et pour Kra (Malaisie).

## Cas d'acceptation (tests dans `routing.test.ts`)

1. Route terrestre Mexico → Bogotá : existe, milieu `land` de bout en bout, passe par l'isthme
   (une cellule du chemin dans la boîte 7-10° N / 77-81° W).
2. Route terrestre Le Caire → Jérusalem : existe, `land` de bout en bout.
3. Route navale Colón → Balboa (Atlantique → Pacifique) : existe, `sea` de bout en bout,
   longueur inférieure à celle du cap Horn.
4. Route navale Port-Saïd → Suez : idem, plus court que le Cap.
5. Une colonne terrestre ne traverse pas la Manche ni Gibraltar : les détroits restent `SEA`.
6. La cellule terrestre de Colón est `coastal` ; une cellule au centre du Kansas ne l'est pas.
7. `grid.json` régénéré, égalité octet à octet au vérifieur, décodage toujours sous 5 ms.
8. `convex/routes.ts` : une `movements.preview` Panama → Colombie rend une route, pas
   `NO_ROUTE` — test serveur existant à étendre.
9. Vérifieur vert.

## Hors périmètre

Dessiner le canal sur la carte (Natural Earth 50m ne le porte pas) : un trait au zoom région,
décoratif, un autre prompt si Pierre le veut. Le blocus d'un canal (« choix de blocus ») : pas
de règle, pas de code.
