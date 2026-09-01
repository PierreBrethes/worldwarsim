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

## Planche 2 — les trois états retenus (un seul à la fois, ordre du contrat)

1. **Chantier déjà en file ici** — Baraquements · Meuse (niveau 2 en file) :
   « `un chantier vise déjà cette région — annulez-le ou attendez son tour` »
2. **Plafonné par le QG** — Baraquements · Meuse au niveau 1 sous un QG 1 :
   « `plafonné par le QG — montez le quartier général d'abord` »
3. **Matière manquante** — Quartier général (→ niveau 2) : branche **grisée avec sa
   raison** (l'exception assumée au « rien de grisé », 54a) : « `il faut 72 de charbon
   (20 disponibles)` » + « `disponible dans 5 h 12` » (`fr.upgrade.availableIn`) ; coût au
   survol « `alliage 108 / 320` + `charbon 72 / 20` », « `1 h 21` ».

## Planche 3 — observateur

**La rose ne s'ouvre pas du tout** (`compassOf` rend null pour un défait). Rien à dessiner
— une planche-note suffit.

## Rappels du contrat (fermes)

- Un seul état dit à la fois — le premier vrai de l'ordre ci-dessus.
- Aucune autre donnée : pas de liste de bâtiments, pas de stocks, pas de catalogue — la
  fiche complète reste à l'Économie.
- La branche « rejoindre la garnison » (64b) n'est **pas** dans cette vue : elle
  appartient à la rose **en visée**, chantier ultérieur — ne pas la dessiner ici.
- Pictogramme de la branche « améliorer » : à proposer (la plate n'en a pas — `crane` est
  pris par « Bâtir ici »).

## Chaînes les plus longues

« `un chantier vise déjà cette région — annulez-le ou attendez son tour` » ·
« `plafonné par le QG — montez le quartier général d'abord` » · « `il faut 72 de charbon
(20 disponibles)` » · « `Ouvre ce qui peut se poser en Meurthe-et-Moselle.` » ·
« `Alpes-de-Haute-Provence` » (le nom de région le plus long).
