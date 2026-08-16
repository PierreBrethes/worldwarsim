# Prompt Claude Code — supprimer la hiérarchie de taille des bâtiments

Lis `CLAUDE.md`, `CONVENTIONS.md` et **`WWS/sprites/README.md` §7** — la section « L'échelle :
hauteur unique » y a été réécrite le 16/08 et fait foi. Ne commit pas, ne push pas.

**Prompt court et purement mécanique.** Aucune décision à prendre : elle a été prise en
regardant les planches réelles à la taille réelle de la carte.

## Le constat

`WWS/sprites/buildings_clean/echelles.json` donne une échelle par clé (`hq` 1,00 →
`listening` 0,50), `optimiser.py` la cuit dans la hauteur du WebP exporté — **et
`src/styles/labels.css` l'écrase intégralement** en épinglant `height: 46px` sur
`.label-plate`. Vérifié sur les fichiers : `hq.webp` sort à 512 px de haut, `listening.webp`
à 256, et les deux s'affichent à 46.

Le commentaire au-dessus de `.label-plate` se trompe d'axe : il justifie de dimensionner par
la hauteur en expliquant qu'« une largeur commune aplatirait la hiérarchie », alors que c'est
la **hauteur** qui est épinglée, et que c'est dans la hauteur que la hiérarchie était cuite.

## La décision

**Les quinze vignettes s'affichent à la même hauteur. Il n'y a pas de hiérarchie de taille.**

Testée à l'œil, planches réelles sur fond de terre nue, à l'échelle 1:1 de la carte.
L'amplitude 1,00 → 0,50, confortable sur un cadre de 512 px, tombait sous 25 px de haut pour
les trois derniers sujets à une référence de 46 — sous le seuil de lisibilité que le README
pose lui-même. La distinction entre bâtiments repasse **entièrement sur la silhouette**
(règle « une masse, pas un détail »).

## Ce que tu fais

1. **Supprime `WWS/sprites/buildings_clean/echelles.json`.**

2. **`WWS/sprites/optimiser.py`** — retire la passe d'échelle par clé pour les bâtiments :
   plus de lecture d'`echelles.json`, plus d'erreur « clé absente », plus de multiplication
   par une échelle. Ce qui **reste, et qui est le cœur du script, ne bouge pas** : recadrage
   sur la boîte englobante alpha, puis normalisation **par la hauteur** (pas par la largeur)
   à `HAUTEUR_REFERENCE`. Sans ce recadrage, un entrepôt cadré serré et une fonderie cadrée
   large sortiraient de tailles différentes — la carte hériterait d'un accident de cadrage.
   Toutes les clés valent désormais 1,00.

   Si la chaîne des **unités** lit un fichier d'échelles distinct, n'y touche pas : cette
   décision ne concerne que les bâtiments.

3. **Régénère les quinze planches** vers `src/emblems/buildings/` et vérifie que
   `manifest.test.ts` passe toujours. Les quinze WebP doivent sortir à la **même hauteur**.

4. **`src/styles/labels.css`** — le commentaire de `.label-plate` est faux, remplace-le. Il
   doit dire : hauteur commune assumée, aucune hiérarchie de taille entre les quinze, la
   distinction passe par la silhouette, et un lien vers `WWS/sprites/README.md` §7. Garde le
   commentaire sur `max-width: none` (il documente un vrai piège de Preflight) et celui de
   `.label--building .label-pictogram` (l'assise au pied du bloc), qui restent exacts.

## Ce que tu ne fais pas

Tu ne touches pas à la **teinte** : les planches de bâtiments ne sont pas teintées à l'encre
nationale et ne doivent pas l'être (`README.md` §7 — `PlayerView` ne sert jamais les
bâtiments adverses, la teinte porterait zéro information). Tu ne touches pas à la teinte des
**régions** bâties, qui est en place et correcte. Tu ne changes pas `HAUTEUR_REFERENCE` (voir
ci-dessous).

## En attente d'arbitrage — ne fais pas ce point sans validation explicite

`HAUTEUR_REFERENCE` vaut 512 px pour un affichage à 46 px : **un sur-échantillonnage d'un
facteur 11**, soit 460 Ko de WebP pour quinze pictogrammes. Une référence de **160 px**
couvrirait un écran 3× DPR avec une échelle HUD jusqu'à ~1,15, et ferait tomber le poids
autour de 55 Ko. Le risque est de verrouiller la résolution sur un seul usage : aujourd'hui
`buildingSprite()` n'a qu'un appelant (`src/routes/plateau.tsx`), mais une fenêtre Nation qui
afficherait la planche en grand rendrait le choix coûteux à défaire — même si tout reste
régénérable depuis `buildings_clean/`.

**Signale ce point dans ton rapport, ne le tranche pas.**

## Critères d'acceptation

- `echelles.json` n'existe plus et n'est référencé nulle part.
- Les quinze WebP de `src/emblems/buildings/` ont la même hauteur.
- Le commentaire de `.label-plate` décrit ce que le code fait.
- `npm run build` et `npm run test` passent ; aucun terme banni (`WWS/CONTEXT.md`).
