# ADR 0008 — Combat par interception et rejeu, plutôt que tour par tour interactif

**Statut :** acceptée

## Contexte

Proposition initiale : chaque force porte une zone d'agression ; quand deux zones adverses se
touchent, on zoome sur la scène, les zones fusionnent, et les joueurs s'affrontent dans un tour par
tour de placement — un croisement entre Advance Wars et Total War, avec orientation à 360° influant
sur les dégâts et la résistance.

L'envie derrière la proposition est claire et légitime : **voir la bataille**, de près, avec les
unités placées.

## Décision

- La **zone d'interception** est retenue.
- Le combat se résout **automatiquement et de façon déterministe** au point de contact.
- Le joueur peut ensuite **plonger sur la scène en rejeu cinématique**.
- L'**orientation** est conservée, mais remontée au niveau stratégique : c'est le **cap d'arrivée**.
- **Aucune couche tactique interactive.**

## Justification

### Le problème de synchronicité n'a pas de solution

Le jeu est asynchrone, sur sept jours, entre amis répartis dans le temps. Un combat tour par tour
interactif exige les deux joueurs présents. Il n'existe que trois issues, toutes mauvaises :

1. **Les deux doivent être en ligne** — on réintroduit exactement le problème de matchmaking qui a
   fait écarter le format de 30 minutes ([ADR 0001](0001-saison-longue-asynchrone.md)). Les batailles
   n'arrivent jamais, ou l'un attend deux jours.
2. **Tour par tour asynchrone** — 10 tours × 2 joueurs × quelques heures de latence donne une
   bataille de trois jours, dans une saison qui en compte sept.
3. **Le joueur absent est joué par l'IA** — l'attaquant déclenche alors les combats pendant que le
   défenseur dort. Cela annule la plage de repos (fiche 07), la politique anti-élimination, et la
   confiance entre joueurs.

### Une couche tactique est un second jeu

Pour un développeur solo, la construire avant même d'avoir simulé la boucle économique revient à
engager le plus gros poste de travail du projet sur un socle non validé.

### Le rejeu donne 100 % du plaisir visé pour une fraction du coût

L'envie était de *voir* la bataille. Le rejeu la donne intégralement : zoom, silhouettes placées,
déroulé des passes. Ce qui coûte cher, c'est l'interactivité — pas le spectacle.

Avantage supplémentaire : le joueur absent voit exactement la même chose que celui qui était en
ligne.

### L'interception est structurellement gratuite

C'est la même intersection segment/cercle que les fenêtres de révélation du brouillard, calculée au
même moment — à la création du mouvement. Elle ne demande aucun système nouveau.

## Conséquences

- Le positionnement des forces devient signifiant : blocus, escorte, embuscade.
- Le renseignement devient directement monnayable : savoir où passe un convoi permet de s'y placer.
- Il faut trancher **si l'on peut refuser le combat**. Sans dérobade possible, l'interception est une
  punition sans contre-jeu.
- Le rayon d'interception devient un paramètre sensible : trop grand, plus aucun convoi ne passe et
  la carte se fige.
- Le combat n'étant plus une inconnue, la **simulation d'équilibrage est débloquée**.

## Ce qu'on abandonne

Le placement tactique et la manœuvre pendant la bataille. L'orientation survit sous forme de cap
d'arrivée, ce qui en conserve l'intérêt décisionnel sans en payer le coût.

## Réserve — option B

L'**auto-battler à plans** reste explicitement en réserve : chaque joueur enregistrerait à l'avance
un plan de bataille (formation, orientation, cibles prioritaires, seuil de repli), les deux plans se
résolvant ensuite de façon déterministe.

C'est la seule façon connue de rendre de la décision tactique sans casser l'asynchrone. À
reconsidérer après la première saison test, si le combat automatique paraît trop passif.
