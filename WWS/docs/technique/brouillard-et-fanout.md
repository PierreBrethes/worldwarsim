# Le brouillard est un problème serveur

Le point technique le plus sous-estimé du projet. Le rendu du brouillard est trivial ; **c'est la
requête qui est dangereuse**.

## Le piège

L'implémentation naïve est une requête réactive du type :

> « donne-moi tous les mouvements en vol, filtre ceux qui croisent un de mes détecteurs »

Dans un backend réactif, cette requête dépend de **toute** la table des mouvements. Conséquence :
chaque écriture de mouvement, par n'importe quel joueur, invalide et recalcule la requête de **tous**
les joueurs.

À 8 joueurs, avec des leurres, ça donne un fan-out quadratique sur l'action la plus fréquente du jeu.
C'est une bombe de facturation, et c'est aussi une fuite d'information si le filtrage se retrouve
côté client pour des raisons de performance.

## L'approche retenue

**Calculer les fenêtres aux événements qui changent le plateau, puis les dénormaliser.**

Un départ, une arrivée, une composition modifiée, un détecteur posé ou retiré et son changement
d'état déclenchent une réévaluation serveur bornée par les mouvements et les slots de la saison.
On calcule, pour chaque observateur, l'intersection temporelle entre les trajets et les portées,
puis on écrit ou corrige des enregistrements :

```
(observateur, mouvement, tDébut, tFin)
```

Chaque joueur ne lit ensuite **que ses propres lignes**. Sa requête ne dépend plus de la table des
mouvements, mais d'une table qui lui est propre. Le fan-out disparaît.

Une ligne future porte un rendez-vous annulable : aucune dépêche et aucun arc ne sort avant
`tDébut`. Si l'événement suivant rend la fenêtre impossible, la ligne et son rendez-vous
disparaissent. Une fenêtre déjà ouverte n'est pas effacée : son `tFin` est refermé et elle devient
la dernière position connue.

## Ce que ça implique

- **Un détecteur créé après un départ peut voir la suite du mouvement**, jamais son passé. La
  réévaluation commence à l'heure de l'événement et ne fabrique aucune information rétroactive.
- **Un détecteur mobile ne voit que dans son milieu courant.** Les segments et les coûts stockés
  donnent sa position et son milieu à l'heure considérée ; un transfert n'appartient à aucun milieu.
- **Le pouvoir britannique** (voit tous les arcs maritimes) se traite dans le même passage, comme un
  détecteur global à information partielle.
- **Le sabotage** a besoin de savoir si un agent est à portée à un instant donné : c'est la même
  géométrie temporelle, à intégrer à la même réévaluation le jour où l'agent existe.
- Les détecteurs et les mouvements étant bornés par les troupes et les slots, la réévaluation reste
  un coût d'écriture événementiel ; aucune query de joueur ne balaie le plateau.
- **Le tronçon servi se taille à la lecture, et ça ne change pas le coût** (décision 4a du
  13/09/2026). Depuis qu'un relevé ne sert plus le fil entier mais la seule part vue, chaque ligne
  paie un échantillonnage borné — un point par minute de marche, plafonné, plus les sommets du fil
  traversés. C'est **par ligne `sightings` et non par mouvement** : la query reste sur l'index du
  joueur, et elle sert *moins* de points qu'avant, un tronçon n'étant qu'une part du trajet.
  Mesure du banc, huit mouvements vus par un même guetteur : trente et un points par arc.

- **Un événement d'un seul joueur ne relit que lui** (#145). Un départ, une arrivée sans combat,
  un pas de tournée, une recrue ne changent que les détecteurs et les colonnes de leur joueur :
  la réévaluation refait ses relevés et ceux tenus sur ses colonnes, et rend à cet instant ce que
  rendrait la réévaluation entière (test d'équivalence de `detection.test.ts`). Les camps, les
  caisses et les captures se relisent toujours en entier. Corollaire : **un événement qui change
  un détecteur appelle la réévaluation lui-même** — il ne compte plus sur le suivant pour le
  rattraper. Mesure du banc, 161 colonnes croisées dans un même carré d'Europe : un départ passe
  de plus d'une seconde (coupé) à quelques centaines de millisecondes.

## Le même piège au sol

La couleur des territoires (ADR 0020 §5) est exactement la même requête sous un autre nom : « les
régions que je connais ». L'implémentation naïve — calculer qui tient quoi, puis garder ce que mes
portées couvrent — dépend de **toute** la table des avant-postes, donc une fondation par n'importe
qui recalcule la carte de tout le monde.

La réponse est la même aussi : `regionSightings(observateur, région, tenant vu, date)`, écrite aux
**événements** (pose d'une troupe, fondation, départ et arrivée d'un mouvement) dans une mutation,
et lue par chacun sur son propre index. `control.held` ne lit pas une ligne de la table des
avant-postes.

Deux différences avec `sightings`, et elles suivent de ce que le sol ne bouge pas :

- **la ligne est écrasée, pas empilée** — c'est un *dernier* relevé, pas un journal ;
- **une fondation relève pour tous ceux qui regardent**, borné aux huit sièges et aux régions que
  le nouveau point peut avoir touchées : sinon un joueur posté à côté verrait le drapeau se
  planter et sa carte ne bougerait pas.

Mesure du 31/08 : un mouvement Lisbonne → Moscou (95 sommets, 76 haltes au demi-rayon) écrit
**21 lignes** en 13 ms ; à quatre joueurs, une heure de jeu — huit avant-postes, huit troupes
posées, huit marches — laisse **730 lignes** au total, la plus grosse part revenant à qui a fondé
en Europe centrale.

**Un gisement pris ne se refuse qu'à ce qu'on sait** (ADR 0029) : la commande ne compte que ses
propres exploitations et celles qu'on a relevées, la course se tranche quand le bâtiment se
tiendrait, et un gisement découvert pris rembourse le chantier et relève son tenant comme tout
autre relevé — jamais un refus gratuit qui sonderait la carte.

## Information périmée

Un arc détecté puis sorti de portée ne doit pas disparaître de l'écran : il devient une **dernière
position connue**, affichée différemment. Sans ça, l'information achetée s'évapore et le joueur a
l'impression d'avoir payé pour rien.
