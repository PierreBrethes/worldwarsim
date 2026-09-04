# retours-japon-lot-2 — le port au QG 2, les unités par niveau de site, l'invariant de la première projection

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, puis `WWS/CONTEXT.md` pour le vocabulaire
imposé. Ne commit pas, ne push pas. Suppose `retours-japon-lot-1` livré (indépendant, mais un
seul chantier code à la fois).

Décisions de Pierre du 04/09 : **66a**, **67b**. Gravées dans l'ADR 0015 (révision du 04/09) et
dans `plan-progression-v1.md` — lis les deux paragraphes avant de coder, ils disent le pourquoi.

## Le constat (pour les commentaires, pas à recopier)

Facture minimale « une infanterie à bord d'un cargo » depuis Tokyo : fonderie 50 + QG 2 (108) +
caserne 40 + **QG 3 (194)** + port 65 + cargo 120 = 577 alliage pour 500 de dotation. La France
marche à QG 2 pour 198. Le mur est `UNLOCKED_AT.port = 3`, pas le prix du cargo. Après 66a :
383.

## 1. Le port et l'aérodrome descendent au QG 2 (`convex/constants.ts`, `UNLOCKED_AT`)

`airfield: 2`, `port: 2`. Réécris le commentaire de `UNLOCKED_AT` : « la projection au QG 3 »
n'est plus vrai — l'âge de l'armée inclut la mer et l'air, parce qu'une île n'a pas d'autre
sortie (66a, 04/09). Le miroir du simulateur (`WWS/simulation/opening/constants.mjs`) suit ;
`node WWS/simulation/opening/verify.mjs` doit rester sans dérive.

## 2. Les rôles se forment à un niveau de site (67b)

Nouvelle table exhaustive par rôle, à côté de `COST_BY_ROLE` :

```ts
/** Le niveau du bâtiment de projection qui forme le rôle (67b, 04/09). Une largeur par site,
 *  à ne pas confondre avec `roleHqLevel` (profondeur, QG) : cappedByHq borne un site à son QG,
 *  donc caserne 3 ⇒ QG 3, et le blindé garde son contre (inf. MK2 au QG 2) devant lui. */
export const ROLE_SITE_LEVEL: Readonly<Record<UnitRole, number>> = {
  infantry: 1, landTransport: 2, armor: 3,
  cargo: 1, escort: 2, carrier: 5,
  fighter: 1, airTransport: 2, bomber: 3,
};
```

- `convex/troops.ts` : le recrutement refuse si le site qui forme est sous ce niveau — nouveau
  code `SITE_LEVEL_LOCKED` (`convex/errors.ts`, `fr.errors` : « ce rôle demande une caserne de
  niveau 3 » — le nom du bâtiment vient de `producedBy`, la grammaire de `ROLE_LOCKED`).
  `roleHqLevel` reste tel quel : c'est l'autre verrou, et le test ci-dessous tient les deux
  ensemble.
- `workshop` sert `unlockedAtSiteLevel` à côté de `unlockedAtHqLevel`, pour l'abaque
  (contrat 06 : la condition en toutes lettres devient « se forme dans une caserne de niveau
  3 ») et pour la modale de site.
- Modale de site (contrat 03) : la carte d'un rôle au-dessus du niveau du site **reste
  affichée** (rien de caché ne se débloque — 60b), sans bouton, avec la condition dite —
  jamais grisée. Le porte-avions à « port de niveau 5 » se lit sur un port 1.
- Le niveau **maximal** d'un site reste `MAX_HQ_LEVEL` : le porte-avions au port 5 arrive au
  QG 5, comme le plan le veut.

## 3. L'invariant de la première projection (question 51, « le jour où l'on touche constants »)

Un test dans `convex/economy.test.ts` (ou un fichier `invariants.test.ts` si tu préfères — un
seul endroit) qui **lit les constantes, ne les recopie pas** :

1. la facture par voie de mer (`foundry` + QG 1→`unlockLevel('port')` + `barracks` + `port` +
   `cargo` MK1, tous au niveau 1 sauf le QG) tient dans `STARTING_ALLOY` ;
2. la facture par voie de terre (`foundry` + QG 1→`unlockLevel('barracks')` + `barracks`) aussi ;
3. le blindé n'arrive jamais avant son contre : `ROLE_SITE_LEVEL.armor >= TIER_2_HQ_LEVEL`
   (via cappedByHq) **et** `roleHqLevel('armor') >= TIER_2_HQ_LEVEL` ;
4. `ROLE_SITE_LEVEL[role] <= MAX_HQ_LEVEL` pour tout rôle — un rôle au niveau 6 serait caché.

Mesure et **écris dans le rapport** (pas dans un test) la même facture en charbon contre
`STARTING_STOCK.coal` + N heures de mine : si elle ne tient pas sous 24 h, dis-le, ne corrige
rien.

## Cas d'acceptation

1. Étant donné un QG 2, le port et l'aérodrome se posent (placementOf ne les retient plus) ;
   à QG 1 ils se lisent avec leur condition, comme aujourd'hui.
2. Étant donné une caserne 1, enfiler un transport terrestre échoue en `SITE_LEVEL_LOCKED`
   avec la phrase « … une caserne de niveau 2 » ; la caserne passée au 2, il s'enfile.
3. Étant donné un port 1, la carte du porte-avions s'affiche dans la modale avec « se forme
   dans un port de niveau 5 », sans bouton, sans grisé ; l'abaque plié dit la même chose.
4. Étant donné un QG 2 et une caserne 2 (plafonnée), le blindé MK1 reste refusé (site 3) ;
   l'infanterie MK2 s'enfile — le contre précède l'arme.
5. Les quatre invariants passent ; `verify.mjs` sans dérive ; `npm run verifier` vert.

Un commit, dont le message décrit le chantier entier (66a, 67b, invariants).
