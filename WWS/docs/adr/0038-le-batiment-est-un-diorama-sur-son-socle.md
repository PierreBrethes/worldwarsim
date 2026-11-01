# ADR 0038 — Le bâtiment est un diorama sur son socle

**Statut :** acceptée (01/11/2026). Pierre a retenu la piste B+ le 30/10
(`WWS/prototypes/batiments-caractere/b-plus.html`) et validé ses sept points et le budget le
01/11 (« Oui, toutes »). **Précise l'ADR 0035** (§8 : le socle et la cour n'ont pas de mètres
réels) et le rendu de l'ADR 0026 (la carte en figurines).

## Contexte

Le lot 0 (#293, fusionné le 26/10) a branché des bâtiments neufs en mètres réels, aux pièces
nommées et à leurs pivots : ils ont gagné l'échelle et le socle des animations, et perdu le
caractère. Pierre, le 26/10 puis le 30/10 : « insipides, durs à reconnaître, aucun charme ». À la
distance de jeu (0,8 px/m), une caserne fait 40 px de large : murs et toits gris d'une même
valeur s'y confondent avec la feuille, et rien ne dit à qui elle est, sinon un drapeau de quelques
pixels.

Trois pistes ont été maquettées (`batiments-caractere/` : A caricature, B diorama, C gravure,
puis B+). Pierre veut une solution définitive, pas un correctif de couleur.

## Décision

1. **Un site est une maquette posée sur sa base de wargame.** Le GLB de chaque bâtiment porte un
   `socle` couleur papier (#ebe1c8, flanc et biseau #bfae8a) : un seul gabarit, le rectangle aux
   coins arrondis (rayon 6 m), dessus à 2,2 m (`SOCLE_TOP`), biseau de 0,8 m. Il déborde de 6 à
   9 m autour du bâtiment et de 20 à 25 m côté façade, pour la cour. Le bâtiment, ses portes et
   ses pièces nommées ne changent pas : ils sont rehaussés de 2,2 m. Pas de forme par famille :
   elle ferait concurrence au carré de l'épingle et au losange de l'avant-poste, et le signe (§4)
   dit déjà quel bâtiment c'est.

2. **Le liseré dit à qui est le site.** Une bande de 3 m sur le bord du dessus du socle, matériau
   `lisere` à part, que le moteur teint à l'encre de la nation qui tient le site
   (`INK_BY_NATION`, comme le drapeau). Elle est pleine, jamais en tirets : le tiret des contours
   (ADR 0033) dit « territoire », le trait plein dit « pièce ».

3. **Un site adverse relevé a un liseré creux**, à l'encre adverse, comme l'épingle d'un relevé.
   Sa cour ne montre que ce que la vue sert à ce joueur : niveau et état relevés, et aucune
   garnison qui n'ait été relevée (brouillard, `PlayerView`).

4. **Le signe porte le caractère.** Chaque site plante dans sa cour un élément haut qui lui est
   propre, `signe` : il dépasse le bâtiment d'au moins un quart de sa hauteur et le dit en
   silhouette noire de 40 px. Lui seul porte la couleur chaude du site, une matière désaturée
   (brique, rayures, cuivre), pas une couleur de jeu. Caserne : mât de 24 m de la place d'armes et
   deux guérites rayées ; aérodrome : tour de contrôle vitrée ; ferme : silo de brique à dôme ;
   chantier naval : grue ; entrepôt : portique ; QG : campanile à mâts radio ; arsenal : deux
   cheminées ; mine de fer : chevalement ; mine de charbon : chevalement et terril ; puits :
   derrick ; centre de recherche : coupole ; station d'écoute : pylône haubané ; ville : clocher.
   `hampe` et `drapeau` passent sur le signe, avec leur nom et leur pivot : les animations qui les
   lisent (`RIG_PARTS`) ne changent pas.

5. **La cour raconte le niveau et l'état.** Ses sols (gravier, béton, labours) sont peints dans
   l'atlas sur 4 cm au plus, à 20 points de L\* du socle au plus. Des groupes d'accessoires,
   `niveau_1`, `niveau_2`, `niveau_3` (qui s'ajoutent), `chantier` et `ruines`, sont masqués ou
   montrés par le moteur selon le niveau et l'état ; un chantier coupe le bâtiment par le plan de
   montée qui existe déjà (`cutOf`). Aucun accessoire ne ressemble à une pièce du jeu. La garnison
   se range sur la cour, à partir du repère `fx_rang` (premier homme, +z vers le rang), dans un
   rectangle libre de 30 × 14 m, au lieu du pied des murs (`garrisonFoot`).

6. **Deux sites voisins ne se touchent jamais.** L'emprise d'un site est la boîte de son socle,
   lue sur le GLB (`BUILDING_FOOTPRINT_METRES`, tenue par `maquettes.test.ts`) ; l'anneau espace
   les sites par elle, avec 4 m d'écart au moins. Pas de socle commun : chaque site garde son
   liseré, car il peut changer de mains seul.

7. **La lecture par distance.** Jusqu'à d = 28 (`PIN_APPROACH_DISTANCE`), tout le diorama ; de 28
   à 65 (`REGIONS_GONE_DISTANCE`), seuls le socle, le liseré et le signe, ce dernier grandi
   jusqu'à ×2 pour garder 12 px de haut, comme la figurine plancher ; au-delà, l'épingle carrée
   d'aujourd'hui. Chaque passage est un fondu, qui suit le réglage `actives / réduites / coupées`
   (`src/domain/map-motion.ts`) et le contrat « Carte à la demande ».

8. **Le socle et la cour n'ont pas de mètres réels** (écart à l'ADR 0035, accepté) : ils
   agrandissent l'emprise d'un site de 30 à 60 % au sol (la caserne passe de 65 à 80 m), pas le
   bâtiment. Une figurine se mesure toujours au bâtiment, jamais au socle.

9. **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le
   bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires. Le
   budget n'est pas relevé à 4 000 : le téléphone est déjà le poste serré (14 images par seconde
   au banc des files, #276). L'atlas reste en 512² WebP, avec cinq cases de plus (papier du socle,
   gravier, béton d'aire, labours, toile de tente).

10. **Ce qui reste hors du socle.** La piste (#269) et le môle (#270) sont des kits que le moteur
    pose à côté du site, parce qu'ils portent des pièces qui le quittent : la piste se pose devant
    le socle de l'aérodrome, le môle part du bord de celui du chantier naval, côté grue. La manche
    à air reste le kit que le moteur pose sur la cour de l'aérodrome. Le chantier naval garde son
    socle sur sa part de terre : le bord côté mer est son quai.

11. **L'avant-poste** (#298) prend le même liseré sur un socle rond, son cercle de sacs de sable
    de 30 m, plutôt que le rectangle : le rond le distingue d'un bâtiment de près, comme le
    losange de son épingle au loin.

## Ce qu'on abandonne

- Le bâtiment seul, posé à même la feuille : son emprise est désormais celle de son socle.
- Le drapeau sur le toit : il passe sur le signe.
- La garnison au pied des murs : elle passe sur la cour.

## Options écartées

B+ réunit le signe de A et la cour de B, posés sur un socle qui dit à qui est le site.

- **A, la caricature** : des toits relevés de 1,4 à 1,75 fois et un signe qui dépasse. On garde
  le signe ; les toits relevés trahissent l'échelle commune (ADR 0035) sans dire à qui est le site.
- **B, le diorama sans socle** : la cour à même la feuille. Sans socle, pas de liseré ni d'emprise
  nette, et deux cours voisines se confondent.
- **C, la gravure** : trois valeurs franches et un trait d'encre autour de chaque volume. La forme
  ne change pas, et rien ne dit à qui est le site.
- **Une forme de socle par famille** : rond pour l'industrie, ovale pour l'agricole (§1).
- **Le liseré en tirets** : il se confondrait avec les contours de nation (§2).
- **Un budget de 4 000 triangles** : refusé pour le téléphone (§9).

## Conséquences

- Les treize prompts de bâtiment (`WWS/prototypes/glb/prompts/`) gagnent la section « Le socle, la
  cour, le signe » et leur budget ; `verifier-glb.mjs` attend `socle`, `lisere`, `cour`, `signe`,
  `fx_rang` et les groupes d'accessoires. Pierre régénère les GLB dans Claude Design.
- Le moteur lit l'emprise sur le socle, pose la garnison depuis `fx_rang`, teint le liseré (plein
  ou creux), bascule les accessoires et tient la lecture par distance. Tant qu'un GLB n'a pas de
  socle, le site se dessine comme aujourd'hui : les modèles se branchent un par un.
- Les animations aux bâtiments (#269, #270, #271, #273) ont la cour et le socle pour terrain.
