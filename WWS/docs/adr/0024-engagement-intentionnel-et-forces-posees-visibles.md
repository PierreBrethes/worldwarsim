# ADR 0024 — L'engagement est intentionnel, et une force posée se voit dans la portée

> ⚠️ **Révision (01/11/2026, [ADR 0037](0037-un-avant-poste-qui-stocke-et-guette.md), non codée).** §1 : tout avant-poste debout est un détecteur (sa vigie, à mi-rayon), plus le seul avant-poste d'écoute ; et « jamais la composition » cède pour le Guet, dont les relevés la livrent.

**Statut :** acceptée (13/09/2026), **§4 précisé le 17/09/2026** (l'objectif neutre, public par
nature, est l'exception nommée du relevé préalable) — **révise l'[ADR 0008](0008-combat-par-interception.md)**
(le contact automatique), **l'[ADR 0019](0019-mouvement-libre-et-troupes-posees.md) §3 et §6**
(la riposte au rayon d'arrivée, l'invisibilité des forces posées), **l'[ADR 0021](0021-portee-de-detection-et-postures.md) §2 et §3**
(la rencontre en route, la table des comportements), et la fiche 04 § « Les forces posées ne se
voient pas de loin ». Le calcul de la passe (ADR 0014, ADR 0018) et la détection passive par
portée (ADR 0021 §1, §4, §5) restent fermés.

## Contexte

Partie de contrôle à deux, 13/09/2026. Deux joueurs marchent chacun une colonne au même endroit,
à plus de 25 km l'une de l'autre, chacune dans les 60 km de portée de l'autre. Chacun voit
l'autre arriver, puis plus rien : deux camps posés, aveugles (fiche 04, « seulement ce qui
bouge »), et la dernière position connue disparaît avec le mouvement (bug contre l'ADR 0005,
corrigé par ce lot). Le même jour, la règle de contact en vigueur produisait des batailles que
personne n'avait voulues : une marche qui s'arrête à moins de 25 km d'un camp adverse se bat
(ADR 0019 §3), deux colonnes d'attaque qui se croisent en route se battent (ADR 0021 §2), et une
région ciblée engage la garnison de ses bâtiments — mais pas une pile posée sur un point de la
même région (`defenceOf`, trou repéré le 13/09).

Le joueur lit ça comme un jeu qui décide à sa place, deux fois : ce qu'il voit, et quand il se
bat.

## Décision

### 1. Une force posée se voit dans la portée

Une pile posée adverse — au sol, en garnison d'un avant-poste ou d'un bâtiment — est **relevée**
par tout détecteur (ADR 0021 §1 : territoire, station, avant-poste d'écoute, pile posée ou en
mouvement) dont la portée la couvre, aux mêmes conditions qu'un mouvement. Le relevé sert **sa
position, son milieu (la silhouette de domaine) et l'heure depuis laquelle elle est vue** —
jamais la composition, jamais la nation, jamais l'effectif (fiche 04, « l'identification est un
état »). Quand elle sort de portée, ou que le détecteur s'en va, elle devient une **dernière
position connue**, comme un mouvement.

Ce qui reste caché : ce qu'elle est. L'agent dormant, que le §6 de l'ADR 0019 protégeait en
rendant les camps invisibles, garde son métier — **identifier**, pas repérer.

### 2. Une dernière position connue survit au mouvement

Une fenêtre de relevé qui s'est ouverte laisse une dernière position connue quoi qu'il arrive
à ce qu'elle a vu — arrivée, retour, déroute, destruction, sortie de portée. Elle s'efface après
`LAST_KNOWN_HOURS` (24, `@a-mesurer`) : le brouillard rend l'information périmée, pas éternelle,
et vingt marches ne laissent pas vingt fantômes.

### 3. Rien ne se bat sans ordre d'attaque

**Une passe de résolution n'a lieu que si un ordre la vise.** Trois déclencheurs automatiques
disparaissent :

- la riposte d'une force posée à toute colonne qui s'arrête à moins de `ARRIVAL_RADIUS_KM`
  (ADR 0019 §3) — une marche peut désormais s'arrêter à côté d'un camp adverse, chez lui, dans
  le rayon de son avant-poste, sur la région de sa mine : il ne se passe rien tant que personne
  n'attaque ;
- la rencontre en route de deux colonnes (ADR 0021 §2) — une colonne va où on l'envoie ;
- la garnison d'une région ciblée par hasard.

Ce qui reste : **attaqué, un camp se bat toujours** (décision 1a). La riposte est automatique,
l'initiative va à qui a donné l'ordre (ADR 0014). Le sommeil n'est pas mortel : la plage de repos
retient toujours toute arrivée sur le sol national (fiche 07), et un camp attaqué n'a pas besoin
de son maître pour rendre les coups.

### 4. Une attaque vise ce qu'on a relevé

> **Exception nommée, 17/09/2026 — l'objectif neutre.** Un objectif neutre
> (`propositions/objectifs-neutres.md`) est **public par nature** : il est annoncé à tous au
> lancement par une dépêche, il est dessiné sur la carte de tous, et le dépôt qu'il lui reste se
> lit. Il n'y a donc **aucun relevé à exiger** pour le viser, et c'est la seule cible du jeu dans
> ce cas. La règle ne perd rien de ce qu'elle protège : ce que le brouillard garde est **la
> garnison locale qui le tient**, une force posée comme une autre, qui ne se relève qu'en portée
> (§1). *On sait où aller, pas ce qu'on y trouvera.* Le code le dit d'un mot —
> `nothingToAttack` rend `null` sur `kind: 'objective'`, comme sur un camp et un avant-poste, qui
> *sont* le relevé — et l'ordre garde ses autres conditions : une colonne qui compte de
> l'infanterie, parce qu'une réserve se porte.

L'ordre « attaquer » (et « raider », « piller », « saboter », qui en sont des formes) **ne se
donne que sur un objet relevé** : une pile posée adverse (§1), une installation relevée (S8), un
avant-poste, un objectif neutre. Sur un point vide, la rose ne l'offre pas — attaquer du vide ne
sert à rien, et la rose n'ouvre que là où un ordre existe (règle du 31/08). L'ordre peut partir
de n'importe quelle pile, à portée ou non : c'est le relevé qui ouvre la cible, pas la distance.

**Une attaque vise une position, pas une unité.** La colonne marche au point relevé ; à l'arrivée,
elle engage ce qui s'y tient à moins de `ARRIVAL_RADIUS_KM` — le rayon change de sens, de
déclencheur il devient **allonge de l'ordre**. Si la cible est partie, la colonne est bredouille,
comme aujourd'hui sur une région vide. La poursuite est l'intention « intercepter » de la
direction V1, pas cette décision.

## Justification

**Le joueur décide de ses batailles.** Une bataille que personne n'a voulue n'est lisible pour
personne : ni celui qui « attaque » sans l'avoir demandé, ni celui qui apprend au réveil qu'une
marche l'a heurté. L'ordre d'attaque est déjà le seul geste irréversible du jeu ; qu'il soit le
seul à ouvrir une passe le rend entier.

**Voir un camp, c'est pouvoir décider.** Sans §1, le §3 est injouable : un adversaire camperait
chez moi sans que rien ne me le dise. Avec §1, le camp adverse est une information — payée par une
portée, comme un mouvement — et l'attaque une décision prise sur cette information.

**Le coût, assumé.** L'initiative va à qui donne l'ordre le premier, donc à qui est là. C'est le
prix de toute décision dans un jeu asynchrone — celui qui marche le premier arrive le premier —
et le §3 le borne : la riposte automatique fait qu'un absent n'est jamais sans défense, seulement
sans initiative. L'embuscade automatique (une force posée qui frappe ce qui passe) disparaît ; ce
qu'elle donnait — punir une marche imprudente — revient à la main du joueur qui voit passer.

**Ce que l'agent dormant garde.** Le §6 de l'ADR 0019 cachait les camps pour que « n'importe
quel fantassin » ne double pas l'agent. L'agent n'a jamais été codé ; son métier survit tel que
la fiche 04 le décrit — percer un relevé, en dire le type et la composition — et c'est un métier
plus riche que repérer.

## Conséquences

- `standAt` ne cherche plus de défense ; `engageAt` n'engage que ce qui se tient à
  `ARRIVAL_RADIUS_KM` du point visé. `defenceNear` devient la lecture de l'allonge d'une attaque,
  jamais d'une marche. La rencontre en route (`firstMobileEncounter`, `contactJobId`) est
  retirée du plateau ; la géométrie reste dans le domaine pour l'intercepteur V1.

  > **Révision du 14/10/2026 (lot 5 des deux modes)** : `firstMobileEncounter` a disparu avec la
  > poursuite de la Blitz, qui date son contact elle-même (`contactAt`, `src/domain/blitz.ts` ;
  > `convex/movement/pursuit.ts`). L'intercepteur V1 partira de là.
- Une table de relevé des forces posées, jumelle de `sightings` (par observateur, écrite aux
  événements : pose, départ, pose ou départ du détecteur, fondation ou désactivation d'un poste
  d'écoute), lue depuis l'index du joueur — le fan-out reste celui de
  `brouillard-et-fanout.md`.
- La rose « attaquer » lit les relevés — pile posée, installation, avant-poste, objectif — et
  rien d'autre ; `movement-orders.ts` et le serveur sortent toujours de la même fonction.
- La dépêche « colonne inconnue relevée » gagne une sœur : « camp inconnu relevé » ; le compte
  rendu d'engagement ne change pas.
- « Sol non reconnu » (ADR 0019 §6) garde son sens : il dit ce que le joueur ne regarde pas, pas
  ce qui s'y trouve.
- À la partie de contrôle : le nombre d'attaques volontaires par joueur et par jour (déjà
  observé) devient la mesure de cette décision. Si personne n'attaque jamais un camp qu'il voit,
  le §3 a coûté plus qu'il ne rapporte.

## Ce qu'on abandonne

L'embuscade automatique, la bataille de rencontre, et le « campement invisible ». Le brouillard
ne cache plus *où* est une force posée à portée ; il cache toujours *ce qu'elle est*.
