# Déploiement — Convex auto-hébergé ([ADR 0010](../WWS/docs/adr/0010-convex-auto-heberge-sur-vps.md))

La même pile partout : `convex-backend` + dashboard en Docker, front statique Nginx. En dev le
front tourne via Vite, sur le VPS il est servi par le conteneur `front`, derrière le **Traefik
déjà en place sur le VPS** qui porte le TLS.

Les quatre adresses de production :

| Adresse | Sert | Conteneur |
|---|---|---|
| `wws.pierrebrethes.cloud` | le jeu | `front` (Nginx, port 80) |
| `convex.pierrebrethes.cloud` | l'API Convex + WebSocket | `backend` (port 3210) |
| `convex-actions.pierrebrethes.cloud` | les actions HTTP Convex | `backend` (port 3211) |
| `convex-dashboard.pierrebrethes.cloud` | la console d'admin Convex | `dashboard` (port 6791) |

Le dashboard s'ouvre depuis n'importe où, mais derrière deux barrières : le BasicAuth de
Traefik, puis la clé d'admin Convex (§ Dashboard).

## Dev local (Windows, Docker Desktop)

1. Créer `.env` à la racine (jamais commité) :

   ```
   INSTANCE_SECRET=<64 caractères hexadécimaux — openssl rand -hex 32>
   ```

2. Lancer le backend et générer la clé d'admin (une fois) :

   ```bash
   docker compose up -d backend dashboard
   docker compose exec backend ./generate_admin_key.sh
   ```

3. Coller la clé dans `.env.local` (jamais commité) :

   ```
   CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
   CONVEX_SELF_HOSTED_ADMIN_KEY=<la clé>
   VITE_CONVEX_URL=http://127.0.0.1:3210
   ```

4. Déployer les fonctions puis lancer le front :

   ```bash
   npm run dev:complet   # Vite (HMR front) + convex dev (redéploie convex/ à chaque sauvegarde)
   ```

   → http://localhost:5173. Le front seul : `npm run dev` ; le backend seul : `npx convex dev`
   (`npx convex deploy` est le one-shot utilisé par la CI).
   Le dashboard est sur http://127.0.0.1:6791 (se connecter avec la clé d'admin).

## VPS (Hostinger) — mise en prod initiale

En prod, le compose de dev est complété par
[`deploiement/compose.prod.yml`](compose.prod.yml) : **plus aucun port publié** (Docker
contourne ufw — un port publié sur le VPS est un port mondial), Traefik route par le réseau
Docker, dashboard compris. Toute commande compose sur le VPS prend les deux fichiers :

```bash
alias wws-compose='docker compose -f docker-compose.yml -f deploiement/compose.prod.yml'
```

### 0 · Vérifier Traefik — trois noms à relever

`compose.prod.yml` suppose un réseau `traefik`, un entrypoint `websecure` et un certresolver
`letsencrypt`. Relever les vrais noms et corriger le fichier si besoin :

```bash
docker ps                                  # le conteneur Traefik
docker inspect <traefik> --format '{{json .NetworkSettings.Networks}}'   # → le réseau
docker inspect <traefik> --format '{{json .Args}}'                       # → entrypoints + certresolver
                                           # (sinon : son traefik.yml / ses labels)
```

Vérifier aussi que Traefik écoute bien 80 **et** 443, et qu'il fait la redirection 80 → 443.

### 1 · DNS

Trois enregistrements A vers l'IP du VPS : `wws`, `convex`, `convex-actions`. Attendre la
propagation avant le premier `up` — Let's Encrypt échoue sur un DNS pas encore résolu, et
Traefik retente mais en pénalisant.

### 2 · Le repo

```bash
sudo mkdir -p /opt/worldwarsim && sudo chown $USER /opt/worldwarsim
git clone git@github.com:<compte>/worldwarsim.git /opt/worldwarsim
```

Avec une **deploy key en lecture seule** (GitHub → repo → Settings → Deploy keys), jamais une
clé de compte : le VPS n'a besoin que de `git pull`.

### 3 · `.env` de production (jamais commité)

```
INSTANCE_SECRET=<un autre secret que le dev — openssl rand -hex 32>
CONVEX_CLOUD_ORIGIN=https://convex.pierrebrethes.cloud
CONVEX_SITE_ORIGIN=https://convex-actions.pierrebrethes.cloud
```

`VITE_CONVEX_URL` n'a pas à y figurer : le build du front prend `CONVEX_CLOUD_ORIGIN` par
défaut (voir `docker-compose.yml`).

### 4 · Backend, clé d'admin, fonctions

```bash
wws-compose up -d backend dashboard
wws-compose exec backend ./generate_admin_key.sh    # → la clé, à garder pour la CI
```

Puis déployer les fonctions **une première fois à la main** (depuis le poste de dev — la CI
prendra le relais) :

```bash
CONVEX_SELF_HOSTED_URL=https://convex.pierrebrethes.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY=<la clé du VPS> \
npx convex deploy
```

### 5 · Le front

```bash
wws-compose --profile prod up -d --build front
```

### 6 · Contrôle

- `https://wws.pierrebrethes.cloud` répond et le jeu se charge ;
- dans l'onglet réseau du navigateur, le WebSocket vers `convex.pierrebrethes.cloud` est
  **101 Switching Protocols** — c'est le test du passage des upgrades par Traefik ;
- `curl https://convex-actions.pierrebrethes.cloud` répond (peu importe le code : c'est le
  routage 3211 qu'on teste, l'ancien README l'oubliait) ;
- depuis l'extérieur, `curl http://<IP>:3210` et `:6791` **échouent** — rien ne publie ;
- `curl -o /dev/null -w '%{http_code}' https://convex-dashboard.pierrebrethes.cloud` répond
  **401** sans identifiants et **200** avec — un 200 tout court voudrait dire que le middleware
  BasicAuth n'est pas attaché au routeur.

## CI/CD (GitHub Actions)

Un seul workflow, `.github/workflows/ci.yml` : le job `verifications` (la même liste
`npm run verifier` que le hook pre-push — elle ne diverge jamais) puis, s'il passe, le job
`deployer` — fonctions Convex d'abord, reconstruction du front sur le VPS ensuite.

Secrets à créer dans GitHub → Settings → Secrets and variables → Actions :

| Secret | Contenu |
|---|---|
| `CONVEX_SELF_HOSTED_URL` | `https://convex.pierrebrethes.cloud` |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | la clé générée à l'étape 4 |
| `VPS_HOTE` | l'IP du VPS |
| `VPS_UTILISATEUR` | l'utilisateur SSH |
| `VPS_CLE_SSH` | une clé privée SSH **dédiée au déploiement** (générée pour ça, ajoutée à `authorized_keys` du VPS) |
| `VPS_CHEMIN` | `/opt/worldwarsim` |

Un `convex deploy` dont la migration de schéma est incompatible avec les données en place
**échoue, et c'est voulu** : une saison en cours ne se casse pas en silence — on wipe
(off-season) ou on écrit la migration, puis on relance le job (`workflow_dispatch`).

## Dashboard

`https://convex-dashboard.pierrebrethes.cloud`, depuis n'importe quel navigateur. Deux
barrières successives : le BasicAuth de Traefik, puis la clé d'admin Convex à la connexion.
Le sous-domaine n'est pas secret — c'est le mot de passe qui tient la porte.

Le couple identifiant/hash est dans `WWS_DASHBOARD_AUTH` du `.env` du VPS (jamais commité, le
`.env` est ignoré). Pour le changer :

```bash
htpasswd -nbB <utilisateur> <mot de passe>          # sur le VPS
# reporter dans .env en DOUBLANT chaque `$` du hash — Compose interpole les valeurs du .env,
# et un `$tqFtK…` non doublé part en variable vide, ce qui laisserait un users vide.
docker compose -f docker-compose.yml -f deploiement/compose.prod.yml --profile prod up -d dashboard
```

La clé d'admin, elle, se régénère par `docker compose exec backend ./generate_admin_key.sh` :
elle dérive d'`INSTANCE_SECRET`, donc la relancer ne casse pas les clés déjà distribuées.

`NEXT_PUBLIC_DEPLOYMENT_URL` pointe sur l'origine publique : le dashboard parle au backend par
`https://convex.pierrebrethes.cloud`, depuis le navigateur — normal, il n'y a pas d'appel
serveur à serveur.

## Sauvegardes

Tout l'état vit dans le volume `convex-data` (SQLite). Un cron quotidien sur le VPS :

```bash
crontab -e
# 04h10 tous les jours, 14 jours de rétention
10 4 * * * cd /opt/worldwarsim && docker compose exec -T backend sqlite3 /convex/data/db.sqlite3 ".backup /convex/data/sauvegarde.sqlite3" && docker compose cp backend:/convex/data/sauvegarde.sqlite3 $HOME/sauvegardes/wws-$(date +\%F).sqlite3 && find $HOME/sauvegardes -name 'wws-*.sqlite3' -mtime +14 -delete
```

(`mkdir -p ~/sauvegardes` une fois. Le `.backup` SQLite est cohérent même à chaud.)
