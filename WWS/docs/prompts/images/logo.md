# Prompt d'image — la manchette

Décision de Pierre (27/08) : le logo est une **manchette typographique**, pas un emblème. Un titre
de journal de 1940, réutilisable en bandeau d'accueil et réductible en favicon (les deux premières
lettres ou le seul filet). Générer **trois variantes** et garder celle qui reste lisible à 64 px.
Nom affiché à confirmer avant de lancer — le prompt écrit « WORLD WAR SIM », change-le si le jeu
porte un autre nom à l'écran.

```
Masthead (nameplate) of a 1940 daily newspaper, front page header only.
Title text: "WORLD WAR SIM" in a heavy blackletter or condensed slab-serif, letterpress
printed, slightly uneven ink, on aged cream newsprint.
Above the title: a thin double rule; below: a single rule with a small centered dateline
"ÉDITION DE GUERRE — 1940" in small caps.
Optional tiny ornaments at the ends of the rule (no globe, no eagle, no weapons).
Colors: black ink only, plus one accent — deep red — on the dateline or a single rule.
Paper: cream #ece3cf with faint grain, no photo, no illustration, no border around the sheet.
Composition: wide banner 2048×512, title fills ~80% of the width, horizontally centered,
generous margins. Crisp, flat, print-like; no 3D, no gloss, no drop shadow.
```

Contrôle : sur fond `--paper` du jeu, le noir doit être le même que l'encre de l'interface ;
retirer le fond si la génération l'a rendu autrement (PNG transparent). Variante favicon : les
lettres « WW » seules, même casse, même filet, 256×256.
