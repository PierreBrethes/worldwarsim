# 67-runbook — `deploiement/README.md` tient en cinq sections, le dev local ne porte plus aucune procédure de prod, et `compose.prod.yml` ne contredit plus son dashboard

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 57 à 66.

**À lire :** `deploiement/README.md` (entier ; `git log --oneline` du fichier dit qui a posé quoi) ·
`deploiement/compose.prod.yml` (en-tête ~1-15, service `dashboard`) · `scripts/prod.mjs` (l'aiguillage :
**lire, ne rien lancer**) · `.github/workflows/{ci,ops,surveillance}.yml` · en-têtes de
`deploiement/deployer.sh` et `sauvegarder.sh` · `WWS/docs/rapports/2026-09-09-comptes-c2.md` ~74-79 ·
`noms-de-modules-convex.md`, `contours-de-region-paresseux.md` (là où 27 les a rangés) ·
`convex/invariants.test.ts` ~105, ~144 · `scripts/mesure-isolat.mjs` ~1-17 · `git show --stat ac7fea5
46d2320 54678c5 1adb0f3`.

## Pourquoi

À la rédaction, « Dev local » (README ~19) contient le wipe de C3 (~21-36), la relance de la presse
(~38-57), la récupération de mot de passe (~59-73) et un bricolage de C2 (~75-78, `api.d.ts` retouché à
la main) : qui cherche le dev lit des procédures de prod. 06 à 66 ont posé leurs morceaux sans ranger
(57, 09, 61, 63, 65). L'en-tête de `compose.prod.yml` (~5-7) annonce un dashboard « lié à 127.0.0.1 et
joignable uniquement en tunnel SSH », démenti par ~40-60 (Traefik, BasicAuth) et par le README (~16-17).
Vérifiés aussi : § 0 (~126) « suppose un réseau `traefik` » quand `compose.prod.yml` ~9-13 dit qu'il n'y
en a pas (`network_mode: host`) ; § 1 (~140) donne trois enregistrements DNS pour quatre sous-domaines
routés ; § 3 (~156-160) omet `WWS_DASHBOARD_AUTH`, que `compose.prod.yml` exige (`:?`, ~60).

## Ce qui change

1. `deploiement/README.md` : le titre et la table des adresses restent en tête, puis **exactement cinq**
   `##`, dans cet ordre. Le texte se **déplace**, il ne se réécrit que là où il est faux.
   - `## Dev local (macOS ou Windows/WSL)` : le bloc de 20, « Démarrage local », le dashboard local.
   - `## Mise en prod initiale` : étapes 0 à 6. § 0 : `network_mode: host`, le label
     `traefik.docker.network=worldwarsim_default`, et `docker inspect <traefik> --format
     '{{.HostConfig.NetworkMode}}'` doit rendre `host`. § 1 : quatre enregistrements. § 3 :
     `WWS_DASHBOARD_AUTH`, renvoi à la recette `htpasswd` (les `$` doublés). Secrets GitHub et « Clé de
     CI restreinte » (63) ; Contrôle (06, 64).
   - `## Exploitation courante` : en tête, le `prod.env` du poste (57) ; une ligne par sous-commande de
     `scripts/prod.mjs` (ce qu'elle fait, ce qu'elle rend) ; `ops.yml` depuis le téléphone (61) ;
     `surveillance.yml` (09) ; `sauvegarder.sh` et sa ligne de cron (07) ; le déploiement à chaque
     poussée (ci.yml, deployer.sh, contrôle de `version.json`) ; `DEPLOIEMENT_AUTO` et `WIPE-REQUIS`
     (44), avec l'ordre du wipe et sa raison (reset sur l'ancien déploiement, déploiement ensuite) ; le
     dashboard (accès, BasicAuth, clé d'admin) ; l'image Convex épinglée (15) ; les comptes (console,
     `reset-password`, les portes publiques en deux lignes).
   - `## Retour arrière` : le code, ce que 65 a écrit ; les données, ce qui existe (copies de 07,
     `restore-test` de 60, en local seulement).
   - `## Incidents connus` : une entrée par incident, quatre lignes au plus, date · symptôme · cause ·
     correctif (commit) · garde-fou d'aujourd'hui. 11/09 `InvalidConfig` (46d2320 ; invariants ~105) ;
     11/09 `InvalidModules`, budget d'évaluation de 4 s (54678c5 ; invariants ~144, `mesure-isolat`) ;
     11/09 bascule C3 (1adb0f3 ; wipe avant la poussée, aujourd'hui `WIPE-REQUIS`, 43-44 et 59 : le
     récit de C3 quitte le dev) ; 12/09 presse arrêtée à 23 h 55 (ac7fea5 le 13/09 ; `PRESS_CHAIN_DEAD`
     de 08 surveillé par 09 ; la relance) ; 12/09 isolat recyclé, `TooMuchMemoryCarryOver`
     (`mesure-isolat` ~5-10).
   - Le paragraphe C2 part **sans nouveau rapport** : `WWS/docs/rapports/2026-09-09-comptes-c2.md`
     ~74-79 le dit déjà (écart au cahier, qui voulait un rapport daté). `VITE_CONVEX_SITE_URL`, que
     rien ne lit, n'y figure nulle part.
2. `compose.prod.yml`, en-tête ~5-7 : « La seule exception est le dashboard, lié à 127.0.0.1… » devient
   « dashboard compris : Traefik le route derrière un BasicAuth (voir son service) ». Commentaires seuls.

## Ce que ce prompt ne fait pas

Aucune procédure nouvelle, aucun script, rien contre le VPS ni la prod. Ni `CLAUDE.md` (21), ni
`WWS/docs/ETAT-DU-CODE.md`, ni `.env.local`. Les prompts d'incident restent où 27 les a rangés. Le fond
de ce qu'ont écrit 06 à 66 ne se réécrit pas : il change de place.

## Cas d'acceptation

Une recherche qui nomme le domaine de prod ou la clé d'admin passe par l'outil Grep (16, 57).

1. `grep -n '^## ' deploiement/README.md` : les cinq titres, dans l'ordre, rien d'autre.
2. Un script du scratchpad liste les blocs de code de `git show HEAD:deploiement/README.md` et du
   nouveau fichier : chaque ancien bloc se retrouve à l'identique, sinon il est au rapport avec sa raison.
3. La section « Dev local » (de son titre au `##` suivant) : ni `pierrebrethes`, ni `npm run prod`, ni
   `dev:reset`, ni `relaunch`, ni `resetPassword`, ni `WIPE-REQUIS`.
4. README et `compose.prod.yml` : ni `api.d.ts`, ni `VITE_CONVEX_SITE_URL`, ni « réseau `traefik` », ni
   `tunnel`.
5. `CONVEX_CLOUD_ORIGIN=https://exemple.invalid WWS_DASHBOARD_AUTH=x:y docker compose -f
   docker-compose.yml -f deploiement/compose.prod.yml --profile prod config`, sortie gardée hors du
   dépôt avant et après : `diff` vide.
6. Chaque texte que `git grep -n "deploiement/README"` renvoie trouve ce qu'il cite (RESTE-A-CODER sur
   l'ordre du wipe, rapport C2 sur la récupération, `fr.ts`, messages `:?`).

## Vérifications

Les cas 1 à 6. `npm run doc-lint -- --strict` : 0, aucun constat sur `deploiement/README.md`.
`npx prettier --check deploiement/compose.prod.yml` : vert. `git diff --stat` : ces deux fichiers seuls.

## Rapport attendu

Format commun (README de la série), plus : la table de passage (ancien titre et lignes → nouvelle
section) ; les blocs retirés et pourquoi ; la longueur du README avant et après ; en « À trancher » :
le quatrième enregistrement DNS (ou un joker) à confirmer par Pierre, et l'absence de procédure pour
restaurer la **prod** depuis une copie (60 ne prouve la restauration qu'en local).
