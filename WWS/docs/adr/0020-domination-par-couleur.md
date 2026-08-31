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

Un avant-poste colore les régions dont le centre tombe dans `CONTROL_RADIUS_KM` autour de son
point. La nation d'origine colore son propre pays. **Aucune région ne change de propriétaire au
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

### 4. Le score est public, permanent, et affiché en clair

La part de carte de chaque joueur est visible en permanence, nominativement, sans être noyée dans
un indicateur composite. Un score qu'on ne lit pas ne produit aucun comportement — et l'audit
reproche déjà au jeu de « montrer tout ce qu'il sait et rien de ce qu'il attend ».

### 5. La couleur est publique ; le brouillard se déplace sur ce qui bouge

**Révision de l'ADR 0005.** Le brouillard cessait de fonctionner à 2-4 joueurs : il ne rendait pas
l'information *chère*, il la rendait *absente*. La couleur des territoires devient publique — on
sait où sont les nations et jusqu'où elles portent. Ce qui reste caché, et ce qui s'achète, c'est
**ce qui bouge** : les colonnes, leur composition, leurs intentions, vues par les portées de
détection ([ADR 0021](0021-portee-de-detection-et-postures.md)).

L'espionnage ne perd pas sa colonne vertébrale, il change de sujet : de *où es-tu* vers *avec
quoi, et pour aller où*.

**La brume affiche `PlayerView`, elle ne le décore pas.** Le voile porté par la carte 3D doit
correspondre exactement à ce que le serveur refuse d'envoyer. Un masque cosmétique posé au-dessus
de données déjà transmises se lit dans l'onglet réseau, et ce serait un faux brouillard.

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

## Questions ouvertes

- **Q4, le plafond de bâtiments**, redevient bloquante : un plafond global (`1 + niveau QG`)
  punit exactement l'expansion que cette ADR demande. Piste non tranchée : emplacements **par
  avant-poste**, variables selon la richesse de la région, le palier de QG débloquant les **types**
  et non le nombre — le QG resterait l'étranglement.
- **Le frein à la prolifération d'avant-postes** : coût croissant par avant-poste plutôt que
  plafond dur. Non tranché.
- `CONTROL_RADIUS_KM` est un placeholder de plus, non simulé, à regarder à la main dès la première
  saison — comme `INTERCEPTION_RADIUS_KM` avant lui.
