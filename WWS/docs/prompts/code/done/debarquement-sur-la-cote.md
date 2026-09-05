# debarquement-sur-la-cote — les navires ne roulent pas (72a)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, puis l'ADR 0019 §2 (révision du 04/09) et
l'ADR 0012. Ne commit pas, ne push pas. Suppose `port-sur-la-cote` livré. Un chantier, un commit.

## Le constat

Une colonne mixte (cargo + infanterie) qui vise l'intérieur des terres route mer puis terre, et
**le cargo suit sur la jambe terrestre** (`traverser-demande-un-navire`, mode `combined`). Décision
72a (04/09) : une colonne embarquée ne vise qu'un **point de côte** ou un port ; à l'arrivée tout
est posé sur la plage, et chaque troupe se réordonne séparément. Un débarquement redevient une
opération : choisir la plage, puis marcher.

## La règle

1. **La visée d'une colonne en mode `combined`** (`routeModeOf` : terre + mer) n'accepte que :
   un point dont la cellule est de côte (`isCoastCell`, livrée par `port-sur-la-cote`) ; un
   avant-poste dont le point est de côte ; un port ami (garnison, déjà en place). Une région,
   un point intérieur, un avant-poste intérieur → `LANDING_NEEDS_A_COAST` (« une colonne
   embarquée ne débarque que sur une côte »). Le refus vit dans `refusalOf`
   (`src/domain/movement-orders.ts`), donc la rose le sait sans route et le serveur dit la même
   chose — un test tient les deux ensemble, comme pour `NO_PORT_AT_DEPARTURE`.
2. **La route d'une colonne `combined` finit à la côte** : elle ne comporte jamais une jambe de
   terre après une jambe de mer. Avec 1, c'est une conséquence, pas une règle de plus — vérifie
   que `computeRoute` en mode `combined` vers une cellule de côte ne rajoute pas un pas de terre
   par arrondi (`nearestCell`), et corrige là si c'est le cas.
3. **L'arrivée pose tout le monde au point** (déjà `standAt`) — coques et passagers, une seule
   adresse. Pas de mouillage séparé : deux adresses rendraient le rembarquement impossible à
   composer (`sameStation`).
4. **La porte de départ s'assouplit** (ADR 0019 §2, révision du 04/09) : une coque part d'un
   port, d'un point en mer (`afloat`, déjà), **ou d'un point de côte où elle se tient** — elle y
   est arrivée par la mer. `departureOf` calcule `coastal = isCoastCell(point)` pour une origine
   `point` ; `embarking` lit `!column.afloat && !column.coastal`. Le routage suit déjà : en mode
   `naval`, `nearestCell` accroche la cellule de mer voisine.
5. Une colonne de **terre pure** ne change en rien : elle vise ce qu'elle visait, marche où elle
   marchait.

## Cas d'acceptation

1. Cargo + infanterie au port de Tokyo, visée sur un point intérieur de Corée → rose en motif,
   `LANDING_NEEDS_A_COAST` ; visée sur la côte coréenne → branche offerte, la route est
   `sea` de bout en bout après le départ (aucune jambe `land` finale).
2. À l'arrivée, cargo et infanterie sont posés au point de côte ; l'infanterie seule s'ordonne
   vers l'intérieur (mode `land`) ; le cargo seul s'ordonne vers Tokyo (mode `naval`, aucun
   `NO_PORT_AT_DEPARTURE`) ; les deux ensemble se recomposent et repartent par la mer.
3. Un cargo posé sur un point **intérieur** (impossible après ce chantier, mais une donnée
   d'avant-wipe peut l'être) reste refusé : `NO_PORT_AT_DEPARTURE` — la règle 3 de l'ADR 0019
   ne fabrique pas de quai.
4. `legalMovementTypes` et la mutation répondent la même chose sur les quatre cibles (point
   côtier, point intérieur, avant-poste côtier, région) sans qu'aucune route ne soit calculée.
5. Une colonne de terre pure vise toujours une région ou un point intérieur comme avant.

`npm run verifier` vert. Un commit, message qui décrit le chantier entier.
