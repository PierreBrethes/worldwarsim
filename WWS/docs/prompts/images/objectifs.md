---
type: prompt
statut: livré
maj: 2026-10-02
code: [src/emblems/objectives/manifest.ts, WWS/sprites/README.md, WWS/sprites/optimiser.py]
decisions: []
voir: [batiments.md, ../code/done/objectifs-neutres.md]
---
# Prompts d'image — les objectifs neutres (quatre planches, V1)

**En bref.** Prompts d'image des quatre planches d'objectifs neutres et chaîne vers `src/emblems/objectives/`. Les quatre planches sont dessinées depuis le 17/09 et le manifeste n'a plus de `null`.

Même gabarit que les bâtiments (`batiments.md`) : sujets **neutres**, une planche pour toutes
les nations, aucune teinte nationale, fond vert `#4a7060`, 1024², sujet entier et fermé en bas.
Ce sont des **lieux abandonnés ou irréguliers**, pas des bâtiments militaires en service : usure,
bâches, caisses, matériel dépareillé. Le pictogramme pend au bout d'un mât comme un bâtiment
(`src/emblems/objectives/manifest.ts`, clé = archétype).

## Le gabarit

```
Sprite de jeu de stratégie, vue de dessus 3/4 (angle ~60°), orienté vers sud-ouest.
Sujet : [voir la liste] — matériel et abris de fortune, années 1940, abandonnés ou tenus par des
irréguliers.
Style : prérendu type RTS fin des années 90 (Sudden Strike, Blitzkrieg), détaillé mais net,
sans flou, sans effet de particules.
Éclairage : soleil haut légèrement à gauche, ombres courtes et douces, aucun reflet spéculaire fort.
Couleurs : ternes et désaturées — toile, bois, tôle rouillée, caisses. Jamais saturé.
FOND : uni vert neutre #4a7060, PAS de décor, PAS de sol, PAS d'ombre portée — le sprite sera détouré.
Cadrage : sujet seul, centré, occupe ~80 % de l'image, format carré 1024×1024.
Aucun texte, aucun logo, aucun personnage, aucun drapeau national.
```

## Les quatre sujets

| clé | sujet à mettre dans le prompt |
|---|---|
| `abandonedStores` | un tas de caisses en bois et de sacs sous une bâche à demi arrachée, deux fûts couchés, une charrette sans cheval |
| `stalledConvoy` | trois camions bâchés à l'arrêt en file, capots ouverts, un pneu à plat, caisses déchargées au sol |
| `fuelDump` | quatre cuves cylindriques basses cerclées de terre, fûts empilés, une pompe à bras, tuyaux au sol |
| `irregularArsenal` | atelier de fortune sous tôle ondulée, râteliers de fusils, un canon antichar sous bâche, caisses de munitions marquées |

Chaîne ensuite : `WWS/sprites/nettoyer-ombres.py` (planche sur fond vert : les deux critères
s'appliquent) → `optimiser.py --recadrer` vers `src/emblems/objectives/` → remplacer les `null`
du manifeste.
