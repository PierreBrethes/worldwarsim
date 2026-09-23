# 61-ops-depuis-le-telephone — `.github/workflows/ops.yml` lance `status`, `relaunch-press` ou `export-artifact` depuis GitHub, sans clé collée, et porte le seul job que la surveillance appelle aussi

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 08, 09.

**À lire :** `.github/workflows/surveillance.yml` (09 puis 10 : crons, entrée `exporter`, checkout
clairsemé, `node-version-file: .nvmrc`, `CONVEX_VERSION`, étapes Santé / Front / Backend / Export),
`scripts/read-health.mjs` (09), `scripts/node-version.test.mjs` (10), `convex/dev.ts`
(`relaunchPress` ~115, idempotente, rend `{ relaunched: [codes] }`), `convex/ops.ts` (`health`,
argument `now`), `.claude/settings.json` et `.claude/hooks/garde-prod.sh` (16, 57),
`deploiement/README.md` (§ Presse ~38-57 et ce que 57-58 y ont mis, § Surveillance).

## Pourquoi

À l'audit, chaque opération de prod se tapait clé en préfixe (README ~47-51 ; les `export` ne
passaient pas dans le terminal de Pierre, HANDOFF du 13/09), et la clé a transité par une
conversation le 12/09 (P7). 57-58 les ont rangées dans `npm run prod`, qui lit la clé sur le poste,
mais Pierre opère souvent depuis son téléphone (HANDOFF du 11/09), où ce script ne sert à rien.
Les secrets de la CI sont déjà dans GitHub : un `workflow_dispatch` s'y lance du téléphone.

## Ce qui change

1. **Rangement, premier commit.** Le job de `surveillance.yml`, tel que 09 et 10 l'ont laissé,
   part dans `.github/workflows/ops.yml` (à créer, `name: Opérations`), sous `on.workflow_call`
   (entrées `commande`, string, défaut `status` ; `exporter`, boolean, défaut `false`).
   `surveillance.yml` garde ses deux crons et son `workflow_dispatch`, et n'a plus qu'un job
   `uses: ./.github/workflows/ops.yml` avec `secrets: inherit`, `commande: status` et
   `exporter: ${{ github.event.schedule == '17 3 * * *' || inputs.exporter == true }}`, sans
   `timeout-minutes` (GitHub le refuse sur un job `uses:` ; il reste sur le job d'`ops.yml`).
   Comportement identique à 09, étape pour étape ; un seul runner (l'appelant n'en occupe pas).
2. **Comportement, second commit.** `ops.yml` gagne `on.workflow_dispatch`, entrée `commande` de
   `type: choice` : `status` (défaut), `relaunch-press`, `export-artifact` — même nom que l'entrée
   de `workflow_call`, le contexte `inputs` servant les deux (`inputs.exporter` y est absent).
   `permissions: contents: read` dans les deux fichiers. Les étapes, par leur `if:` :
   - Relance, si `relaunch-press` : `npx -y convex@$CONVEX_VERSION run dev:relaunchPress >
     relance.json`, versé dans `$GITHUB_STEP_SUMMARY`, puis `sleep 20` (le `publish` relancé part
     à `+0` et confie aussitôt l'édition à `writeEditionJob`) ;
   - Santé, sauf `export-artifact` : le verdict du run est celui de la santé, vert = réparé ; un
     `FAILED_JOBS` d'avant la relance reste compté 24 h (08), le résumé le nomme ;
   - Front et Backend, si `status` ; Export et `upload-artifact`, si `export-artifact` ou
     `inputs.exporter == true` ; ces trois-là gardent le `!cancelled()` de 09. Rétention
     `${{ inputs.commande == 'export-artifact' && 3 || 14 }}` jours (une copie à la demande se
     télécharge aussitôt ; l'export quotidien garde 14 jours).
   Aucune expression `${{ }}` dans un bloc `run:` : ce qu'il lit passe par `env:`. Aucune entrée
   libre : un mot de passe s'afficherait dans l'interface du run, et une commande libre ferait du
   bouton une console d'admin. Le wipe (59) et le changement de mot de passe (58) restent locaux.
3. `deploiement/README.md` : « Depuis le téléphone », huit lignes au plus, près de la section de
   57 (Actions → Opérations → Run workflow → commande, ce que rend chacune, où le lire, pourquoi le
   wipe n'y est pas) ; § Presse, la voie `relaunch-press` à côté de la commande locale en place
   (celle de 58 si elle y est), et le bloc qui colle la clé en préfixe disparaît s'il reste ;
   § Surveillance, une ligne : elle appelle `ops.yml`.

Backend local permis (127.0.0.1:3210). Les URL `pierrebrethes.cloud` restent écrites dans le YAML
et ne s'appellent jamais d'ici. Le hook de 16 refuse une commande Bash qui porte ce domaine, et 57
celle qui nomme la variable de la clé : chercher dans les fichiers avec l'outil Grep.

## Ce que ce prompt ne fait pas

- Ni wipe, ni mot de passe, ni export d'état par GitHub (58, 59) ; aucune réparation planifiée,
  la surveillance reste en `status` ; pas de `concurrency` (`relaunchPress` est idempotente).
- `npm run prod` (57-58), actions par SHA (63). `.nvmrc` ne bouge pas : `ops.yml` le suit comme
  `surveillance.yml` après 10 (`node-version-file`, `.nvmrc` au checkout clairsemé).

## Cas d'acceptation (tests d'abord)

Aucun code applicatif touché ; `read-health.test.mjs` et `node-version.test.mjs` restent verts tels quels.

1. `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:<dernière version>` : aucun constat
   sur les trois workflows, entrées du `workflow_call` comprises (Docker absent : le dire).
2. Avant/après du premier commit : crons, entrée `exporter`, étapes, leurs `if:` et rétention de
   l'export quotidien inchangés, listés dans le rapport.
3. Dossier temporaire `$T` hors du dépôt, seulement `package.json` et `package-lock.json` copiés ;
   URL et clé chargées par `( set -a; . <dépôt>/.env.local; set +a; cd "$T"; … )`, jamais
   imprimées : le shell de chaque commande rejoué contre le backend local. `status` sort selon `ok`
   par `read-health.mjs` ; `relaunch-press` rend `{ "relaunched": [...] }` (elle rallume les
   chaînes mortes des saisons locales, c'est son rôle : dire lesquelles) ; `export-artifact`
   produit le zip, taille notée.
4. `bash -n` sur chaque bloc `run:` extrait.

## Vérifications

- Les cas 1 à 4 tels quels, sorties notées. `npm run verifier` : vert (`format:check` lit le YAML).
- `npm run doc-lint` (31-33) : aucun constat nouveau sur `deploiement/README.md`.

## Rapport attendu

Format commun (README de la série), plus : les deux commits (rangement, puis comportement), leurs
fichiers et la séparation des hunks d'`ops.yml` (`git add -p`) ; la durée des trois rejeux du cas
3 ; pour Pierre après la fusion, `status` lancé du téléphone (app GitHub, sinon navigateur) et la
surveillance relancée une fois à la main, pour voir l'appel à `ops.yml` réussir.
