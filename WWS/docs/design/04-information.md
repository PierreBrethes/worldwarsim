# 04 — Information : brouillard, espionnage, leurres

> ## ⚠️ Révision du 29/08/2026 — le leurre est retiré du jeu
>
> Le leurre a été conçu ici, codé (`d37e9b6`), puis **retiré** sur décision de Pierre le
> 29/08/2026, sans avoir jamais été éprouvé en partie réelle. La raison n'est pas qu'il marchait
> mal : c'est **un outil de plus que personne n'avait demandé**. Le jeu en offrait déjà davantage
> qu'une saison de test n'en consomme, et chaque ordre supplémentaire est une ligne de menu, une
> règle à apprendre et une surface à maintenir avant d'être une histoire à raconter.
>
> Ce que le retrait emporte : la mutation, le forfait `DECOY_COST`, les trois dépêches, l'allure
> dédiée, l'entrée du menu contextuel, la section du widget de troupes — et la tolérance qui
> faisait d'un manifeste vide un ordre. **Une pile vide redevient un refus franc**
> (`EMPTY_MOVEMENT`).
>
> Ce que le retrait laisse en place : la `columnFoundNothing`, née avec lui et qui n'était pas à
> lui — elle dit la marche qui arrive sur un sol vide, et c'est le seul événement du jeu qui ne
> laissait aucune trace.
>
> **Ce qui reprend son rôle d'incertitude d'intention : rien, pour l'instant.** C'est le trou
> assumé de cette révision, et il est nommé ici pour qu'on ne le redécouvre pas en partie. Le
> brouillard continue de cacher le type et la composition (§ « Ce que révèle un mouvement
> détecté ») ; ce qu'il ne fait plus, c'est laisser douter qu'il y ait quelqu'un derrière le fil.
> Le jour où l'incertitude d'intention manque vraiment, c'est **cette section-là** qui se relit —
> et une reprise du leurre serait une décision neuve, pas un retour en arrière.
>
> Le reste de la fiche est conservé tel quel : c'est le dossier de la décision, pas son état.
> Ce qui suit décrit un outil que le jeu n'a plus.

C'est le cœur du jeu, pas une couche annexe. Cf.
[ADR 0005](../adr/0005-brouillard-par-defaut.md).

## Le brouillard

**Par défaut, tu ne vois que tes propres arcs.** Les mouvements adverses ne sont visibles que dans
une fenêtre écrite par ton territoire, ta station d'écoute, tes avant-postes d'écoute ou une de tes
troupes posées ou en mouvement.

C'est la décision la plus importante du design. Elle transforme d'un coup :

- l'espionnage, de système annexe en colonne vertébrale ;
- le rendu 3D, de décoration en ressource qu'on achète ;
- une flotte qui arrive, en événement.

Sans brouillard, le plus beau du jeu est offert gratuitement à tout le monde et ne sert à rien.

⚠️ **C'est un problème serveur avant d'être un problème de rendu.** Cf.
[technique/brouillard-et-fanout.md](../technique/brouillard-et-fanout.md).

## Les forces posées ne se voient pas de loin

> ⚠️ **Révision (13/09/2026, [ADR 0024](../adr/0024-engagement-intentionnel-et-forces-posees-visibles.md)) : cette section est renversée.**
> Une force posée **se voit dans la portée** de tout détecteur, comme un mouvement — sa position,
> son milieu, depuis quand — jamais sa composition ni sa nation ; sortie de portée, elle devient
> une dernière position connue (24 h, `@a-mesurer`). Et **rien ne se bat sans ordre d'attaque** :
> une colonne qui s'arrête près d'un camp adverse ne le combat pas, l'attaque ne se donne que sur
> un objet relevé — camp, installation, avant-poste, objectif. Le texte ci-dessous est conservé
> comme trace de l'argument (l'agent dormant), dont l'ADR 0024 dit ce qui survit.


Depuis l'ADR 0019 (18/08), une troupe peut rester posée sur la carte. Elle suit la règle déjà
écrite pour l'avant-poste adverse — *exactement le genre de chose que le brouillard existe pour
cacher* : **aucune détection à distance**, ni par le rayon d'un territoire, ni par celui d'une
autre force posée. Ce qui se voit de loin, c'est ce qui **bouge** — un convoi fait du bruit, un
campement non. Deux choses seules révèlent une force posée : l'agent dormant, pas encore codé, et
l'arrivée d'un mouvement sur son point. Une force posée détecte, mais n'intercepte jamais à distance.

Le contrepoids, qui ne perce aucun brouillard : en visée, un point hors du sol du joueur et hors
du rayon de ses avant-postes est marqué **« sol non reconnu »**. Le marqueur ne promet rien — il
ne dit pas qu'un adversaire est là, et surtout pas qu'un sol reconnu serait sûr. Il dit une seule
chose : *rien à moi ne regarde ce sol*.

**Elle voit en revanche ce qui bouge.** Une troupe posée est la **quatrième source de détection**,
après le territoire, la station d'écoute et l'avant-poste d'écoute — et la seule qui existe dans le
code à ce jour. Portée propre à son rôle (`DETECTION_RANGE_KM`, maximum pour une pile), un fil, un cap, un horaire estimé, un
domaine, **jamais le type ni la composition**, jamais la nation. Elle ne perce rien :
l'identification reste l'affaire de l'agent et des bâtiments.

Le relevé se recalcule **aux événements du plateau** — départ, arrivée, composition et changement
de détecteur — tout en gardant le fan-out : chaque joueur lit une table à lui (`sightings`,
`(observateur, mouvement, tDébut, tFin)`), jamais un filtre sur la table des mouvements. Un
détecteur posé après le départ voit seulement la suite ; s'il quitte sa position avant une fenêtre
future, celle-ci est annulée. Une troupe en mouvement observe les mouvements adverses dans le même
milieu courant.

## Outils

| Outil | Effet | Coût |
|---|---|---|
| **Sonde** | révèle les mouvements sortants d'un joueur pendant X min | ravitaillement |
| **Agent dormant** | posé dans un pays neutre, révèle en continu les arcs proches | ravitaillement + slot |
| **Sabotage** | un agent dormant retarde ou dégrade un convoi à sa portée | action de l'agent |
| ~~**Convoi leurre**~~ | ~~mouvement à zéro unité, indiscernable d'un vrai pour l'espionnage~~ | ~~**forfait fixe + 1 slot**~~ — *retiré le 29/08/2026* |

### Pourquoi le sabotage existe

Sans lui, la doctrine Influence n'a aucune prise sur la partie : elle observe sans jamais pouvoir
agir. Six couples nation × doctrine sur 24 devenaient morts, tous concentrés sur Influence. Le
sabotage est ce qui rend la doctrine jouable plutôt que contemplative.

### Pourquoi le leurre coûtait un forfait fixe *(retiré le 29/08/2026)*

Si le coût d'un mouvement dépendait de sa cargaison, un convoi vide coûterait zéro. Résultat : spam
illimité, espionnage réduit à du bruit pur, condition de victoire « suprématie de renseignement »
inatteignable, et facture serveur qui explose.

Forfait fixe **plus un slot de mouvement** : feinter se paie en attaques qu'on ne lancera pas. C'est
ce qui fait du leurre une décision plutôt qu'un réflexe.

Le leurre coûte trois lignes de code — un mouvement dont le tableau d'unités est vide — et produit à
lui seul la moitié des histoires que vous vous raconterez après la saison. C'est le meilleur rapport
effort/plaisir du design.

## Ce que révèle un mouvement détecté

> ### ⚠️ Révision du 13/09/2026 — le relevé sert le tronçon vu, jamais la destination
>
> **Ce que c'était.** `detectedArcs` servait **le fil entier** et **les deux extrémités
> déclarées** du mouvement. La section disait « le fil, le cap et un horaire estimé » ; servir le
> fil entier, c'est servir la destination — et le premier guetteur venu apprenait où allait la
> colonne, gratuitement, du seul fait d'avoir posé un fantassin au bord d'une route.
>
> **Ce que c'est.** Un relevé sert **le tronçon que le détecteur a vu** (la fenêtre `sightings`,
> sa part future comprise — une fenêtre est déjà une prédiction stockée, et le client la découvre
> en marchant), **le cap de la colonne à sa sortie de portée**, et **l'arrivée estimée**. Rien
> avant l'ouverture de la fenêtre, rien après sa fermeture : les deux bouts de l'arc sont les deux
> bouts du tronçon. La destination et le reste du fil attendent l'identification (règle de
> l'identification ci-dessous — et aucun système ne perce encore, donc jamais pour l'instant).
>
> **Trois conséquences de détail.** Le pion marche le tronçon et s'arrête à son bout quand la
> fenêtre se ferme ; le tronçon figé devient la dernière position connue de l'ADR 0005. Le cap est
> lu sur les deux derniers points vus, pas d'un bout à l'autre de la fenêtre — une colonne qui
> tourne dans la fenêtre serait aplatie. Et **« cap sur moi » devient une estimation** : le cap est
> prolongé sur ce qu'il reste à marcher, par pas d'une cellule de grille, et l'encre critique
> s'allume si un de ces points tombe sur mon sol ou dans le rayon d'un de mes avant-postes. Une
> colonne qui passe à côté de moi sans venir pour moi n'est plus critique : c'est voulu, et
> l'étiquette dit déjà « estimé ».
>
> L'ADR 0021 §6 en sort renforcée, pas contredite ; la règle 2 (« les forces posées ne se voient
> pas de loin ») ne bouge pas. Le reste de la section est conservé tel quel.

Décidé en session (13/08/2026), à l'occasion de la frise des mouvements et du « fil tendu ».

**Trois familles d'affichage, trois encres.** Mes mouvements (encre de ma nation, tout
visible, filtrables par type puisque mes types sont connus) ; **cap sur moi** (encre
critique : adverse détecté dont la trajectoire croise mon territoire ou mes avant-postes) ;
**renseignement** (encre sourde : adverse détecté ailleurs, sans conséquence directe).

**Un mouvement adverse détecté ne révèle par défaut ni son type ni sa composition** —
seulement le fil, le cap et un horaire estimé. C'était la condition d'existence du leurre ; la
règle lui survit et vaut pour elle-même.

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
