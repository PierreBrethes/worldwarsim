# stockage-unique — entrepôt et dépôt fusionnés en un bâtiment de stockage, posé, pillable

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0015 et l'ADR 0017 (écrêtage à la
perte de stockage), `propositions/pillage-et-butin.md` (§ « le point qui se contredit »,
sortie **b** retenue le 31/08), `convex/constants.ts` (`BASE_CAP`, `STORAGE_CAP_PER_LEVEL`,
`BUILDING_SPEC.warehouse/depot`, `UNLOCKED_AT`), `src/domain/economy.ts` (`STORED_BY`,
`clipToCapacity`), `convex/resources.ts` (`storageCaps`), `src/emblems/buildings/manifest.ts`,
`WWS/sprites/buildings/warehouse.png`. Ne commit pas, ne push pas. Un chantier, un commit.
**Petit, à donner avant `pillage-et-butin`** — le pillage a besoin d'une cible de stock.

## La règle

**Un seul bâtiment de stockage**, `warehouse` (« entrepôt »), qui relève le plafond de **toutes**
les ressources de `STORAGE_CAP_PER_LEVEL` par niveau. `depot` disparaît. Il se pose sur toute
région tenue, comme aujourd'hui, et il sera **la** cible de stock du pillage (prompt suivant).

## Ce qui change

1. `STORED_BY` devient une liste (`STORED_RESOURCES = RESOURCES`), `storageCaps` somme les
   niveaux d'entrepôts seuls. `BUILDING_SPEC.depot`, `UNLOCKED_AT.depot`, le sprite, la
   vignette, les clés `fr` du dépôt sont retirés ; **le littéral `depot` reste dans les
   validateurs en legacy, jamais réécrit, jusqu'au wipe** (leçon du 27/08 — comme `decoy`), et
   un dépôt existant en base est **lu comme un entrepôt** (`storageCaps` le compte) tant que le
   wipe n'a pas eu lieu : aucune saison en cours ne perd de plafond.
2. Le commentaire de `constants.ts:66` (« the warehouse and the depot become necessary — and
   therefore targets ») est réécrit au singulier, avec la référence à la proposition.
3. `clipToCapacity` (ADR 0017) est inchangé — c'est lui qui fera « le dépôt qui explose » quand un
   entrepôt sera désactivé par un pillage.
4. Rose, catalogue de construction, Économie (recensement, filière) : une entrée de moins,
   aucune section vide qui reste. Le simulateur d'ouverting (`constants.mjs`, `verify.mjs`) suit :
   le miroir compare du texte, il doit rester vert.

## Cas d'acceptation (tests d'abord)

1. Un entrepôt niveau 1 relève le plafond de **pétrole et munitions** aussi (test sur les huit).
2. `placementRefusal` n'offre plus `depot` ; la rose ne le propose pas ; le serveur le refuse
   (`UNKNOWN_BUILDING` ou l'erreur existante).
3. Un document `buildings` avec `key: 'depot'` (fixture) est compté par `storageCaps` comme un
   entrepôt du même niveau.
4. `verify.mjs` vert ; `a-mesurer.md` inchangé (aucune constante nouvelle).

`npm run verifier` vert. `CLAUDE.md`, `WWS/CONTEXT.md` (dépôt retiré du vocabulaire, entrepôt
défini), fiche 02 (une note datée), `RESTE-A-CODER.md` (9 livré).
