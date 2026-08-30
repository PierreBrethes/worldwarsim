# Prompt Claude Code — petit ménage (tidy first, zéro comportement)

Lis `CLAUDE.md`, `CONVENTIONS.md`. Ne commit pas, ne push pas.

## Pourquoi

Trois restes vus lors du découpage de `movements.ts` (26/08) et jamais repris. Aucun ne change
le jeu : c'est un commit de rangement, à garder séparé de tout changement de comportement.
Si un point te fait toucher une règle, arrête-toi et dis-le.

## Ce qui change

**1. `pointOf` porte deux sens contraires.**
- `convex/movement/forces.ts:61` — `pointOf({lon,lat}) → LonLat`, et juste dessous
  `asPoint(LonLat) → {lon,lat}`.
- `convex/combat.ts:214` — `pointOf(LonLat) → {lon,lat}` : c'est `asPoint` sous un nom qui
  contredit celui de `forces`.

Supprime `combat.pointOf`, importe `asPoint` depuis `./movement/forces` dans `combat.ts` — sauf
si ça crée un cycle (`forces` importe déjà `troopsStationedAt` depuis `combat`). Dans ce cas,
déplace la paire `pointOf`/`asPoint` dans un module feuille sans import (`convex/movement/geo.ts`
ou à côté de `LonLat`), et fais pointer `forces`, `combat`, `constructions`, `arrival` dessus.
Un seul nom par sens dans tout `convex/`. Vérifie qu'aucun autre fichier ne redéfinit la
conversion à la main (`{ lon: p[0], lat: p[1] }`).

**2. `march()` accepte `'recall'` que personne n'ordonne plus.** `convex/movement/orders.ts:248`
— `type: 'march' | 'attack' | 'raid' | 'recall'`. Le rappel n'est plus une commande (ADR 0019 §1) ;
seuls `marchTo`, `attack`, `raid` appellent `march()`. Retire `'recall'` de l'union du paramètre
et toute branche qui n'existait que pour lui dans `march()`. **Ne touche pas** au littéral
`'recall'` de `MOVEMENT_TYPE` (`validators.ts`) ni aux branches d'arrivée (`arrival.ts`,
`movements.ts:320`) : un rappel encore en vol doit atterrir, c'est la même tolérance que `decoy`.

**3. `DETECTOR` et les quatre détecteurs — ne touche à rien.** C'est un sujet de design en
cours (retrait de l'écoute et du relais à trancher), pas du ménage.

## Vérifications

`npm run verifier`. Diff hors imports/commentaires : aucune ligne de logique ajoutée ; les tests
existants (`movements.test.ts`, `combat`, `detection.test.ts`) passent sans modification —
s'il faut modifier un test, c'est que le comportement a bougé.
