# chaine-de-l-alliage — la fonderie double, le sol la suit, le pack descend à 400

Suppose `simulateur-au-niveau` passé. Lis `CLAUDE.md`, `CONVENTIONS.md`, `convex/constants.ts`
(l'en-tête, `EXTRACTION_PER_HOUR`, `CHAINS`, `STARTING_ALLOY` et son commentaire « Measured,
not chosen », `STORAGE_CAP_PER_LEVEL`), `convex/invariants.test.ts` (« la première projection
tient dans la dotation »), `convex/production.test.ts`, `WWS/simulation/opening/constants.mjs`
et `verify.mjs`, l'ADR 0017 (tableau ligne ~144), `WWS/docs/technique/a-mesurer.md` (en-tête :
les tables économiques et leur instrument), `WWS/docs/rapports/2026-09-11-partie-de-controle.md`
(pour la forme d'un rapport daté). Ne commit pas, ne push pas. Un chantier, un commit.

## Décision (Pierre, 14/09/2026, sur la grille du simulateur remis au niveau)

Mesuré (`node run.mjs --grille`, campagne 168 h, 108 cases) : **la fonderie est le seul
goulot**. À 4/h le joueur assidu plafonne à 36-37 actions et 45 % de connexions vides quoi
qu'on fasse du sol ou du pack (extraction ×2 sans fonderie : 37, inchangé) ; l'alliage restant
ne dépasse jamais 273 sur toute la grille pendant que minerai et charbon s'entassent. Le saut
n'arrive qu'à 8/h : 37 → 52-57 actions, 20/20 troupes, 9-12 vides. À ce régime, **le pack ne
pèse plus** (250 → 52, 500 → 55 : du bruit). Et à 8/h ×1,5 le minerai tombe à 0 pendant que le
charbon bute sur le plafond de stock (2 000+, marqué `!`) : la fonderie à 8 mange 16 minerai et
8 charbon par heure, le sol doit suivre *dans ces proportions*, pas d'un même facteur.

Trois valeurs bougent, rien d'autre :

| constante | avant | après | pourquoi |
|---|---|---|---|
| `CHAINS.foundry.perHourPerLevel` | 4 | **8** | le goulot, mesuré seul |
| `EXTRACTION_PER_HOUR.ore` | 9 | **16** | l'appétit exact d'une fonderie niveau 1 |
| `EXTRACTION_PER_HOUR.coal` | 10 | **12** | 8 pour la fonderie, le reste pour les chantiers ; ×1,5 gâche 2 000 au plafond |
| `STARTING_ALLOY` | 500 | **400** | voir ci-dessous |

**Pourquoi 400 et pas 300.** La grille dit que 250 suffit à l'assidu ; mais
`invariants.test.ts` porte une règle de design qui n'est pas un chiffre du simulateur : la
première projection par mer (fonderie + QG 2 + caserne + port + cargo = 383) tient dans la
dotation, sans quoi une île est tarifée au-dessus de son voisin (66a, 04/09). À 300 elle
casse ; à 400 elle tient, de justesse, et la grille ne mesure aucune perte entre 400 et 500.
On ne rouvre pas 66a pour cent alliage que rien ne mesure. Si un jour la règle devient « dans
la dotation *plus une journée de fonderie* », le pack pourra descendre — ce sera une décision
signalée, pas un réglage.

## Ce qui change

1. **`convex/constants.ts`** : les quatre valeurs. Le commentaire de `STARTING_ALLOY` est
   réécrit : ce n'est plus « lu au point où les connexions vides cessent de tomber » (à 8/h
   elles ne dépendent plus du pack), c'est **« le plus bas où la première projection par mer
   tient (383), mesuré indifférent à l'ouverture entre 250 et 500 le 14/09 »**. L'en-tête du
   fichier (« a fresh nation raises its first buildings within the first hours of a 48-hour
   season ») dit la saison unique et le 14/09 comme date de la première mesure des tables
   économiques — sans retirer « placeholder » : une grille d'ouverture n'est pas une saison
   jouée. Le commentaire de `CHAINS` ne change pas.
2. **Le miroir suit** : `constants.mjs` (`EXTRACTION_PER_HOUR`, `CHAINS`, `campaign.startingAlloy`),
   `verify.mjs` vert. Relance `--sweep` et `--grille` pour régénérer `sweep.json` et
   `grille.json` — les JSON suivis doivent dire l'état après, pas avant. Les axes de la grille
   restent tels quels (fonderie {4, 6, 8}, extraction {×1, ×1,5, ×2}) : la case « 8/h ×1 » est
   désormais la valeur nominale, et l'axe montre ce qu'il en coûterait de revenir en arrière.
3. **Tests** : `invariants.test.ts` reste vert sans modification (383 ≤ 400 ; si ce n'est pas
   383, dis-le et arrête-toi, la décision est fondée dessus). `production.test.ts` et tout test
   qui lit 4/h, 9 ou 10 par le chiffre : passe par les constantes, jamais par le nombre en dur.
4. **Docs** : ADR 0017, tableau ligne ~144 — « alliage de départ 500 » → 400 avec une note
   datée 14/09 sous le tableau (deux lignes : la mesure, la borne 66a). Nouveau rapport
   `WWS/docs/rapports/2026-09-14-chaine-de-l-alliage.md` : la grille avant/après en tableau
   réduit (assidu / occasionnel / absent aux valeurs nominales avant et après), les trois
   lectures, la liste des cases non monotones telle que le rapport `simulateur-au-niveau` l'a
   donnée, et ce que la grille ne dit pas (pas de combat, pas de pertes, la politique de
   l'absent garde une réserve qui l'empêche de recruter — c'est le plan, pas l'instrument).
5. **`WWS/docs/technique/a-mesurer.md`** ne bouge pas (les tables économiques n'y sont pas), mais
   la ligne `UPKEEP_UNSUPPLIED_MULTIPLIER` disait « an economy where alloy is the bottleneck » —
   c'est toujours vrai (l'alliage restant ≤ 273), laisse-la.

## Ce que ce prompt ne fait pas

Ne touche ni au coût ni à la durée de la fonderie, ni à `LEVEL_COST_FACTOR`, ni au plafond de
stock, ni à `STARTING_OIL` / `STARTING_AMMUNITION`. Ne change pas la politique du simulateur
(la réserve de l'absent est une question de plan de jeu, à ouvrir dans `QUESTIONS.md` si Pierre
le veut, pas ici). Ne supprime pas `skirmish`.

## Rapport attendu

Le diff des quatre valeurs et de leurs commentaires ; la ligne « 8/h ×1 400 » de la nouvelle
grille pour les trois profils, comparée à l'ancienne « 4/h ×1 500 » ; la case de la grille où
le charbon ou le minerai touche encore le plafond `!` chez l'assidu, s'il y en a une ; le
`verifier` vert.
