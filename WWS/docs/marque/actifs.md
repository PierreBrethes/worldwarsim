---
type: marque
statut: en cours
maj: 2026-10-03
code: [src/shell/media.ts, src/emblems/units/manifest.ts, src/emblems/buildings/manifest.ts, src/emblems/objectives/manifest.ts, src/emblems/resources/manifest.ts, src/emblems/Flag.tsx]
decisions: []
voir: [marque-et-site.md, ../../sprites/README.md, ../prompts/images/sprites.md, ../design/10-direction-artistique.md]
---

# Actifs — où ils vivent, comment on les refait

**En bref.** Registre des actifs graphiques et média du projet : pour chaque famille, où elle vit, combien de fichiers et quel format, qui les charge, comment on les refait et ce qui manque. La fabrication des sprites fait autorité dans [../../sprites/README.md](../../sprites/README.md) ; ce registre sert à ne pas les chercher. Aucun binaire n'est copié ici, on référence. État relevé le 02/10/2026.

## Unités

| | |
|---|---|
| Où | `src/emblems/units/<nation>/` (france, uk, usa, ussr, germany, japan, italy, china), 2,4 Mo |
| Combien, format | 82 WebP : France 10, Royaume-Uni 11, États-Unis 11, les cinq autres 10 chacune |
| Qui charge | `src/emblems/units/manifest.ts` (`SPRITES_BY_NATION`, `Record` complet des neuf rôles, `null` si absent) ; rendu par `src/emblems/UnitSprite.tsx`, filtre encre appliqué en CSS |
| Sources | `WWS/sprites/units_<nation>_clean/` (PNG détourés, `noms.json`) ; le dossier français s'appelle `units_fr_clean` |
| Refaire | `python WWS/sprites/nettoyer-ombres.py --source … --destination … [--sol]`, puis `python WWS/sprites/optimiser.py --source … --destination src/emblems/units/<nation> --serrer`. Procédure : [sprites/README.md §1-6](../../sprites/README.md). Prompt d'image : [sprites.md](../prompts/images/sprites.md) (trois-quarts 60°, lumière haut-gauche, fond `#4a7060`, 1024²) |

Ce qui manque : six trous nommés `null` — cargo français ; porte-avions soviétique, chinois, italien ; avion de transport allemand et japonais (le Ju 52 est à refaire). Les planches chinoise, italienne, japonaise et les objectifs viennent de remove.bg et ne passent pas par `nettoyer-ombres.py`.

## Bâtiments

| | |
|---|---|
| Où | `src/emblems/buildings/`, 156 Ko |
| Combien, format | 14 WebP (airfield, arsenal, barracks, billets, farm, foundry, hq, listening, mill, mine, oilWell, port, quartermaster, warehouse) ; la clé historique `depot` est rendue comme un entrepôt |
| Qui charge | `src/emblems/buildings/manifest.ts` (`BUILDING_SPRITES`), via `src/emblems/Plate.tsx` et `src/map/MapLabels.tsx` : vignette au bout d'un mât, 46 px de haut, sans teinte |
| Sources | `WWS/sprites/buildings/` (15 PNG 1024² et `_to_delete/anciens-batiments`), `WWS/sprites/buildings_clean/` (15 PNG) |
| Refaire | `nettoyer-ombres.py --source WWS/sprites/buildings --destination WWS/sprites/buildings_clean --controle /tmp/controle`, puis `optimiser.py --source WWS/sprites/buildings_clean --destination src/emblems/buildings --recadrer`. Procédure : [sprites/README.md §7](../../sprites/README.md). Prompts : [batiments.md](../prompts/images/batiments.md) |

Ce qui manque : la planche de l'avant-poste. Son prompt existe ([avant-poste.md](../prompts/images/avant-poste.md)), mais ni source ni WebP ; seul le pictogramme `outpost` est servi.

## Objectifs

| | |
|---|---|
| Où | `src/emblems/objectives/`, 68 Ko |
| Combien, format | 4 WebP : abandonedStores, fuelDump, irregularArsenal, stalledConvoy |
| Qui charge | `src/emblems/objectives/manifest.ts` (`OBJECTIVE_SPRITES`, indexé par archétype ; `objectives.test.ts` exige l'égalité des clés) |
| Sources | `WWS/sprites/objectifs_clean/` (4 PNG, remove.bg) et `objectifs.zip` |
| Refaire | `optimiser.py --source WWS/sprites/objectifs_clean --destination src/emblems/objectives --recadrer`. Procédure : [sprites/README.md §9](../../sprites/README.md). Prompts : [objectifs.md](../prompts/images/objectifs.md) |

Ce qui manque : rien, les quatre sont dessinées. Un archétype de plus coûte une ligne de table, une planche et trois phrases dans `fr.objectives`.

## Ressources

| | |
|---|---|
| Où | `src/emblems/resources/`, 96 Ko |
| Combien, format | 8 WebP (alloy, ammunition, bandages, coal, food, oil, ore, textile) |
| Qui charge | `src/emblems/resources/manifest.ts` (`RESOURCE_PLATES`) via `Plate.tsx`, à 20 px et au-dessus ; sous cette taille, `src/emblems/ResourceIcon.tsx` (vectoriel, `currentColor`) |
| Sources | `WWS/sprites/ressources/` (9 PNG nommés par UUID et un `noms.json` clé vers fichier ; un rejet de génération est ignoré) |
| Refaire | `optimiser.py --source WWS/sprites/ressources --destination src/emblems/resources --recadrer`. Procédure : [sprites/README.md §8](../../sprites/README.md) |

Ce qui manque : aucun prompt d'image dédié. La planche du charbon est sous le plancher de contraste sur fond de nuit (2,80:1), compensée par `.resource-reserve`.

## Drapeaux

Pas de fichier : `src/emblems/Flag.tsx` importe les SVG du paquet npm `country-flag-icons` (3:2, sept nations : CN, DE, FR, GB, IT, JP, US) ; l'URSS est le SVG local `src/emblems/ussr.svg`. Repalettisés et jamais déformés. Pas de commande de régénération. Référence de design : `WWS/maquettes/Drapeaux bandeau.dc.html`. Ce qui manque : rien. Les drapeaux affichés sont ceux d'aujourd'hui, pas ceux de 1940, sauf l'URSS.

## Curseurs

| | |
|---|---|
| Où | `public/cursors/`, 20 Ko |
| Combien, format | 5 PNG (curseur-cible, -construire, -defaut, -interactif, -renseignement) |
| Qui charge | seul `curseur-construire.png` est référencé (`src/map/engine/index.ts`, `TROWEL_CURSOR`) ; les quatre autres ne le sont nulle part |
| Sources | 5 JPG `curseur-*.jpg` dans `WWS/maquettes/pictos/references/` |
| Refaire | aucun script ni prompt trouvé |

Ce qui manque : le mode d'emploi de fabrication, et le branchement des quatre curseurs orphelins (ou leur retrait).

## Pictogrammes

| | |
|---|---|
| Où | `public/pictograms/`, 164 Ko |
| Combien, format | 34 PNG : 17 noms en deux poids (`-20`, `-40`) |
| Qui charge | `src/shell/IndicatorGlyph.tsx` (masque CSS `url('/pictograms/<nom>-<poids>.png')`) |
| Sources | références JPG dans `WWS/maquettes/pictos/references/` (22 fichiers) |
| Refaire | aucun script ni prompt trouvé |

Ce qui manque : le mode d'emploi de fabrication. `doctrine`, `manpower` et `steel` ne sont plus dans `PictogramName` : reliques de systèmes morts.

## Polices

Aucun fichier local et aucun `@font-face` : `index.html` charge Google Fonts (Archivo Narrow, Bodoni Moda, IBM Plex Mono, Source Serif 4). Les variables sont dans `src/styles/tokens.css` (`--font-display`, `--font-body`, `--font-mono`) et `src/styles/index.css` (`--font-text`). On les « refait » en changeant la ligne `index.html` et ces variables. Ce qui manque : l'auto-hébergement (le jeu dépend du CDN au chargement) ; la fiche [10-direction-artistique.md](../design/10-direction-artistique.md) garde la typographie « à faire ».

## Film d'annonce

| | |
|---|---|
| Où | `Claude outputs/film/` à la racine du dépôt, ignoré par git (plan-4b-2026-10-02 : les vidéos vivent sur le VPS) |
| Combien, format | `la-manchette-film-30s.mp4` 29 Mo et `-leger.mp4` 11 Mo (30 s, 1920 × 1080, 25 i/s, son AAC) ; `la-manchette-boucle-8s.mp4` 3 Mo (1600 × 900, muette) et `la-manchette-boucle-poster.jpg` 150 Ko ; `la-manchette-affiche.png` ; `la-manchette-film-source.zip` 2 Mo |
| Qui charge | `src/shell/media.ts` (les trois URL `/media/…`) : la boucle et son image d'attente en fond de `/connexion` et `/rejoindre/CODE` (`Newspaper`, `backdrop="film"`, choix par `filmBackdrop`), le film léger dans la fenêtre de `src/shell/FilmTrailer.tsx`. Servis par le conteneur `front` depuis `/opt/worldwarsim-media` (VPS), `public/media/` en local, jamais dans git. Le maître de 29 Mo, l'affiche et le zip ne sont chargés par rien |
| Refaire | le zip source : scène HTML pilotée par le temps, rendu Playwright, `sfx.py`, `loop.py`, README (`./build.sh`, environ 14 minutes). Description : [marque-et-site.md](marque-et-site.md) |

Ce qui manque : la page d'accueil publique (plan-5c) ; la création du dossier média sur le VPS suit [dossier-media](../prompts/vps/dossier-media.md). Le film de 15 s
(`Claude outputs/teaser/`, WW SIM) est périmé ; il est encore suivi par git (commit 0afc2ea), et
le prompt outillage 29 prévoit de supprimer `Claude outputs/` : les sources du film n'ont pas de
domicile durable.

## Maquettes

`WWS/maquettes/`, 5,2 Mo, références écrites à la main, chargées par aucun code : `Interface de saison.dc.html`, `Icônes ressources.dc.html` et `v2`, `Drapeaux bandeau.dc.html`, `Sprite soldat.dc.html`, `Unités et atouts par nation.html`, `support.js`, `tokens.css`, `tokens.json`, `Wireframes-selection.png`, `screenshots/` (4 PNG), `pictos/` (848 Ko) et `modale-de-site/` (2,7 Mo, regénérée par `build.mjs`). Le [README](../../maquettes/README.md) est périmé et ne couvre ni `modale-de-site/`, ni `pictos/`, ni `Unités et atouts par nation.html`. Ce qui manque : un README à jour ; les valeurs de tokens à suivre sont celles de `src/styles/tokens.css`.

## Prototypes

`WWS/prototypes/carte-3d.html` (192 Ko, autonome, three.js depuis un CDN, figé au 11/08) et son [README](../../prototypes/README.md). Données générées par `scripts/generate-world.mjs` (world-atlas 110m, projection Natural Earth 1). Pas maintenu : le moteur réel est `src/map/`. Ce qui manque : rien, c'est une trace.

## Données carte

| Fichier (`public/`) | Taille | Produit par |
|---|---|---|
| `world.json` | 1,2 Mo | `scripts/generate-world.mjs` (chaîne ensuite `generate-grid.mjs` et `generate-region-grid.mjs`) |
| `regions.json` | 2,5 Mo | `scripts/generate-regions.mjs` (Natural Earth 10m admin-1, contours intérieurs seulement) |
| `grid.json` | 68 Ko | `scripts/generate-grid.mjs` (1,33 M de cellules cuites en plages, décodées à la première demande de l'isolat) |
| `region-grid.json`, `projection.json` | 416 Ko, 8 Ko | `scripts/generate-region-grid.mjs` |
| `region-index.json` | 308 Ko | `scripts/generate-region-index.mjs` (lit aussi `country-names.json`, 8 Ko) |
| `deposits.json` | 8 Ko | `scripts/generate-deposits.mjs` |

Ces fichiers ne se retouchent jamais à la main. Garde-fous : `scripts/generators-import.test.mjs` et l'égalité octet à octet de `grid.json` avec `buildGrid`. Ce qui manque : la passe de classification du type de région (le type reste un factice par hachage du nom) ; le découpage des régions géantes, prévu au prochain wipe. Le CLAUDE.md racine écrit encore `generer-regions.mjs` et `generer-monde.mjs` pour `generate-regions.mjs` et `generate-world.mjs`.

## Sources de `WWS/sprites/`

74 Mo, 173 fichiers suivis par git : 152 PNG, 6 zips, 12 `noms.json`, `nettoyer-ombres.py`, `optimiser.py`, un README. Ce sont les sources pleine résolution ; seul le WebP optimisé part au navigateur (dans `src/emblems/`).

| Contenu | Taille |
|---|---|
| `UK/`, `USA/` (planches brutes) | 3,9 Mo, 4,1 Mo |
| `Allemagne.zip`, `URSS.zip`, `JAPON.zip`, `CHINE.zip`, `ITALIE.zip` (remove.bg) | 4,8, 4,0, 3,6, 3,2, 3,2 Mo |
| `units_<nation>_clean/` (8 dossiers) | 3,3 à 4,1 Mo chacun |
| `buildings/`, `buildings_clean/` | 7,1 Mo, 5,5 Mo |
| `ressources/` | 2,8 Mo |
| `objectifs_clean/`, `objectifs.zip` | 1,9 Mo chacun |

Ce qui manque : les zips et les dossiers `_clean` contiennent les mêmes planches, d'où une redondance d'une dizaine de Mo ; rien ne dit lequel est la source de vérité sinon le README.
