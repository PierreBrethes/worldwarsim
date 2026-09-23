# 69-partie-locale — `npm run partie:locale` monte, sur le backend local et nulle part ailleurs, une saison lancée à deux sièges, et imprime de quoi ouvrir chacun

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `convex/auth.ts` (`register` ~33, `login` ~49), `convex/accounts.ts` (`me` ~134,
`seats` ~147), `convex/seasons.ts` (`create` ~176, `join` ~261, `previewOf`, `launch` ~418),
`convex/players.ts` (`reserveNation` ~50, `declareReady` ~69), `src/routes/accueil.tsx` ~131-138,
`convex/constructions.ts` (`start` ~98), `convex/view.ts` (`me.capitalPoint` ~437),
`convex/regions.ts` (`CAPITAL_REGION` ~277, non exportée), `src/data/session.ts` (~4-5, `onStorage`
~97), `scripts/exporter-etat-reference.mjs` (~11-16, CLI ~517), `convex/dev.ts` (`snapshot` ~159).

## Pourquoi
Trois sessions de vérification à l'écran ont coûté 181, 165 et 66 appels navigateur ; deux autres
se sont arrêtées faute d'état de jeu : « Aucun avant-poste n'existe dans la base locale » (471ebfcc),
« ta saison FRANCE n'a aucune troupe posée » (327da3d6). La mise en place se refait à la main
(`npx convex run auth:register`, `seasons:create`, `seasons:join`, jetons recopiés en dur). Il
manque la commande qui l'enchaîne, et une garde qui refuse de l'enchaîner ailleurs qu'en local.

## Ce qui change
1. `scripts/partie-locale.mjs` (à créer), node pur : `ConvexHttpClient` (`convex/browser`), `api`
   de `convex/_generated/api.js`, fonctions pures exportées, CLI derrière la garde « lancé
   directement » d'`exporter-etat-reference.mjs`. `"partie:locale": "node scripts/partie-locale.mjs"`
   hors `verifier`. Options : `--qg`, `--neuve`, `--nations=a,b`, `--env=<fichier>` (`.env.local`).
2. **La garde, avant tout appel réseau.** Chaque variable du fichier d'env dont le nom contient
   `CONVEX` et finit par `_URL` (aujourd'hui trois) se parse par `new URL`, en `http:`, d'hôte
   exactement `127.0.0.1` ou `localhost` ; sinon sortie 2, la variable nommée. Toutes : le
   navigateur lit `VITE_CONVEX_URL`, `npx convex` lit `CONVEX_SELF_HOSTED_URL` — et `process.env`
   l'emporte sur le fichier : ces noms, s'ils y sont, passent la même garde. La clé d'admin n'est
   ni utilisée ni imprimée (tout ce qu'on appelle est public). Puis `GET <VITE_CONVEX_URL>/version` :
   200 attendu, le corps (`unknown`) ignoré ; sinon sortie 2 et « docker compose up -d backend ».
3. **Deux comptes**, `locale-a` et `locale-b`, mot de passe constant (8 octets au moins) : le jeton de
   `.partie-locale.json` si `accounts.me` le reconnaît, sinon `auth.login`, et sur `BAD_CREDENTIALS`
   `auth.register`. Un refus se lit sur `error.data.code` ; tout autre : sortie 1, le code nommé.
4. **Une saison lancée.** Reprise : dans `accounts.seats` de A, la dernière saison non `concluded`
   fondée par A où B a une place (`--neuve` passe outre). Sinon `seasons.create`
   `{ durationHours: null, compensation: 0.5 }` (comme l'accueil), `seasons.join` de B par le code.
   Au salon : `reserveNation` (`france,germany` par défaut : deux voisins du théâtre Europe),
   `declareReady` (`ready: true`), `seasons.launch` par A. Une saison lancée n'est pas touchée.
5. **`--qg`**, pour chaque siège dont `playerView.me.hqLevel` vaut 0 : la région de
   `public/region-index.json` dont `point` égale `me.capitalPoint`, puis `constructions.start`
   `{ building: 'hq', regionId }`, et le QG amène sa compagnie d'infanterie en garnison.
   **Décision : aucune table des capitales dans le script**, le serveur sert le point. Il n'est pas
   toujours unique (`GBR-2080` le partage avec `GBR-2072`) : le premier id trié, dit en sortie.
6. **Sorties.** `.partie-locale.json` (à créer), ajouté à `.gitignore` avec son pourquoi (`*.local`
   ne le couvre pas) : `{ url, code, seasonId, seats: [{ nickname, nation, token, seasonId }] }`.
   **Le code contredit le cahier** : `exporter-etat-reference.mjs` ne lit aucun fichier, il prend
   `--token=` et `--saison=` ; ces deux valeurs sont celles-ci, et il ne change pas. Par siège :
   pseudo, nation, QG posé ou dû ; `localStorage.setItem('wws-session', …);`, de même `'wws-season'`,
   puis `location.assign('/plateau');` (valeurs brutes comme `keepSession`/`keepSeat`, littéraux par
   `JSON.stringify`) ; `npx convex run dev:snapshot '{…}'`. Et une phrase : deux onglets d'une origine
   partagent ce stockage (`onStorage` fait basculer l'autre) — un second siège veut une autre origine.
7. Une ligne `npm run partie:locale   # saison à deux, backend local` au bloc de commandes de
   `CLAUDE.md` (`wc -m` ≤ 8 000) et dans `deploiement/README.md`, là où il cite `npm run dev:complet`.

## Ce que ce prompt ne fait pas
Ni avant-poste, ni troupe hors garnison, ni mouvement mis en scène. Ni `window.wws`, ni
`launch.json`, ni skill (70). Le script ne lance ni Docker, ni vite, ni `convex dev`.

## Cas d'acceptation (tests d'abord)
`scripts/partie-locale.test.mjs` (à créer), écrit d'abord, sans réseau :
1. Garde : `http://127.0.0.1:3210` et `http://localhost:3210/` passent ; refusés, variable nommée :
   `https://convex.example.com`, `http://127.0.0.1.nip.io:3210`, `http://localhost.example.com`,
   `http://evil.com#127.0.0.1`, `http://0.0.0.0:3210`, `http://[::1]:3210`, une valeur vide,
   `VITE_CONVEX_URL` local avec `CONVEX_SELF_HOSTED_URL` distant, fichier local avec
   `CONVEX_SELF_HOSTED_URL` distant dans l'environnement. Lecture : commentaires, guillemets.
2. Reprise : la dernière saison fondée par A où B siège ; écartées une `concluded`, une sans B, une de B.
3. Sur le vrai `region-index.json` : le point de `FRA-5333` rend `FRA-5333`, celui de `GBR-2080`
   rend `GBR-2072`, un point absent une erreur. Chaque ligne `localStorage` rendue passe
   `new Function(ligne)` (la ligne `npx convex run` est du shell, pas du JS).
Essai réel, local seulement : `curl -s -o /dev/null -w '%{http_code}' -m 2
http://127.0.0.1:3210/version` rend 200, sinon `docker compose up -d backend`. Sur « Could not find
public function » : relire `grep -E '^(CONVEX_SELF_HOSTED_URL|VITE_CONVEX_URL)=' .env.local`, puis
`npx convex dev --once --codegen disable` ; jamais `deploy`.
4. `npm run partie:locale` sort en 0, saison lancée ; `git check-ignore -q .partie-locale.json`.
5. Relancé : même `seasonId`, ni `register` ni `create` (« reprise » en sortie), et
   `npx convex data seasons --limit 500 | wc -l` inchangé.
6. `--qg` : `npx convex run dev:snapshot` rend, pour chaque siège, `playerView.me.hqLevel` ≥ 1 et un
   `hq` dans `me.buildings` ; relancé avec `--qg`, sortie 0 sans pose de plus.
7. `T=$(mktemp -d)`, `--env=$T/.env` avec `CONVEX_SELF_HOSTED_URL=https://convex.example.com` :
   sortie 2 immédiate, aucune requête.

## Vérifications
`npx vitest run scripts/partie-locale.test.mjs` ; cas 4 à 7 sous `/usr/bin/time -p` ;
`npm run verifier` vert ; `git status --short` : script, test, `package.json`, `.gitignore`, docs.

## Rapport attendu
Format commun (README de la série), plus : la sortie du premier run, jetons coupés à six
caractères ; la durée des deux runs ; « À trancher » : des mutations internes de mise en scène dans
`convex/dev.ts` (troupe posée, avant-poste debout) ; `Bash(npm run partie:locale*)` en `allow`.
