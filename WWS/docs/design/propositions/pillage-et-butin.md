# Pillage et butin — le trajet de retour comme enjeu (proposition, 31/08/2026)

**Idée de Pierre (31/08)** : une colonne d'infanterie posée sur un bâtiment adverse le **détruit et
emporte l'équivalent de plusieurs heures de sa production**, ou le **capture** au prix d'un temps de
présence plus long. Modèle de référence assumé : Civilization pour le pillage, OGame pour la
capacité de chargement.

Cette proposition n'est pas une ADR : deux points restent à trancher, et l'un d'eux contredit une
décision prise le même jour.

## Ce que ça règle

Le pillage ferme la boucle ouverte par l'[ADR 0020](../../adr/0020-domination-par-couleur.md) :
la couleur donne une raison de *prendre* du territoire, le butin donne une raison d'aller *chez*
quelqu'un même sans vouloir sa terre. Et il crée le premier objet du jeu qui vaille la peine
d'être intercepté.

À rapprocher de [objectifs-neutres.md](objectifs-neutres.md) (29/08), qui posait déjà le dépôt
neutre « pris par le vainqueur — ramené par la colonne, comme un vrai pillage ». Cette proposition
est la version joueur-contre-joueur du même mécanisme, et le dépôt neutre en reste le banc d'essai :
il se pille sans poser « que devient un QG frappé » (🟠).

## Les règles proposées

### 1. Le butin est de la production capturée, pas du stock volé

Le stock est **déjà national** (ADR 0015, question tranchée n° 3 : « l'acheminement est
automatique, une exploitation verse au stock national »). Il n'y a donc rien à prendre *sur* un
extracteur.

Le butin est donc **créé au pillage** : l'équivalent de N heures de production du bâtiment pillé,
matérialisé dans la colonne. On ne va pas chercher un tas, on prive l'autre d'une usine et on
repart avec ce qu'elle aurait fait.

### 2. Le butin voyage, et il se perd

La colonne porte le butin. Sa **capacité de chargement** dépend de sa composition — une grosse
colonne emporte plus, et se voit de plus loin.

Le butin n'entre au stock national qu'au moment où la colonne **franchit la frontière de son
propre territoire** (la couleur de l'ADR 0020). Interceptée avant, elle le perd.

C'est le cœur de la proposition : le butin transforme le trajet de retour en cible. Il ne
fonctionne **que** couplé à la réévaluation du contact
([ADR 0021](../../adr/0021-portee-de-detection-et-postures.md) §2) — sans elle, une colonne qui
rentre est intouchable et le butin est un cadeau sans risque.

### 3. L'ordre est atomique, et il se termine à la frontière

Un ordre de pillage est un aller-retour complet : aller à la cible, piller, revenir **jusqu'au
point le plus proche de son propre territoire**, calculé par le serveur. La colonne s'y arrête,
posée, à l'endroit le plus exposé du territoire.

Écarté : mémoriser une destination de retour choisie au départ. Objection de Pierre, retenue —
ce serait un état invisible que le joueur doit traquer à travers plusieurs déplacements, exactement
le travers des « deux mémoires » que l'audit reproche déjà au flux de mouvement.

### 4. La durée de présence se compte en heures, pas en passes

**Correction d'une confusion de la session** : une *passe de résolution* n'est pas une unité de
temps. C'est la résolution d'un engagement, en une passe (ADR 0018) — pas une horloge périodique,
pas un tour. « N passes » ne veut rien dire comme durée.

Une durée de présence se compte donc en **heures**, comme `OUTPOST_DISABLED_HOURS` (6) et
`OUTPOST_IMMUNITY_HOURS` (3).

En revanche la distinction qui compte reste entière : **une durée, jamais un rendez-vous**.
« Tenir six heures » est équitable — chacun la vit quand il joue. « Actif de 18 h à 20 h » ne
l'est pas : celui qui peut être présent gagne, et c'est Q5 (l'écart d'assiduité) portée à son
maximum, dans un jeu conçu asynchrone. Aucun objectif, aucun pillage ne doit ouvrir de fenêtre
horaire.

### 5. La capture, si elle est retenue, ne touche pas l'avant-poste

Pierre veut la capture (« ça force à défendre ses avant-postes »). Elle touche frontalement
l'ADR 0004 : « un avant-poste ne change **jamais** de propriétaire […] une couche de capture aurait
recréé la conquête par la fenêtre ».

Formulation qui garde l'idée sans rouvrir le verrou : **on capture des bâtiments de production,
jamais un avant-poste, jamais un QG.** L'avant-poste reste désactivé ou détruit, comme aujourd'hui.

Le problème de l'enclave se résout seul grâce à la production reliée (ADR 0020 §6) : un extracteur
capturé au fond du territoire adverse **ne produit rien** tant que la couleur du preneur n'est pas
arrivée jusqu'à lui. La capture devient un pari sur l'avancée suivante, pas un gain immédiat — et
elle n'occupe pas un emplacement du preneur, mais celui de l'avant-poste adverse.

## ⚠️ Le point qui se contredit : entrepôt et dépôt

Décision de la même session : « stock global, capacité de stockage améliorable sur le QG, entrepôt
et dépôt supprimés ».

Or `convex/constants.ts` dit, à propos des plafonds bas : « the warehouse and the depot become
necessary — and therefore **targets** ». Ce sont, littéralement, les deux seules cibles pillables
prévues par l'économie. Les supprimer au moment précis où l'on ajoute le pillage a trois effets :

1. le pillage n'a plus pour cible que des extracteurs ;
2. le stock national devient un coffre-fort **inviolable**, puisque le QG est chez soi ;
3. « le dépôt qui explose », donné par l'ADR 0018 §7 comme l'une des trois choses qui rendent les
   munitions au tir intéressantes, disparaît.

Trois sorties, à trancher :

- **a.** Garder entrepôt et dépôt tels quels — la simplification cherchée n'est pas là.
- **b.** Fusionner les deux en **un seul bâtiment de stockage**, posé sur une région, pillable, qui
  relève le plafond national. Une cible, une décision, un bâtiment de moins.
- **c.** Supprimer les deux et poser le stockage sur le QG — simple, mais le stock devient
  imprenable et le pillage perd la moitié de son intérêt.

**Recommandation : b.**

## Ce qui reste à mesurer

- N, les heures de production emportées. Aucune valeur ne sort d'une simulation ; le simulateur ne
  modélise ni le combat ni l'interception.
- La capacité de chargement par rôle.
- Le temps de présence pour détruire, et celui pour capturer.
- Si le pillage devient plus rentable que produire, la boucle économique s'effondre. À regarder au
  premier skirmish avant tout réglage.

## Dépendances

Rien de tout ceci n'est livrable avant : la couleur (ADR 0020), la réévaluation du contact
(ADR 0021 §2), et une réponse à « que devient un QG frappé » (🟠) si le pillage vise autre chose
que des bâtiments de production.
