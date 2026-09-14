# qg-pose-par-le-joueur — le quartier général se pose au lancement, il n'est plus planté

Suppose `dette-par-gisement` passé. Lis `CLAUDE.md`, `CONVENTIONS.md`, l'ADR 0015 (le QG
planté) et l'ADR 0017 §2 (« Le QG, lui, reste planté au niveau du format dès le lancement »),
l'ADR 0020 §10 (la capitale ne mange aucun emplacement), `convex/seasons.ts` (`endow`, lignes
~150-200 : le QG inséré à `capitalRegionOf`, l'infanterie de départ garnison au QG),
`convex/regions.ts` (`CAPITAL_REGION`, `capitalRegionOf`, `foundationOf`, `foundationOwed`),
`convex/constructions.ts` (`owedFreely`, `HQ_ALREADY_BUILT`, `pointRefusal`), `convex/sites.ts`
(`hqLevel`, `homeSlots`, `takenAtHome`), `convex/constants.ts` (`HQ_LEVEL_AT_LAUNCH`,
`UNLOCKED_AT`, `unlockLevel`), les trois lecteurs de `capitalRegionOf` hors `seasons.ts`
(`surveys.ts:94`, `movement/arrival.ts:373`, `movement/detection.ts:513` — le repli d'une
troupe à `stationedAt: null`), `src/domain/next-actions.ts`, `FoundationRows.tsx`, la rose de
construction (`src/domain/movement-orders.ts` ou l'équivalent pour « bâtir »), et le rapport
`WWS/docs/rapports/2026-09-11-partie-de-controle.md` ligne 2 (question 89). Ne commit pas, ne
push pas. Un chantier, un commit.

## Décision (Pierre, 13/09/2026 — 1b)

**Le joueur pose son quartier général au lancement, où il veut sur son sol national.** C'est
une révision signalée de l'ADR 0015 et de l'ADR 0017 §2 : le QG entre dans le mécanisme du
socle — première dette, facturée zéro, terminée immédiatement, niveau `HQ_LEVEL_AT_LAUNCH` —
au lieu d'être planté sur la capitale de 1940. L'enjeu qui l'a rouverte : une bâtisse par
région, donc un gisement sous le QG est perdu ; le joueur doit pouvoir choisir ce qu'il
sacrifie. (Sur les huit capitales une seule porte un gisement, Chongqing — l'enjeu est mince,
la décision est prise.)

## Les règles

1. **Rien n'est planté à `endow`** : ni QG, ni infanterie. Les ressources de départ, oui.
2. **Le QG est la première entrée de `foundationOf`** — `{ key: 'hq', deposit: null }` — avant
   les extracteurs. Une dette sans gisement se consomme par un QG debout, quelle que soit sa
   région. Pose sur **sol national seulement** (règle existante de pose), une bâtisse par
   région (existante), gratuite et immédiate (`owedFreely`), au niveau `HQ_LEVEL_AT_LAUNCH`.
3. **Le QG d'abord.** Tant que le QG est dû, `constructions.start` refuse toute autre clé :
   `HQ_FIRST`, code d'erreur nouveau dans `errors.ts` + `fr.errors`. Vérifie si `UNLOCKED_AT`
   (tout à 1) et `hqLevel = 0` le refusent déjà d'eux-mêmes — si oui, `HQ_FIRST` est le
   message qui dit pourquoi, pas une seconde garde.
4. **L'infanterie de départ naît avec le QG** : `constructions` qui termine un `hq` offert
   (la première pose, jamais une élévation) insère la compagnie que `endow` insérait, garnison
   au QG (`stationedAt: <id du bâtiment>`), même `nominalStrength`, même commentaire sur le
   nominal et la réduction (à déplacer, pas à réécrire).
5. **`capitalRegionOf` reste** pour ce qu'il est : le point de repli d'une troupe sans adresse
   (`stationedAt: null`, lignes écrites avant ce jour) dans `surveys.ts`, `arrival.ts`,
   `detection.ts`. Ne le remplace pas par le QG : ces trois lecteurs servent des lignes
   historiques, et un joueur sans QG n'a pas de troupe. Dis dans le rapport si l'un des trois
   est atteint par une troupe neuve après ce chantier — il ne devrait pas.
6. **L'exemption d'emplacement** : `takenAtHome` ignore déjà `'hq'` ; l'ADR 0020 §10 tient (le
   QG ne mange pas d'emplacement). `homeSlots(0)` vaut 0 avant la pose : c'est voulu, rien ne
   se pose avant lui (règle 3).

## Au front

- « À faire maintenant » : la ligne de fondation existante porte le QG en premier ; le libellé
  de `FoundationRows` pour `hq` dit « quartier général — à poser sur votre sol ».
- La rose « bâtir » propose `hq` sur une région de sol national tant qu'il est dû, et plus
  jamais ensuite (même fonction que le serveur, rien de grisé).
- **Le plateau d'un joueur sans QG** : la caméra se centre sur la capitale de 1940 (le seul
  point qu'on connaisse de lui — trouve où le plateau choisit son cadrage initial et lis
  `CAPITAL_REGION` par le serveur si le client ne l'a pas), et la carte « à faire maintenant »
  n'a qu'une ligne. Vérifie que rien ne suppose un QG debout : `NationWindow`, la colonne QG du
  bandeau, `victory.ts` (nominal à zéro troupe), `press.ts` (industrie à zéro bâtiment),
  `surrender`, `fondateur absent`.

## Docs

- Bannière de révision datée en tête de l'ADR 0015 et dans l'ADR 0017 §2, avec la décision
  (1b, 13/09) et l'enjeu ; `CLAUDE.md` § « Ce qui existe » : la phrase sur le QG planté.
- `rapports/2026-09-11-partie-de-controle.md` ligne 2 : question 89 → « tranchée 1b le 13/09 ».
- La proposition `fonder-sans-question` (31/08) est rouverte de fait : une ligne en tête.

## Tests

`seasons.test.ts` : après `launch`, aucun `hq`, aucune troupe, `foundation[0]` est le QG.
`constructions.test.ts` : la pose du QG est gratuite, immédiate, au niveau
`HQ_LEVEL_AT_LAUNCH`, crée l'infanterie garnison ; une seconde pose ailleurs → `HQ_ALREADY_BUILT`
; une mine avant le QG → `HQ_FIRST` ; le QG sur une région à gisement est accepté et la mine y
est ensuite refusée (`REGION_TAKEN`). Tous les tests qui posaient un bâtiment juste après
`launchedSeason` doivent d'abord poser le QG : ajoute un helper dans le fixture plutôt que de
répéter la pose.

## Ce que ce prompt ne fait pas

Pas de déplacement du QG après la pose, pas de destruction du QG (point 16 de la file), pas de
capitale « nommée » au classement ou à la presse. Le pouvoir ou l'atout national ne lit pas la
capitale — vérifie, et dis-le si c'est faux.

## Rapport attendu

Les tests ajoutés ; la liste des endroits qui supposaient un QG debout et ce qui a été fait
pour chacun ; le `verifier` vert.
