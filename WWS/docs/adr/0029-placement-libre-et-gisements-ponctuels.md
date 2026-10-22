# ADR 0029 — Le placement libre des bâtiments, et les gisements ponctuels

**Statut :** acceptée (18/10/2026, Q30 et Q31 de la proposition
[Mondiale : économie, logistique, escouades](../design/propositions/mondiale-economie-logistique-escouades.md),
après la deuxième version du prototype du plateau personnel). **Révise l'[ADR 0013](0013-batiments-de-projection-sur-regions.md)**
(les bâtiments posés sur des régions) et **l'[ADR 0015](0015-economie-v2-ressources-localisees.md)**
(une bâtisse par région, un gisement par région). Elle généralise la décision 1b du 13/09 (le
joueur pose son QG) et le point de côte du port (révision du 04/09 de l'ADR 0013). Rien n'est
codé au 18/10, et les chiffres sont `@a-mesurer`.

## Contexte

Aujourd'hui, un bâtiment occupe une région (`buildings.regionId`), une seule par région, et seul
le port garde un point exact, sa côte. Dans le prototype, poser une tuile revenait à viser un
cercle d'emplacement : le geste montrait un découpage administratif, pas un lieu. Pierre veut
poser un bâtiment là où il le veut, comme son QG. Une région resterait ce qu'on voit du
territoire. Mais sans la règle d'une bâtisse par région, rien n'empêcherait d'empiler dix mines
sur une région de charbon.

## Décision

### 1. Un bâtiment se pose à une position exacte

Une tuile lâchée bâtit au point visé, sur le sol national ou dans le rayon d'un avant-poste, à un
**espacement minimum** des autres bâtiments (≈ 30 km). Le refus se dit (« Trop près de l'usine :
30 km au moins »). Le point est écrit une fois et ne bouge jamais, même quand on élève le bâtiment.
La région qui contient ce point se déduit de lui. Elle porte la couleur, comme aujourd'hui.

### 2. La région ne compte plus rien

Une région sert à **voir le territoire**, sa couleur (`heldRegions`), et à porter son **type de
terrain**. Elle n'est plus un emplacement. L'ADR 0015 l'avait déjà posé : *aucune quantité de jeu
ne se compte en régions*. Il ne reste plus de règle qui les compte. Que le type de terrain agisse
sur les troupes est une intention de Pierre, qui demandera sa propre ADR : aucune règle ne lit
`RegionType` sans elle.

### 3. Un gisement est un point, et il porte une seule exploitation

Chaque gisement devient un **point visible** sur la carte, avec l'icône de sa ressource : terres,
fer, charbon ou pétrole. Une exploitation ne se pose que sur un gisement libre, et elle s'y
aimante. Le générateur cuit ces points hors ligne, comme aujourd'hui les gisements par région. Les
garde-fous de répartition de l'ADR 0015 se rejouent sur des points : la bande, aucun profil plat,
les exceptions déclarées.

## Conséquences

- **Le schéma** : `buildings` reçoit un point obligatoire, que le champ du port préfigure. La
  région devient une lecture de ce point. Le wipe d'avant la saison test évite la migration.
- **Les gisements** : `scripts/generate-deposits.mjs` sort des points au lieu d'une ressource par
  région, et `public/deposits.json` change de forme. Il est toujours cuit, jamais retouché à la
  main.
- **La règle de placement** (`placementRefusal`) perd `REGION_TAKEN` et gagne l'espacement et le
  gisement libre. L'écran et le serveur la lisent toujours ensemble (ADR 0015).
- **Une feature de la file** passe avant le plateau personnel, puisque poser une tuile en dépend.
- **La capture et la frappe** visent un bâtiment par son point. Une région capturée l'est
  toujours par ce qui s'y tient.

## Précisée le 22/10/2026

Le clic droit ne propose plus « Bâtir ici », ni sur une région ni sur un mât (retour de Pierre,
#228) : bâtir passe seulement par le plateau personnel. « Raser » et « démanteler » restent dans
la rose.

## Ce qu'on abandonne

- **Une bâtisse par région**, et avec elle la séparation géographique automatique de la mine et
  de la fonderie (la fonderie disparaît de toute façon, ADR 0028).
- **Le gisement comme propriété d'une région.**
- **Le choix d'une région** au moment de bâtir : on vise un lieu.
