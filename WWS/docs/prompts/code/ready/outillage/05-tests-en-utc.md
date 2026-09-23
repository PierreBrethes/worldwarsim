# 05-tests-en-utc — les tests tournent à l'heure de la CI, quel que soit le fuseau du poste

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `vite.config.ts` (entier, 37 lignes : les deux projets vitest `convex` et `front`),
`convex/constants.ts` (~828-840 : `REST_WINDOW_MINUTES`, `DEFAULT_REST_START_MINUTES` « en
minutes UTC », `DEFAULT_REST_WINDOW`), `convex/plunder.test.ts` (~23 : `MIDDAY` en heure locale ;
`describe('what a column surveys where it lands')` ~337, dont les deux cas échouent ~352 et ~377),
`convex/invariants.test.ts` (sa suite de `describe` en français, où loger le garde-fou),
`.github/workflows/ci.yml` (`ubuntu-latest`, donc UTC).

## Pourquoi

15 fichiers de test (14 sous `convex/`, plus `src/domain/journal.test.ts`) construisent leur
horloge en heure locale : 16 appels `new Date(2026, m, j, h…)`
(`git grep -nE "new Date\(20[0-9]{2}, *[0-9]" -- '*.test.ts' '*.test.tsx'`), contre 9 `Date.UTC`.
Le serveur, lui, compte en UTC : plage de repos par défaut de 21 h à 4 h UTC, fin exclue
(`constants.ts` ~830-840, `insideWindow` de `src/domain/rest-window.ts`). Midi local y tombe dès
UTC+9 (Tokyo : 3 h UTC) et dès UTC-9 (21 h UTC). Reproduit à la rédaction :
`TZ=Asia/Tokyo npx vitest run convex/plunder.test.ts` → `2 failed | 23 passed`
(`surveyedInstallations` vide ~352, liste amputée ~377) ; même résultat sous Sydney, Auckland et
Kiritimati (audit). La CI tourne en UTC, Pierre en Europe/Paris : ce sont deux horloges, et un
test peut passer sur le poste puis bloquer le déploiement.

## Ce qui change

1. **Le garde-fou d'abord**, dans `convex/invariants.test.ts` : un `describe('l’horloge des
   tests')` dont l'unique cas exige `new Date(2026, 7, 17, 12).getTime()` égal à
   `Date.UTC(2026, 7, 17, 12)`, avec un message d'échec qui nomme `vite.config.ts`. Sur le Mac
   (Europe/Paris) il échoue avant le correctif. C'est lui qui rend la ligne indispensable, même
   là où les deux cas de pillage passent : sans lui, on la retirerait sans rien voir.
2. `vite.config.ts` : `process.env.TZ = 'UTC';` en tête du module, juste après les imports et
   avant `defineConfig`. Commentaire de pourquoi, deux lignes au plus : le serveur et la CI
   comptent en UTC ; la variable est posée avant que vitest lance ses workers, qui en héritent.
   Revérifié à la relecture sur un projet jetable (vitest 4.1.10, un projet `edge-runtime` et un
   projet `node`, comme ici) : sous `TZ=Asia/Tokyo`, le cas du point 1 passe avec la ligne et
   échoue sans elle, dans les deux projets.
3. **Décision : pas de condition sur le mode.** `vite dev` et `vite build` chargent aussi ce
   fichier, sans effet : le navigateur garde son fuseau, et aucun des quatre plugins ne lit l'heure
   locale. Vérifie-le et dis-le dans le rapport.
4. Rien d'autre. Les `MIDDAY` locaux restent tels quels : sous `TZ=UTC`, chacun vaut déjà son
   `Date.UTC`.

## Ce que ce prompt ne fait pas

- Aucun `MIDDAY` n'est réécrit en `Date.UTC` et aucun autre fichier de test n'est touché : la
  fixture commune le fait (56), puis chaque suite à sa prochaine retouche.
- Ni la CI (déjà en UTC) ni le code du jeu ne changent. `src/data/serverView.ts` ~235 et
  `src/routes/salon.tsx` ~488 lisent le fuseau du navigateur, et c'est voulu.
- Pas de test sous un autre fuseau dans la suite : le fuseau des tests est un seul, UTC.

## Cas d'acceptation (tests d'abord)

1. Avant le correctif : `TZ=Asia/Tokyo npx vitest run convex/plunder.test.ts` rend 2 échecs, et le
   garde-fou échoue sous un fuseau autre qu'UTC
   (`TZ=Europe/Paris npx vitest run convex/invariants.test.ts -t horloge`).
2. Après : `TZ=Asia/Tokyo npx vitest run convex/plunder.test.ts` → 25/25.
3. `TZ=Pacific/Kiritimati npm run test` et `TZ=America/Los_Angeles npm run test` : suite complète
   verte.
4. Sans `TZ` (le fuseau du poste) : suite complète verte, garde-fou compris.
5. `git diff --stat` : `vite.config.ts` et `convex/invariants.test.ts`, rien d'autre.

## Vérifications

- Les commandes des cas 1 à 4, avec leurs comptes de tests.
- `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus :

- les comptes de tests avant et après : Tokyo sur `plunder.test.ts`, Kiritimati et Los Angeles
  sur la suite complète ;
- la sortie d'échec du garde-fou sans la ligne ;
- comment tu as établi que `vite dev` et `vite build` ne dépendent pas de la ligne.
