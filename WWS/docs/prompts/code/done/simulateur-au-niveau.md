# simulateur-au-niveau — le miroir rattrape 1b et la file, puis balaie la chaîne de l'alliage

Suppose `qg-pose-par-le-joueur` et `engagement-intentionnel` passés (l'état non commité du
13/09). Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/simulation/opening/README.md` en entier (dont
l'encadré « Retards connus (25/08) »), `engine.mjs`, `policy.mjs`, `scenarios.mjs`,
`constants.mjs`, `run.mjs`, `verify.mjs` ; côté jeu, `convex/constructions.ts` (la file
prépayée, lignes ~105-170 et ~296-330 ; `refusalFor`, `HQ_FIRST` ligne ~407 ; « une entrée
par région, debout ou en file »), `convex/constants.ts` (`CHAINS`, `HQ_LEVEL_AT_LAUNCH`,
`foundationFor`, `STORAGE_CAP_PER_LEVEL`), le prompt `done/qg-pose-par-le-joueur.md` (règles
1 à 4). Ne commit pas, ne push pas. Un chantier, un commit.

**Ce prompt ne touche qu'à `WWS/simulation/opening/`.** Aucune constante du jeu ne bouge : il
remet l'instrument au niveau du jeu, puis il mesure. La décision vient après, avec les chiffres.

## Pourquoi (mesure du 14/09, sur l'instrument tel qu'il est)

Saison 7 j, joueur assidu, valeurs actuelles : 36 actions, 19 connexions vides sur 42, restes
minerai 897 + charbon 1 220, alliage 84. **Le goulot est la fonderie** (4/h), pas l'extraction.
Fonderie à 8 seule → le minerai tombe à 0, rien de gagné. Fonderie 8 + minerai/charbon ×1,5 →
55 actions, 6 vides, 20/20 troupes ; et à ce régime le pack ne pèse plus (300 → 54 actions,
500 → 55). Mais l'occasionnel (29 actions) et l'absent (11) ne bougent pas et gardent 500 à 900
d'alliage inutilisé — en partie parce que le moteur refuse encore `CONSTRUCTION_IN_PROGRESS`
alors que le jeu a une file prépayée depuis le 25/08. Tant que ce retard est là, l'écart
assidu/absent mesuré est faux, et on ne peut pas trancher le pack.

## Ce qui change

1. **Le QG entre dans le socle (1b).** `scenarios.mjs` : `startingSites` vide par défaut, et
   `foundation` commence par `{ key: 'hq', deposit: null }` comme `foundationFor` du jeu. Dans
   `engine.mjs`, la pose du QG est offerte, immédiate, au niveau `HQ_LEVEL_AT_LAUNCH` du jeu
   (le format `campaign` du miroir doit le lire, pas le redire), et **l'infanterie naît avec
   lui** : `startingTroops` disparaît au profit de cette règle. Rien ne se pose avant le QG
   (`HQ_FIRST` dans la colonne « ce qui bloque »). Le socle compte alors cinq placements
   gratuits sur le sol de référence, pas quatre. `scenarios.mjs:109` cesse de planter le QG.
2. **La file de chantier prépayée**, telle que `constructions.ts` la tient : illimitée, payée
   à la mise en file, un seul chantier tourne (la tête), une entrée par région debout *ou* en
   file, plafond de bâtiments lu sur debout + file. `CONSTRUCTION_IN_PROGRESS` disparaît du
   moteur. La politique (`policy.mjs`) enfile à chaque connexion tant que la règle d'envies
   donne une clé légale et payable — sans limite artificielle : si ça produit des files
   absurdes, le rapport doit le montrer, pas le cacher. Nouvelle métrique : **profondeur
   médiane de la file au départ de chaque connexion**, par profil.
3. **La pose due hors plafond** : `buildRefusal` lit `owesFirstPlacement` avant
   `BUILDING_CAP_REACHED`, comme le jeu. Sans effet sur la France, mesurable sur un sol à cinq
   extracteurs — ajoute `REFERENCE_GROUND_OIL` (États-Unis : fer, charbon, blé, tissu, pétrole)
   et une ligne de rapport pour lui, joueur assidu seulement.
4. **`verify.mjs` lit `CHAINS`** comme du texte : `output`, `inputs`, `perHourPerLevel` des
   trois chaînes, contre `constants.mjs`. Et `HQ_LEVEL_AT_LAUNCH` contre
   `SEASON_FORMATS.campaign.hqLevelAtLaunch`. Le tunable `foundryPerHour` de `DEFAULT_TUNING`
   doit dériver de `CHAINS.foundry.perHourPerLevel`, pas le recopier — une seule source dans le
   miroir. La ligne « CHAINS — non vérifié » disparaît de la sortie.
5. **La grille** : `node run.mjs --grille`, saison `campaign` seulement (le jeu n'a plus qu'une
   saison, ADR 0020 §11 ; `skirmish` reste tel quel, hors périmètre), trois profils, sur
   fonderie {4, 6, 8}/h × extraction minerai *et* charbon {×1, ×1,5, ×2} × pack {250, 300,
   400, 500}. Sortie tableau comme `--sweep` (actions, vides, QG, troupes, bâtiments, file
   médiane, restes alliage/charbon/minerai) et `grille.json`. Le `--sweep` existant reste.
   Les restes doivent nommer la ressource qui **plafonne** (`STORAGE_CAP_PER_LEVEL` atteint) :
   un stock au plafond n'est pas un reste, c'est une perte.
6. **Le rapport lisible** : `node run.mjs --rapport` écrit `rapport.html` à côté — un seul
   fichier, données inlinées, SVG en ligne, aucune dépendance, aucun `fetch` (il doit s'ouvrir
   en `file://`). Trois vues, pour la dernière exécution et la dernière grille : la frise des
   connexions par profil (la ligne « 5 1 · · · 1 » en couleur, une case par connexion, vide
   en creux), actions et vides selon le paramètre balayé (une courbe par fonderie, pack en
   abscisse, extraction en petits multiples), et les restes en fin de saison par ressource et
   par profil, plafond marqué. `rapport.html` va dans `.gitignore` ; `grille.json` est suivi
   comme `sweep.json`.
7. **README** : l'encadré « Retards connus » perd les deux premiers points (file, pose due) et
   garde les munitions ; la section « Ce qu'il modélise » dit le QG posé et la file ; les
   commandes listent `--grille` et `--rapport`. `WWS/docs/RESTE-A-CODER.md` : retire la ligne
   sur `scenarios.mjs:109` si elle y est.

## Ce que ce prompt ne fait pas

Ne change aucune valeur de `convex/constants.ts`. Ne modélise ni combat, ni mouvement, ni
munitions dépensées (retard assumé, README). Ne supprime pas `skirmish`. N'ajoute pas de
garde-fou nouveau : celui du 48 h reste imprimé tel quel.

## Rapport attendu

`verify.mjs` vert avec `CHAINS` compté dans les valeurs comparées. La sortie de `--grille`
complète, et trois lectures en une ligne chacune : la fonderie est-elle toujours le goulot ;
avec la file, l'occasionnel et l'absent captent-ils enfin la production (actions, troupes,
alliage inutilisé — avant/après) ; le pack le plus bas où l'assidu ne perd rien. Les cases où
la grille n'est pas monotone, nommées, sans les expliquer. Le `verifier` vert.
