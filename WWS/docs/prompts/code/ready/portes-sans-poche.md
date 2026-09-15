# portes-sans-poche — aucune porte maritime ne découpe une poche de terre, et Malacca retrouve son chenal

Lis `CLAUDE.md`, `CONVENTIONS.md`, l'ADR 0012 et `SEA_GATES` (`src/domain/routing.ts`). Ne
commit pas, ne push pas. Suppose `canaux-franchissables` livré et commité. Un chantier, un commit.

## Le constat (compte rendu de `canaux-franchissables`, 15/09)

La porte **Malacca** est tracée à l'intérieur des terres : `[101.3, 4.4]` est dans le Perak
(la côte y est vers 100.6° E), `[102.5, 3.0]` dans le Pahang (côte vers 101.4° E). Gravée en
`SEA` sur trois cellules de large, la polyligne tranche une bande côtière ouest — **Kuala Lumpur
et Malacca sont sur une poche isolée**, injoignables à pied depuis Bangkok. Le raster, lui,
tient : la péninsule est continue. C'est la porte qui coupe. Panama et Suez avaient le même
défaut, résolu autrement (type `CANAL`) parce que là, l'eau existe.

Rien ne le détectait : les tests de routage vérifient des trajets nommés, jamais l'invariant.

## La règle

Une porte de type `strait` ajoute de l'eau **là où il y en a** ; elle ne peut donc jamais
séparer deux terres qui se touchaient. Invariant : **le nombre de composantes connexes de
terre (8-voisinage, avec l'enroulement est-ouest) est identique avant et après la gravure des
détroits.** Une porte `canal` ne compte pas dans cet invariant (elle est franchissable) — mais
elle ne doit pas non plus en créer une si on la lisait comme de la terre.

## Ce qu'il faut

1. **Retracer Malacca dans le chenal**, entre Sumatra et la péninsule, pas sur la côte : de
   l'ordre de `[100.0, 6.2] → [100.4, 5.0] → [100.9, 3.6] → [101.6, 2.5] → [102.8, 1.6] →
   [103.7, 1.1] → [104.2, 1.2]`. Vérifie chaque point contre `world.json` (cellule d'eau, pas de
   terre) avant de l'écrire — les valeurs ci-dessus sont une direction, pas une mesure. Si le
   chenal est déjà de l'eau au pas de la grille sur une partie du tracé, la porte peut se
   raccourcir au seul goulet (Singapour) ; ne la garde que là où elle sert.
2. **Le test d'invariant**, dans `routing.test.ts` : composantes de terre du raster nu, puis
   après `SEA_GATES` — égalité stricte. Le calcul se fait une fois par test sur `buildGrid`
   (quelques centaines de ms, acceptable), en réutilisant `neighbors`. C'est ce test qui aurait
   pris Malacca, et qui prendra la prochaine porte mal tracée.
3. Deux trajets nommés en plus : **Bangkok → Kuala Lumpur à pied** existe ; **Penang →
   Singapour par mer** existe et reste plus court que le tour de Sumatra.
4. **Recuire `public/grid.json`** ; égalité octet à octet au vérifieur.
5. Relis les sept autres détroits au passage — pas pour les retracer, pour dire dans le compte
   rendu lesquels le test couvre déjà (tous, s'il passe) et si l'un d'eux a une polyligne qui
   longe une côte de trop près.

## Cas d'acceptation

1. Composantes de terre identiques avant/après détroits — test vert.
2. Bangkok → Kuala Lumpur, route terrestre, `land` de bout en bout.
3. Penang → Singapour, route navale, `sea` de bout en bout, plus court que par l'ouest de
   Sumatra.
4. Les quatre trajets de `canaux-franchissables` toujours verts.
5. `grid.json` recuit, égalité au vérifieur, décodage sous 5 ms.
6. Vérifieur vert.

## Hors périmètre

Le droit de passage par les détroits (blocus, neutralité) : pas de règle. Le dessin des portes
sur la carte : pas de dessin.
