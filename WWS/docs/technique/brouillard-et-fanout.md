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

**Calculer les fenêtres de révélation à la création du mouvement, et les dénormaliser.**

Quand un mouvement est créé, on connaît déjà tout ce qu'il faut : sa courbe, sa date de départ, sa
date d'arrivée, et la position de tous les détecteurs existants. On calcule alors, pour chaque
détecteur, l'intersection entre le trajet et son rayon, et on écrit des enregistrements :

```
(observateur, mouvement, tDébut, tFin)
```

Chaque joueur ne lit ensuite **que ses propres lignes**. Sa requête ne dépend plus de la table des
mouvements, mais d'une table qui lui est propre. Le fan-out disparaît.

## Ce que ça implique

- **Un détecteur créé après un mouvement ne le voit pas.** C'est une décision de design, pas
  seulement une optimisation : poser une station d'écoute ne révèle pas rétroactivement ce qui est
  déjà en vol. C'est défendable et lisible, mais il faut l'assumer explicitement — ou recalculer les
  fenêtres à la création d'un détecteur, ce qui reste borné puisque les détecteurs sont rares.
- **Le pouvoir britannique** (voit tous les arcs maritimes) se traite dans le même passage, comme un
  détecteur global à information partielle.
- **Le sabotage** a besoin de savoir si un agent est à portée à un instant donné : c'est la même
  intersection segment/cercle, calculée une seule fois.
- Les détecteurs étant peu nombreux et les mouvements bornés par les slots, le calcul à la création
  est négligeable.

## Information périmée

Un arc détecté puis sorti de portée ne doit pas disparaître de l'écran : il devient une **dernière
position connue**, affichée différemment. Sans ça, l'information achetée s'évapore et le joueur a
l'impression d'avoir payé pour rien.
