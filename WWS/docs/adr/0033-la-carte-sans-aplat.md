# ADR 0033 — La carte sans aplat

**Statut :** acceptée (21/10/2026, #196, lot 3 de la refonte de la carte #193) — **révise
l'ADR 0020** sur le rendu de la couleur (§1 « qui tient quoi » en aplat, §5 « un relevé ancien est
délavé »). La règle de la couleur ne change pas : `heldRegions`, `knownRegions` et `control.held`
calculent la même chose, seul leur dessin change.

## Contexte

Pierre (20/10) : la carte des POC (`WWS/prototypes/pions/`, `plateau-personnel/`) était plus belle,
les pièces y « avaient l'air bien posées ». Le comparatif du 20/10 donne l'aplat de nation pour
l'une des causes : 65 % d'encre sur chaque région tenue, contre 15 % dans le POC. La feuille
devient un patchwork de couleurs franches, les pièces se détachent mal, et la carte cesse de
ressembler à une carte. La maquette #194, validée le 21/10, lit la même information par un contour
en tirets à l'encre de chaque nation (`WWS/prototypes/carte-refonte/main.js`).

## Décision

1. **Plus aucun aplat de nation.** La feuille garde les couleurs d'une vraie carte : le papier, la
   mer, les dessins de terrain. Qui tient quoi se lit au contour.
2. **Un contour en tirets par territoire** — des régions contiguës d'une même encre et d'un même
   état —, à l'encre de la nation (`INK_BY_NATION`), sur la frontière extérieure du territoire. Entre ses propres régions, un trait gris fin et plein. Entre deux nations,
   deux lignes côte à côte, chacune en retrait chez elle. Le contour du joueur est plus épais que
   les autres.
3. **Les états** :
   - un territoire connu par un relevé (`surveyed`) a un pointillé court, pâle et immobile ; sa
     date se lit au survol, sur la fiche de la région ;
   - une région suspendue garde ses hachures (ADR 0020 §7) ;
   - une région occupée prend l'encre de l'occupant (elle est dans sa revendication) ;
   - une région jamais vue n'a pas de contour : seul le grain de crayon de la feuille.
4. **Les tirets tournent lentement, tous dans le même sens** : à 10 images par seconde au bureau,
   au doigt seulement quand la carte se redessine déjà, immobiles en animations réduites ou
   coupées. C'est une couche d'`Ambience` : elle ne demande jamais d'image au doigt.
5. **Le réglage « Contours : fins / épais »**, fins par défaut, rangé comme le cycle jour et nuit.
   Les deux jeux de valeurs (épaisseur, longueur et écart des tirets, retrait) sont ceux de la
   maquette.
6. **Brouillard** : seuls les territoires que le joueur connaît ont un contour ; le contour se
   dessine depuis `control.held`, qui ne sert que ce que le joueur connaît.
7. **Les deux modes** : la Blitz prend le même contour, son trait plein disparaît.

## Conséquences

- `RegionLayer` dessine des rubans de contour (`contours.ts`) au lieu des aplats ; la largeur et
  le tiret se disent en pixels d'écran, la feuille ne se teinte plus jamais.
- `HeldClaim` perd `wash` et `outlined`, et gagne `mine`.
- Le pays d'une nation n'est plus peint sur sa feuille : `colorNations`, `wholeSheets` et
  `inkByClaimedCountry` disparaissent ; le lavis (`nationShades`) ne sert plus qu'à la table de
  la page d'accueil.
- Le grain de crayon couvre toute la terre : c'est l'absence de contour qui dit une région vierge.
- Les tirets avancent par une couche d'`Ambience` passive au doigt (`passive`), qui suit les
  images déjà dessinées sans en demander.

## Ce qu'on abandonne

- **L'aplat de nation** à 65 % sur chaque région tenue, et la feuille d'un pays tenu tout entier
  peinte à son encre.
- **Le délavé des relevés** (`FADED_WASH`, `surveyWash`), cranté sur l'âge, et leur gravure en
  tailles horizontales : un relevé est pâle et immobile quel que soit son âge, la date est à la
  fiche. **La carte ne montre plus l'âge d'un relevé** (ADR 0020 §5) : elle dit seulement qu'il est
  un relevé, et son âge se lit au survol, sur la fiche de la région (`GroundPanel`).
- **L'encre plus foncée des régions bâties** : un bâtiment se voit par sa maquette, pas par son sol.
- Le trait plein de la Blitz autour de ce qu'on tient.

## Précisée le 21/10/2026 (#197) : les dessins de terrain

- **Toujours visibles, jamais effacés de près** (choix de Pierre, #194) : forêts, montagnes,
  déserts, toundra, jungle à la plume pâle ; la plaine reste nue. Ceux du survol, posés par
  `terrain.ts`, disparaissent.
- **Cuits, pas gravés** : la maquette grave ses dessins dans une feuille de 2560 à 4096 px
  (~22 Mo à 2560), ce que le monde entier ne tient pas. `terrain-drawings.ts` cuit deux textures
  d'un octet par pixel (la carte des types, cellules de 0,2 u, et l'atlas des glyphes, en mips) et
  sème les glyphes au fragment sur une grille décalée, qui double de pas quand elle deviendrait
  grain : ~2,5 Mo, aucun coût par image côté CPU.
- **Le type reste décor** : aucune règle de jeu ne le lit (invariant « Données générées »). La
  fiche au survol le nomme avec son picto (`src/emblems/terrain/`).

## Précisée le 21/10/2026 (#198) : la nuit éteint carte et pièces, un halo à chacune

- **Une lune pour les pièces, une bande de nuit au pixel pour la feuille.** Dans la bande de nuit
  (`boardInstant`), la lampe devient une lune faible et froide au point regardé, et le ciel descend
  à 0,3 : les pièces s'assombrissent avec la carte. Le voile reste (Q14 c, grilling du 20/10),
  mais multiplie la feuille par le bleu de la lune au lieu de la couvrir d'encre : la bande de
  nuit dit qui dort et où, de loin comme de près, et la lune n'est teintée qu'une fois. Les encres
  des contours et les dessins de terrain lisent la même bande au pixel (`night-here.ts`). L'accueil
  garde son ancien voile (il est à refaire).
- **La lune est fixe.** L'azimut du soleil est singulier à l'antipode du point subsolaire, là où il
  fait nuit : les ombres y pivotaient de 90° pour un degré de carte et tournaient d'un battement à
  l'autre. La nuit, la lampe prend une direction fixe (`lampDirection`, `src/domain/daylight.ts`) ;
  au crépuscule, les deux directions se mêlent comme des vecteurs, jamais comme des angles.
- **Un halo chaud et léger autour de chaque pièce et de chaque bâtiment visible**, le même pour tous,
  toujours allumé la nuit, sans réglage (choix de Pierre, #194) : sans lui, les pièces sont presque
  noires. Un disque additif à plat par pièce, tous d'un seul `InstancedMesh` (`halo.ts`), et la
  pièce se réchauffe de la même lueur par son émission. Il ne scintille jamais, quel que soit le
  réglage d'animation : il suit le battement du soleil et ne demande aucune image à lui seul.
- **Les encres s'éclaircissent la nuit** (contours, #196) pour rester lisibles ; les fins traits
  gris s'assombrissent avec la carte. Les dessins de terrain (#197) restent visibles, sous la même
  lumière que la feuille.
