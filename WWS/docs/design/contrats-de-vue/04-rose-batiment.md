# Contrat de vue — 04 · Rose sur bâtiment

**Rôle en une phrase :** au clic sur un bâtiment posé sur la carte, la **même rose des vents**
que pour les troupes, avec la branche **« Améliorer »** — le geste d'élévation rendu à la
carte (décision 54a).

**Révisé le 22/10 (#228) : la rose du bâtiment n'hérite plus de « Bâtir ici »** — bâtir passe
seulement par le plateau personnel (ADR 0029) ; les passages ci-dessous qui en parlent sont
caducs.

**Statut : codé (02/09).** La cible `building` existe (`src/domain/compass-rose.ts`), le mât la
rend au clic droit (`targetOfLabel`, `src/map/WorldMap.tsx`), la branche `upgrade` porte son coût
à plat et son grisé (`src/map/CompassRose.tsx`), et le clic appelle `constructions.start` — la
mutation d'`UpgradeControl`, doublon assumé (57a). Deux écarts au gabarit, tenus par le code
existant : la durée s'écrit avec `asDuration` (« 00:54:00 »), et la facture suit l'ordre de
`RESOURCES` comme `CostLine` — le même prix lu à deux endroits ne s'écrit pas dans deux ordres.

## Ce que le serveur sert (source de chaque champ)

| Donnée | Source |
|---|---|
| L'instance : clé, région, niveau | `view.ts:me.buildings[]` (`id`, `key`, `regionId`, `level`) |
| Coût du niveau suivant | `me.buildings[].nextLevelCost` |
| Durée du niveau suivant | `me.buildings[].nextLevelMinutes` |
| Plafonné par le QG | `me.buildings[].cappedByHq` |
| Stock courant (pour « 40 / 120 » et le grisé) | `me.resources` + `currentStock` |
| Déjà en file sur cette région | `me.construction` / `me.constructionQueue` (`upgradeHold:alreadyQueued`) |
| Quand la matière manquante arrivera | `availabilityOf` (domaine, sur `resources`) |

La règle du retenu est **la fonction existante** `src/domain/construction.ts:upgradeHold` —
la rose ne tient pas une seconde table (même principe que `legalMovementTypes`, ADR 0015).

## P1 — d'un coup d'œil (liste fermée)

- **La rose elle-même** : pictogramme par branche, **une branche « Améliorer »** portant son
  **coût dans la rose** — c'est LE chiffre (« alliage 108 », multi-matières à la suite).
  *Justification : le coût est ce qui décide du clic, et 54a le met explicitement dans la
  rose.*
- Le tampon de la cible dans le kicker de la rose : le nom du bâtiment + « niveau n ».
- **Les branches héritées de la région** restent (bâtir sur la région si quelque chose peut
  s'y élever — une région est le même sol vu de près, `compass-rose.ts:build`).

## P2 — au geste (survol de la branche)

- L'infobulle de branche (le modèle existant : label, coût, conséquence) : **coût avec stock
  à côté** (« alliage 108 / 86 »), **durée**, et la conséquence (« passe au niveau n+1 »).
- Quand la branche est retenue : **la raison, en clair, dans l'infobulle** — la phrase du
  serveur, jamais une paraphrase : « il faut 108 d'alliage — 86 en réserve » +, si servie,
  l'échéance (« disponible dans ~x min » / « jamais : aucune fonderie ») ; « plafonné par le
  quartier général » ; « un chantier attend déjà son tour dans cette région ».

## P3 — nulle part

- La liste des autres bâtiments de la région, les stocks en tableau, le catalogue — la rose
  est un menu, pas une fiche. La lecture complète du bâtiment reste à l'Économie (ligne
  focalisée — le deep-link existe, `focused`).
- Tout ce que la popin de troupe réserve : la rose ne décrit pas, elle propose.

## Tampons / états de la branche « Améliorer »

Par priorité (source `upgradeHold`, un seul dit à la fois — le premier vrai) :

1. **retenue — chantier déjà en file ici** (`alreadyQueued`)
2. **retenue — plafonné par le QG** (`cappedByHq`)
3. **retenue — matière manquante** (`materials` : ressource, requis, disponible)
4. **franche** — cliquable, part en file (`constructions.start`)

**Exception assumée à « rien de grisé, jamais »** (ADR 0015) : la décision 54a dit
explicitement que la branche se **grise avec sa raison** quand le stock manque, au lieu de
disparaître. Motif : contrairement à un type de mouvement illégal, le manque de matière est
transitoire et le remède se chiffre — une branche qui disparaît cinq minutes se lirait comme
un bug (le même argument que la grue du panneau de construction). La règle générale de la
rose des mouvements ne change pas.

## Actions tolérées

- **Améliorer** (la branche — envoie `constructions.start`). C'est l'action de la rose, pas
  d'une surface : elle est *sur* la carte, la règle « les surfaces lisent » est respectée.
- Les branches région héritées (bâtir) selon le contrat existant du panneau de construction.
- Observateur : **aucune rose** — le clic droit lui est déjà inerte partout
  (`compass-rose.ts:compassOf`, `defeated`).

## Manque côté serveur (futurs prompts code)

- Rien : toutes les données sont servies, et le client est écrit. **En visée, la grammaire ne
  change pas** : un mât rend le sol sous lui, parce qu'une colonne armée marche sur un lieu et
  qu'« améliorer » n'est pas une destination. La branche « rejoindre la garnison » (64b)
  appartient à cette rose-là et reste à faire.
- **Tranché (56a, 01/09)** : la rose s'ouvre au **clic droit** sur le bâtiment — cohérent
  avec la couche permanente « le clic droit agit, la popin lit » ; le clic gauche garde une
  lecture.
- **Tranché (57a, 01/09)** : l'élévation reste **aussi** dans Économie / Caserne
  (`UpgradeControl`) — doublon assumé, même fonction, un seul appelant de
  `constructions.start`.

## À coller à Claude design — Rose sur bâtiment

> **Toutes les chaînes et tous les chiffres viennent de l'annexe
> `04-rose-batiment-donnees.md`, jointe — n'écris rien, ne calcule rien, ne crée aucun
> état ; demande ce qui manque. Valide sur les chaînes les plus longues de l'annexe.**
> Maquette la rose des vents ouverte au **clic droit** sur un bâtiment de la carte
> (décisions 54a et 56a — même objet radial que la rose des troupes, mêmes pictogrammes
> muets, libellé au survol). Kicker : nom
> du bâtiment + « niveau n ». Branches : « Améliorer » avec son coût lisible dans la rose
> (la seule branche qui affiche un chiffre à plat), plus les branches que la région sous le
> bâtiment offrirait déjà (bâtir). Au survol de « Améliorer » : coût avec stock à côté
> (« 108 / 86 »), durée, conséquence « passe au niveau n+1 ». États de la branche, un seul à
> la fois, dans cet ordre : retenue car un chantier attend déjà dans cette région ; retenue
> car plafonné par le QG ; retenue car matière manquante (grisée **avec sa raison** et, si
> connue, l'échéance — c'est l'exception assumée au « rien de grisé ») ; franche. Aucune
> autre donnée : pas de liste de bâtiments, pas de stocks, pas de catalogue — la fiche
> complète reste à l'Économie. Pour un observateur la rose ne s'ouvre pas du tout.
