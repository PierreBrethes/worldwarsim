# La Manchette — charte graphique (version pour Claude Design)

Ce fichier remplace le design system en ligne, que Claude Design ne peut pas ouvrir. Il va avec deux planches : `la-manchette-planche-couleurs-et-faces.png` (couleurs, encres, quatre faces) et `la-manchette-planche-composants.png` (manchette, boutons, champs, tampons, feuille posée, fenêtre, presse, télégraphe). Les polices sont toutes sur Google Fonts : Bodoni Moda, Source Serif 4, Archivo Narrow, IBM Plex Mono.

## Les règles

**La Manchette est un journal de 1940 posé sur une table de cartes.** Tout ce que le joueur lit est imprimé : de l'encre sur du papier jauni, une trame de similigravure, des filets, des tampons. Le plateau est la carte d'état-major sous la feuille. En cas d'écart entre cette page et le code, `src/styles/tokens.css` et les composants de `src/shell/` font foi.

## Ce qu'on écrit

- Le jeu parle français, le code anglais (ADR 0016). Tout texte affiché vient de `src/i18n/fr.ts`.
- Le ton est celui d'une rédaction : des phrases entières, au présent, sans exclamation ni familiarité. « Aucune édition n'a encore paru — la première tombe trois heures après le lancement. »
- Vocabulaire imposé : **mouvement**, **passe de résolution**, **avant-poste désactivé** ou **détruit** (jamais « pris »), **relevé**, **dépêche**, **télégraphe** (jamais « chat »), **presse**, **saison**, **salon**. Mots bannis : tick, temps réel, micro, base, rush, convoi, unité sélectionnée, tour de combat.
- Les sur-titres, boutons et tampons sont en capitales par CSS (`text-transform`), jamais saisis en capitales dans `fr.ts`.
- Les nombres suivent la presse française : virgule décimale, espace insécable étroite pour les milliers (`1 655`, `21,4 %`), et chiffres tabulaires partout (`font-variant-numeric: tabular-nums` sur `body`, non négociable).
- Les noms de matériel sont des noms propres, jamais traduits : « char lourd B1 bis », « Dewoitine D.520 », « Le Fantasque » (`src/emblems/units/equipment.ts`).
- Aucun emoji.

## Le papier et l'encre

- Le fond de l'application est `desk`. Une surface imprimée est `paper` avec la trame à 45° (classe `.paper` : un filet `ink` à 5,5 % tous les 5 px) et une bordure `ink` d'un pixel.
- Une couleur s'écrit toujours par sa variable. L'encre en transparence s'écrit `color-mix(in srgb, var(--ink) 35%, transparent)` ou, en classe, `border-(--ink)/35` ; jamais `rgba(42, 33, 24, …)` (le test `src/styles/colors.test.ts` le refuse). Seuls le moteur de carte et les encres de nation gardent des littéraux.
- Texte courant : `ink` sur `paper` (11,2:1). Texte secondaire et sur-titres : `ink-soft` (5,5:1). Corps calme : `ink-quiet` (6,8:1). Sur le bureau sombre : `paper` ou `paper-dim`.
- Le petit texte secondaire (notes, heures, liens discrets, textes d'exemple) prend `ink-note` (4,7:1). Il n'y a pas de gris plus pâle : en dessous, le texte ne se lit plus.
- **Le budget de contraste appartient à la couche de jeu.** L'interface reste désaturée pour que les encres de nation, les fils de mouvement, les avant-postes et les alertes ressortent par-dessus.
- **L'encre rouge `critical` est réservée** : une attaque subie, un avant-poste désactivé, un tir à sec, un relevé, et le filet de la manchette. Tout le reste passe à l'encre, y compris ce qui est grave mais acquis. Elle tient 4,4:1 sur `paper` : en texte, au moins 24 px, ou en tampon gras.
- Les encres de nation (`nation-france` … `nation-china`) ne sont pas des variables CSS : elles arrivent avec la vue du serveur (`INK_BY_NATION`) parce qu'elles désignent un joueur. Une région tenue les porte à l'opacité `held` (0,72).
- Les ressources ont deux encres : `res-<clé>` sur fond sombre, `res-<clé>-paper` sur papier. Leurs pictogrammes tiennent sans couleur, par la forme.
- La carte a ses propres valeurs (`map-*`, `arc-*`) : le moteur ne lit pas les variables CSS.

## Les filets, les angles, les ombres

- Filets : `--rule-strong` (1 px `ink`), `--rule-double` (2 px), `rule-medium` (`ink` à 32 %), `rule-light` (18 %), `--rule-dark` (1 px `ink-quiet`). Une manchette de journal porte un filet de 3 px, un blanc de 2 px, un filet d'1 px au-dessus du titre, un filet d'1 px dessous.
- Angles vifs partout : `radius` vaut 0, barres de défilement comprises.
- Aucune ombre dans l'interface (`shadow`). Seule une feuille posée sur le bureau en porte une (`shadow-pile`, `shadow-window`).
- Aucun dégradé lisse, aucun néon : les volumes se lisent par la valeur.
- Le grain d'impression couvre l'écran entier (`.grain`, opacité `grain` en overlay, plan `z-grain`).

## La typographie

Quatre faces, une par rôle, toutes chargées depuis Google Fonts :

- **Bodoni Moda** (`display`) pour ce qui se titre : la manchette, les titres de presse, les tampons, les noms de nation. Graisse 800, interlettrage `track-display`. Sous 20 px ses déliés s'effacent : pour des chiffres ou des noms petits, réglez l'axe optique bas (`font-variation-settings: 'opsz' 11`).
- **Source Serif 4** (`text`) pour ce qui se lit : le corps des dépêches et des notes longues (style `dispatch`). Jamais Bodoni pour un paragraphe.
- **Archivo Narrow** (`body`) pour l'interface : boutons, champs, sur-titres, messages du télégraphe.
- **IBM Plex Mono** (`mono`) pour les heures, les codes, les dates de saison et les compteurs.

Le sur-titre (`eyebrow`) est le libellé le plus fréquent : 9 px (`--size-eyebrow-sm`), capitales, `--track-label` (0,18em), `ink-soft` ; `.eyebrow-dark` en `paper-dim` sur fond sombre.

## La manchette

Le nom du jeu est un titre de quotidien, dessiné en CSS et jamais en image (`Wordmark`) : « la » en Bodoni italique 500 à la moitié du corps (jamais sous 9 px), MANCHETTE en capitales 800, un filet `critical` dessous (0,09 du corps, au moins 2 px, incliné de −0,6°). Le texte prend l'encre du support, le filet reste rouge sur papier comme sur le bureau. L'icône est le M de Bodoni Moda (axe optique 6) en `paper` sur un pavé `critical` : voir le groupe Logos.

## Les tampons

Un tampon constate un état administratif : « relevé », « désactivé », « saison close ». Il ne titre pas, ne compte pas, ne se clique pas. Deux par surface au plus. Sa rotation (±1°, jamais 0) est tirée du texte, pour qu'un même mot penche toujours du même côté.

## L'iconographie

- Les unités, les bâtiments, les ressources et les objectifs sont des planches illustrées (WebP détourés, `src/emblems/`) qui portent leur propre encre et ne prennent aucune teinte. Sous 20 px, une ressource passe au pictogramme vectoriel (`ResourceIcon`, `currentColor`).
- Les drapeaux sont les tracés officiels (`country-flag-icons`), filtrés `saturate(.45) sepia(.28) brightness(.85)`, dans une boîte au ratio 3:2 : la boîte s'adapte au drapeau, jamais l'inverse. L'URSS a son propre tracé (`src/emblems/ussr.svg`), l'Allemagne porte le tricolore actuel.
- Dans un film ou une affiche, une unité devient une photo de presse : similigravure à une encre, découpée sur un carton à liseré.

## Le mouvement

- Passer d'un écran de journal à l'autre tourne la page autour du pli gauche (`page-turn-out` 320 ms, `page-turn-in` 440 ms), jamais un fondu enchaîné.
- Une jauge qui se remplit porte un reflet qui court (`gauge-inflow`) : c'est une information, il reste même avec `prefers-reduced-motion`.
- Rien ne bouge pour décorer.

## La mise en page

- L'interface du plateau est mise à l'échelle par `zoom: var(--hud-scale)` (1,2) : toute mesure en pixels s'entend avant ce facteur.
- Les plans suivent une seule échelle (`z-marker` … `z-notice`). Un `z-index` écrit en dur ne se compare à rien.
- Mesures du plateau : bandeau `--topbar-h` 58 px, rail `--rail-w` 52 px, panneau ancré `--dock-w` 430 px.

## Les couleurs

| Nom | Valeur | Emploi |
|---|---|---|
| `desk` | `#0f0a04` | Le bureau sombre sous la feuille et sous la carte. Fond de l'application entière (`body`). Le moteur de carte en garde un autre, `map-desk`. |
| `paper` | `#e4d8bd` | Toute surface imprimée : feuilles, fenêtres, cartouches, étiquettes. Toujours avec la trame à 45° (classe `.paper`). Sur `desk` : 13,9:1. |
| `ink` | `#2a2118` | L'encre : texte courant, filets forts, boutons pleins, bordures. Sur `paper` : 11,2:1. |
| `ink-soft` | `#5f5039` | Texte secondaire et sur-titres (eyebrow) sur `paper` : 5,5:1. |
| `ink-quiet` | `#4a4436` | Corps de texte calme (dépêches, notes longues) et filets sombres sur `paper` : 6,8:1. |
| `ink-note` | `#6b5b3b` | Le gris de note, unique depuis le 03/10/2026 (il a absorbé `ink-faint`) : ligne de date de la manchette, liens discrets, notes de formulaire, heures du télégraphe, textes d'exemple des champs. 4,7:1 sur `paper` ; seulement 3,7:1 sur `paper-pile` : n'y posez pas de petit texte. Jamais sur fond sombre (environ 3:1) : là, `paper-dim`. |
| `paper-dim` | `#8d7f6a` | Le papier vu dans le noir : sur-titres sur fond sombre (`.eyebrow-dark`), encre des tampons sur le bandeau (`--stamp-ink`). Sur `desk` : 5,1:1. |
| `paper-dim-2` | `#a9968f` | Second ton de papier sur fond sombre. Sur `desk` : 7,0:1. |
| `paper-pile` | `#cfc09e` | La feuille du dessous d'une pile (décalée de quelques pixels, tournée de moins d'un degré). |
| `paper-pile-2` | `#b8ab8c` | La feuille la plus basse de la pile. |
| `sea` | `#a9c5cd` | Mer en aplat délavé, sur la carte et sur la planche imprimée. |
| `sea-ink` | `#2c5063` | Encre de la trame de mer et des isobathes. Texte possible sur `paper` : 6,1:1. |
| `sea-shade` | `#3f6b7c` | Ombré côtier : le lavis qui part du trait de côte. |
| `land` | `#d5c5a0` | Terre neutre, pays sans joueur. |
| `border-world` | `#6b4a24` | La bordure du monde, le bord du plateau. |
| `plinth-top` | `#c7b48e` | Tranche du socle en papier, haut du dégradé. |
| `plinth-bottom` | `#5f5039` | Tranche du socle en papier, bas du dégradé. |
| `critical` | `#9d4638` | L'encre rouge, réservée : ce qui exige l'attention (attaque subie, avant-poste désactivé, relevé) et le filet de la manchette. 4,4:1 sur `paper` (juste sous 4,5) et 3,2:1 sur `desk` : en texte, 24 px ou plus, ou en tampon de 12 px gras assumé. |
| `valid` | `#2b6b46` | Verdict favorable lu sur `paper` : 4,5:1. |
| `valid-lit` | `#4f9c68` | Le même verdict sur le verre sombre du bureau : 5,9:1 sur `desk`. |
| `notable` | `#b07434` | L'ambre du rail : « vous êtes ici », ce qui mérite un regard sans être une alarme. Sur `desk` 5,1:1 ; sur `paper` 2,75:1 (ne jamais l'y écrire en texte). |
| `notable-paper` | `#8a5a24` | L'ambre assombri pour le papier : 4,2:1, réservé aux marques et aux chiffres d'au moins 14 px. |
| `routine` | `#6e6a5e` | Ce qui n'est qu'un souvenir : dernière position connue, gris de routine. 3,8:1 sur `paper`, jamais en petit texte. |
| `interaction` | `#3f5a7d` | Survol des boutons, anneau de focus (2 px, décalé de 2 px). Fond d'un bouton survolé sous texte `paper` : 5,0:1. |
| `rule-medium` | `rgba(42, 33, 24, 0.32)` | Filet moyen : séparation de colonnes, tête de tableau. En CSS : `--rule-medium: 1px solid …`. |
| `rule-light` | `rgba(42, 33, 24, 0.18)` | Filet léger entre deux lignes d'une liste. En CSS : `--rule-light`. |
| `res-food` | `#8b9160` | Ravitaillement, encre sur fond sombre. |
| `res-textile` | `#b59a83` | Textile, encre sur fond sombre. |
| `res-coal` | `#7d7869` | Charbon, encre sur fond sombre (4,5:1 sur `desk`). |
| `res-oil` | `#9184a8` | Pétrole, encre sur fond sombre. |
| `res-ore` | `#8fa0b0` | Minerai, encre sur fond sombre. |
| `res-alloy` | `#aab6bf` | Alliage, encre sur fond sombre. |
| `res-ammunition` | `#b07434` | Munitions, encre sur fond sombre (même valeur que `notable`). |
| `res-bandages` | `#d8cbb2` | Pansements, encre sur fond sombre. |
| `res-food-paper` | `#6a7047` | Ravitaillement sur papier (3,7:1 : pictogramme, pas texte). |
| `res-textile-paper` | `#826146` | Textile sur papier. |
| `res-coal-paper` | `#605a49` | Charbon sur papier. |
| `res-oil-paper` | `#584973` | Pétrole sur papier. |
| `res-ore-paper` | `#4d6376` | Minerai sur papier. |
| `res-alloy-paper` | `#627584` | Alliage sur papier. |
| `res-ammunition-paper` | `#8a5a24` | Munitions sur papier. |
| `res-bandages-paper` | `#836f49` | Pansements sur papier. |
| `nation-france` | `#3f5a7d` | Encre de la France. Pas une variable CSS : elle voyage avec la vue (`INK_BY_NATION`, src/domain/nations.ts) parce qu'elle désigne un joueur, pas une surface. |
| `nation-uk` | `#4a4f7a` | Encre du Royaume-Uni (`INK_BY_NATION`). |
| `nation-usa` | `#4a7060` | Encre des États-Unis (`INK_BY_NATION`). |
| `nation-ussr` | `#9d4638` | Encre de l'URSS (`INK_BY_NATION`) ; même valeur que `critical`. |
| `nation-germany` | `#6e6a5e` | Encre de l'Allemagne (`INK_BY_NATION`) ; même valeur que `routine`, et encre par défaut d'un joueur sans nation. |
| `nation-japan` | `#a44a5e` | Encre du Japon (`INK_BY_NATION`). |
| `nation-italy` | `#a86c4a` | Encre de l'Italie (`INK_BY_NATION`). |
| `nation-china` | `#b07434` | Encre de la Chine (`INK_BY_NATION`) ; même valeur que `notable`. |
| `map-desk` | `#171208` | Le bureau du moteur de carte, plus clair que `desk` : `--map-desk` dans tokens.css, recopié dans `PALETTE.desk` (le moteur ne lit pas le CSS) ; un test tient les deux d'accord. Les fonds de la feuille d'accueil le reprennent en transparence. |
| `map-graticule` | `#4a4436` | Le canevas de la carte (`PALETTE.graticule`). |
| `map-rim-stroke` | `#3a2a18` | Le trait du bord du monde (`PALETTE.rimStroke`). |
| `map-search-ended` | `#777166` | Un relevé public conclu, gardé sur la carte mais plus présenté comme vivant (`PALETTE.searchEnded`). |
| `arc-mine-trace` | `#c98a3c` | Le fil d'un de mes mouvements, trait (`ARC_COLORS.mine`). |
| `arc-mine-progress` | `#e0a552` | Le parcouru de mon mouvement. |
| `arc-enemy-trace` | `#8f4a3e` | Un mouvement adverse détecté, trait (`ARC_COLORS.enemyDetected`). |
| `arc-enemy-progress` | `#9d4638` | Le parcouru d'un mouvement adverse. |
| `arc-last-known` | `#6e6a5e` | Une dernière position connue (`ARC_COLORS.lastKnown`). |
| `arc-sea-control` | `#3e6b7a` | Le contrôle de mer, trait (`ARC_COLORS.seaControl`). |
| `arc-sea-control-progress` | `#5a8fa0` | Le contrôle de mer, parcouru. |

## Ombres, interlettrages, opacités

- `shadow` : `none` — Valeur par défaut : rien dans l'interface n'a d'ombre portée.
- `shadow-pile` : `0 10px 24px rgba(0, 0, 0, 0.5)` — Feuille de pile sous la page d'accueil (Newspaper).
- `shadow-window` : `0 20px 46px rgba(0, 0, 0, 0.6), 0 2px 0 rgba(0, 0, 0, 0.5)` — Fenêtre flottante posée sur le plateau.
- `track-eyebrow` : `0.2em` — Libellés des planches (`UnitSprite`, `Plate`) ; les boutons écrivent 0,2em en dur.
- `track-display` : `0.02em` — Titres en didone.
- `track-masthead` : `0.06em` — Titres de journal en capitales (LE JOURNAL DES OPÉRATIONS).
- `track-label` : `0.18em` — Sur-titres `.eyebrow` et `.eyebrow-dark`.
- `held` : `0.72` — Encre nationale posée sur une région tenue (`HELD_OPACITY`).
- `grain` : `0.2` — Le grain d'impression en mode overlay.
- `depleted` : `0.42` — Une ressource vide qui ne se remplit pas : elle pâlit sans disparaître.
- `radius` : `0` — Angles vifs partout. Un arrondi est la seule chose de l'interface qui daterait d'après 1940.

## Le CSS de base

```css
:root {
  --desk: #0f0a04; --paper: #e4d8bd; --ink: #2a2118; --ink-soft: #5f5039;
  --ink-quiet: #4a4436; --ink-note: #6b5b3b; --paper-dim: #8d7f6a; --paper-pile: #cfc09e;
  --critical: #9d4638; --interaction: #3f5a7d; --valid: #2b6b46; --notable: #b07434;
  --font-display: 'Bodoni Moda', Georgia, serif;
  --font-text: 'Source Serif 4', Georgia, serif;
  --font-body: 'Archivo Narrow', 'Arial Narrow', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}
body { background: var(--desk); color: var(--ink); font-family: var(--font-body); font-variant-numeric: tabular-nums; }

/* Toute surface imprimée : papier, trame à 45°, filet d'encre. */
.paper {
  background-color: var(--paper);
  background-image: repeating-linear-gradient(45deg, color-mix(in srgb, var(--ink) 5.5%, transparent) 0 1px, transparent 1px 5px);
  color: var(--ink);
  border: 1px solid var(--ink);
}

/* Le sur-titre, libellé le plus fréquent. */
.eyebrow { font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-soft); }
.eyebrow-dark { font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: var(--paper-dim); }

/* La manchette (logo), dessinée en CSS : « la » à la moitié du corps, filet rouge à 0,09 du corps. */
.wm { display: inline-flex; flex-direction: column; align-items: stretch; white-space: nowrap; }
.wm .row { display: inline-flex; align-items: baseline; gap: .12em; font-family: var(--font-display); line-height: .98; }
.wm .article { font-style: italic; font-weight: 500; font-size: .5em; }
.wm .word { font-weight: 800; letter-spacing: .01em; text-transform: uppercase; }
.wm .bar { background: var(--critical); height: .09em; min-height: 2px; margin-top: .06em; transform: rotate(-0.6deg); }
/* <span class="wm" style="font-size:54px"><span class="row"><span class="article">la</span><span class="word">Manchette</span></span><span class="bar"></span></span> */

/* Boutons */
.btn-primary { border: 1px solid var(--ink); background: var(--ink); color: var(--paper); padding: 10px 26px; font-size: 10px; letter-spacing: .2em; text-transform: uppercase; }
.btn-primary:hover { background: var(--interaction); border-color: var(--interaction); }
.btn-secondary { border: 1px solid var(--ink); background: transparent; color: var(--ink); padding: 4px 9px; font-size: 9px; letter-spacing: .18em; text-transform: uppercase; }
.btn-link { border: 0; background: none; padding: 0; font-size: 11.5px; color: var(--ink-note); text-decoration: underline; text-underline-offset: 4px; }
:focus-visible { outline: 2px solid var(--interaction); outline-offset: 2px; }
```
