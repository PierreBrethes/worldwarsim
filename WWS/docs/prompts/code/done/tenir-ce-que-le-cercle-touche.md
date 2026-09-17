# tenir-ce-que-le-cercle-touche — une région qu'une cellule du disque touche est tenue (révision ADR 0020 §1)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0020 §1 (et sa précision du 04/09), §3,
§6, §7, l'ADR 0023 (la géographie serveur est un raster), `src/domain/control.ts`
(`heldRegions`, `nearestHolder` — **la règle à réviser**), `convex/holding.ts` (`heldOver`, la
lecture unique de la couleur, quatre lecteurs), `convex/view.ts` (`coveredRegions` — ce que la
vue sert pour bâtir), `convex/regionGeometry.ts` et `src/domain/region-raster.ts` (`cellsOfRegion`,
`regionAtCell`, `cellAt`, le décodage paresseux), `src/domain/routing.ts` (`KM_PER_UNIT`, la
conversion cellule ↔ lon/lat), `convex/view-budget.test.ts`, `convex/control.test.ts`. Ne commit
pas, ne push pas. Un chantier, un commit.

> **Décision de Pierre, 17/09 — révision de l'ADR 0020 §1, à signaler dans l'ADR** : « quand on
> pose un avant-poste, toute région qui a un bout dans son cercle est tenue ». La règle du pôle
> (une région est tenue si son *point* tombe dans le rayon) est remplacée. Mesuré avant la
> décision : hors d'Europe, le pôle du voisin est à plus de 120 km dans 969 régions sur 4 589
> (Brésil 25/27, États-Unis 43/51, Canada 13/13) — le rayon ne tenait rien au-delà de la région
> du point, quel que soit le niveau. §3 (« on compte des régions ») **tient** ; le découpage
> des géantes à la cuisson reste au Registre 31 pour le prochain wipe.

## La règle

Une région est **tenue** par un avant-poste debout si **au moins une de ses cellules** (le
raster de l'ADR 0023, `region-grid.json`) est à moins de `outpostReachKm(level)` du point — la
région où le point se tient l'est donc toujours (sa cellule est à distance nulle), ce qui
absorbe la précision du 04/09 sans seconde branche. **Le sol national l'emporte toujours**
(inchangé). **Litige** entre deux points adverses qui touchent la même région : elle revient à
celui dont le point est **le plus proche de la cellule la plus proche** de la région ; à égalité
au kilomètre, personne (inchangé dans l'esprit, la distance change d'objet). Un point hors
service ne concourt pas (§7, inchangé). « Là où je peux bâtir est là où je tiens » (§1) : la
vue sert les mêmes régions pour bâtir (`coveredRegions`) — une seule fonction, pas deux.

## Ce qui change

1. **Domaine pur** : `coveredByDisc(raster, point, reachKm) → ReadonlyMap<regionId, kmToNearestCell>`
   dans `region-raster.ts` — parcours des seules cellules de la **boîte englobante** du disque
   (jamais les 1,33 M), distance au centre de cellule, une entrée par région touchée avec la
   distance minimale. `heldRegions` prend désormais, pour chaque point, cette carte au lieu du
   couple (rayon, pôle) ; `nearestHolder` compare les `kmToNearestCell`. Les régions **sans
   cellule** (971 plus petites qu'une cellule, ancrées) sont touchées si leur cellule d'ancrage
   l'est — `cellsOfRegion` la rend déjà.
2. **Serveur** : `holding.ts` calcule la couverture de chaque point via `regionGeometry.ts`
   (raster décodé une fois par isolat). **Mémo** par `(lon, lat, level)` au niveau du module :
   la couverture d'un point ne change qu'à l'élévation. Aucun champ nouveau, aucune migration,
   aucun wipe : la couleur est recalculée, pas stockée.
3. **Vue** : `coveredRegions` (`view.ts`) lit la même fonction — le joueur peut bâtir sur toute
   région tenue par le disque ; la hachure (`control.held` suspendu) suit d'elle-même.
4. **Budget** : `view-budget.test.ts` — la vue et le classement (4 589 régions) ne doivent pas
   payer un parcours de cellules par région ; c'est par *point* (quelques centaines de cellules
   à 240 km) et mémoïsé. Mesure le temps de `heldOver` sur 8 points de niveau 3 avant/après.
5. **Docs** : ADR 0020 §1 — bannière « Révision du 17/09/2026 : tenu par le disque, plus par le
   pôle », la précision du 04/09 marquée absorbée ; §3 — la phrase « une en Sibérie » devient
   « deux ou trois en Sibérie, et c'est toujours moins qu'au Benelux » ; `CONTEXT.md`
   (avant-poste) ; fiche `?` ; `CLAUDE.md` si la règle y est citée. Cas accepté, écrit dans l'ADR :
   un point posé en lisière tient les géantes qu'il touche (Ontario + Québec depuis Gatineau).

## Cas d'acceptation (tests d'abord — `control.test.ts` sur le raster réel)

1. Point niveau 1 à Gatineau (−75,7 ; 45,5) : Québec **et** Ontario tenus ; au pôle, seul le
   Québec l'était (test de non-régression inversé, commenté).
2. Point niveau 1 à la triple frontière RS / SC / PR (−51,5 ; −26,2) : trois régions tenues.
3. Point niveau 1 à Paris : le même nombre de régions qu'avant ± 2 (la règle ne doit pas
   exploser l'Europe — mesure et écris le chiffre).
4. Litige : deux points adverses de niveau 1 touchant la même région, l'un à 30 km de sa cellule
   la plus proche, l'autre à 90 : le premier la tient ; à égalité, personne.
5. Sol national : un point adverse touchant une région française ne la tient pas.
6. Point désactivé : ses régions retombent au voisin qui les touche, adverse compris (§7).
7. Une région plus petite qu'une cellule (Malte) est tenue quand sa cellule d'ancrage l'est.
8. `coveredRegions` (vue) et `heldOver` (classement) répondent la même chose pour un joueur.
9. Budget : `heldOver` sur une saison à 8 joueurs × 5 points ≤ 2 × le temps d'avant ; le mémo
   fait que le second appel est ~gratuit.
10. Vérifieur vert.

## Hors périmètre

Le découpage des géantes (Registre 31, au wipe). La phrase « centre à N km » (inutile : le
disque devient vrai). La portée de détection (ADR 0021, un autre objet).
