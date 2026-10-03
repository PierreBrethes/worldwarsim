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

## Emblèmes — icônes de ressources et drapeaux

Deux planches complètent la palette (maquettes `Icônes ressources.dc.html` et
`Drapeaux bandeau.dc.html`), toutes deux implémentées.

**Trois icônes de ressources** (la planche d'origine ; l'économie v2 en compte huit depuis, voir [charte](../marque/charte.md)), silhouettes pleines sans détail intérieur : caisse cerclée
(ravitaillement `#b07434`), lingots empilés (acier `#8fa0b0`), casque (effectifs `#8b9160`).
Formes distinctes à la découpe, donc lisibles même sans la couleur. Sur papier, les teintes
s'assombrissent : `#8a5a24`, `#4d6376`, `#6a7047`.

> **L'icône ne remplace jamais le chiffre**, elle remplace le *mot* quand la place manque.
> En dessous de 12 px elle devient illisible : préférer alors le chiffre seul.

**Drapeaux — tracés officiels, jamais déformés.** Les SVG de `country-flag-icons` (ratio 3:2, moins
de 4 Ko en tout, incorporés en data-URI) passés au filtre `saturate(.45) sepia(.28) brightness(.85)`
pour les ramener dans la palette : un drapeau officiel saturé crèverait le budget de contraste.

> **Règle unique : la boîte s'adapte au drapeau, jamais l'inverse.** Étirer un drapeau sur une bande
> dix fois plus large que haute transforme le disque japonais en ellipse et couche les étoiles
> chinoises ; le recadrer n'en montre qu'une tranche, et le Royaume-Uni se réduit à un aplat rouge.
> Chaque emploi lui donne donc une boîte au ratio 3:2 :

| Emploi | Traitement | Où |
|---|---|---|
| **bannière** | drapeau plein cadre, la carte est dessinée autour | choix de nation — une grille de huit cartes, drapeau en haut, nom dessous |
| **filigrane** | drapeau ancré à gauche d'une bande sombre, hauteur pleine, fondu sur sa propre largeur | bandeau nation |
| **cartouche** | 27 à 36 px, liseré, reflet de verre | en-tête de fiche, liste des joueurs |

Le filigrane **ne va que sur fond sombre** : sur papier le drapeau vire au bloc gris.
L'**URSS** n'existe dans aucun paquet (pays disparu) : son tracé est à nous, dans
`src/emblems/ussr.svg`. L'**Allemagne** porte le tricolore actuel, jamais le drapeau de 1940.

**Ces six teintes étendent la palette verrouillée de la fiche 11.** Elles sont désaturées et
n'entrent pas en concurrence avec les encres de nation, mais c'est une extension assumée.

## Ce qui reste à faire

- ~~**Typographie.**~~ Choisie depuis : Bodoni Moda (titrage), Source Serif 4 (labeur), Archivo Narrow
  (interface), IBM Plex Mono (chiffres). Rôles et styles : [charte](../marque/charte.md).
- **Les écrans qui comptent.** Fiche de nation, file de production, journal d'événements, fiche
  d'unité. Ils n'existent pas encore — c'est pour ça qu'il est trop tôt pour une passe de design
  complète.
- **Les unités.** Silhouettes à plat, encre unique, dans l'esprit des planches de reconnaissance
  d'aéronefs de l'époque.
- **Les cinq curseurs de souris** (`public/cursors/`, 32×32, références dans
  `maquettes/pictos/references/`) sont **dessinés mais non branchés** — aucun code ne les a
  jamais chargés. Ils attendent les surfaces qui les nomment : *cible* le ciblage d'un
  mouvement (4.7), *construire* la pose de bâtiments de l'économie v2 (ADR 0015),
  *renseignement* l'écran d'information (4.8), *défaut* et *interactif* le survol du plateau.
  Le moteur de carte ne pose aujourd'hui que `grab` / `grabbing`, en mots-clés CSS
  (`map/engine/index.ts`, retour visuel du mode déplacement) : ce n'est pas le même besoin.
  Ne pas les supprimer en croyant à du code mort — ce sont des assets en avance sur leur
  surface.

## Le bon moment pour une passe de design

Pas maintenant pour les écrans : l'UI actuelle, c'est quatre curseurs, il n'y a rien à styliser.

C'est maintenant le bon moment : la simulation a donné l'inventaire exact des décisions du joueur,
donc la liste des écrans. Le brief est prêt dans [11 — Brief UI](11-brief-ui.md).
