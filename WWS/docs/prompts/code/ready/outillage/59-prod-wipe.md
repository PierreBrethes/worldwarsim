# 59-prod-wipe — `npm run prod -- wipe` ne se lance qu'au clavier, sauvegarde d'abord, vide les tables de jeu une transaction par table et dit la suite du déploiement

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 58, 44, 56 (56 ajouté : le test monte sa saison par `convex/scenario.fixture.ts`).

**À lire :** `convex/dev.ts` (`GAME_TABLES` ~13-41, `IDENTITY_TABLES` ~44, `reset` ~46-64) ·
`convex/season-partition.test.ts` (~266-272) · `convex/auth.test.ts` (~301-326 : l'identité survit à
`dev.reset`) · `convex/scenario.fixture.ts` (56 : `boot`, `launchedSeason`) · `scripts/prod.mjs` et son
test (57-58 : `readProdEnv`, `callFunction`, `backup`) · `scripts/compat-deploiement.mjs` (44 : l'avis
du code 3) et `deploiement/README.md` § CI/CD (44 : `WIPE-REQUIS`), puis ~21-36 (l'ordre du wipe) ·
https://docs.convex.dev/production/state/limits (plafonds d'une transaction).

## Pourquoi

Le wipe a un ordre imposé, gardé de mémoire : `dev:reset` sur l'**ancien** déploiement, ensuite
seulement `convex deploy` (README ~26-33 : poussé d'abord, le déploiement bute sur les documents
incompatibles et `dev:reset` n'est plus là pour les effacer). `reset` vide les 27 `GAME_TABLES` en une
mutation, `collect()` puis `delete` (dev.ts ~55-64) : un plafond de transaction dépassé bloquerait le
wipe au pire moment. Non mesuré : celui du 11/09 est passé, mais `campSightings` et `regionSightings`
grossissent plus vite depuis le 13/09 (vérificateur). Et rien n'empêche un wipe par mégarde, ou sans copie.

## Ce qui change

1. `convex/dev.ts` :
   - `reset` prend `{ table?: <union des littéraux de GAME_TABLES> }` et rend `{ deleted }` : avec
     `table`, cette table seule ; sans, toutes, comme aujourd'hui (le dev et `auth.test.ts`). Une table
     d'identité est refusée par le validateur. `GAME_TABLES` garde sa forme littérale (43 la lit en texte) ;
   - `wipePlan` (à créer), `internalQuery` → `{ tables: GAME_TABLES, latest: { code, status } | null }`
     (la dernière saison créée) : la liste vient **du déploiement qu'on vide**, jamais d'une copie ;
   - l'en-tête de `reset` dit pourquoi une transaction par table, et qu'il tourne sur l'ancien
     déploiement : il n'y existe qu'après un déploiement ordinaire qui le porte.
2. `scripts/prod.mjs`, `wipe`, dans cet ordre :
   1. refus de tout argument (le code se tape), puis sans TTY (`process.stdin.isTTY`), avant `prod.env` ;
   2. `wipePlan` ; absent du déploiement en place → ce prompt n'y est pas encore déployé : rien n'est fait ;
   3. l'hôte, `latest` et le nombre de tables affichés ; le code lu sur `/dev/tty`, ouvert à part
      (jamais stdin, jamais argv) ; attendu : `latest.code`, ou l'hôte si aucune saison ne reste (reprise
      d'un wipe interrompu, `seasons` partant en premier) ; différent → sortie 2, rien n'est fait ;
   4. `backup` (58) ; échec → sortie 1, rien n'est effacé ;
   5. `wipeOrder(tables)`, pure : `seasons`, `players`, puis le reste dans l'ordre de `GAME_TABLES` —
      sans saison ni siège, un travail planifié réveillé entre deux transactions n'a plus où écrire.
      Une ligne par table (`table : n supprimés, t ms`). Au premier échec : la table, l'erreur, les
      tables déjà vides, « relancer `npm run prod -- wipe` » (une table vide rend 0) ;
   6. seconde passe : chaque table rend 0, sinon la nommer et sortir 1 ;
   7. la suite, dans les mots de 44 : retirer `deploiement/WIPE-REQUIS` dans un commit et pousser,
      c'est cette poussée qui déploie ; puis `git grep -n '@wipe' -- src convex` (45), ce qui peut partir.
   Cœur exporté : `runWipe(deps)`, avec `host`, `plan`, `readCode`, `backup`, `reset` et `print` injectés ;
   en vrai, `plan` et `reset` passent par `callFunction` (58) : un appel HTTP par table, pas une CLI.
3. `deploiement/README.md` : le bloc ~28-31 devient `npm run prod -- wipe` puis la suite de 44, l'ordre
   et sa raison restent ; une ligne dans la section de 57. L'avis du code 3 de
   `scripts/compat-deploiement.mjs` (44) perd « prompt 59 ; d'ici là … » : `npm run prod -- wipe` existe.

## Ce que ce prompt ne fait pas

Aucun lot dans une table, aucun protocole `remaining` (vérificateur). Ni annulation des travaux
planifiés en attente (le `reset` d'aujourd'hui non plus, voir 43), ni `WIPE-REQUIS` lui-même (44),
ni le nettoyage des `@wipe` (45), ni GitHub (61 : le wipe reste local).

## Cas d'acceptation (tests d'abord)

1. `convex/dev.test.ts` (à créer), saison lancée par `launchedSeason`, `seasons`, `players` et une
   autre table de jeu non vides en tête : `reset({ table: 'players' })` rend le nombre de sièges et ne
   vide que `players` ; `accounts` et `sessions` intactes.
2. Même montage, `reset({ table })` sur chaque table de `wipePlan().tables`, `seasons` et `players`
   d'abord (sans importer `scripts/prod.mjs`, que tsc ne type pas) : toutes vides, identité intacte,
   `accounts:me` répond encore.
3. `reset({ table: 'accounts' as never })` rejette ; `reset({})` vide tout comme avant ; `wipePlan`
   rend `GAME_TABLES` et le code de la saison, `latest: null` sans saison.
4. `scripts/prod.test.mjs` : `wipeOrder` (`seasons`, `players` en tête, rien perdu ni doublé) ;
   `runWipe` sur des faux : mauvais code → ni sauvegarde ni reset ; `latest: null` → l'hôte attendu ;
   sauvegarde en échec → aucun reset ; échec à la troisième table → arrêt, les deux premières
   nommées ; seconde passe non nulle → 1 ; ordre des appels : plan, code, sauvegarde, resets, seconde passe.
5. Enfant par `process.execPath` dans vitest, stdin en tube, `HOME` temporaire vide : `wipe` sort 2 sur
   le TTY, pas sur `prod.env` ; `wipe ABC123` sort 2 sur l'argument.

## Vérifications

- `npx vitest run convex/dev.test.ts convex/auth.test.ts scripts/prod.test.mjs
  scripts/compat-deploiement.test.mjs` : vert. `npm run verifier` : vert.
- Backend local seulement (`.env.local`, 127.0.0.1:3210) : `npx convex dev --once` ; `dev:wipePlan` ; le
  compte de chaque table par `npx convex run --inline-query` (lecture seule) ; `dev:reset
  '{"table":"accounts"}'` refusé ; `{ "deleted": 0 }` sur une table que ce compte a trouvée vide.
  L'agent n'efface rien d'autre.
- Le bout en bout au clavier revient à Pierre : le rapport en donne les commandes (`HOME` temporaire
  dont `prod.env` vise 127.0.0.1:3210, `npm run prod -- wipe`, puis les comptes). Ni `script`, ni
  `expect`, rien qui fabrique un TTY : ce serait contourner le refus que ce prompt pose.

## Rapport attendu

Format commun (README de la série), plus : les plafonds d'une transaction cités de la doc Convex et la
plus grosse table locale rapportée à eux ; la suite imprimée, telle quelle ; l'écart au cahier
(« relancer le workflow ») : 44 fait déployer le commit qui retire `WIPE-REQUIS` ; pour Pierre,
`reset({ table })` et `wipePlan` partent en prod par un déploiement ordinaire **avant** le premier
wipe qui s'en sert ; l'essai au clavier efface les saisons locales (la copie de `backup` les garde).
