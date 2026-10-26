# ADR 0036 — Une copie articulée, le temps d'une séquence

**Statut :** proposée (26/10/2026), pour #267 et #282 ; l'ombre des boucles (§12) attend Pierre. **Précise l'ADR 0035** (§8 : ce qui
appartient au bâtiment vit dans son modèle) et le contrat « Carte à la demande » de `CLAUDE.md`.
Part de l'état du lot 0 (#286) : GLB neufs en mètres, pièces nommées à leur pivot, drapeau masqué.

> **Précisée le 26/10/2026, au codage des piles** (#289) : le seuil du rapproché (§8) est celui de
> la séquence, `Sequence.minPx`, `PLAY_PX` à défaut. Le zoom s'arrête à d = 3, où un camion ne lit
> que 34 px : à 150 px, son hayon ne jouerait jamais. `@a-mesurer` : 30 px pour le hayon. La
> pose `root` déplace la copie dans un support que l'hôte place (la matrice d'un bâtiment est écrite
> par l'hôte à chaque image). Une pile qu'une vue vient de redessiner (une troupe descend) charge
> ses modèles : prêtée sans boîte tant qu'elle n'est pas posée à l'échelle du plateau, la copie
> prend la place du modèle à son arrivée.

## Contexte

Les modèles neufs portent leurs pièces mobiles nommées, à leur pivot : battants de la caserne,
portes coulissantes du hangar, hayon du camion, train et hélices des avions, panneaux de cale
(`EXPECT`, `WWS/prototypes/glb/prompts/verifier-glb.mjs:22-153`). Le moteur les perd toutes à la
cuisson :

- un bâtiment est fondu en une géométrie par matériau (`bakedParts`, `src/map/engine/baking.ts:11-18`),
  puis dessiné en `InstancedMesh` : un appel par matériau, quel que soit le nombre d'exemplaires
  (`maquettes.ts:561-571`) ;
- une figurine ne garde que ses articulations, ses `fx_*` et le premier `prop*` d'une branche
  (`movesOnItsOwn`, `figurines/figurine.ts:150-153`), et chaque pile en porte un clone
  (`figurine.ts:253-259`).

Garder les pièces à part en permanence coûte 3 appels de plus à la caserne (11 → 14), 7 à
l'aérodrome, et multiplie le camion par 2,75 (8 → 22), ombre non comprise (enquête du 26/10, §3).
#267 exige un repos qui ne coûte rien : d'où l'option B, deux cuissons.

Les storyboards (`WWS/prototypes/storyboard-caserne/`, `-aerodrome/`, `-port/`) décrivent chaque
séquence comme une fonction pure du temps : `plan()` fixe la ligne de temps, `pose(t)` place
chaque pièce, la pose finale est `pose(total + 1)` (`storyboard-caserne/commun/scene.js:528-622`,
`:945`).

## Décision

1. **Deux cuissons, une seule source.** La cuisson de repos reste celle d'aujourd'hui :
   `bakedParts` pour les bâtiments, la cuisson des figurines pour les pièces. La cuisson
   articulée garde à part, à leur pivot, les pièces de sa famille, et fond le reste par matériau
   sous chacune. C'est la cuisson des figurines généralisée : `bakedFigurine` devient
   `bakedRig(scene, keeps)`, et vit dans `baking.ts` avec `bakedParts`. Le filtre de ce qui ne se
   dessine pas (le `drapeau` jusqu'à #279) est une seule fonction, lue par les deux cuissons.

2. **Les noms qu'on articule vivent dans `src/emblems/rigs.ts`.** `RIG_PARTS` donne, par fichier
   (`barracks`, `airfield`, `landTransport`…), les pièces que la cuisson articulée garde. C'est la
   liste du §2 de l'enquête, réduite à ce qu'une séquence fait bouger. Le type d'une pose en
   dérive : une séquence de la caserne ne peut pas nommer `tailgate`, le compilateur refuse.

3. **Une séquence est une fonction pure du temps.** `Sequence = { family, ms, at(t) }` : `at`
   rend la pose de chaque pièce nommée à `t` millisecondes, en écart à sa pose de repos (rotation,
   déplacement en mètres du modèle, étirement, fondu). Comme les storyboards. Les lignes de temps
   vivent dans `src/map/engine/timelines/`, sans three, testées seules ; leurs courbes
   (`out3`, `in2`, `inOut`, `march`, `drive`, `push`) sont celles des storyboards.

4. **La pose finale est la pose de repos.** `at(t)` rend `{}` pour tout `t ≥ ms`. Une séquence
   finit donc exactement sur la cuisson de repos : rien ne saute à la substitution. Un état qui
   dure hors de la pose du modèle (l'avion en vol, train rentré) n'est pas une séquence tenue :
   c'est une **cuisson de repos de plus**, à la pose voulue, au même coût que l'autre. Elle
   arrive avec le premier lot qui en a besoin (#269).

5. **Une copie articulée remplace une seule pièce, le temps de sa séquence.**
   - La couche des séquences (`SequenceLayer`, `src/map/engine/sequences.ts`) tient l'horloge et
     les copies ; elle parle à une couche qui dessine des pièces au repos par un hôte
     (`SequenceHost`) : `pieceOf(id)` dit ce qui est dessiné, `standIn(id, copie | null)` substitue
     ou rend.
   - Bâtiment : l'instance au repos passe à l'échelle nulle, à son propre point, comme une maquette
     devenue épingle (`maquettes.ts:706-708`) ; la copie reçoit la matrice que l'instance aurait eue.
     Les autres exemplaires du lot ne bougent pas. La copie vit dans le groupe de la couche, hors
     des lots : un `rebuild` la garde par son id.
   - Figurine : la copie remplace le clone de son groupe dans la pile. Le pied de pile, par
     lequel on prend une pièce (`standing.ts:183-189`), ne change pas.
   - La copie est un `clone(true)` d'une cuisson articulée mise en cache par fichier : elle partage
     géométries et matériaux. Seul le fondu lui donne des matériaux à elle, rendus à la fin.

6. **L'horloge part du signal, pas du chargement.** `play` note l'instant ; la cuisson articulée
   se fait au premier signal pour ce fichier (la scène est déjà chargée par la cuisson de repos),
   puis reste en cache. Une cuisson lente mange le début de la séquence, jamais sa fin.

7. **Elle se déclare à la boucle.** `this.sequences.active` rejoint la liste de
   `src/map/engine/index.ts:3143-3151`, avec son test dans `frame-demand.test.ts` sur le modèle du
   parachute (`:210-222`). Le signal entre par une méthode publique, `cue(cue)`, qui commence par
   `this.invalidate()`. Pendant une séquence, chaque image est complète : la carte d'ombres est
   refaite à chaque image (`index.ts:3241`), comme pendant un déplacement de caméra.

8. **Elle ne joue qu'à plein mouvement, au rapproché, dans le champ.**
   - En mouvement réduit ou coupé, `play` ne fait rien : la cuisson de repos *est* la pose finale.
     L'anneau d'encre des « réduites » appartient au signal (il se pose où la séquence finit),
     pas au socle.
   - Rapproché : la boîte de la pièce fait au moins `PLAY_PX` à l'écran (lue sur la fenêtre de
     900 px de référence, `figurine.ts:75`). `@a-mesurer` : 150 px, soit la caserne sous d ≈ 7,5.
   - Champ : la boîte coupe le tronc de vue de la caméra.
   - Au signal, si l'une de ces conditions manque, rien ne joue. En cours de séquence, si l'une
     cesse (dézoom, pièce hors champ, réglage changé, pièce disparue ou fantôme, rejeu qui
     l'écarte), la séquence finit tout de suite sur sa pose finale. Elle ne reprend jamais.
   - Au plus `MAX_PLAYING` copies à la fois (`@a-mesurer` : 4) ; au-delà, la pose finale.

9. **La sélection lit la copie.** `MaquetteLayer.under` essaie aussi les copies debout : l'instance
   à l'échelle nulle n'est plus touchée par un rayon (sphère de rayon nul,
   `node_modules/three/src/objects/Mesh.js:150-167`). `boxOf`, `lights`, `garrisonAt` lisent
   l'item, pas l'instance : rien à changer.

10. **Les éléments de #282 ne forment pas un module.** Chacun vit près de ce qui fait déjà la même
    chose, et arrive avec le premier lot qui s'en sert :
    - **le gond** n'est pas écrit : chaque pièce mobile neuve a son pivot dans le GLB
      (`pivots` d'`EXPECT`) ; une pièce sans pivot est un défaut du fichier, renvoyé à la
      régénération ;
    - **le noir d'une entrée** est le matériau `fond_sombre` des GLB ; la nuit l'allume dans
      `warmPieces` (`halo.ts:153`) ;
    - **le fondu** est une pose (décision 3) ;
    - **la caisse unique** remplace la caisse de `crates.ts:23-36` et le paquet de
      `parachute.ts:50` ; c'est le seul élément écrit avant son premier usage neuf, parce qu'il
      retire un doublon ;
    - **les poses de l'homme** rejoignent `marching` dans `figurines/infantry.ts` ;
    - **les roues** tournent de la distance sur leur rayon, lu sur la cuisson articulée ;
    - **les bouffées** rejoignent `smoke.ts`, **le sillage** `pawn.ts`, **l'encre** `ink.ts` ;
    - **la manche, la piste et le môle** sont le lot des kits de terrain.

11. **Ce que les tests tiennent des noms.**
    - `src/emblems/maquettes.test.ts` et `src/emblems/figurines/glb.test.ts` : chaque nom de
      `RIG_PARTS` existe dans chaque fichier de sa famille, et un seul nœud le porte (le doublon
      `manche` de l'enquête).
    - `baking.test.ts` : pour chaque fichier, la cuisson articulée au repos dessine la même chose
      que la cuisson de repos — même boîte, même nombre de triangles, même volume orienté (la
      méthode de `figurines/baked.test.ts:160-186`) — et chaque pièce de `RIG_PARTS` garde sa
      position.
    - Chaque ligne de temps : `at(ms)` et `at(0)` rendent la pose de repos.
    - Les pivots restent au vérificateur de livraison (`verifier-glb.mjs`), qui les juge sur la
      géométrie : les tests ne les recalculent pas.

12. **Les boucles sans fin** (éolienne, balancier, cadre goniométrique, drapeau, manche : #273,
    #279) passent par la même copie, sous une `AmbientLayer` qui la pose à son pas : idle hors du
    rapproché, `MAX_PLAYING` copies au plus, en mouvement plein seulement. Une image d'ambiance ne
    refait pas les ombres (`index.ts:3241`) : la pièce qui tourne en boucle ne porte pas d'ombre
    (voir « Reste à trancher »). Lot à part, après les kits.

## Conséquences

- Au repos, rien ne change : mêmes appels de dessin, mêmes cuissons, une recherche dans une
  table vide par maquette et par image.
- Pendant une séquence, une pièce coûte sa cuisson articulée en plus de son lot : la caserne
  14 appels, 28 avec l'ombre (enquête, §3), et une carte d'ombres refaite à chaque image. Le banc
  le mesure (`npm run banc:client`).
- Le premier signal sur un fichier fait sa cuisson articulée sur le fil principal : à mesurer au
  banc, en tâche longue.
- Chaque animation (#268 à #281) écrit une ligne de temps et un signal ; elle ne touche ni aux
  cuissons ni à la boucle.
- La couche des séquences a deux hôtes : les maquettes (premier lot), les figurines (deuxième).
- `RIG_PARTS` grandit avec chaque famille régénérée (fantassins, chars, artillerie, escorte,
  porte-avions) ; `EXPECT` reste le cahier des charges des fichiers, plus large que ce que le
  code lit.

## Ce qu'on abandonne

- **Des pièces séparées en permanence** (option A) : +3 à +14 appels par modèle, à toute heure.
- **Une séquence qui finit ailleurs que sur la pose du modèle.** Un état durable se cuit.
- **Une séquence reprise** quand la caméra revient : ce qui s'est passé hors de vue est fini.
- **Le module unique des éléments réutilisables** (#282, « un module du moteur ») : chaque élément
  rejoint ses voisins (CONVENTIONS §1, « penser local »).
- **Le gond du moteur** (`hingeOf` du POC) : le pivot est dans le fichier.
- **Les pivots tenus par les tests** : ils le sont à la livraison.
- **L'ombre d'une pièce qui tourne en boucle.**

## Options écartées

- **A, toujours séparé** : un `InstancedMesh` par pivot et par matériau. Le coût court au repos.
- **Une instance animée par matrices de pièces** (un `InstancedMesh` par pièce mobile, la pose
  écrite dans ses matrices) : garde l'instanciation pendant la séquence, mais coûte les appels de
  l'option A en permanence.
- **`BatchedMesh`** (visibilité par instance) : il faut tout de même une géométrie par pièce
  mobile, et le reste du moteur ne s'en sert nulle part.
- **Importer `EXPECT` dans les tests** : il vit hors de `src/`, en `.mjs`, et dit ce que les
  fichiers doivent porter, pas ce que le code lit.

## Reste à trancher

**Une pièce qui tourne en boucle (éolienne, balancier, drapeau) porte-t-elle une ombre ?** Une
image d'ambiance ne refait pas la carte d'ombres : son ombre resterait figée jusqu'à l'image
complète suivante (une par seconde au moins, le battement). Les options : pas d'ombre pour la
pièce qui bouge (le reste du bâtiment garde la sienne) ; une ombre figée qui saute une fois par
seconde ; des images complètes au pas de la boucle (8 à 12 par seconde, la carte d'ombres refaite
autant). Recommandation : pas d'ombre pour la pièce en boucle. Pierre tranche avant le lot des
boucles.
