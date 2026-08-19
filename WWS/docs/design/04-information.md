# 04 — Information : brouillard, espionnage, leurres

C'est le cœur du jeu, pas une couche annexe. Cf.
[ADR 0005](../adr/0005-brouillard-par-defaut.md).

## Le brouillard

**Par défaut, tu ne vois que tes propres arcs.** Les mouvements adverses ne sont visibles que dans le
rayon de détection de ton territoire, de ta station d'écoute et de tes avant-postes d'écoute.

C'est la décision la plus importante du design. Elle transforme d'un coup :

- l'espionnage, de système annexe en colonne vertébrale ;
- le rendu 3D, de décoration en ressource qu'on achète ;
- une flotte qui arrive, en événement.

Sans brouillard, le plus beau du jeu est offert gratuitement à tout le monde et ne sert à rien.

⚠️ **C'est un problème serveur avant d'être un problème de rendu.** Cf.
[technique/brouillard-et-fanout.md](../technique/brouillard-et-fanout.md).

## Les forces posées ne se voient pas de loin

Depuis l'ADR 0019 (18/08), une troupe peut rester posée sur la carte. Elle suit la règle déjà
écrite pour l'avant-poste adverse — *exactement le genre de chose que le brouillard existe pour
cacher* : **aucune détection à distance**, ni par le rayon d'un territoire, ni par celui d'une
autre force posée. Ce qui se voit de loin, c'est ce qui **bouge** — un convoi fait du bruit, un
campement non. Trois choses seules révèlent une force posée : l'agent dormant, un mouvement qui la
croise (contact à `ARRIVAL_RADIUS_KM`, initiative au posé), et l'arrivée sur elle.

Le contrepoids, qui ne perce aucun brouillard : en visée, un point hors du sol du joueur et hors
du rayon de ses avant-postes est marqué **« sol non reconnu »**. Le marqueur ne promet rien — il
ne dit pas qu'un adversaire est là, et surtout pas qu'un sol reconnu serait sûr. Il dit une seule
chose : *rien à moi ne regarde ce sol*.

À venir (prompt `reperage-des-troupes-posees.md`) : une troupe posée devient la **quatrième
source de détection** de ce qui bouge, après le territoire, la station d'écoute et l'avant-poste
d'écoute — rayon court (`SCOUT_RADIUS_KM`, 60 km), un fil, un cap, un domaine, jamais le type ni
la composition. Elle ne perce rien : l'identification reste l'affaire de l'agent et des bâtiments.

## Outils

| Outil | Effet | Coût |
|---|---|---|
| **Sonde** | révèle les mouvements sortants d'un joueur pendant X min | ravitaillement |
| **Agent dormant** | posé dans un pays neutre, révèle en continu les arcs proches | ravitaillement + slot |
| **Sabotage** | un agent dormant retarde ou dégrade un convoi à sa portée | action de l'agent |
| **Convoi leurre** | mouvement à zéro unité, indiscernable d'un vrai pour l'espionnage | **forfait fixe + 1 slot** |

### Pourquoi le sabotage existe

Sans lui, la doctrine Influence n'a aucune prise sur la partie : elle observe sans jamais pouvoir
agir. Six couples nation × doctrine sur 24 devenaient morts, tous concentrés sur Influence. Le
sabotage est ce qui rend la doctrine jouable plutôt que contemplative.

### Pourquoi le leurre coûte un forfait fixe

Si le coût d'un mouvement dépendait de sa cargaison, un convoi vide coûterait zéro. Résultat : spam
illimité, espionnage réduit à du bruit pur, condition de victoire « suprématie de renseignement »
inatteignable, et facture serveur qui explose.

Forfait fixe **plus un slot de mouvement** : feinter se paie en attaques qu'on ne lancera pas. C'est
ce qui fait du leurre une décision plutôt qu'un réflexe.

Le leurre coûte trois lignes de code — un mouvement dont le tableau d'unités est vide — et produit à
lui seul la moitié des histoires que vous vous raconterez après la saison. C'est le meilleur rapport
effort/plaisir du design.

## Ce que révèle un mouvement détecté

Décidé en session (13/08/2026), à l'occasion de la frise des mouvements et du « fil tendu ».

**Trois familles d'affichage, trois encres.** Mes mouvements (encre de ma nation, tout
visible, filtrables par type puisque mes types sont connus) ; **cap sur moi** (encre
critique : adverse détecté dont la trajectoire croise mon territoire ou mes avant-postes) ;
**renseignement** (encre sourde : adverse détecté ailleurs, sans conséquence directe).

**Un mouvement adverse détecté ne révèle par défaut ni son type ni sa composition** —
seulement le fil, le cap et un horaire estimé. C'est la condition d'existence du leurre.

**L'identification est un état, pas une catégorie.** Certains bâtiments, unités ou
placements permettent de percer un mouvement détecté : sa fiche révèle alors type et
composition, avec la mention « identifié ». Conséquence voulue : identifier un leurre,
c'est du renseignement gaspillé — le leurre devient une arme d'usure contre l'espionnage
adverse. ⚠️ Le coût d'identification est un curseur d'équilibrage sensible : trop bon
marché, le brouillard meurt ; trop cher, personne n'identifie jamais. À mesurer.

### Le domaine est visible

Décidé (13/08/2026), en même temps que le « fil tendu ».

**Un mouvement détecté montre son domaine — terre, mer ou air.** L'altitude du fil le dit
(collé au relief, au niveau de l'eau, en arc dans le ciel) et la silhouette du jalon le
répète (prisme, coque, delta). Le type et la composition, eux, restent cachés tant que le
mouvement n'est pas identifié.

Deux raisons. La trajectoire le révèle de toute façon : un fil en pleine mer est maritime,
le cacher demanderait de mentir sur le tracé. Et le leurre y gagne un choix de bluff —
simuler un débarquement plutôt qu'une colonne, c'est une décision de plus à prendre pour
trois lignes de code.

Le mot du code est **`Milieu`** (`src/domaine/trajets.ts`) ; « domaine » n'existe que dans
cette fiche, `src/domaine/` désignant déjà la couche de logique pure.
