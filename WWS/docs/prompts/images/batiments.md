# Prompts d'image — les quinze bâtiments

Même gabarit que les unités (`sprites.md`), une seule planche pour les huit nations : les
bâtiments sont **neutres**, et le restent à l'affichage — contrairement aux unités, **aucune
teinte à l'encre nationale n'est appliquée** (`WWS/sprites/README.md` §7). Une caserne à pagode
pour le Japon serait belle et coûterait huit planches.

## Le gabarit, identique pour les quinze

```
Sprite de jeu de stratégie, vue de dessus 3/4 (angle ~60°), orienté vers sud-ouest.
Sujet : [voir la liste] — architecture militaire ou industrielle d'Europe, années 1940.
Style : prérendu type RTS fin des années 90 (Sudden Strike, Blitzkrieg), détaillé mais net,
sans flou, sans effet de particules.
Éclairage : soleil haut légèrement à gauche, ombres courtes et douces, aucun reflet spéculaire fort.
Couleurs : matériaux ternes et désaturés — béton, brique sale, tôle, bois goudronné. Jamais saturé.
FOND : uni vert neutre #4a7060, PAS de décor, PAS de sol, PAS d'ombre portée — le sprite sera détouré.
Cadrage : bâtiment seul, centré, occupe ~80 % de l'image, format carré 1024×1024.
Le bâtiment est POSÉ, vu depuis l'extérieur, entier, avec sa base visible — pas de coupe, pas de
vue plongeante verticale.
Aucun texte, aucun logo, aucun véhicule, aucun personnage, un seul bâtiment.
```

**Le détail qui décide de tout : la base doit être visible et nette.** Un sujet coupé en bas est
inutilisable. Non pas parce qu'il serait posé au sol — à l'affichage la planche est la **vignette
d'un jalon**, elle pend au bout d'un mât et c'est le pied du mât qui désigne la région — mais
parce qu'un bâtiment tronqué se lit comme une image cassée, au bout d'un mât comme au sol. Le
sujet doit être **entier et fermé en bas**.

## Les quinze sujets

| clé | sujet à mettre dans le prompt |
|---|---|
| `hq` | bâtiment d'état-major en pierre, deux étages en L avec une tourelle d'angle, **grand drapeau déployé** sur un mât court, sacs de sable devant l'entrée |
| `farm` | corps de ferme et sa grange en bois, un silo cylindrique bas |
| `mill` | filature en brique, long bâtiment à toit en dents de scie, une cheminée |
| `mine` | chevalement de mine en treillis métallique, molette au sommet, petit terril |
| `oilWell` | derrick pétrolier en treillis, plateforme au sol, deux cuves basses |
| `foundry` | halle de fonderie en tôle, haut-fourneau trapu, deux cheminées fumantes éteintes |
| `arsenal` | atelier d'armement bas et long, toit plat, caisses de munitions empilées contre le mur |
| `quartermaster` | entrepôt d'intendance en bois, grandes portes, ballots de toile empilés |
| `barracks` | caserne d'infanterie, bâtiment long à un étage, rangée de fenêtres régulières, porche central |
| `airfield` | hangar d'aviation à toit en arc de cercle, grande porte coulissante, manche à air sur mât |
| `port` | quai de pierre avec une grue portuaire à flèche, bollards, appontement en bois |
| `listening` | cabane technique basse surmontée d'un réseau d'antennes filaires sur pylônes |
| `billets` | rangée de trois baraquements Nissen en tôle ondulée demi-cylindrique |
| `warehouse` | entrepôt de stockage en tôle, portes coulissantes, caisses de bois devant |
| `depot` | dépôt de carburant : trois cuves cylindriques sur socle de béton, tuyauterie apparente |

**Chaque silhouette doit se distinguer à la découpe**, comme les icônes de ressources : cheminée,
arc, treillis, demi-cylindre, cuve ronde. Deux bâtiments qui se ressemblent de loin ne servent à
rien sur une carte où ils font quarante pixels.

## Ce que la première planche a appris

Le `hq` est sorti conforme sur l'angle, la lumière, le fond et la base visible. Trois écarts
reviendront sur les quatorze autres, autant les traiter comme structurels :

1. **Le générateur ajoute une ombre portée même quand on l'interdit.** Ne pas se battre avec le
   prompt : `nettoyer-ombres.py` est fait pour ça, et le contrôle sur fond clair est obligatoire.
2. **Il grave parfois un numéro dans l'image.** Une planche qui porte du texte cuit est à refaire
   ou à recadrer — un tampon ne se retire pas proprement.
3. **Le sujet occupe ~50 % du cadre, pas 80 %.** Ne pas relancer pour ça : le cadrage se règle
   **à la découpe**, pas à la génération. Recadrer sur la boîte englobante alpha, puis normaliser
   **par la hauteur** — sinon un entrepôt cadré serré et une fonderie cadrée large sortiraient de
   tailles différentes, et la carte hériterait d'un accident de cadrage. Les quinze clés sont
   normalisées à la **même hauteur** : il n'y a pas de hiérarchie de taille (tranché le 16/08,
   `WWS/sprites/README.md` §7).

**La leçon de fond : un mât nu ne distingue rien.** À quarante pixels, une ligne d'un pixel
disparaît et le quartier général devient une maison en pierre quelconque. Chaque sujet doit porter
**une masse** qui le signe — un volume, pas un détail. Pour le `hq`, c'est le drapeau déployé et la
tourelle d'angle ; pour les autres, la cheminée, l'arc, le treillis, le demi-cylindre, la cuve.

~~**Toit clair plutôt que sombre.**~~ **Périmé depuis le 16/08.** Cette règle n'existait que pour
le filtre encre, qui n'est pas appliqué aux bâtiments. Les planches peuvent donc être **plus
contrastées et plus sombres** qu'elles ne le sont. Les quinze actuelles ont été générées sous
cette contrainte : si une série est relancée, la lever.

La contrainte qui la remplace est plus simple et plus dure : **la silhouette porte seule la
distinction.** Puisque les quinze s'affichent à la même hauteur, ni la taille ni la couleur ne
séparent un dépôt d'un arsenal — seule la forme le fait.

## Après la génération

Même chaîne que les unités, décrite dans `WWS/sprites/README.md` :

1. détourer sur le vert `#4a7060` ;
2. `python WWS/sprites/nettoyer-ombres.py` puis **contrôle sur fond clair** — l'ombre portée ne se
   voit que là ;
3. poser dans `WWS/sprites/buildings_clean/`, nommer par la clé (`farm.png`, `oilWell.png`…) ;
4. `python WWS/sprites/optimiser.py --source WWS/sprites/buildings_clean --destination src/emblems/buildings` ;
5. écrire le manifeste typé — un `Record` complet des quinze clés, une absence s'écrit `null`.

Une fois `src/emblems/buildings/` peuplé, la partie B de
`WWS/docs/prompts/code/batiments-sur-la-carte.md` peut tourner.
