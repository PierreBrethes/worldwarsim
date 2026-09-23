# 56-fixtures-communes — le montage des tests convex vit dans une fixture, et deux suites l'emploient déjà

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 05.

**À lire :** `convex/seats.fixture.ts` (en-tête : pourquoi deux points dans le nom ; ses exports),
`convex/test.setup.ts` (`modules`, par `import.meta.glob`), `convex/tsconfig.json` (`exclude` ~30
et son commentaire), `convex/messages.test.ts` (~20-38 : `boot`, `MIDDAY`, `lobby`, `launched`),
`convex/surrender.test.ts` (~19-41 : `boot`, `MARNE`, `PRAHOVA`, `MIDDAY`, `NATIONS`,
`launchedSeason` à n joueurs). Variantes : `plunder.test.ts` ~29 (QG posés), `movements.test.ts`
~66-97 (QG, puis `disbandTheGift`), `objectives.test.ts` ~54 (nations). `convex/invariants.test.ts`
~147-170 : le budget d'import lit tout `.ts` non-test, fixtures comprises.

## Pourquoi

Chaque suite convex réécrit son montage : `const boot = () => convexTest(schema, modules)` à
l'identique dans 22 fichiers ; `launchedSeason` dans 18 fichiers, en 13 corps distincts (deux
sièges France/URSS et le lancement, puis au choix les QG, la dotation retirée, n joueurs, des
nations, des pseudos, une durée) ; `MIDDAY` dans 14 fichiers, sur 5 dates, un seul en `Date.UTC`
(`production.test.ts` ~60), la cause de 05. Au niveau du module, `MARNE = 'FRA-5323'` ×15,
`PRAHOVA = 'ROU-310'` ×11, `RUHR = 'DEU-1572'` ×4, `PSKOV = 'RUS-2335'` ×3 ; `disbandTheGift` ×6.
Avec 22 appelants, « on remonte au deuxième appelant » est acquis depuis longtemps.

## Ce qui change

1. `convex/scenario.fixture.ts` (à créer), nommé comme `seats.fixture.ts` : deux points dans le
   nom, ni le bundler Convex ni vitest ne le ramassent. **Son en-tête dit que les suites
   existantes y migrent à leur prochaine retouche, chacune dans un commit de rangement, jamais en
   masse.** Il exporte :
   - `boot()`, `HOUR = 3_600_000`, et `MIDDAY = Date.UTC(2026, 7, 17, 12)` : un nombre, à la date
     de 10 des 14 fichiers ; le commentaire dit pourquoi midi UTC (hors de la plage de repos) ;
   - `MARNE` (sol français, nourriture), `PRAHOVA` (Roumanie, pétrole, sol de personne), `RUHR`
     (Rhénanie-du-Nord-Westphalie, charbon), `PSKOV` (sol soviétique, sans gisement) : le
     commentaire dit un fait sur la région, pas le rôle qu'une suite lui donne ;
   - `launchedSeason(t, { nations?, hq?, durationHours?, nicknames? })` : fonder, faire rejoindre,
     réserver, déclarer prêt, lancer, dans l'ordre des suites actuelles. Par défaut
     `['france', 'ussr']`, 48 h, et les pseudos « Pierre », « Léa », puis `Joueur N` (N le rang)
     au-delà. `hq: true` pose le QG de chaque siège par `placeHq`, après le lancement. Les sièges
     reviennent **en tuple typé, dans l'ordre des nations** (paramètre de type `const`) :
     `const [seat, guest] = await launchedSeason(t)` ;
   - `disbandTheGift(t, ...seats)`, la forme variadique de `movements.test.ts` ~86, par `seatIn`.
2. `convex/tsconfig.json` : `"./**/*.fixture.ts"` rejoint l'`exclude`, et le commentaire gagne
   une phrase (une fixture est du code de test, elle importe `test.setup.ts`). Sinon le projet que
   `convex deploy` type, et `npm run types` depuis 12, ramasse la fixture et casse sur
   `test.setup.ts` : `TS2339: Property 'glob' does not exist on type 'ImportMeta'` (vérifié à la
   relecture). La racine continue de typer les fixtures.
3. `convex/scenario.fixture.test.ts` (à créer), **écrit d'abord** : sans option, deux sièges
   France et URSS lancés, sans QG ; `hq: true` pose un QG par siège ; trois nations donnent trois
   sièges dans l'ordre, aux pseudos distincts ; `windowExit(MIDDAY, DEFAULT_REST_WINDOW)`
   (`../src/domain/rest-window`, `./constants`) vaut `null` ; `regionFacts` (`./regions`) donne
   aux quatre régions le pays et le gisement annoncés (`null` pour `PSKOV`).
4. Deux suites migrent en exemple, les deux plus petites qui emploient la date commune :
   - `convex/messages.test.ts` (165 lignes) : `boot`, `MIDDAY` (`MIDDAY.getTime()` devient
     `MIDDAY`, trois lignes), et `launched(t, 'Pierre', 'Léa')` devient `launchedSeason(t)`, donc
     `const { seat, guest } =` devient `const [seat, guest] =`. `lobby` reste local ;
   - `convex/surrender.test.ts` (267 lignes) : `boot`, `MARNE`, `PRAHOVA`, `MIDDAY` ;
     `launchedSeason(t, n)` devient `launchedSeason(t, { nations: [...] })`, nations écrites à
     l'appel, et `NATIONS` disparaît. Les pseudos `Joueur 1`… deviennent « Léa »… : aucun test ne
     les lit. (`founder-absence.test.ts`, plus petit, date son horloge du 06/09 : il reste.)
5. Si le budget d'import (~147) refuse la fixture, exclus `*.fixture.ts` de son filtre, avec une
   ligne de pourquoi : un fichier à deux points n'est jamais déployé.

## Ce que ce prompt ne fait pas

- Aucune autre suite ne migre, pas même celles de 53 et 54 ; `movements.test.ts` et
  `economy.test.ts` migrent au découpage (74). `seats.fixture.ts` n'est pas modifié.
- Les recopies propres à un domaine (`playerOf` ×11, `raise`, `form`, `post`, `plant`) restent.
- Rangement pur : aucune assertion ne change de sens.

## Cas d'acceptation (tests d'abord)

1. `npx vitest run convex/scenario.fixture.test.ts` échoue avant la fixture et passe après.
2. `npx vitest run convex/messages.test.ts convex/surrender.test.ts` : autant de tests qu'avant.
3. `git grep -nE "convexTest\(|const (MIDDAY|MARNE|PRAHOVA|NATIONS) =|function (launchedSeason|launched)\(" -- convex/messages.test.ts convex/surrender.test.ts`
   ne rend rien (avant : 9 lignes ; pas de `\b`, que le `git grep -E` du Mac ignore).
4. `npx tsc --noEmit -p convex/tsconfig.json` : vert ; rouge (TS2339 sur `test.setup.ts`) si
   l'on retire temporairement la ligne d'`exclude` du point 2.
5. `TZ=Asia/Tokyo npx vitest run convex/messages.test.ts convex/surrender.test.ts convex/scenario.fixture.test.ts` : vert.

## Vérifications

Cas 1 à 5, `npx vitest run convex/invariants.test.ts`, puis `npm run verifier` : tout vert.

## Rapport attendu

Format commun (README de la série), plus : le nombre de tests des deux suites avant et après, le
`git diff --stat` ; la signature finale de `launchedSeason` ; parmi les 17 définitions non migrées,
celles que la fixture couvre telles quelles et les autres (par exemple `economy.test.ts` ~98, qui
rend un seul siège) ; si l'exclusion du point 5 a été nécessaire.
