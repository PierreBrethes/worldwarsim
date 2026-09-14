# anneau-cadre-des-regions — le voile bleu sur toute la carte, c'est le Maryland

Lis `CLAUDE.md`, `CONVENTIONS.md`, `scripts/generate-regions.mjs` (`isProjectionFrame`, ajouté
le 09/09 dans `cb42ae3`), `scripts/generate-region-index.mjs`, `scripts/generate-region-grid.mjs`
(et son test d'égalité, s'il existe : le raster doit être régénéré avec ses sources),
`src/map/engine/regions.ts` (`fillOf`, `showHeld`, `showBuilt`, `display`). Ne commit pas, ne
push pas. Un chantier, un commit.

## Ce qui se passe (diagnostic du 14/09, vérifié sur les données)

En partie avec les États-Unis, un voile bleu-gris translucide couvre parfois toute la carte,
mer comprise ; les pions restent nets au-dessus. Ce n'est ni la lumière, ni le brouillard, ni
le lavis côtier : c'est **un remplissage de région** (`fillOf`) posé sur le contour entier de la
sphère.

`public/regions.json` (généré le 15/08) contient deux anneaux qui sont le **cadre de la
projection** — 42 points, x de 0 à 400, y de 0 à 208, passant par `[89.92,0]`, `[200,0]`,
`[310.08,0]`… :

- `USA-3557` Maryland, anneau n° 3 (sur 5) ;
- `HKG-5156` Hong Kong Southern, anneau unique.

`isProjectionFrame` existe précisément pour les filtrer, mais il a été écrit le 09/09 et
**`regions.json` n'a jamais été régénéré depuis**. Dès que le Maryland reçoit une encre —
`showHeld` (ADR 0020) ou `showBuilt` — `fillOf` fait une `ShapeGeometry` de ce cadre et pose
un rectangle-monde à `HELD_OPACITY`/`BUILT_LIFT` dans l'encre du joueur. « Aléatoire » parce que
ça dépend de l'état qui encre ou non le Maryland. Hong Kong fera la même chose au premier
joueur qui le tiendra.

Vérifié aussi : `public/region-grid.json` (12/09) n'est **pas** atteint — le Maryland y compte
56 cellules, un chiffre sain — donc rien côté serveur (ADR 0023). C'est un défaut du front seul.

## Ce qui change

1. **Régénérer la chaîne** : `node scripts/generate-regions.mjs <geojson admin-1 10m>` — le
   chemin est celui que Pierre a utilisé le 15/08, demande-le-lui s'il n'est pas dans le
   dépôt (`ne_10m_admin_1_states_provinces.geojson`, natural-earth-vector) — puis
   `generate-region-index.mjs`, puis `generate-region-grid.mjs`. Vérifie avant/après que
   les deux anneaux-cadres ont disparu et que **rien d'autre ne bouge** que ce que la
   simplification déterministe redonne à l'identique : `git diff --stat` sur les quatre
   fichiers `public/`, et si `region-grid.json` ou `region-index.json` diffèrent au-delà de
   ces deux régions, dis-le et arrête-toi — ce serait une dérive de script, pas ce chantier.
2. **Un test sur l'actif**, pas sur le script : `public/regions.json` ne contient aucun
   anneau dont l'étendue dépasse la moitié du monde en x ou en y (`meta` de `world.json` :
   400 × 208). Le script pouvait être juste et l'actif faux pendant cinq jours ; c'est l'actif
   que la CI doit lire. Place-le à côté du test d'égalité du raster s'il existe, sinon dans
   `scripts/`. Le test doit être rouge avant la régénération, vert après.
3. **Une garde dans `fillOf`** : un anneau plus large que la moitié du cadre n'est pas
   rempli, et un `console.warn` nomme la région — une donnée future ne doit pas pouvoir
   repeindre le monde. Une ligne, pas une couche.

## Ce que ce prompt ne fait pas

Ne touche pas à `isProjectionFrame` (il est juste), ni à la simplification, ni au lavis
côtier ni au stencil, ni aux lumières. Ne change aucune encre.

## Rapport attendu

Le `git diff --stat` des quatre actifs ; la preuve que `USA-3557` a quatre anneaux ; le sort
de `HKG-5156` (son seul anneau *est* le cadre : filtré, la région n'a plus de contour et le
script la laisse tomber — dis si Hong Kong garde une région dans `regions.json`, dans
`region-index.json` et dans `deposits.json`, et si un test ou une donnée la nomme) ; le test
rouge/vert ; le `verifier` vert.
