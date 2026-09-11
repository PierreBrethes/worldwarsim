# raccourcis-clavier — la caméra et les bureaux au clavier

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/docs/prompts/code/done/controles-camera.md` (les six gestes
souris et leurs raisons — ils ne bougent pas), `src/map/engine/index.ts` (l'API impérative de la
caméra : orientation, inclinaison, déplacement, zoom, retour au nord, recentrage), `src/map/WorldMap.tsx`
(la frontière React), `src/map/ControlsCard.tsx` (`?`, `isTyping`), `src/map/typing.ts`,
`src/shell/SurfaceRail.tsx` (les entrées du rail et leur ordre), `src/i18n/fr.ts`
(`fr.mapUi.gestures`), `src/routes/-plateau/BriefingSheet.tsx` (l'aide-mémoire, colonne « la carte et
la souris »). Ne commit pas, ne push pas. Client pur, un chantier, un commit.

## Pourquoi

Retour de la partie du 11/09 : « le binding des actions de caméra / déplacement serait bien ».
Aujourd'hui la carte ne se tient qu'à la souris (glisser, molette, espace) plus `N` (nord) et `?`.
Un joueur qui lit le journal d'une main veut déplacer la carte de l'autre, et ouvrir ses bureaux
sans viser le rail.

## Les touches — proposition, Pierre amende d'une ligne

| Touche | Effet | Existe déjà |
| --- | --- | --- |
| `←` `→` `↑` `↓` ou `Q` `D` `Z` `S` (et `A`/`W` en QWERTY : lire `event.code`, pas `event.key`) | déplacer la carte, vitesse proportionnelle au zoom, maintien = continu | — |
| `+` / `−` (et pavé numérique) | zoom, mêmes bornes que la molette | — |
| `Maj + ←` / `Maj + →` | orienter (rotation), même garde-fou d'alignement au nord à < 5° | `N` = retour au nord |
| `Maj + ↑` / `Maj + ↓` | incliner | — |
| `Origine` (Home) | recentrer sur le QG, animé | — |
| `J` `E` `A` `T` `P` `R` | journal · économie · abaque · télégraphe · presse · réglages — ouvre, ou ferme si déjà ouverte | rail |
| `Échap` | ferme ce qui est ouvert, du plus récent au plus ancien : rose → fenêtre / modale → sélection | partiel |
| `?` | la fiche des gestes, complétée des touches | oui |

Lettres = celles du rail, dans son ordre ; si une lettre est prise deux fois, la fiche `?` tranche.
`N` reste au nord (controles-camera). Aucune touche n'agit quand le focus est dans une saisie
(`isTyping`) ; `preventDefault` sur celles qui feraient défiler la page (flèches, espace, `+`/`−`
dans certains navigateurs).

## Ce qui change

1. Un seul point d'écoute clavier pour le plateau (`src/routes/-plateau/keys.ts` ou dans
   `plateau.tsx`, à toi), qui traduit en appels de l'API caméra existante — **aucune logique de
   caméra nouvelle** : si un effet n'a pas d'entrée dans le moteur (l'inclinaison au clavier, le
   recentrage animé), l'ajouter au moteur, pas dans React. Maintien = `requestAnimationFrame`, pas
   de répétition clavier (`event.repeat` ignoré).
2. `fr.mapUi.gestures` gagne les touches ; la fiche `?` les montre en deux blocs (souris, clavier).
   L'aide-mémoire (`BriefingSheet`, colonne 1) mentionne « flèches : déplacer · `?` : toutes les
   touches » — une ligne, pas la table.
3. Rien de stocké, rien de configurable : pas d'écran de remappage (ce n'est pas un réglage, c'est
   un mode d'emploi — même esprit que la fiche `?`).

## Cas d'acceptation

1. Focus dans le télégraphe : aucune touche n'agit sur la carte ni n'ouvre un bureau.
2. Flèche maintenue : la carte glisse à vitesse constante à l'écran, quel que soit le zoom.
3. `Maj + ←` relâchée à moins de 5° du nord → alignée à 0°, comme le glisser (test existant).
4. `J` deux fois : le journal s'ouvre puis se ferme ; `Échap` avec une rose ouverte ferme la rose
   et rien d'autre.
5. `?` liste chaque touche codée, aucune touche codée absente de la fiche (test statique :
   la table des touches est une seule constante lue par les deux).
6. `npm run verifier` vert.

Un commit, message en français qui décrit le chantier.
