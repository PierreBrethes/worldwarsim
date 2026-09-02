# Annexe au contrat 04 — Jeu de données réel pour la rose sur bâtiment

**Règle : ce fichier est la SEULE source de texte et de chiffres de la maquette.** Chaînes
verbatim de `src/i18n/fr.ts`, chiffres de `convex/constants.ts`, régions réelles. Ce qui
manque se demande, ne s'écrit pas ; **aucun état ne s'invente** — les états de la branche
sont ceux d'`upgradeHold`, dans l'ordre du contrat.

## Scénario

France, QG 1 — le même que les vues 2 et 3. La rose s'ouvre au **clic droit** (56a) sur un
bâtiment de la carte. Elle garde la grammaire existante : pictogrammes muets sur la plate,
libellé + coût + conséquence au **survol** d'une branche ; l'ordre du dessin est celui de
l'éventail (nord puis horaire).

## Planche 1 — Mine · Meurthe-et-Moselle (branche franche)

- Kicker : « `région · France` » n'est PAS le kicker ici — la cible est le bâtiment :
  « `Mine` » + « `niveau 1` » (⚠ le kicker exact de la cible bâtiment est une nouvelle
  chaîne — proposer, marquer clé fr).
- Branche **« Améliorer »** (⚠ libellé : `fr.upgrade.action` = « `améliorer` ») avec **son
  coût lisible dans la rose** : « `54` » (alliage — la seule branche qui affiche un chiffre
  à plat, décision 54a).
- Au survol : coût avec stock « `alliage 54 / 320` », durée « `54 min` », conséquence
  « `passer Mine au niveau 2` » (`fr.upgrade.title`).
- Branche héritée de la région : **« `Bâtir ici` »** (grue), conséquence « `Ouvre ce qui
  peut se poser en Meurthe-et-Moselle.` » — présente car la fondation restante (ferme,
  filature) laisse des poses possibles.

## Planche 2 — les trois états retenus (un seul à la fois — formes gravées le 01/09, v2)

États 1 et 2 : **la branche disparaît** (règle générale ADR 0015) et la rose s'ouvre en
mode motif — en tête « `aucun ordre ici` » (`fr.compass.refused`, réutilisée telle quelle,
tranché 01/09), puis la phrase :

1. **Chantier déjà en file ici** — Baraquements · Meuse (niveau 2 en file) :
   « `un chantier vise déjà cette région — annulez-le ou attendez son tour` »
2. **Plafonné par le QG** — Baraquements · Meuse au niveau 1 sous un QG 1 :
   « `plafonné par le QG — montez le quartier général d'abord` »

État 3 : **la seule branche grisée du jeu** (l'exception assumée 54a) :

3. **Matière manquante** — Quartier général (→ niveau 2) : branche grisée avec sa raison :
   « `il faut 72 de charbon (20 disponibles)` » + « `disponible dans 5 h 12` »
   (`fr.upgrade.availableIn`) ; coût au survol « `alliage 108 / 320` + `charbon 72 / 20` »,
   « `1 h 21` », coût à plat « `108 · 72` ».

## Planche 3 — observateur

**La rose ne s'ouvre pas du tout** (`compassOf` rend null pour un défait). Rien à dessiner
— une planche-note suffit.

## Rappels du contrat (fermes)

- Un seul état dit à la fois — le premier vrai de l'ordre ci-dessus.
- Aucune autre donnée : pas de liste de bâtiments, pas de stocks, pas de catalogue — la
  fiche complète reste à l'Économie.
- La branche « rejoindre la garnison » (64b) n'est **pas** dans cette vue : elle
  appartient à la rose **en visée**, chantier ultérieur — ne pas la dessiner ici.
- Pictogramme « améliorer » : **tranché (01/09)** — le chevron sur assises (proposition A
  de la v1), lisible à 15 px ; la grue reste à « Bâtir ici ».
- Kicker de la cible : **tranché (01/09)** — « bâtiment · niveau n » (⚠ nouvelle clé
  `fr.compass.building(level)`) ; la région se lit sur la carte sous le réticule.
- **Pas d'index de branche** (« 1 / 2 ») en coin de carte : aucune donnée ne le porte, la
  rose se lit spatialement — retiré (v2).

## Chaînes les plus longues

« `un chantier vise déjà cette région — annulez-le ou attendez son tour` » ·
« `plafonné par le QG — montez le quartier général d'abord` » · « `il faut 72 de charbon
(20 disponibles)` » · « `Ouvre ce qui peut se poser en Meurthe-et-Moselle.` » ·
« `Alpes-de-Haute-Provence` » (le nom de région le plus long).

## Post-scriptum de livraison (01/09 — commit 61c82bb)

Deux écarts au gabarit, **validés** au branchement : les durées s'affichent au format
horloge du dépôt (`asDuration` réécrit — « `00:54:00` », « `05:12:00` »), et la facture
suit l'ordre de `RESOURCES` (« `72 · 108` », charbon avant alliage — le même ordre que
`CostLine` partout). Les annexes de la refonte, écrites avant, portent l'ancien format
« 54 min » : le code fait foi. Nouvelles clés : `fr.compass.building`,
`fr.compass.upgradeBill` ; `foundError` renommé `orderError` (le bandeau porte aussi
l'échec d'une élévation).
