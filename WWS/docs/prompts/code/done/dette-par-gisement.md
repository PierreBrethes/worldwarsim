# dette-par-gisement — les deux mines offertes vont l'une au fer, l'autre au charbon

Lis `CLAUDE.md`, `CONVENTIONS.md`, l'ADR 0017 §2 et sa révision du 25/08 (le socle se lit sur
les gisements), `convex/constants.ts` (`FOUNDATION_EXTRACTORS`, `FOUNDATION_ORDER`,
`foundationFor`), `convex/regions.ts` (`homeDepositsOf`, `foundationOf`, `foundationOwed`),
`convex/constructions.ts` (`owedFreely`), `convex/sites.ts` (`takenAtHome`), `convex/view.ts`
(ligne ~418, `foundation` servi), `src/domain/player-view.ts` (`me.foundation`),
`src/domain/next-actions.ts` (`foundationLine`), `src/routes/-plateau/FoundationRows.tsx`,
`src/domain/world.ts` (`depositOfRegion`). Ne commit pas, ne push pas. Un chantier, un commit.

## Ce qui s'est passé en prod

Une nation qui a du fer et du charbon se voit devoir deux mines. La dette se compte **par clé**
(`foundationOwed` retire une `'mine'` par mine debout, `takenAtHome` de même) : deux mines
posées sur deux régions de charbon consomment les deux dettes, et le fer se paie ensuite au prix
fort — 500 d'alliage au départ, le joueur est coincé sur la ressource qui fait tout le reste.

## La règle

**Une dette de socle est un couple (bâtiment, gisement)**, pas une clé. La mine offerte pour le
fer ne se consomme que par une mine posée sur une région de fer ; celle du charbon, sur une
région de charbon. Ferme, filature et puits ne changent pas de sens — une seule ressource
chacun — mais passent par la même forme pour qu'il n'y ait qu'une règle.

## Ce qui change

1. **La forme de la dette.** `foundationFor` rend `ReadonlyArray<{ key: BuildingKey; deposit:
   DepositKey }>` dans l'ordre de `FOUNDATION_ORDER` ; `foundationOf` suit. `foundationOwed(nation,
   standing)` prend `standing: ReadonlyArray<{ key: BuildingKey; deposit: DepositKey | null }>`
   (le gisement de la région du bâtiment, `depositOfRegion(building.regionId)`), et ne retire
   une dette que sur **clé et gisement égaux**. Une mine debout sur une région sans gisement ne
   retire rien. Tests dans `convex/regions.test.ts` (ou là où `foundationOwed` est déjà testé) :
   deux mines sur charbon → la mine de fer reste due ; une mine sur charbon, une sur fer → rien
   de dû.
2. **La pose gratuite lit le gisement.** `owedFreely` (`constructions.ts`) : la pose de `key`
   sur `regionId` est offerte si la dette contient `{ key, deposit: depositOfRegion(regionId) }`.
   Test dans `constructions.test.ts` : la seconde mine sur charbon d'une nation fer+charbon est
   **facturée** (prix et durée normaux), la mine sur fer est offerte.
3. **L'exemption d'emplacement suit.** `takenAtHome` (`sites.ts`) compte par couple, avec le
   même `depositOfRegion` : une seconde mine sur charbon mange un emplacement. Test.
4. **La vue dit le gisement.** `me.foundation` devient `ReadonlyArray<{ key; deposit }>` ;
   `FoundationRows` affiche « mine — fer », « mine — charbon » (libellés dans `fr`, réutilise les
   noms de ressources existants) ; `foundationLine` (`next-actions.ts`) compte les entrées comme
   avant. Le fantôme de pose sur la carte, s'il lit `me.foundation` pour savoir si la pose est
   offerte, lit le couple et le gisement de la région visée — vérifie `plateau.tsx` ligne ~800.
5. **La feuille de simulation d'ouverture** (`WWS/simulation/opening/`, si elle lit
   `foundationFor`) suit la nouvelle forme ; `verify.mjs` reste vert.

## Ce que ce prompt ne fait pas

Pas de changement au nombre de dettes ni à leur ordre, pas de QG dans le socle (prompt
`qg-pose-par-le-joueur`, après celui-ci), pas de migration : la dette se recalcule à chaque
lecture depuis les bâtiments debout.

## Rapport attendu

Les tests ajoutés ; ce que `takenAtHome` comptait de faux avant (un exemple chiffré) ; le
`verifier` vert.
