# 10 — Direction artistique

**Référence : illustration de presse, années 1900-1950.** Papier jauni, encres limitées, trame de
similigravure, titrage en serif condensé.

## Le risque principal : la DA contre la 3D

Un style journal, c'est plat, grainé, palette limitée, encre. Une carte 3D éclairée avec des océans
qui accrochent la lumière, c'est l'inverse. **Une UI vintage posée sur une carte réaliste donne un
résultat bancal** — deux mondes côte à côte.

**Décision : la carte entre dans la DA, on ne stylise pas seulement l'UI.**

## Ce qui est déjà implémenté

La palette **Journal 1947** du prototype teste exactement ce risque :

- **Rendu gravure de la mer** — la profondeur n'est plus un dégradé lissé mais la densité d'une
  trame de points inclinée à 45°, comme une similigravure de presse.
- **Isobathes à l'encre** — traits pleins au lieu d'un simple éclaircissement. Les isobathes *sont*
  un procédé de gravure de carte ancienne : elles servaient déjà la DA sans qu'on l'ait cherché.
- **Papier** — marbrure basse fréquence et fibre haute fréquence, générées en bruit de valeur.
- **Encres imprimées** pour les nations, à la place des couleurs d'écran saturées.
- **Grain et vignettage en espace écran**, superposés au rendu : ils portent donc aussi sur les
  terres et le socle, et pas seulement sur la mer.
- **Socle en tranche de papier**, éclairage aplati, mélange normal au lieu d'additif — l'additif
  sature instantanément sur un fond clair.

L'épaisseur des pays et les isobathes sont conservées, comme demandé.

## Ce qui reste à faire

- **Typographie.** Un titrage type presse et un texte étroit. Rien n'est choisi.
- **Les écrans qui comptent.** Fiche de nation, file de production, journal d'événements, fiche
  d'unité. Ils n'existent pas encore — c'est pour ça qu'il est trop tôt pour une passe de design
  complète.
- **Les unités.** Silhouettes à plat, encre unique, dans l'esprit des planches de reconnaissance
  d'aéronefs de l'époque.

## Le bon moment pour une passe de design

Pas maintenant pour les écrans : l'UI actuelle, c'est quatre curseurs, il n'y a rien à styliser.

C'est maintenant le bon moment : la simulation a donné l'inventaire exact des décisions du joueur,
donc la liste des écrans. Le brief est prêt dans [11 — Brief UI](11-brief-ui.md).
