---
type: prompt
statut: validé
maj: 2026-10-03
code: [src/styles/tokens.css, src/styles/index.css, src/map/engine/palette.ts, src/shell/Newspaper.tsx, src/routes/-plateau/EconomyWindow.tsx, src/routes/-plateau/SiteModal.tsx, src/routes/-plateau/GunneryWindow.tsx, src/routes/salon.tsx]
decisions: [charte-1a-2026-10-03, charte-1b-2026-10-03]
voir: [../../../marque/charte.md]
---

# nettoyer-les-couleurs — les couleurs suivent leurs variables, au pixel près

**En bref.** Le relevé de la charte (`WWS/docs/marque/charte.md`, « Écarts relevés ») a trouvé
l'encre écrite en dur 151 fois, 25 couleurs recopiées à côté de leur variable, des classes en
double et des variables mortes. Ce chantier rattache chaque couleur à sa variable **sans changer
un seul pixel** : si `--ink` change demain, tout suit. Ce qui changerait le rendu est hors de ce
chantier (dernière section).

> Décision de Pierre du 03/10/2026 : charte-1b-2026-10-03 (le nettoyage avant les maquettes).

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/docs/marque/charte.md`, `src/styles/tokens.css`,
`src/styles/index.css`, `src/map/engine/palette.ts`. Ne commit pas, ne push pas. Un chantier,
un commit.

**Avant de toucher au code, fais les captures « avant »** (voir Acceptation) : sans elles, rien ne
prouve que le rendu n'a pas bougé.

## 1. L'encre en transparence

Chaque `rgba(42, 33, 24, α)` (espaces variables) devient l'encre `--ink` **à la même opacité,
exactement** — on ne regroupe pas les 26 opacités sur une échelle, ce serait un changement visible :

- dans une classe Tailwind v4 : le modificateur d'opacité sur la variable
  (`border-(--ink)/35`, `bg-(--ink)/[.055]`) ;
- dans une feuille de style ou un objet `style` : `color-mix(in srgb, var(--ink) 35%, transparent)`.

Vérifie sur un cas que la couleur calculée est identique à l'ancienne (`getComputedStyle`) : le
mélange de Tailwind passe par oklab, un écart d'une unité sur 255 est toléré, pas plus.

## 2. Les couleurs déjà nommées

Un hexadécimal égal à une couleur de `tokens.css` dans du code DOM ou CSS devient `var(--…)` (le
relevé en compte 25 : `#9d4638` → `--critical`, `#b07434` → `--notable`, `#6e6a5e` → `--routine`,
`#2c5063` → `--sea-ink`…). **Sauf** là où une variable CSS ne peut pas être lue ou n'est pas la
source : `src/map/engine/**` (canvas et three.js), `src/domain/nations.ts` (`INK_BY_NATION`,
source des encres de nation), les tests, les SVG de `public/` et `src/emblems/`.

## 3. Le second bureau, nommé

Le moteur de carte peint son bureau en `#171208` (`PALETTE.desk`), l'interface en `#0f0a04`
(`--desk`). Les unifier changerait le rendu : ici on les **nomme**. Ajoute `--map-desk: #171208`
à `tokens.css`, avec un commentaire qui dit pourquoi il diffère ; les `rgba(23, 18, 8, α)` de
`Newspaper.tsx` et d'ailleurs deviennent `--map-desk` à la même opacité (comme au §1).
`palette.ts` garde ses littéraux (le moteur ne lit pas le CSS), avec une ligne qui renvoie à
`tokens.css`.

## 4. Les doublons de feuilles de style

- `.eyebrow` : la règle de `tokens.css` (10 px, 0,2em) est écrasée par celle d'`index.css`
  (9 px, 0,18em). Supprime la première ; dans la seconde, `font-size: var(--size-eyebrow-sm)` et
  un nouveau `--track-label: 0.18em`. Même chose pour `.eyebrow-dark`. Ne change pas
  `--track-eyebrow` (0,2em) : `UnitSprite.tsx` et `Plate.tsx` le lisent.
- `.paper` et `.paper-grain` déclarent la même trame : une seule déclaration, `.paper` y ajoute
  l'encre et la bordure.
- `.grain` existe dans les deux feuilles : garde celle d'`index.css` (elle porte `--z-grain`).
- `--font-text` (Source Serif 4) rejoint les trois autres faces dans `tokens.css`.

## 5. Les variables mortes

Après la passe, supprime de `tokens.css` les variables que plus rien ne lit (le relevé :
`--sp-1` à `--sp-10`, et les `--size-*` sauf `--size-eyebrow-sm`). Vérifie chacune par recherche
dans `src/` **et** `WWS/`, `CLAUDE.md`, `CONVENTIONS.md` avant de l'ôter ; si un document les cite
comme règle, dis-le dans ton rapport plutôt que de supprimer.

## 6. Le garde-fou

Un test (`src/styles/colors.test.ts`) qui lit `tokens.css` et échoue si :

- `rgba(42, 33, 24` ou `rgba(23, 18, 8` reparaît dans `src/` (hors tests) ;
- un hexadécimal égal à une couleur de `tokens.css` paraît hors des exceptions du §2 ;
- `PALETTE` (`palette.ts`) diverge de `tokens.css` pour les couleurs qu'ils partagent :
  `desk` ↔ `--map-desk`, `paper`, `sea`, `seaInk` ↔ `--sea-ink`, `neutralLand` ↔ `--land`,
  `border` ↔ `--ink`, `graticule` ↔ `--ink-quiet`, `plinthTop`, `plinthBottom`,
  `worldRim` ↔ `--border-world`.

## Hors de ce chantier (changements visibles, décision de Pierre à part)

Regrouper les 26 opacités sur une échelle ; unifier les deux bureaux ; remonter `--ink-note` et
`--ink-faint` au-dessus de 4,5:1 ; réduire les 29 tailles de police et les 19 interlettrages. Ne
fais aucun de ces gestes, même petit.

## Acceptation

- `npm run verifier` vert, dont le nouveau test.
- **Rendu identique.** Captures avant et après, 1440 × 900, de `/connexion`, `/accueil`, `/salon`,
  `/rejoindre/<un code>` et du plateau avec la presse, l'économie, l'abaque, le journal, une fiche
  de site et l'aide-mémoire ouverts. Comparaison pixel à pixel avec l'outil de ton choix, sans
  dépendance ajoutée au projet : écart toléré d'une unité sur 255 par canal. Les paires et le
  rapport de comparaison dans `Claude outputs/marque/captures-nettoyage/`. Un écran que la pile
  locale ne permet pas d'atteindre : dis lequel.
- Le décompte avant/après dans ton rapport : `rgba(42, 33, 24` (151 → 0), hexadécimaux égaux à une
  variable (25 → 0 hors exceptions), variables supprimées (liste).
- `WWS/docs/marque/charte.md` : marque comme résolus les écarts traités, garde les autres.
