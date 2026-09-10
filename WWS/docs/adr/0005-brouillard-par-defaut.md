# ADR 0005 — Brouillard de guerre par défaut

**Statut :** acceptée — **révisée le 31/08/2026 par l'[ADR 0020](0020-domination-par-couleur.md)**
— détection événementielle précisée le 08/09/2026 par l'[ADR 0021](0021-portee-de-detection-et-postures.md)
— **révisée le 10/09/2026 (décision 84a) : la rumeur de butin est la première fuite publique assumée**

> ⚠️ **Révision (10/09/2026, décision 84a).** Le pillage livré les 08-09/09 a introduit deux
> objets que cette ADR n'avait pas prévus, et Pierre les garde **pour les éprouver à la partie de
> contrôle** — pas pour les graver :
>
> - **La caisse de butin** (`lootCrates`) : le reliquat qu'une force détruite ne peut plus porter
>   reste au point du combat pendant `LOOT_CRATE_HOURS` (2 h, `@a-mesurer`), collectable par qui
>   l'atteint. Elle ne fuit rien par elle-même : sa position et son contenu exacts n'entrent dans
>   `PlayerView` que par une portée de détection existante (`lootCrateSightings`, dénormalisé par
>   observateur comme `sightings`).
> - **La rumeur mondiale** (`lootRumors`) : `LOOT_RUMOR_DELAY_MINUTES` (10) après la première
>   caisse d'un engagement, **tous les joueurs** reçoivent un cercle de `LOOT_RUMOR_RADIUS_KM`
>   (200) dont le centre est tiré une fois dans le disque autour de la caisse — jamais le point,
>   jamais le contenu, jamais les combattants. C'est **une entorse délibérée au « par défaut, un
>   joueur ne voit que ses propres arcs »** : un combat qui laisse du butin se sait, à 200 km près,
>   dix minutes plus tard.
>
> Ce que la révision achète : une raison de **converger** — deux joueurs qui n'ont rien relevé
> l'un de l'autre ont désormais un lieu commun où se rencontrer (vision V1, point 1). Ce qu'elle
> risque : que la rumeur dénonce le pilleur plus qu'elle n'attire le charognard, et qu'à deux
> joueurs elle ne dise que « l'autre est là ». **Ce que la partie de contrôle doit juger** :
> quelqu'un a-t-il bougé à cause d'une rumeur ? si personne, la rumeur part (une constante à
> zéro suffit : `LOOT_RUMOR_DELAY_MINUTES`) et la caisse reste, muette. Le filtrage reste serveur ;
> `lootRumors.list` ne joint jamais la caisse vraie.

> ⚠️ **Révision (31/08/2026).** Le secret change d'objet : la **couleur des territoires devient
> publique** — on sait où sont les nations et jusqu'où elles portent. Ce qui reste caché, et ce
> qui s'achète, c'est **ce qui bouge** : colonnes, composition, intentions, vues par les portées
> de détection ([ADR 0021](0021-portee-de-detection-et-postures.md)). Le motif : à 2-4 joueurs le
> brouillard ne rendait pas l'information *chère*, il la rendait *absente* (audit du 25/08).
> Ce qui ne change pas : le client ne reçoit jamais ce qu'il n'a pas le droit de voir, et le
> filtrage reste serveur. Le *convoi leurre* cité plus bas n'existe plus (retiré le 29/08).

## Contexte

Le prototype de carte affiche tous les arcs de mouvement à tout le monde. C'est joli, et c'est du
gâchis : l'effort de rendu le plus visible du jeu est offert gratuitement et ne coûte aucune décision.

Par ailleurs, l'espionnage était envisagé comme un système annexe parmi d'autres (logistique,
commerce, espionnage).

## Décision

**Par défaut, un joueur ne voit que ses propres arcs.** Les mouvements adverses ne sont visibles que
dans le rayon de détection de son territoire, de sa station d'écoute et de ses avant-postes d'écoute.

## Justification

Une seule décision produit trois effets :

- **L'espionnage devient la colonne vertébrale** au lieu d'un système optionnel. Sonde, agent
  dormant et sabotage cessent d'être du contenu pour devenir le jeu.
- **Le rendu 3D devient une ressource qu'on achète.** Voir la carte pleine d'arcs n'est plus l'état
  par défaut, c'est un résultat.
- **Une flotte qui arrive devient un événement.** C'est le générateur de récit le plus efficace du
  design, et il ne coûte aucun contenu à produire.

Le brouillard active aussi le convoi leurre, qui n'aurait aucun sens en information parfaite.

## Conséquences

- **C'est un problème serveur avant d'être un problème de rendu.** Une requête réactive naïve
  « arcs visibles par moi » se recalcule pour tous les joueurs à chaque écriture de mouvement : bombe
  de fan-out. Cf. [technique/brouillard-et-fanout.md](../technique/brouillard-et-fanout.md).
- Le client ne doit **jamais** recevoir les mouvements qu'il n'a pas le droit de voir. Un filtrage
  côté client serait contournable en trois lignes de console.
- Il faut une UI pour l'information périmée : un arc détecté puis perdu de vue doit rester affiché
  comme **dernière position connue**, pas disparaître.
- Le pouvoir britannique est explicitement une brèche partielle dans cette règle.

## Ce qu'on abandonne

La lisibilité immédiate de la situation globale, et la démo « regarde comme c'est joli » — sauf pour
le joueur qui a payé pour ça.
