---
type: prompt
statut: livré
maj: 2026-10-04
code: [src/domain/force-highlight.ts, src/domain/label-groups.ts, src/domain/labels.ts, src/map/MapLabels.tsx, src/map/WorldMap.tsx, src/map/engine/index.ts, src/routes/plateau.tsx, src/routes/-plateau/GarrisonStack.tsx, src/styles/labels.css]
decisions: [carte-lisible-2026-10-03]
voir: [../done/mobile-2-cadre.md, ../../design/plateau-sur-telephone-2.md]
---
# carte-lisible — la troupe touchée grossit, un drapeau à l'arrivée, un cartouche par pile

**En bref.** Trois règles de lecture de la carte, **sur ordinateur et sur téléphone** (décision du
03/10/2026). Référence visuelle : `Claude outputs/marque/plateau-mobile/passe-2-d-carte-lisible-telephone.png`
et `passe-2-e-carte-lisible-ordinateur.png` — **pour les règles seulement** : les étiquettes « INF /
CHR » de la maquette tiennent la place des vraies planches de troupes, qu'on garde. Le rail et le
bandeau de l'ordinateur ne changent pas.

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, le moteur de carte (`billboard.ts`, `arcs.ts`,
`labels.ts`, `MapLabels.tsx`) et l'ADR sur le brouillard (relevés). Ne commit pas, ne push pas. Un
chantier, un commit.

## 1. La troupe touchée ou cochée grossit

La troupe que le joueur a touchée (rose ouverte sur elle) ou cochée dans un panneau de garnison est
dessinée **30 % plus grande**, cernée d'un filet d'encre. Les autres gardent leur taille. Une seule
source de vérité pour « mise en avant » (pas deux états qui divergent entre rose et garnison).

## 2. Un drapeau à l'arrivée de mes mouvements

Chacun de **mes** mouvements en cours finit par un petit drapeau planté, à l'encre de ma nation, au
bout du trait qui part de la force. Hors champ, le drapeau s'annonce au bord de l'écran comme une
destination (même mécanique que les indicateurs de bord existants). Un mouvement **adverse relevé**
garde son arc actuel, **sans drapeau** : le relevé ne donne pas la destination (décision 4a du
13/09) — ne dessine rien qui la suggère.

## 3. Un cartouche par pile

- Une pile = **un seul cartouche** « Lieu · n » (n = nombre de troupes), jamais une étiquette par
  troupe.
- Deux cartouches qui se chevauchent à l'écran se **regroupent** en « 2 piles · n ». Toucher (ou
  cliquer) un regroupement rapproche la caméra jusqu'à ce que les piles se séparent.
- Les étiquettes de bâtiments (« niveau 2 · garnison 0 ») suivent la même règle de chevauchement.

## 4. Vérification

- Tests purs : regroupement des cartouches (chevauchement en coordonnées écran), choix de la troupe
  mise en avant, drapeau seulement pour mes mouvements.
- Captures avant/après sur ordinateur (1440 × 900) et iPhone 13, à deux distances de caméra (un
  pays, une région), sur la saison de test du relevé.
- Pas de baisse de fluidité mesurable : compte les objets ajoutés et dis-le.
- `npm run verifier` complet.

## Livré (04/10/2026)

- **Mise en avant** : `highlightOf` (`src/domain/force-highlight.ts`) est la seule source — la
  colonne armée, puis la troupe désignée, puis les cases cochées de la garnison (remontées par
  `GarrisonStack.onPickedChange`). La planche de la pile grossit ×1,3 depuis son pied contre le
  mât, cernée d'un filet d'encre, et prend le visage de ce qui est mis en avant. Seules les piles
  posées grossissent : un mât de bâtiment ou d'avant-poste dit une adresse, pas une troupe.
- **Drapeau** : une étiquette `arrival` par mouvement `mine`, au dernier point de la route, à
  l'encre de la nation, sans clic. Hors champ, elle s'annonce au bord par le cartouche nommé des
  destinations (`WorldMap.edgeNames`). Aucun drapeau sur un arc adverse ni un souvenir (test).
  Une marche vers un point nu reçoit du serveur le code pays comme nom (`convex/view.ts`,
  `destinationName`) : le drapeau le traduit par `countryLabel` ; les autres surfaces qui lisent
  `destinationLabel` gardent le défaut.
- **Cartouches** : une pile se lit « Lieu · n » (le lieu de `stationNames.place`, donc le pays
  pour un point nu, pas la ville). Piles et bâtiments qui se chevauchent — à la marge du repli,
  14 px — se regroupent (`groupOverlapping`, transitif, jamais pile et bâtiment ensemble) ; le
  cartouche réuni cède par priorité comme une étiquette. Le toucher rapproche la caméra
  (`separatingDistance`) ; **au plancher du zoom** (distance 4), deux piles à 15 km ne se séparent
  pas, et le groupe s'ouvre alors en éventail (`fanOffsets`, mâts allongés).
- **Coût** : aucun objet three.js ajouté. Par mouvement à moi, un nœud d'étiquette (SVG de deux
  tracés) et un cartouche de bord ; par regroupement visible, un nœud. La boucle par image ne fait
  qu'écrire le `transform` des regroupements ; tout le reste tourne au repos ou à la seconde.
- Captures avant/après : `Claude outputs/releve-mobile/captures/carte__{avant,apres}__*.png`
  (script `carte.mjs`), saison du relevé, ordinateur 1440×900 et iPhone 13.
