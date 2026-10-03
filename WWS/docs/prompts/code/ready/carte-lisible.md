---
type: prompt
statut: validé
maj: 2026-10-04
code: [src/map/engine/index.ts, src/map/engine/billboard.ts, src/map/engine/arcs.ts, src/map/engine/labels.ts, src/map/MapLabels.tsx]
decisions: [carte-lisible-2026-10-03]
voir: [mobile-2-cadre.md, ../../design/plateau-sur-telephone-2.md]
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
