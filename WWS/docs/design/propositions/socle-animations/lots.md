# Socle des animations : les lots (ADR 0036)

Une issue par agent. Chacune part de `main` à jour **après le lot 0 (#286)** et se mène seule
jusqu'au dernier commit vérifié (`npm run verifier`). L'ordre : A, puis B et C en parallèle
(ils ne touchent pas les mêmes fichiers), puis D quand #273 arrive. Les éléments de #282 autres
que la caisse arrivent avec le premier lot d'animation qui s'en sert (ADR 0036 §10) : ils sont
listés en bas, rattachés à leur lot.

Chaque prompt d'agent porte la règle d'arrêt : après 3 échecs sur la même vérification,
s'arrêter et rendre un rapport d'échec.

---

## Lot A (#288) — Le socle, prouvé sur les battants de la caserne (#267, partie 1)

**Agent** : `dev`, Sonnet, effort medium (huit fichiers, une seam neuve ; la spec est complète).

**Ce qu'on livre**
- `src/emblems/rigs.ts` : `RIG_PARTS` avec la seule famille `barracks` (les quatre battants).
- `src/map/engine/baking.ts` : `bakedRig(scene, keeps)` (le corps de `bakedFigurine`,
  `figurine.ts:161-207`, déplacé ; `bakedFigurine` en devient une ligne) et `isDrawn` (le filtre
  du drapeau posé par le lot 0, partagé).
- `src/map/engine/timelines/curves.ts` et `timelines/barracks.ts` : `barracksDoors()` d'après
  `T.caserne` du storyboard (`storyboard-caserne/commun/scene.js:55-56`, `:528-545`), battants
  vers l'extérieur. Le sens de chaque battant se vérifie en capture : le pivot `gond` du GLB est
  sur l'arête, son signe ne se lit pas dans `EXPECT`.
- `src/map/engine/sequences.ts` : `SequenceLayer`, `SequenceHost`, `Sequence`, `Pose`, `Cue`,
  `PLAY_PX` et `MAX_PLAYING` marqués `@a-mesurer`.
- `src/map/engine/maquettes.ts` : `MaquetteLayer` hôte (`pieceOf`, `standIn`, `orient`, `under`,
  `dispose`), comme dit dans `interface.md`.
- `src/map/engine/index.ts` : `cue(cue)`, la déclaration à la boucle, `step`, `motion`,
  `dispose`, le `sees` sur `this.eye` ; `REFERENCE_PX_PER_UNIT` exporté de `figurine.ts`.
- `src/map/cues.ts` : `sortiesOf` ; l'effet dans `WorldMap.tsx` qui appelle `engine.cue` pour
  chaque caserne d'où sort une recrue. Le cas Blitz où la recrue se pose à la porte, sur un point
  (`convex/troops.ts:250-254`), ne donne pas de signal : pas de pile `beside`.
- `scripts/banc-client.mjs` : une option `--sequences`, qui cadre la caserne de la démo au
  rapproché (`frameAt`), lit son id par `mapEngine.maquetteAtPoint`, puis mesure deux gestes :
  « caserne repos 5 s » et « sortie de caserne » (`mapEngine.cue`, 3 s).

**Tests**
- `sequences.test.ts`, avec un hôte factice : rien ne joue en `reduced` ou `off`, hors de vue,
  au-delà de `MAX_PLAYING`, sur une pièce déjà en jeu ; la copie ne se tient qu'une fois cuite ;
  la pose suit `at(t)` ; la séquence finit au bout, quand la pièce disparaît, quand elle sort du
  champ, quand le réglage passe à `reduced`, et `standIn(id, null)` est alors appelé une fois ;
  `active` suit ; l'horloge part de `play`, pas de la cuisson.
- `timelines/barracks.test.ts` : `at(0)` et `at(ms)` rendent `{}` ; à mi-ouverture les battants
  tournent en sens contraires ; aucun nom hors de `RIG_PARTS.barracks` (le type le tient déjà).
- `baking.test.ts` : sur `barracks.glb` réel (le lecteur `sceneOfFile` de
  `figurines/baked.test.ts:53-113` remonte dans un module de test partagé), la cuisson articulée
  au repos dessine comme `bakedParts` : même boîte, mêmes triangles, même volume orienté ; chaque
  pièce de `RIG_PARTS.barracks` garde sa position monde.
- `src/emblems/maquettes.test.ts` : chaque nom de `RIG_PARTS` existe dans son fichier, porté par
  un seul nœud.
- `maquettes.test.ts` (moteur) : une maquette doublée a son instance à l'échelle nulle et sa
  copie à la matrice que l'instance aurait eue ; `under` rend son id par la copie ; un `rebuild`
  garde la copie ; un lot `washed` ou `atWork` rend `null` à `pieceOf`.
- `frame-demand.test.ts` : un test « une séquence plus longue que la fenêtre se déclare à la
  boucle » (`barracksDoors().ms > SETTLE_MS`, `this.sequences.active` dans la liste) ; `cue`
  n'entre pas dans `READ_ONLY`.
- `cues.test.ts` : une recrue neuve à une caserne donne son id ; une troupe connue qui rentre ne
  donne rien ; une pile d'un autre bâtiment non plus.

**Banc** (`npm run banc:client -- --sequences`, avant et après, téléphone et bureau)
- « caserne repos 5 s » : appels de dessin, images par seconde et temps de boucle égaux avant et
  après, au bruit près.
- « sortie de caserne » : au plus 28 appels de plus que le repos (la copie et son ombre), p95 de
  l'image consigné ; aucune tâche longue au premier signal, sinon la chiffrer et la dire.

**Captures** : la caserne à mi-ouverture, jour et nuit, bureau et téléphone ; la même à la fin
(rien ne saute entre la copie et l'instance).

**Risque** : moyen.
- La substitution saute d'un pixel si la copie et l'instance ne reçoivent pas la même matrice :
  le test du moteur et la capture de fin le voient.
- Le premier signal cuit sur le fil principal : à mesurer.
- Ce lot fait battre les portes sans que personne ne sorte : fusion groupée avec #268 ;
  décidé le 26/10.

---

## Lot B (#289) — Le deuxième hôte : une figurine de pile (#267, partie 2)

**Agent** : `dev`, Sonnet, effort medium. Après A.

**Ce qu'on livre**
- `StandingLayer` hôte (`pieceOf`, `standIn`) : id `${pileId}/${groupe}` ; la copie remplace le
  clone du groupe sous `model` (`figurine.ts:259`), à son échelle ; les pieds de pile
  (`standing.ts:183-189`) ne bougent pas.
- `Figurine` gagne `url` (le fichier de son premier marquage, celui de `measureOf`).
- La pose `root` (la copie entière : `shift`, `turn`) et le `fade` (matériaux propres à la copie,
  libérés à la fin, comme ceux du parachute, `parachute.ts:70-71`, `:152-153`).
- `RIG_PARTS` des familles régénérées au lot 0 : `landTransport` (`tailgate`, `roue_left_*`
  et `roue_right_*` déroulés en noms, `body`), `fighter`, `bomber`, `airTransport` (`gear_*`,
  `wheel_*`, `tailwheel`, `cabin_door`, `bay_door`), `cargo` (`hold_hatch_*`, `mat_charge_*`).
  Un nom à motif (`hold_hatch_*`) se déroule par fichier : une fonction `rigPartsOf(scene,
  family)` plutôt qu'un littéral, si le compte varie par nation (cargo : 4, 5 aux États-Unis, 1
  pour la jonque).
- `src/emblems/figurines/glb.test.ts` : les noms de `RIG_PARTS` par rôle, un seul nœud chacun ;
  les budgets de triangles d'`EXPECT` (camion 1 500, bombardier et transport 1 500).
- Un signal réel et court pour prouver l'hôte : **le hayon du camion qui tombe et se relève
  quand une troupe en descend** (`carriedBy` qui disparaît, `player-view.ts:301`), sans les
  hommes qui passent (c'est #277).

**Tests**
- `standing.test.ts` : une figurine doublée a sa copie à la place du clone, même matrice monde ;
  `under` et `pick` rendent la même pile ; une pile rhabillée finit la séquence.
- `baked.test.ts` : la cuisson articulée de chaque fichier régénéré dessine au repos comme la
  cuisson de repos ; l'assertion `baked < scene` (`:186`) reste sur la cuisson de repos, la
  cuisson articulée prend `≤` (les camions ont autant de maillages que de primitives).
- `sequences.test.ts` : `fade` crée des matériaux propres et les rend à la fin.
- `cues.test.ts` : le débarquement d'un camion donne son id ; un embarquement ne donne rien.

**Banc** : `--sequences` gagne « hayon » ; repos inchangé ; au plus 2 × 22 appels de plus.

**Risque** : moyen. Les infanteries ne sont pas régénérées : ne pas les mettre dans `RIG_PARTS`.
Un fichier où un nom attendu manque fait échouer `glb.test.ts` : le dire, ne pas l'ôter de la
liste.

---

## Lot C (#290) — La caisse unique (#282, partie 1)

**Agent** : `dev`, Sonnet, effort low. Indépendant de A et B.

**Ce qu'on livre**
- `src/map/engine/crate.ts` : une caisse et ses deux lattes, en mètres (`CRATE_METRES`,
  `@a-mesurer`, 1,2 m), une géométrie et deux matériaux partagés.
- `crates.ts` la prend à la place de `crate()` (`:23-36`) et de ses constantes (`:4-10`), en
  gardant `SPOTS`, la chute et `place` ; la caisse posée garde sa taille d'aujourd'hui à 5 %
  près (elle valait 0,5 unité de modèle × `FIGURINE_SCALE`).
- `parachute.ts` la prend à la place de `CRATE` (`:50`, `:102`), à l'échelle de la voilure (la
  taille à l'écran reste celle d'aujourd'hui).

**Tests** : `crates.test.ts` et `parachute.test.ts` passent sans changement de leurs attentes ;
un test que les deux couches dessinent la même géométrie.

**Captures** : un chargement sur site et un largage, avant et après.

**Risque** : faible. Le paquet du parachute est en matériaux transparents propres à chaque
paquet (`parachute.ts:94-99`) : la caisse partagée ne doit pas en perdre le fondu.

---

## Lot D — Les boucles sans fin (#267, partie 3 ; avec #273)

**Agent** : `dev`, Sonnet, effort medium. Quand le storyboard de #273 est validé.

**Ce qu'on livre**
- Une `AmbientLayer` des boucles (`ambience.ts`) qui pose des copies articulées au pas de
  l'ambiance : idle hors du rapproché, `MAX_PLAYING` au plus, en mouvement plein seulement ; la
  pièce qui tourne ne porte pas d'ombre (selon la réponse à la question 1 de l'ADR).
- Une clé `Fx` pour elles (`map-motion.ts:3`).
- `RIG_PARTS` des familles concernées : `farm`, `mine`, `coalMine`, `oilWell`,
  `researchCenter`, `listening`.

**Risque** : moyen. Une copie posée en ambiance ne passe pas par une image complète : la
substitution et le retour au repos doivent demander une image complète, sinon l'instance et la
copie se montrent ensemble jusqu'au battement.

---

## Les éléments de #282 rattachés à leur premier lot

| Élément | Où il vit | Lot qui l'écrit |
|---|---|---|
| Noir d'une entrée, allumé la nuit | `fond_sombre` des GLB ; `warmPieces` (`halo.ts:153`) | #268 |
| Fondu dans l'entrée | `PartPose.fade` | lot B |
| Poses de l'homme (saut, assis, à genou, en joue, chute, déroute) | `figurines/infantry.ts`, près de `marching` | #268 (marche à la porte), #277 (assis), #272 (en joue) |
| Roues et suspension | une ligne de temps lit le rayon sur la copie | #276 |
| Bouffées (poussière, fumée, éclair, impact, gerbe) | `smoke.ts`, en fonction du temps | #268 (fumée de la remise) |
| Sillage | `pawn.ts:196-206` | #270 |
| Encre (agrafe, empreinte, trace, cercle) | `ink.ts` | #277 |
| Bâche, rampe, passerelle, élingue | une pièce du GLB et sa pose ; sinon un lot de régénération | #277, #270 |
| Manche, piste, môle | les kits de terrain | lot des kits |
| Gond | aucun : le pivot est dans le GLB | — |

Pour chaque lot d'animation, la consigne commune : une ligne de temps dans `timelines/`, un
signal dans `Cue` et `cues.ts`, l'anneau d'encre des « réduites » posé par le signal, la pose
finale égale au repos (test `at(ms) = {}`), `npm run banc:client -- --sequences` avant et après.
