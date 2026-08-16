# Prompt Claude Code — back : troupes discrètes et recrutement (ADR 0014)

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, l'[ADR 0014](../../adr/0014-troupes-discretes-et-combat-sequentiel.md),
l'[ADR 0015](../../adr/0015-economie-v2-ressources-localisees.md), l'[ADR 0016](../../adr/0016-code-anglais-jeu-francais.md),
les fiches [08 — Combat](../../design/08-combat.md) et [09 — Unités](../../design/09-unites.md), puis
[chiffrage-combat.md](../../design/propositions/chiffrage-combat.md) qui porte les nombres.
Ne commit pas, ne push pas.

**Prérequis : `back-ressources-et-batiments.md` est passé.** Les huit ressources et les quinze
bâtiments localisés existent. Sans eux, arrête-toi.

**Identifiants en anglais, libellés en français** (ADR 0016).

## Contexte

L'ADR 0011 avait gravé des unités **sans position ni identité** — un effectif national, une ligne
par couple rôle/palier. L'ADR 0014 l'a révisée : les troupes deviennent discrètes, uniques, et
leurs points de vie sont leur **effectif lisible**.

**Ce qui existe déjà, et qui est un provisoire assumé** (commit `fc3bb65`) : les tables `units` et
`recruitments`, la query `workshop`, les mutations `recruit` / `cancel` / `deliver` avec datation
paresseuse et `scheduler`, et `units.test.ts`. `constants.ts` le dit lui-même en commentaire.
**Tu refonds ce provisoire, tu ne pars pas de zéro** — et la datation paresseuse, qui est la bonne
partie, se conserve telle quelle.

**Repère d'abord l'existant et liste-le-moi** : `convex/schema.ts`, `units.ts`, `units.test.ts`,
`constants.ts`, `validators.ts`, `buildings.ts`, `resources.ts`, puis `src/domain/troops.ts`,
`player-view.ts`, et la surface 4.6 (`src/routes/-plateau/ProductionWindow.tsx`).

**Dette repérée avant toi, à corriger au passage :** `convex/units.ts` ligne 65 contient le mot
`tick`, banni par `WWS/CONTEXT.md`. Il précède ce prompt — ne le prends pas pour une régression,
et fais-le disparaître.

## Huit décisions prises le 16/08 — applique-les, ne les rediscute pas

Elles corrigent des contradictions réelles trouvées en relisant le code. Chacune est motivée : si
l'une te paraît fausse, **signale-la et arrête-toi**, ne l'arbitre pas toi-même.

**D1 — Un seul plafond : le nombre de troupes. Le plafond d'hommes est abandonné.**
La version précédente de ce prompt demandait de borner « la somme des `nominalStrength` ». Ce
n'est pas calculable : `nominalStrength` n'est pas dans la même unité selon le rôle — 50 soldats,
12 chars, 12 appareils, 6 navires, 24 appareils embarqués. Les additionner reviendrait à ajouter
des chars à des destroyers. **Une seule contrainte : le nombre de troupes.** Une seule erreur
typée.

**D2 — Deux constantes libres, le reste se dérive.**

```
TROOP_CAP_BASE        = 8    // troupes au lancement, sans aucun Baraquements
TROOP_CAP_TARGET      = 24   // le plafond de fin de partie — LA valeur à calibrer
BILLETS_LEVELS_TO_CAP = 8    // niveaux cumulés pour saturer
troopStep = (TROOP_CAP_TARGET - TROOP_CAP_BASE) / BILLETS_LEVELS_TO_CAP   // = 2
```

Le pas **se calcule**, il ne s'écrit pas. Déplacer `TROOP_CAP_TARGET` ne doit demander aucun
recalcul à la main : c'est la condition pour que `refonte-simulateur.md` puisse le bouger.

Pas de plafond par domaine : terrestre, aérien et maritime puisent au même stock, exactement comme
les slots de mouvement puisent au même stock (ADR 0006). C'est ce qui donne son poids au choix de
doctrine.

**D3 — Assumé : ce plafond est une règle anti-nuée, pas un équilibrage entre domaines.**
Un plafond en *nombre* ne mord que sur les rôles bon marché : 24 infanteries coûtent 432
d'alliage, 24 porte-avions en coûteraient 10 320. Pour l'infanterie le plafond mord, pour le
naval c'est le coût qui mord et le plafond ne dit rien. **Ce n'est pas un oubli.** Sans lui, une
caserne produit environ 500 infanteries sur une saison de 7 jours. Le faire mordre partout
exigerait un coût en « places » par rôle — écarté délibérément, une table de plus à équilibrer.
Écris-le en commentaire là où la constante vit, pour que personne ne le « corrige » plus tard.

**D4 — Les Baraquements s'additionnent, et le deuxième est un passage obligé.**
Le plafond lit la **somme des niveaux de toutes les instances** de `billets`.

Conséquence structurelle, **voulue** : `cappedByHq` interdit à tout bâtiment d'atteindre le niveau
du QG, donc un Baraquements plafonne à 4 avec un QG à 5. **Un seul Baraquements plafonne donc à
16 troupes** (8 + 2×4) et ne peut jamais saturer. Atteindre 24 coûte au minimum **deux
emplacements** : une armée pleine se paie en économie. Écris-le en commentaire — c'est une
décision, pas un effet de bord.

La fourchette jouable, calculée sur `BUILDING_SPEC.billets` et `LEVEL_COST_FACTOR` :

| Chemin vers 24 | alliage | nourriture | emplacements |
|---|---|---|---|
| 2 × niveau 4 | 594 | 950 | **2** |
| 3 × niveau 3 | 453 | 726 | 3 |
| 4 × niveau 2 | 280 | 448 | 4 |

Monotone : chaque emplacement supplémentaire économise de la matière. Il n'y a pas d'optimum
caché, et c'est très bien — l'arbitrage est lisible. Au-delà de 4 instances le chemin sort du
jouable : 8 Baraquements sur les 13 emplacements du QG maximal ne laissent pas de quoi bâtir une
caserne, donc aucune troupe à produire.

*(N'invoque pas la résilience aux raids comme justification : le combat n'existe pas encore, et
la facilité à disperser dépend du découpage Natural Earth — 232 districts au Royaume-Uni contre
16 Länder en Allemagne. C'est un résidu que l'ADR 0015 laisse ouvert « à mesurer », pas un
argument acquis.)*

**D5 — Un plafond lit la somme, et la doctrine du code doit le dire.**
Le commentaire de **`totalLevelOf`** (`convex/buildings.ts:27-29`) affirme « *the measure an
output adds up over sites, where a ceiling reads only the best one* » — alors que
`resources.ts:52` calcule déjà le plafond de stockage avec `totalLevelOf`, c'est-à-dire la somme.
Le code dément son propre commentaire depuis le début. **Tranche pour la somme** et réécris ce
commentaire : un plafond s'additionne sur les sites ; ce qui lit la meilleure instance, ce sont le
plafond du QG et les portes de palier (`levelOf`). `economy.test.ts` doit couvrir le cas.

**D6 — Le porte-avions n'a qu'un seul palier.** `TIERS_BY_ROLE.carrier` passe de 2 à 1.
`chiffrage-combat.md` §1 ne donne que onze effectifs nominaux et n'en donne aucun pour un
porte-avions MK2 ; ce palier n'est donc pas codable sans inventer un nombre. Sa force est la
portée, pas la puissance (fiche 08).

**D7 — Un lot est une troupe entière.** Donc `recruitments.count` disparaît, et
`MAX_UNITS_PER_BATCH` avec lui : ils supposaient un compteur. `MAX_QUEUED_BATCHES` devient une
longueur de file **par bâtiment producteur** — note dans ton rapport qu'elle est désormais presque
inerte, le plafond de troupes mordant bien avant elle.

**D8 — `billets` s'appelle « Baraquements » en français.** « Caserne » (`barracks`) et
« Casernements » (`billets`) diffèrent d'un suffixe et font des choses sans rapport : l'un ouvre
le domaine terrestre et forme l'infanterie, l'autre ne forme rien et lève un plafond. Deux lignes
dans `src/i18n/fr.ts` — le libellé, et l'effet qui devient « relève le nombre de troupes que
l'armée peut aligner ». **La clé anglaise `billets` ne bouge pas** (ADR 0016).

## Mets à jour le chiffrage dans le même geste

`chiffrage-combat.md` §1 dit encore « 8 au départ, plafond 24, relevé de **4** par niveau de
casernements ». D2 et D4 le remplacent. **Corrige la ligne** — sinon la source de vérité des
nombres ment, et le prochain qui la lit rouvre la discussion.

C'est la **seule** valeur du chiffrage que tu as le droit de toucher. Toutes les autres —
effectifs nominaux, table de dégâts, modificateurs — restent intactes ; si l'une te paraît fausse,
signale-la et arrête-toi.

## Implémentation

1. **Troupes.** Remplace `units` par `troops` : une ligne **par troupe** — `playerId`, `role`,
   `tier`, `nominalStrength`, `currentStrength`, `stationedAt`. Pas de position libre : une troupe
   est rattachée, les mouvements viendront la déplacer plus tard.

   Les effectifs nominaux par rôle sont chiffrés dans `chiffrage-combat.md` §1 — **reprends-les
   tels quels**. Le porte-avions se compte en appareils embarqués, pas en coques.

   **`stationedAt` est `v.union(v.id('buildings'), v.null())`, et `null` veut dire « chez soi ».**
   C'est la réponse à la troupe dont le bâtiment de rattachement disparaît : elle passe à `null`,
   elle ne meurt pas — règle n°3 du projet, un joueur écrasé reste nuisible et jamais éliminé. Ne
   la rattache pas au QG par défaut : le QG n'est pas un bâtiment de projection, et la question
   « le QG peut-il être détruit » n'est pas tranchée (ADR 0015, renvoyée à `QUESTIONS.md`).

   **Pas de champ `specialization`.** L'ADR 0014 ne définit de variantes que pour l'infanterie MK1
   (médecin ou parachutiste) et renvoie les huit autres rôles à plus tard : le type serait à
   inventer. Le champ arrivera avec l'ADR recherche.

2. **Plafond de troupes.** Le nombre de troupes d'un joueur est borné par D2/D4 : troupes en
   service **plus lots en file**, sinon la file sert de dépassement. Une erreur typée.

   **Si le plafond redescend sous le nombre de troupes en service** — Baraquements détruit — on ne
   dissout rien et on ne tue personne : le joueur ne peut simplement plus recruter tant qu'il est
   au-dessus. Même règle n°3.

3. **Recrutement.** `recruitments` gagne le bâtiment producteur : une file séquentielle **par
   bâtiment de projection**, comme l'exige l'ADR 0015. La `barracks` forme le terrestre,
   l'`airfield` l'aérien, le `port` le maritime — aligne-toi sur `DOMAIN_BY_ROLE` de
   `src/domain/troops.ts`, ne redéclare pas la table.

   **La datation paresseuse reste la règle, par file** : seule la tête d'une file porte
   `finishesAt` ; les suivants n'ont pas commencé et ne sont datés nulle part. C'est ce qui rend un
   lot en attente annulable sans redater quoi que ce soit. Annulation remboursée intégralement
   pour un lot non commencé, jamais pour un lot commencé.

   Plusieurs bâtiments d'un même domaine tirent **chacun leur file** — c'est ce qui rend une
   seconde caserne utile.

   **La porte du palier 2 reste sur le QG** (`TIER_2_HQ_LEVEL`), elle ne migre pas sur le bâtiment
   de projection : la recherche vit au QG depuis l'ADR 0015. Même chose pour `chainSpeed`.

4. **Un lot achevé devient une troupe** rattachée au bâtiment producteur, avec son effectif
   nominal — pas un compteur qu'on incrémente (D7).

5. **Coûts — recrutement seulement.** Dans `constants.ts` : coût d'une troupe en `alloy` et en
   `ammunition` (l'emport initial). Plus d'acier, plus d'effectifs : ces ressources n'existent
   plus.

   **Tu ne codes ni l'entretien en nourriture ni la consommation de pétrole.** Décidé hors
   périmètre le 16/08, pour trois raisons : aucun taux d'entretien n'est chiffré (le chiffrage
   §5 donne la forme, pas le nombre), « rôles motorisés » n'est défini dans aucun fichier, et
   `economyOf` n'a aucun chemin de consommation continue — le comportement à stock nul reste à
   décider. Ça fera son propre prompt.

   **Constate dans ton rapport ce qui reste sans débouché** après celui-ci : `bandages` (les soins
   arrivent avec le combat), donc `textile` et l'`Intendance`, plus `food` et `oil` au-delà de la
   construction. Ne l'invente pas, énumère-le.

6. **Domaine et vue.** Adapte `src/domain/troops.ts` et `player-view.ts` : la `PlayerView` **porte**
   l'effectif courant et nominal de chaque troupe et son rattachement. Aucune troupe adverse ne
   transite. Libellés dans `fr.ts`.

7. **Surface 4.6 — adaptation minimale, et un mensonge assumé.** Fais compiler et fonctionner la
   production : choix du bâtiment producteur, une file par bâtiment. **La refonte visuelle attendra
   un brief.**

   La donnée porte les effectifs (point 6), **l'affichage ne s'en sert pas encore** :
   `inventoryTroops` continue d'agréger par rôle, donc l'écran dira « 3 infanteries » là où la
   vérité est « 50 / 32 / 12 soldats ». **C'est su et choisi pour ce prompt**, pas subi — la
   donnée est déjà là, seul le rendu attend son brief. Écris-le en commentaire au-dessus de
   `TroopLine`.

8. **Tests.** Une `barracks` forme une troupe ; deux lots en file, seul le premier porte
   `finishesAt` ; annuler le second rembourse intégralement ; deux casernes tiennent deux files
   indépendantes ; dépasser le plafond de troupes est refusé, file comprise ; un plafond retombé
   sous l'effectif en service n'efface aucune troupe mais bloque le recrutement ; deux Baraquements
   de niveau 1 valent un Baraquements de niveau 2 ; **un unique Baraquements au niveau maximal
   plafonne à 16 troupes** ; une troupe dont le bâtiment disparaît passe à `stationedAt: null` et
   survit.

## Critères d'acceptation

- Deux lots en file dans une `barracks` : seul le premier porte `finishesAt` ; le premier achevé
  apparaît comme troupe rattachée à cette `barracks`, à son effectif nominal.
- Deux casernes forment en parallèle, chacune avec sa propre file.
- Créer une troupe au-delà du plafond est refusé, les lots en file compris dans le décompte.
- Un `port` ne forme aucun rôle terrestre, et réciproquement.
- **Changer `TROOP_CAP_TARGET` seul suffit à déplacer le plafond** : aucun autre nombre à ajuster
  à la main, un test l'atteste.
- `levelOf` / `totalLevelOf` et leurs commentaires disent la même chose que le code qui les
  appelle.
- `chiffrage-combat.md` §1 dit la même chose que `constants.ts`.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts`.
- `npm run build` et `npm run test` passent ; **aucun terme banni nulle part, `units.ts:65`
  compris**.

## Ce que tu ne fais pas

Pas de combat, pas de soin, pas de mouvements de troupes, pas de spécialisations, pas d'entretien
ni de consommation continue, pas de troupes signature nationales, pas de refonte visuelle. Tu ne
touches pas au terrain — il est encore un factice et attend son ADR. En dehors de la ligne de
`chiffrage-combat.md` §1 nommée plus haut, les valeurs du chiffrage ne se modifient pas : si
l'une te paraît fausse, **signale-la et arrête-toi** — c'est une décision de design.
