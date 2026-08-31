# ADR 0005 — Brouillard de guerre par défaut

**Statut :** acceptée — **révisée le 31/08/2026 par l'[ADR 0020](0020-domination-par-couleur.md)**

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
