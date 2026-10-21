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
2. **Un contour en tirets par bloc**, à l'encre de la nation (`INK_BY_NATION`), sur la frontière
   extérieure du bloc. Entre ses propres régions, un trait gris fin et plein. Entre deux nations,
   deux lignes côte à côte, chacune en retrait chez elle. Le contour du joueur est plus épais que
   les autres.
3. **Les états** :
   - un territoire connu par un relevé (`surveyed`) a des tirets pâles et immobiles ; sa date se
     lit au survol, sur la fiche de la région ;
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
- Le pays d'une nation n'est plus peint sur sa feuille : `colorNations`, `wholeSheets`,
  `inkByClaimedCountry` et `nationShades` disparaissent.

## Ce qu'on abandonne

- **L'aplat de nation** à 65 % sur chaque région tenue, et la feuille d'un pays tenu tout entier
  peinte à son encre.
- **Le délavé des relevés** (`FADED_WASH`, `surveyWash`), cranté sur l'âge, et leur gravure en
  tailles horizontales : un relevé est pâle et immobile quel que soit son âge, la date est à la
  fiche. L'ancienneté se voit toujours en permanence (ADR 0020 §5), mais sans degrés.
- **L'encre plus foncée des régions bâties** : un bâtiment se voit par sa maquette, pas par son sol.
- Le trait plein de la Blitz autour de ce qu'on tient.
