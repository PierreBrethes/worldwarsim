---
type: prompt
statut: proposé
maj: 2026-10-05
code: [src/styles/index.css, src/shell/FootBar.tsx, src/shell/BottomSheet.tsx, src/routes/-plateau/MapCard.tsx, src/routes/-plateau/AimingSheet.tsx, src/routes/-plateau/TroopBadge.tsx, src/domain/compass-rose.ts, src/domain/mouse-mapping.ts, src/routes/plateau.tsx]
decisions: [Pierre 05/10 — 1a, 2a, 3a ; ADR 0015]
voir: [mobile-6-feuille-fixe.md, done/mobile-5-refonte.md]
---
# mobile-7 — pied plus bas, pas de rose de refus au doigt, une feuille de sélection qu'on réduit

**En bref.** Trois retours de Pierre sur le plateau à l'iPhone 13 Pro (05/10), tranchés 1a, 2a et 3a.
Indépendant de `mobile-6-feuille-fixe`, qui touche seulement les pages hors saison.

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0015, puis les fichiers listés en
`code`. Ne commit pas, ne push pas. Tidy first : ranger d'un côté, changer le comportement de
l'autre. Un chantier par section.

## 1. La barre de pied se rapproche du bord (décision 1a)

Aujourd'hui `.board-foot` (`index.css`) réserve toute la marge de sécurité basse (34 pt sur
l'iPhone) sous chaque mot, et les onglets font `56px` sous un zoom de 1,2 : il reste environ 46 pt
de vide sous les libellés. Fais deux changements :

- **La réserve sous les mots devient `max(0px, safe-bottom − 16px)`**, divisée par l'échelle
  comme aujourd'hui. Il reste ≈ 18 pt, de quoi garder les mots hors de la zone du geste
  d'accueil. Ce qui ne change pas : les tuiles touchent toujours le bord de l'écran (retour du
  04/10). Le fond de l'onglet ouvert et la tuile « à faire » descendent donc jusqu'en bas. Seul le
  creux sous le mot rétrécit.
- **La hauteur passe de 56 à 50 px.** Les 44 px de cible au doigt restent garantis (règle
  `min-height: 44px` du même fichier).

`--board-bottom` est mesuré (`usePublishedEdges`, `Shell.tsx`), donc les feuilles et fenêtres
suivront d'elles-mêmes. Vérifie-le, ne recalcule rien.

## 2. Au doigt, la rose ne s'ouvre sur sa propre troupe que s'il y a un ordre (décision 2a)

Au doigt, un toucher net lit **et** agit (`cleanPressAt`). Sur une pile à soi, la rose de cible
`force` (`compass-rose.ts`, `foundHere`) s'ouvre donc toujours. Quand rien ne se fonde, elle ne
porte qu'un refus (« aucun ordre ici — un cargo ne fonde pas… »), en doublon de la feuille de la
troupe, et elle se cale par-dessus le bandeau.

- **Au doigt seulement, sur une cible `force`, la rose ne s'ouvre que si elle a au moins une
  branche** (« fonder »). Sans branche, rien ne s'ouvre et la feuille de la troupe suffit. Le
  bureau ne change pas : au clic d'action, la rose de refus reste telle quelle.
- **Le motif ne se tait pas (ADR 0015)** : sous le seuil, `TroopBadge` affiche une ligne avec le
  même motif, dans l'encre des refus de la rose. Cette ligne sort de **la même fonction** que
  celle de la rose : exporte ce qu'il faut depuis `compass-rose.ts`, ne réécris aucune phrase et ne
  duplique aucune règle. `TroopBadge` ne porte toujours aucun ordre, seulement une lecture.
- Trouve l'endroit où le toucher ouvre la rose (moteur de carte, `WorldMap.tsx` ou `plateau.tsx`)
  et coupe la condition là, une seule fois. Ne mets pas un second filtre dans `CompassRose`.

Test : au doigt sur une pile de cargo posée, aucune rose ne s'ouvre et la feuille porte le motif.
Au doigt sur de l'infanterie fondatrice, la rose propose « fonder ». À la souris, rien ne change.

## 3. Un cran « réduit » pour les feuilles qui portent une sélection (décision 3a)

Aujourd'hui `MapCard` (troupe, camp relevé, objectif, caisse) et `AimingSheet` ouvrent la
`BottomSheet` au cran `peek`, et glisser vers le bas depuis `peek` appelle `onClose`. Résultat :
la sélection est perdue alors que Pierre voulait seulement dégager la carte.

- **`BottomSheet` gagne un cran `collapsed`, sur option** (une prop, du genre
  `keepsSelection`). L'option est activée par `MapCard` et `AimingSheet`, et par elles seules :
  « à faire », les calques et les dépêches gardent leur comportement.
- **Ce que montre le cran `collapsed`** : la poignée et la ligne d'en-tête (surtitre, `aside`,
  « fermer »), rien d'autre. Aucun contenu ne défile dessous.
- **Les gestes dans ce cran** :
  - glisser vers le bas depuis `peek` → `collapsed` ;
  - glisser vers le bas depuis `collapsed` → **rien** (la feuille revient à sa place) ;
  - glisser vers le haut, ou toucher l'en-tête hors du bouton « fermer » → `peek`.
- **On désélectionne** avec « fermer », ou en touchant la carte ailleurs (le comportement actuel
  de la sélection, inchangé).
- **La sélection survit au changement de cran.** C'est le but : en `collapsed`, la visée reste
  armée, les destinations restent cerclées sur la carte, et toucher une cible fait ce qu'il fait
  aujourd'hui.
- **Ce qui lit la hauteur de la feuille en tient compte.** `SHEET_SHARE` / `sheetHeight` /
  `sheetLift` ont besoin d'une part pour `collapsed` (la hauteur réelle de l'en-tête, mesurée de
  préférence). Le recentrage de la carte (`lift`) et le plancher de la rose au doigt
  (`fingerRose.floor`) doivent suivre le cran **courant**, pas `half` figé. Ainsi, une rose
  ouverte feuille réduite se pose plus bas, et non contre le bandeau.
- **Le cran survit au remplacement de la troupe sélectionnée** si c'est simple (même feuille,
  autre `key`). Sinon, rapporte-le et n'ajoute pas d'état global pour ça.

`MovementPreview` sous le seuil n'est pas concerné : c'est une confirmation, pas une sélection. Si
tu juges l'inverse, rapporte-le sans le faire.

## Preuve attendue

- Tests de `BottomSheet` : les transitions de crans avec et sans l'option. Sans elle, glisser vers
  le bas depuis `peek` ferme toujours.
- Un test de `plateau` ou de `TroopBadge` (`.phone.test.tsx` existants) : feuille réduite, la
  troupe est toujours sélectionnée et la visée toujours armée.
- `npm run verifier` vert.
- Rapport : la mesure du creux sous les libellés avant et après (en pt, iPhone 13 Pro, ou 390 ×
  844 avec une marge sûre simulée de 34 px), l'endroit où la condition de la rose a été coupée, et
  ce qui lisait `sheetHeight('half')` en dur.
