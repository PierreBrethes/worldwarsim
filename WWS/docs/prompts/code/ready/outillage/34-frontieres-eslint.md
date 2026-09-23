# 34-frontieres-eslint — Les frontières de CONVENTIONS sont des règles eslint, et un avertissement fait échouer `npm run lint`

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 13.

**À lire :** `eslint.config.js` (entier), `package.json` (`lint` ~12, tel que 13 l'a laissé),
`CONVENTIONS.md` §6 (~103), §7 (~112), §10 (~144), §11 (~153), `src/domain/world.ts` (chargeurs
~76, ~94, ~160 ; `regionType` ~130), `src/domain/ids.ts` ~4, `src/domain/nations.ts` ~1-4,
`convex/constants.ts` (~27, ~250-254, ~360), `convex/movements.ts` ~63.

## Pourquoi
Sept frontières ne tiennent que par la relecture : domaine sans React, three, backend ni client ;
moteur sans React ; three hors du moteur ; `convex/` sans rien du client ; `regionType` lu par la
seule carte ; pas de ré-export ; pas de `throw new Error` côté serveur. `lint` tourne sans
`--max-warnings`, pour 0 avertissement aujourd'hui. À la rédaction, la configuration ci-dessous
rend **12 violations**, de rangement : l'alias `@/` sur 6 lignes du domaine (`compass-rose`,
`labels` ×2, `next-actions`, `resource-band`, `station-name`, toutes ~1-2) quand le bundler
Convex exige le relatif (`ids.ts` ~4) ; 5 ré-exports (`nations.ts` ~3-4, `convex/constants.ts` ~27
et ~254, `movements.ts` ~63) ; un `throw new Error` (`constants.ts` ~362).

## Ce qui change
1. **Piège vérifié.** Une règle restrictive n'a qu'une configuration par fichier : de deux blocs
   qui visent le même fichier, le dernier remplace **toute** celle du premier (un bloc
   anti-ré-export posé après le bloc serveur y efface l'interdiction de `throw new Error`). Donc un
   bloc par ensemble de fichiers, le plus précis en dernier, qui reprend les motifs du bloc qu'il
   écrase ; les listes partagées sont des constantes en tête de `eslint.config.js`. Les motifs
   d'import suivent gitignore, **sans accolades** : `**/{data,map}/**` ne bloque rien (vérifié).
   a. `src/**/*.{ts,tsx}` sauf `src/map/engine/**` : `three`, `three/*` (« CONVENTIONS §10 »).
   b. `src/map/engine/**/*.ts` : `react`, `react/*`, `react-dom`, `react-dom/*` (§10).
   c. Après a, `src/domain/**/*.ts` sauf `**/*.test.ts`, un groupe au message « CONVENTIONS §7 » :
      les motifs de a et b, `convex`, `convex/*`, `**/convex/**`, `@/*`, `**/data/**` et de même
      `map`, `routes`, `shell`, `emblems` ; `importNames: ['regionType']` de `**/world`
      (« regionType est décoratif : aucune règle de jeu ne le lit sans ADR ») ; `no-restricted-globals` sur `fetch`,
      `window`, `document`, `localStorage` (§7).
   d. `src/domain/world.ts` seul : `no-restricted-globals` sans `fetch`, et le pourquoi en
      commentaire (trois chargeurs d'asset statique).
   e. `src/**/*.{ts,tsx}` et `convex/**/*.ts` sauf `src/map/engine/index.ts` (l'exception du §6) :
      `no-restricted-syntax` sur `ExportAllDeclaration` et `ExportNamedDeclaration[source]` (§6).
   f. Après e, `convex/**/*.ts` sauf `**/*.test.ts` et `**/*.fixture.ts` : les motifs de b,
      `**/src/map/**` et de même `routes`, `shell`, `data`, `emblems` (« le serveur n'importe rien
      du client »), `regionType` ; `no-restricted-syntax` = les sélecteurs de e, plus
      `ThrowStatement > NewExpression[callee.name='Error']` et sa forme sans `new` (« fail(code),
      CONVENTIONS §11 »).
2. **Décision : l'alias est refusé sans exception dans le domaine, `@/i18n/fr` compris.**
   L'exception que le §7 accorde à `fr.ts` porte sur le module, pas sur le chemin (`journal.ts` ~2
   importe déjà `../i18n/fr`). Le 12 annonçait une exception pour `@/i18n/fr` : cette phrase-là
   cède. Les 6 lignes passent en relatif.
3. **Décision : les ré-exports sont supprimés**, sans liste blanche. Chaque lecteur pointe le
   fichier réel. `NATIONS` de `nations.ts` est lu par `src/routes/salon.tsx` ~8, `nations.test.ts`
   ~3 et `src/i18n/countries.test.ts` ~3, et `type Nation` par `src/emblems/Flag.tsx` ~9.
   `NATIONS` de `constants.ts` est lu par `convex/players.ts` ~4 et `off-season.test.ts` ~7-16,
   `settlesDebt` par `constructions.ts` ~12-24, `regions.ts` ~4 et `sites.ts` ~6, et `restHold`
   par `convex/view.ts` ~47. `src/map/engine/index.ts` (~48, ~55) garde ses deux `export type … from`.
4. `convex/constants.ts` ~362 : `// eslint-disable-next-line no-restricted-syntax -- <pourquoi>`
   (une table incomplète est une faute de programme, pas un refus de joueur : aucun `ErrorCode`).
5. `package.json`, `lint` : `--max-warnings 0` à la fin, drapeaux de 13 intacts.

## Ce que ce prompt ne fait pas
- Le test de `roleOf` (35), les règles du React Compiler (36), knip (37), les cycles (38). Aucun
  lint typé : le cache de 13 (`--cache-strategy content`) suppose qu'aucune règle ne l'est. Les
  chargeurs de `world.ts` restent au domaine. `CONVENTIONS.md` et `CLAUDE.md` ne bougent pas : leurs garde-fous, c'est 68.

## Cas d'acceptation (tests d'abord)
Sondes sans fichier : `printf '%s\n' '<ligne>' | npx eslint --stdin --stdin-filename <chemin>`.
Le chemin, même inexistant, choisit les blocs : rien à créer, rien à annuler.
1. Avant tout changement : `npm run lint` vert, 0 avertissement ; noter la durée.
2. Règles posées, rangement non fait : `npm run lint` rouge, exactement les 12 violations. Ni
   `world.ts` (`fetch`) ni le `window` local d'`interception.ts` ~307 ou `rest-window.ts` ~3.
3. Une sonde par règle, dont l'erreur cite le message attendu : `src/domain/zz.ts` avec `react`
   (§7), `@/i18n/fr`, `import { regionType } from './world'`, `localStorage.clear()` ;
   `src/domain/world.ts` avec `fetch('x'); export const t = document.title;` (seul `document`) ;
   `src/map/engine/zz.ts` avec `react` ; `src/routes/zz.tsx` avec `three`, puis
   `export * from './x'` ; `convex/zz.ts` avec `../src/emblems/Flag`, `export { a } from './b'`,
   `throw new Error('x')`. Muettes : `convex/zz.test.ts` avec l'import de `Flag` et le `throw` (le
   ré-export, lui, y tombe encore) ; `src/map/engine/index.ts` avec `export type { X } from './x'`.
4. `npx eslint --max-warnings 0 --stdin --stdin-filename src/zz.ts` sort en 1 sur `const inutile = 1;`.
5. Après : `npm run lint` vert ; `git grep -n "from '@/" -- 'src/domain/*.ts' ':!*.test.ts'` vide ;
   `git grep -nE "^export (\*|(type )?\{[^}]*\}) from" -- src convex` ne rend que le moteur.

## Vérifications
- `npm run types` ; `npx vitest run src/domain/nations.test.ts src/i18n/countries.test.ts convex/off-season.test.ts`.
- `npm run verifier` vert (le miroir lit `convex/constants.ts` comme du texte).

## Rapport attendu
Format commun (README de la série), plus :
- les 12 violations du cas 2, verbatim, et une ligne par sonde du cas 3 ;
- `npm run lint` à froid (`rm -rf node_modules/.cache/wws/eslint`), avant et après ;
- en « À trancher » : `src/i18n/` interdit à `convex/` (§11, aucun import aujourd'hui) ; les
  `export type { X };` d'un nom importé, que `[source]` ne voit pas (8 cas, dont
  `convex/buildings.ts` ~15, `convex/constants.ts` ~253, `src/domain/player-view.ts` ~17).
