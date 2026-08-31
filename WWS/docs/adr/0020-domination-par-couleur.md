# ADR 0020 — Domination par couleur : le territoire devient le score

**Statut :** acceptée (31/08/2026) — **révise l'[ADR 0005](0005-brouillard-par-defaut.md)**,
tient la promesse non tenue de l'[ADR 0004](0004-avant-postes-plutot-que-conquete.md),
retire les doctrines de la [fiche 05](../design/05-doctrines.md)

## Contexte

Constat de Pierre, 31/08 : **il n'y a aucune raison de s'attaquer**. L'audit du 25/08 le disait
déjà autrement — un seul générateur d'événements, une seule condition publique, aucune
interaction non violente, et une Domination simplifiée dont la barre est instantanée, donc
oscillante, donc illisible.

La carte, elle, ne raconte rien de qui tient quoi. C'est un manquement à une promesse déjà
gravée : l'ADR 0004 justifiait le modèle des avant-postes en annonçant « la course au
territoire, les fronts qui avancent et **la carte qui se colore** ». Le point a été codé, la
couleur jamais.

Trois modèles étaient sur la table pour donner une raison de sortir de chez soi : des bâtiments
défensifs et un contrôle de frontière ; un pillage qui rapporte ; une frappe terminale qui abrège
les parties. Aucun des trois ne répond au problème posé — le premier fige la carte, le deuxième
suppose une cible qui vaille le trajet, le troisième arrive après que la partie est décidée.

## Décision

**Le territoire tenu devient le score, il est public, et il se prend à l'adversaire.**

### 1. La couleur suit l'avant-poste, elle ne prend pas la région

Un avant-poste colore les régions dont le point tombe dans **son rayon** (`outpostReachKm`)
autour du sien — le rayon où il donne déjà le droit de bâtir (ADR 0015).

> **Révision du 31/08/2026.** Le rayon suit désormais le **niveau** du point : 120 / 180 / 240 km
> aux niveaux 1 / 2 / 3, au lieu d'un `OUTPOST_REACH_KM` unique de 400 km — au premier contrôle
> visuel en production, un seul avant-poste de niveau 1 peignait le quart de la France. La règle
> ne bouge pas, les deux montent ensemble ; les bâtiments déjà posés gardent leur ancrage
> (`buildings.outpostId`, écrit à la pose) et restent debout hors du nouveau rayon. Pas de nouvelle constante : *là où
je peux bâtir est là où je tiens*. Une règle au lieu de deux, et un joueur qui a compris la portée
de construction a compris la couleur. La nation d'origine colore son propre pays. **Aucune région ne change de propriétaire au
sens de l'ADR 0004** : elle n'est pas annexée, elle est *tenue* tant qu'un avant-poste vivant la
couvre. Retirer l'avant-poste retire la couleur, sans transfert.

### 2. Le score est relatif, pas absolu

Le score d'un joueur est sa **part du théâtre** — le nombre de régions qu'il tient sur le total
des régions tenues par quelqu'un. Une région prise à un adversaire vaut donc mécaniquement deux
fois une région neutre : elle entre chez soi et sort de chez lui.

C'est la seule formulation qui rend l'attaque plus rentable que l'expansion vers le vide. Avec un
score absolu, l'optimum reste de poser des avant-postes loin de tout le monde : moins cher, sans
risque, sans munitions — et le problème de départ n'est pas résolu.

### 3. On compte des régions, avec un rayon en kilomètres

L'unité de score est **la région**, jamais le kilomètre carré, et le rayon de contrôle est
**métrique**. Les régions admin-1 du monde réel ont des tailles très inégales : le même avant-poste
colore huit régions au Benelux et une en Sibérie.

C'est voulu. La densité administrative réelle fabrique les points chauds sans qu'on ait à dessiner
un théâtre artificiel : l'Europe de l'Ouest vaut cher, les grands vides ne rapportent rien, donc
les joueurs convergent, donc ils se touchent. Au kilomètre carré, l'effet s'inverse exactement :
le vide devient rentable et chacun s'évite poliment.

### 4. Le score est public, la carte ne l'est pas

La part de carte de chaque joueur est visible en permanence, nominativement, sans être noyée dans
un indicateur composite. Un score qu'on ne lit pas ne produit aucun comportement — et l'audit
reproche déjà au jeu de « montrer tout ce qu'il sait et rien de ce qu'il attend ».

**Mais un chiffre public n'est pas une carte publique** (§5) : on sait *qui* mène, jamais *où* il
tient. Savoir que l'URSS pèse 34 % du théâtre ne dit pas quelle frontière est mince. C'est la
tension recherchée : le classement pousse à agir, le brouillard oblige à aller voir avant.

### 5. La couleur n'est pas publique : elle est **connue**, et elle se périme

**Révision de l'ADR 0005, dans son esprit et non contre lui.** Une première rédaction du 31/08
disait « la couleur est publique ». Elle est remplacée le même jour par une règle plus juste et
plus riche.

Il y a **deux états d'une région**, et le second est celui qu'on affiche :

- **la vérité** — qui la tient réellement, calculée depuis les avant-postes, connue du seul
  serveur ;
- **le relevé** — ce que *ce joueur-là* a vu la dernière fois qu'il a observé cette région, avec sa
  date.

Un joueur voit son propre territoire à jour, en permanence. Partout ailleurs, il voit **son
dernier relevé**. Une région qu'il n'a jamais observée n'a aucune couleur pour lui — elle est
vierge, pas neutre.

Le relevé se met à jour quand une de ses portées de détection couvre la région
([ADR 0021](0021-portee-de-detection-et-postures.md)). Entre deux passages, la couleur qu'il voit
peut être fausse : s'il a relevé une région tenue par l'URSS, qu'elle est prise par les États-Unis
pendant son absence, il continue de la voir soviétique **jusqu'à ce qu'il y retourne**.

C'est la carte d'état-major de 1940 : on ne savait pas qu'une région avait changé de mains sans y
envoyer quelqu'un. C'est aussi ce que l'ADR 0005 exigeait déjà sans que ce soit codé — « il faut
une UI pour l'information périmée : un arc détecté puis perdu de vue doit rester affiché comme
**dernière position connue**, pas disparaître ». La couleur applique cette règle au sol.

**L'ancienneté doit se voir, en permanence, pas au survol.** Une couleur fraîche est franche ; un
relevé ancien est délavé, et se date. Sans ça, un joueur qui décide sur une information périmée
lira un bug plutôt qu'une règle — et il aura raison de se plaindre.

**Ce que ça donne au jeu, et qui manquait :** le renseignement cesse d'être une couche annexe pour
devenir la condition de toute décision territoriale. Aller voir devient un ordre qui se justifie
seul. Et la carte cesse d'être un décor donné : c'est un objet que le joueur construit, région par
région.

**Le brouillard reste un problème serveur** (`technique/brouillard-et-fanout.md`). Le relevé se
dénormalise par observateur, comme `sightings` : chaque joueur lit ses propres lignes, jamais un
filtre sur la vérité. Une requête « les régions que je connais » qui dépendrait de la table des
avant-postes se recalculerait pour tous à chaque fondation.

### 6. Un bâtiment ne produit que relié

Un bâtiment ne produit que si **sa région porte la couleur de son propriétaire**. Un avant-poste
isolé, hors de tout territoire tenu, ne rend rien.

C'est la règle qui empêche le stock national de rendre la géographie décorative : sans elle, un
avant-poste à trois mille kilomètres rapporte autant qu'un avant-poste au coin de la rue, et il
suffit de semer des points là où personne ne va. Avec elle, la couleur cesse d'être un score pour
devenir le **réseau économique** — et couper la frontière d'un adversaire coupe sa production,
sans qu'il ait fallu inventer une règle de plus.

### 7. La désactivation se voit enfin

Un avant-poste désactivé par un raid (ADR 0004, ADR 0018 §6) **décolore sa zone** pendant toute
la désactivation. Détruit, il la décolore définitivement.

C'est le premier retour visuel d'un mécanisme codé et jusqu'ici muet, et c'est ce qui donne au
raid une valeur indépendante du butin : on frappe pour empêcher quelqu'un de tenir sa part au
moment où il en a besoin.

### 8. Le contrôle de frontière se fait par la détection, jamais par le blocage

Un poste frontière est **une portée de détection posée au sol** (ADR 0021), pas une fortification.
Aucun bâtiment ne rend une région imprenable, ni sur terre ni sur mer.

Dans un jeu asynchrone, la passivité est déjà surpayée : un défenseur n'a pas besoin d'être
présent pour tenir, un attaquant doit décider à l'avance et vivre avec. Une défense statique fige
la carte et ramène exactement le problème que cette ADR existe pour résoudre. Rien de maritime
tant que la mer de combat n'existe pas.

### 9. La domination est le mode unique

Il n'y a plus de choix de condition de victoire, plus d'hégémonie, plus d'influence, plus de
doctrine à sceller au lobby. La domination n'est plus une option parmi trois, c'est la règle.

## Conséquences

- **L'ADR 0005 est révisée, pas abandonnée.** Le client ne reçoit toujours jamais ce qu'il n'a pas
  le droit de voir ; `PlayerView` reste le nom qui interdit la fuite. Seul l'objet du secret
  change.
- **L'ADR 0004 n'est pas rouverte.** Aucune annexion, aucun avant-poste qui change de mains. La
  couleur est une lecture de qui tient quoi, pas un transfert de propriété.
- **La fiche 05 (doctrines) est abandonnée**, et avec elle `doctrine` au schéma, `chooseDoctrine`,
  `DOCTRINE`, et l'exigence d'une doctrine pour être prêt. Retrait plus lourd qu'annoncé : le
  champ est lu par `view.ts`, `player-view.ts`, le salon, le bandeau, le cartouche et une
  quinzaine de fichiers de test.
- **La victoire par seuil tenu devient obligatoire.** Sans horloge (ADR 0017 révisée le 27/08) et
  sans mode alternatif, c'est le seul terminateur de partie qui reste. Le trou « fondateur parti,
  saison non clôturable » passe de gênant à bloquant.
- **`REDUCTION_FACTOR` et la Domination simplifiée survivent comme échafaudage**, mais leur
  remplaçant n'est plus une doctrine : c'est la part de carte.
- **Fan-out.** La couleur est publique, donc elle ne coûte rien au brouillard — mais la brume dont
  les trous suivent les portées ne doit pas invalider `PlayerView` à chaque déplacement. Le
  serveur envoie une liste de cercles, le client en dérive le masque
  (cf. `technique/brouillard-et-fanout.md`).
- **La production reliée peut frustrer au premier contact** : un joueur qui perd sa frontière perd
  sa production sans avoir perdu un bâtiment. À regarder pendant le premier skirmish avant de la
  durcir.

## Ce qu'on abandonne

- **Les trois doctrines secrètes et le triangle de la fiche 05.** Écrites, jamais codées, et
  désormais sans place : le mode est unique.
- **Le score composite.** La part de carte se lit seule ou ne se lit pas.
- **Les fortifications et la défense maritime.** Réversible le jour où la mer de combat existe et
  où l'on aura mesuré que la carte ne se fige pas.
- **L'expansion gratuite vers le vide** comme stratégie dominante — c'était le but.

## Décisions du même jour, ajoutées le 31/08 au soir

### 10. Les emplacements suivent le niveau du site (Q4 tranchée, précisée le 31/08 au soir)

Le plafond global `buildingCap(hqLevel)` disparaît. Les emplacements de construction sont portés
par **chaque site**, et leur nombre est **le niveau du site** :

| Site | Emplacements |
|---|---|
| Sol national | `2 × niveau de QG` |
| Avant-poste | son **niveau** (1 → 3) |

**La fondation ne compte pas.** Ce qui est offert au lancement ne se paie pas en liberté : les
extracteurs dus par `foundationOwed` sont hors compte. C'est ce qui corrige le défaut mesuré le
31/08 (zéro placement libre au lancement, et d'autant moins que la nation est riche — l'inverse
des garde-fous de distribution de l'ADR 0015).

**Le niveau plutôt que la richesse de la région** : le niveau est une décision du joueur, la
richesse est un fait de la carte qui paie déjà par ses gisements. Améliorer un avant-poste devient
un choix lisible (« ce qui est joli s'achète »), `outposts.level` existe déjà au schéma, et un
avant-poste de niveau 3 devient une **cible hiérarchisée** : le désactiver gèle trois bâtiments.

Le palier de QG ne borne plus le nombre, il débloque les **types**. Le verrou « le QG unique
étranglement » tient, autrement : sans monter, un joueur ne peut que dupliquer ce qu'il a déjà,
jamais faire quelque chose de nouveau.

**Le frein d'expansion est l'entretien, pas un plafond** : chaque avant-poste consomme au fil de
l'heure (nourriture, charbon), croissant avec son niveau — le prolongement direct de l'entretien
par ancrage des troupes. Un coût de fondation croissant punirait une fois, à l'achat, puis serait
oublié ; l'entretien pèse tant que l'empire existe : le joueur surétendu est structurellement
fragile en guerre, et celui qui perd des avant-postes voit son entretien baisser — « un joueur
écrasé reste nuisible », appliqué à l'économie.

Le spam « un bâtiment par région partout » reste borné par quatre règles déjà en place : un
bâtiment par région, le rayon de pose (`outpostReachKm`), la production reliée (§6), et le coût
de fondation (une infanterie qui marche, un slot, du temps).

### 11. Le format de saison disparaît

`skirmish` et `campaign` sont retirés. Il n'y a plus qu'un jeu de valeurs de départ.

L'horloge était déjà optionnelle depuis le 27/08 ; ce qui restait au format, c'était un jeu de
constantes (`hqLevelAtLaunch`, `maxHqLevel`, `startingAlloy`, `startingOil`,
`startingAmmunition`) et le plafond de bâtiments — que la décision 10 vient de retirer de ses
mains. Ce qui reste ne justifie plus deux tables ni un choix au lobby.

⚠️ **Le choix des valeurs survivantes n'est pas neutre** : `startingAlloy` est la seule valeur du
projet issue d'une mesure (`WWS/simulation/opening/run.mjs --sweep`). Sans horloge, une partie n'a
plus de fin programmée : ce sont les valeurs de **campagne** qui décrivent le jeu réel, et c'est
celles-là qui restent.

## Questions ouvertes

- Les valeurs d'entretien d'avant-poste : aucune n'est mesurée, même statut que
  `UPKEEP_UNSUPPLIED_MULTIPLIER`.
- **Le rendu de la couleur au loin** : les régions n'apparaissent aujourd'hui qu'au rapproché
  (< 65 unités). Une couleur qui est le score doit se lire à toute distance — à trancher entre
  peindre le pays entier au loin ou rendre les régions tenues visibles quel que soit le zoom.
