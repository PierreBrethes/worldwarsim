# Déploiement — Convex auto-hébergé ([ADR 0010](../WWS/docs/adr/0010-convex-auto-heberge-sur-vps.md))

La même pile partout : `convex-backend` + dashboard en Docker, front statique Nginx. En dev le
front tourne via Vite, sur le VPS il est servi par le conteneur `front`.

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

## VPS (Hostinger)

Mêmes étapes 1-2 sur le VPS, avec les origines publiques dans `.env` :

```
INSTANCE_SECRET=<un autre secret>
CONVEX_CLOUD_ORIGIN=https://convex.<domaine>
CONVEX_SITE_ORIGIN=https://actions.convex.<domaine>
```

Puis la pile complète, front compris :

```bash
docker compose --profile prod up -d --build
```

Le front écoute sur `:8080`, le backend sur `:3210` — mettre un reverse proxy (Caddy, Traefik ou
le Nginx de l'hôte) devant, avec TLS, qui route `<domaine>` → `:8080` et `convex.<domaine>` →
`:3210`. Le WebSocket de Convex exige que le proxy passe les upgrades.

## CI (GitHub Actions)

`.github/workflows/deployer.yml` : tests + build sur chaque poussée ; sur `main`, déploiement des
fonctions Convex vers le VPS puis reconstruction du front sur place.

Secrets à créer dans GitHub → Settings → Secrets and variables → Actions :

| Secret | Contenu |
|---|---|
| `CONVEX_SELF_HOSTED_URL` | `https://convex.<domaine>` |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | la clé générée sur le VPS |
| `VPS_HOTE` | IP ou domaine du VPS |
| `VPS_UTILISATEUR` | utilisateur SSH |
| `VPS_CLE_SSH` | clé privée SSH dédiée au déploiement |
| `VPS_CHEMIN` | chemin du dépôt sur le VPS, ex. `/opt/worldwarsim` |

## Sauvegardes

Tout l'état vit dans le volume `convex-data` (SQLite). Un cron sur le VPS suffit :

```bash
docker compose exec backend sqlite3 /convex/data/db.sqlite3 ".backup /convex/data/sauvegarde.sqlite3" \
  && docker compose cp backend:/convex/data/sauvegarde.sqlite3 ~/sauvegardes/wws-$(date +%F).sqlite3
```
