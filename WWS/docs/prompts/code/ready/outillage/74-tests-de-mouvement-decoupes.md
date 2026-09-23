# 74-tests-de-mouvement-decoupes — les deux suites qui fixaient la durée des tests sont découpées par thème

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 56.

**À lire :** `convex/movements.test.ts` (~1-317 : imports, constantes, helpers ; puis 24
`describe` de premier niveau, de ~318 à ~3518), `convex/economy.test.ts` (~1-180 : helpers, dont
`launchedWithoutHq` ~74 et `launchedSeason` ~98 ; puis 16 `describe` de premier niveau, de ~181 à
~2300), `convex/scenario.fixture.ts` (créé par 56), `convex/tsconfig.json` (`exclude` : les
`*.fixture.ts` depuis 56), `convex/invariants.test.ts` (~147 : le budget d'import lit les fixtures).

## Pourquoi

Vitest parallélise par fichier, et deux fichiers fixent la durée murale de la suite :
`movements.test.ts` (110 tests, 3 730 lignes, 12,4 s dans la suite complète) et
`economy.test.ts` (96 tests, 2 482 lignes, 9,5 s). Sans eux, les 77 autres fichiers tiennent en
13,3 s, contre 14,4 à 17 s aujourd'hui (audit ; `--no-isolate` n'y change rien). Lancés seuls à la
rédaction : 9,4 s et 7,2 s. Les sommes des durées par `describe` donnent la découpe :

| Fichier | Lignes | Tests | Somme |
|---|---|---|---|
| movements | ~318-971 | 23 | 1,5 s |
| movements | ~972-2142 | 42 | 3,2 s |
| movements | ~2143-fin | 45 | 4,7 s |
| economy | ~181-1233 | 50 | 4,5 s (dont 2,4 s pour « the foundation the season owes ») |
| economy | ~1234-fin | 46 | 2,7 s |

Gain modeste, environ 3 s par exécution : prompt optionnel, rangement pur.

## Ce qui change

1. `convex/movements.test.ts` se coupe à ses frontières de `describe`, sans rien réordonner :
   - `convex/movements-founding.test.ts` (à créer) prend ~318-971 : fondation, chantier, plage de
     repos à la frontière, rayon d'avant-poste ;
   - `convex/movements.test.ts` garde ~972-2142 : marche, attaque, passe de résolution, aperçu,
     raid, marche sur un point ;
   - `convex/movements-sea-and-return.test.ts` (à créer) prend ~2143-fin : porte de la mer,
     déroute et retour, relevé, garnison, rester en mer.
2. `convex/economy.test.ts` garde ~181-1233 (de l'exploitation à « the foundation the season
   owes ») ; `convex/economy-construction.test.ts` (à créer) prend ~1234-fin (QG posé, file de
   chantier, emplacements, arsenal, dépôt historique, élévation d'avant-poste). Grâce au préfixe
   commun, `npx vitest run convex/movements` et `npx vitest run convex/economy` lancent la
   famille. Sans le `convex/`, le filtre `economy` ramasse aussi `src/domain/economy.test.ts`.
3. Le montage générique vient de `convex/scenario.fixture.ts` : `boot`, `MIDDAY`, `HOUR`, les
   régions de référence, `launchedSeason`, `disbandTheGift`. `MIDDAY` y est un nombre :
   `MIDDAY.getTime()` (~558) devient `MIDDAY`, seule ligne d'assertion retouchée. Ce qui est
   propre à un domaine va dans `convex/movements.fixture.ts` ou `convex/economy.fixture.ts` (à
   créer) : `raise`, `form`, `postAt`, `post`, `plant`, `garrison`, `eastOf`, `REACH_KM`, les
   régions propres (`ALBERTA`, `MOSELLE`…), `fill`, `promoteHq`… Chaque fichier n'importe que ce
   qu'il emploie (`noUnusedLocals` : `npm run types` échoue sinon). L'enveloppe de la saison lancée
   propre au domaine reste admise quand elle évite de réécrire des dizaines d'appels —
   `economy.test.ts` ~74 et ~98 rendent un siège seul, `movements.test.ts` ~66 retire la dotation
   et rend `{ seat, guest }` —, dans la fixture du domaine puisque deux ou trois fichiers la
   partagent. Elle appelle `launchedSeason` de 56 ; elle ne recopie pas le montage.
4. Les `beforeEach` et `afterEach` d'horloge restent dans leurs `describe`. Aucun test n'est
   renommé, réécrit ou changé de `describe` ; le commentaire de tête d'un `describe` le suit.
5. Si le budget d'import refuse une fixture et que 56 n'a pas déjà exclu les `*.fixture.ts` de
   son filtre, applique ce traitement (justifié en une ligne) et dis-le.

## Ce que ce prompt ne fait pas

- Aucune assertion ni règle de jeu ne change. Le parallélisme de vitest (pools, isolation) reste
  tel quel ; les autres suites ne migrent pas vers la fixture.
- Les budgets de temps ne bougent pas (`invariants.test.ts` ~412 et ~458, `view-budget.test.ts`
  ~425 et ~456).

## Cas d'acceptation (tests d'abord : rangement pur, les tests existants servent de filet)

1. **Avant de toucher quoi que ce soit** (sinon par `npm run sur-head`, 19), relève hors du dépôt
   le compte (206) et la liste des noms complets (`ancestorTitles` et `title`) :
   `npx vitest run convex/movements.test.ts convex/economy.test.ts --reporter=json --outputFile=<hors du dépôt>`.
2. Après : `npx vitest run convex/movements convex/economy --reporter=json --outputFile=<…>` rend
   206 tests, et le diff des deux listes triées de noms est vide.
3. Chacun des cinq fichiers passe seul (`npx vitest run convex/<fichier>`) : aucune dépendance
   cachée entre `describe`.
4. `git grep -c "^describe(" -- 'convex/movements*.test.ts' 'convex/economy*.test.ts'` totalise
   24 + 16.

## Vérifications

Trois fois avant et trois fois après : `time npx vitest run --reporter=json --outputFile=<hors du
dépôt>`. Relève la médiane de la durée murale et la durée de chacun des cinq fichiers. Puis
`npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : un tableau avant/après (fichier, tests, durée) et la
durée murale médiane de la suite ; le fichier qui fixe désormais la durée ; ce qui est allé dans
chaque fixture, et les enveloppes gardées, avec leur raison.
