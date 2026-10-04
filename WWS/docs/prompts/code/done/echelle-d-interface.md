---
type: prompt
statut: livré
maj: 2026-10-04
code: [src/styles/index.css, src/styles/tokens.css, src/styles/labels.css, src/styles/compass-rose.css, src/shell/Newspaper.tsx, src/shell/EntrySheet.tsx, src/routes/-index/FrontPage.tsx]
decisions: [hud-fit-2026-10-04]
voir: [mobile-2-cadre.md, ../done/page-d-accueil-la-une.md]
---
# echelle-d-interface — `zoom` ne multiplie plus les pourcentages : vérifier chaque compensation

**En bref.** Le lot de la une (04/10/2026) a mesuré que `hud-fit` (`max-width: calc(100% /
var(--hud-scale))`) rétrécit les feuilles au lieu de les ajuster : Chromium 153 et WebKit 26 ne
multiplient plus les pourcentages par `zoom`. Or toute l'interface du plateau est zoomée
(`--hud-scale: 1.2`) et compense ce zoom à **une vingtaine d'endroits** en divisant par
`--hud-scale`, y compris avec `dvw` et `dvh`. Ce lot mesure chaque compensation sur ordinateur et
corrige celles qui sont fausses. À donner **après** `mobile-2-cadre`, qui retire déjà `hud-fit`
sous 768 px. Décision de Pierre du 04/10 : corriger aussi sur ordinateur, captures avant/après à
l'appui.

Lis `CLAUDE.md`, `CONVENTIONS.md`, le commentaire de tête de `.hud` / `.hud-fit` dans
`src/styles/index.css`, `EntrySheet.tsx` (la feuille de la une, déjà corrigée) et
`Newspaper.tsx` (`fit`). Ne commit pas, ne push pas. Un chantier, un commit.

## 1. Mesurer avant de toucher

Liste toutes les longueurs écrites sous un `zoom: var(--hud-scale)` qui divisent ou multiplient par
`--hud-scale` (`grep "hud-scale"` dans `src/` : `index.css`, `labels.css`, `compass-rose.css`,
composants). Pour chacune, mesure dans **Chromium, WebKit et Firefox** (Playwright, 1440 × 900 et
1920 × 1080) la taille rendue contre la taille voulue (le commentaire dit ce qui est voulu ; à
défaut, la place disponible). Un tableau : règle, voulu, rendu par moteur, verdict.

Attention aux unités : les pourcentages, `dvw`/`dvh` et les `px` ne se comportent pas forcément
de la même façon sous `zoom` normalisé. Ne suppose rien, mesure.

## 2. Corriger ce qui est faux, et seulement ça

- Une compensation fausse se corrige au plus simple qui tienne dans les trois moteurs (souvent :
  retirer la division, ou dimensionner au conteneur comme `EntrySheet`). Pas de détection de
  navigateur.
- `hud-fit` disparaît s'il n'a plus d'usage juste ; `Newspaper` garde un seul mode de largeur.
- Ne change ni `--hud-scale` ni le principe du `zoom` : l'échelle d'interface reste ce qu'elle est.

## 3. La une au bureau

Au passage : à 1440 × 900, les trois brèves de la une passent sous la ligne des 900 px. Limite la
hauteur de la photo de une pour qu'elles tiennent au-dessus, sans toucher au téléphone.

## 4. Vérification

- Le tableau du §1, avant et après, dans le compte rendu.
- Captures avant/après, 1440 × 900, Chromium et WebKit : plateau à vide, chacune des huit fenêtres,
  les trois panneaux, la rose, accueil, salon, la une. Côte à côte, pour que Pierre juge.
- Sous 768 px : rien ne change par rapport à `mobile-2-cadre` (relevé relancé sur iPhone 13).
- `npm run verifier` complet.
