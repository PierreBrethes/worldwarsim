# Prompt Claude Code — la fondation hors chantier

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`,
l'[ADR 0015](../../adr/0015-economie-v2-ressources-localisees.md),
l'[ADR 0017](../../adr/0017-format-de-saison-et-socle-place.md) et la proposition
[ordre-de-mobilisation-et-fenetre-economie.md](../../design/propositions/ordre-de-mobilisation-et-fenetre-economie.md)
(section « Le constat du playtest »). Ne commit pas, ne push pas.

## Pourquoi

Playtest du 19/08, format skirmish : une filature payante lancée avant les mines offertes, et
le verrou « un chantier à la fois » qui bloque alors **trois poses de fondation** — gratuites,
instantanées, qui n'ouvrent aucun chantier. Le commentaire de `convex/constructions.ts` le dit
lui-même : *« It opens no construction of its own: there is nothing to wait for. »* Le code
contredit son propre commentaire : le `.unique()` sur `constructions` est vérifié tout en haut
du handler, avant la branche gratuite.

Deux autres défauts constatés dans la même partie, même famille — l'écran dit faux :

- « **saturé — production perdue** » en rouge sur l'alliage alors que **rien ne produit
  d'alliage** (fonderie non bâtie). Le skirmish démarre à 1000 d'alliage, au-dessus du plafond,
  **par design** (`startingAlloy` décide où un joueur entre dans la courbe) : une jauge pleine
  sans débit entrant est un état normal, pas une perte en cours.
- « **Chantier en cours : Filature — reste 00:06. Un seul à la fois** » répété sur chaque
  ligne d'amélioration de la fenêtre Industrie. Répétée quatre fois, l'information est du
  bruit ; le bandeau la porte déjà (`NationBanner`, `SiteStrip`).

**Cette passe corrige, elle ne redessine pas.** L'ordre de mobilisation et la fenêtre Économie
de la proposition sont hors de portée — ne les anticipe pas.

## 1 — Une pose offerte ne se met pas en file

**Serveur** (`convex/constructions.ts`) : déplace la vérification du chantier en cours pour
qu'elle ne morde que sur le **chemin payant** — juste avant le débit et l'insertion dans
`constructions`, donc après la branche gratuite. La discipline du handler ne change pas :
toutes les autres règles gardent leur mot **avant** la branche gratuite, sans exception —
gisement, une bâtisse par région, chez-soi ou portée d'avant-poste, plafond du QG, verrou de
niveau. Seul le verrou de chantier change de camp : il appartient au chantier, pas à la pose.

**Le trou que ce déplacement ouvre, à fermer dans le même geste** : aujourd'hui le verrou
global masquait le fait que la région d'un chantier en cours n'est réservée nulle part —
`placementRefusal` lit les bâtiments debout, jamais les chantiers. Une pose offerte sur la
région où la filature se bâtit créerait deux bâtisses sur une région à l'arrivée du
`finish`. **La région d'un chantier en cours compte comme prise** : refuse `REGION_TAKEN`
(serveur), et le miroir client dit la même chose.

**Client** (`src/domain/construction.ts`) : une option `free` ne porte jamais le hold
`constructionRunning` — elle reste ordonnable pendant un chantier. La région de
`view.me.construction` compte comme prise, comme au serveur. Dans `ConstructionPanel`, la
phrase de tête `heldByConstruction` ne s'affiche que si elle retient réellement quelque chose :
un panneau où toutes les lignes offertes sont vivantes n'annonce pas un blocage.

**Tests** — c'est le cœur de la passe :

- serveur : une pose offerte aboutit pendant un chantier payant, debout à l'instant, coût nul ;
- serveur : une pose offerte sur la région du chantier en cours refuse `REGION_TAKEN` ;
- serveur : une pose **payante** pendant un chantier refuse toujours `CONSTRUCTION_IN_PROGRESS` ;
- domaine (`src/domain/construction.test.ts`) : une option `free` n'a pas le hold
  `constructionRunning` ; une option payante l'a ; la région du chantier en cours est refusée.

## 2 — La saturation ne crie que si quelque chose se perd

`ReservesPanel.tsx` a déjà la bonne règle : l'alerte de saturation exige
`saturated && reserve.ratePerHour > 0`. La fenêtre Industrie ne l'a pas — `ReserveRow` affiche
`fr.industry.atCap` (« saturé — production perdue ») dès que `filled >= 1`, débit ou pas.

Aligne `ReserveRow` sur la règle du panneau : **critique seulement quand un débit entrant se
perd réellement**. Une jauge pleine sans débit reste une jauge pleine — pleine à l'œil, muette
en mots, jamais `--critical`. Même exigence pour le repère 85 % (`headroom`) : « reste N avant
plafond » ne prévient que si quelque chose monte.

Le débit par ressource existe déjà côté panneau (`ratePerHour`) — sers-toi de la même donnée,
n'en recalcule pas une deuxième version.

## 3 — La phrase du chantier ne se répète plus

Dans la fenêtre Industrie, `UpgradeControl` écrit `heldByConstruction` en toutes lettres sous
**chaque** bâtiment. Le bouton reste inerte pendant un chantier — c'est la règle —, mais la
phrase complète n'apparaît qu'**une fois par fenêtre**, en tête de la section des gisements ;
les lignes gardent au plus le `title` au survol. Le `ConstructionPanel` garde sa phrase de
tête : là elle est unique, c'est sa maison.

## Rapport

Dis ce qui a bougé fichier par fichier, le résultat de `npm run test` et de `npm run build`,
et rejoue à la main l'ouverture skirmish : fondation entière posable pendant un chantier
payant, alliage plein et silencieux, une seule phrase de chantier par fenêtre.
