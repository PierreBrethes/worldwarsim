# Proposition — le clic sur un bâtiment, et la surface qui manque

**Statut : proposition, non gravée.** Session du 16/08/2026. Répond à « cliquer sur un bâtiment
doit ouvrir la fenêtre correspondante » et découvre, en faisant la liste, qu'une fenêtre manque.

## Le principe

> **Un clic ouvre la surface où l'on *utilise* le bâtiment, pas celle où on l'entretient.**

Sans lui, quinze bâtiments donnent quinze règles arbitraires, et « cliquer sur une caserne »
voudrait dire tantôt recruter, tantôt améliorer, selon le bâtiment. Le verbe du clic est
**toujours le même** : *voir ce que ce bâtiment fait pour moi.*

L'amélioration, elle, est présente **sur la ligne du bâtiment, dans la fenêtre où on l'utilise**
(tranché le 16/08). La carte pose, la fenêtre utilise et améliore. La fiche Nation ne porte plus de
bouton — sauf pour le QG, dont elle est la seule surface : voir « Tranché le 16/08 » plus bas. C'est un assouplissement délibéré de la règle « un verbe par surface » du brief
construction : améliorer est une action fréquente, et obliger à changer de fenêtre pour l'exécuter
transformerait chaque amélioration en trois clics.

## La table des quinze

| Verbe | Fenêtre ouverte | Focus | Bâtiments |
|---|---|---|---|
| **Recruter** | Production | section du domaine, site présélectionné | `barracks` `airfield` `port` |
| **Aligner** | Production | ligne du plafond de troupes | `billets` |
| **Produire, stocker, écouter** | **Industrie** *(à créer)* | ligne du bâtiment | `farm` `mill` `mine` `oilWell` `foundry` `arsenal` `quartermaster` `warehouse` `depot` `listening` |
| **Commander** | Nation | fiche du QG | `hq` |

Quatre destinations, quinze bâtiments, aucune exception.

La `listening` va dans Industrie **par défaut assumé** : c'est un bâtiment qu'on améliore et dont
on lit un effet chiffré (rayon de révélation). Elle migrera vers la fenêtre Espionnage quand
celle-ci existera — le rail la porte déjà en « à venir ». Un jalon inerte au milieu de quatorze
cliquables serait pire que ce provisoire.

## La fenêtre qui manque

**Dix bâtiments sur quinze — les deux tiers — n'ont aujourd'hui aucune surface où aller.** La
fiche Nation montre des **stocks**, jamais des **flux**.

Conséquence mesurable : un joueur ne peut pas répondre à *« pourquoi mon alliage ne monte
plus ? »*. La réponse est « ta fonderie manque de charbon », et **rien à l'écran ne le dit**. Les
trois chaînes de conversion sont codées depuis le 15/08 et sont invisibles.

La fenêtre **Industrie** porte ce que la fiche Nation ne peut pas porter :

- **Les trois chaînes**, chacune avec ses entrées, sa sortie, son débit, et surtout **à sec ou
  non**. Une chaîne à sec est le diagnostic le plus utile du jeu et il n'existe nulle part.
- **Les gisements exploités** : quelle région, quel gisement, quel débit, quel niveau.
- **Les réserves** : ce que l'entrepôt et le dépôt plafonnent, et de combien on est loin du
  plafond. Un joueur au plafond gaspille sa production en continu sans le savoir.
- **L'amélioration**, sur la ligne de chaque bâtiment.

Elle rejoint le rail comme quatrième surface, à côté de Troupes, Production et Nation.

## Le bandeau dit la même chose en une ligne

Le bandeau n'affiche que trois ressources sur huit, avec un commentaire qui l'assume :
« *the banner cannot hold eight* ». La place existe désormais.

**Les huit à plat seraient un tableur.** Ordonnés par la chaîne de production, le bandeau dessine
l'économie au lieu de l'énumérer :

```
minerais · charbon  →  alliage  →  munitions     tissus  →  bandages     nourriture · pétrole
```

Et **une flèche barrée signale une chaîne à sec** — le même diagnostic que la fenêtre Industrie,
en un glyphe, sans ouvrir quoi que ce soit. La fenêtre détaille ce que le bandeau alerte.

## Deux points techniques qui décident de l'implémentation

**Le lien porte l'instance, pas la clé.** Une nation peut tenir trois casernes. L'état d'URL doit
être `?building=<Id<'buildings'>>`, jamais `?building=barracks` — sinon un clic sur la caserne de
Bretagne ouvre celle de Normandie. Le motif est déjà en place dans `BoardSearch`
(`withWindow`, `windows[]`) : la clé s'y ajoute, elle ne s'invente pas.

**Le jalon est déjà cliquable.** `.label--clickable` et `.label::before` — la flaque au pied du mât
— portent déjà `cursor: pointer` et `pointer-events: auto`, et la flaque est explicitement
documentée comme « *the click target, the role the pictogram used to hold* ». Le clic n'est pas à
créer, il est à brancher.

**La fenêtre Production n'a pas d'onglets.** Elle empile trois sections de domaine, chacune avec
son sélecteur de site (`DOMAINS.map`, `sitesOf(domain)`). « Ouvrir sur le bon onglet » veut donc
dire *dérouler la bonne section et présélectionner le bon site* — pas construire un système
d'onglets. Le sélecteur existe, il attend une valeur.

## Ordre de réalisation proposé

1. **Industrie**, en lecture seule d'abord : les trois chaînes, les gisements, les réserves. C'est
   ce qui rend visible la moitié invisible du jeu, et ça ne dépend d'aucun clic.
2. **L'amélioration** sur les lignes d'Industrie et de Production.
3. **Le clic sur le jalon** et son état d'URL, une fois les destinations peuplées — brancher un
   clic vers une fenêtre vide n'apprend rien.
4. **Le bandeau à huit**, ordonné par la chaîne, avec la flèche barrée.

Faire le clic en premier serait l'ordre naturel et le mauvais : dix bâtiments sur quinze
ouvriraient une fenêtre qui n'existe pas.

## Tranché le 16/08, après l'avoir vu

**Industrie et Nation se recouvraient, et Nation cède.** Une fois Industrie et Production peuplées,
la couverture est complète sans elle : Industrie tient dix bâtiments, Production quatre, Nation
**un** — le quartier général. Les quinze lignes de Nation portaient les mêmes coûts et les mêmes
boutons, sans gisement ni file.

Nation garde ce qu'elle seule peut porter : le **QG** et ce qu'il débloque, et le **budget
d'emplacements** — l'étranglement central de l'ADR 0015, qui n'avait pour maison qu'un nombre
enterré dans une liste. Le recensement des quinze reste, dense et en lecture seule.

*(Ce doublon venait d'une contradiction entre cette fiche, qui disait « en lecture », et le critère
d'acceptation de `ameliorer-sur-la-ligne.md`, qui disait l'inverse. Corrigé par
`nation-budget-emplacements.md`.)*

## Questions ouvertes

- **Que montre Industrie d'un bâtiment adverse ?** Rien, comme partout — mais la question se
  posera le jour où l'espionnage rapportera une fonderie ennemie.
- ~~**Le clic gauche est-il déjà pris sur la carte ?**~~ Vérifié le 16/08 : le conflit était
  superficiel, la branche du bâtiment passe avant la sélection de pays dans le gestionnaire unique,
  sans `stopPropagation`.
- **La station d'écoute n'a aucun rayon chiffré**, ni dans `constants.ts` ni dans le design.
  Industrie affiche « non chiffré ». Le chiffrer demande d'abord de décider en quoi il se compte —
  et l'ADR 0015 interdit de compter en régions. À traiter avec l'espionnage.
