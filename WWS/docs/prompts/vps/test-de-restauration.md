---
type: prompt
statut: validé
maj: 2026-10-04
code: [deploiement/README.md, docker-compose.yml, deploiement/compose.prod.yml]
decisions: []
voir: [../../RESTE-A-CODER.md, cles-vapid.md]
---
# test-de-restauration — prouver qu'une sauvegarde se relit, avant la première saison entre amis

**En bref.** Le plus vieux point de « bloquant pour la partie de contrôle » (`RESTE-A-CODER.md`) :
la restauration d'une sauvegarde n'a jamais été essayée. Le README prévoit un cron quotidien
(`sqlite3 .backup` dans le conteneur `backend`, copie dans `~/sauvegardes`, 14 jours). Ce prompt,
pour le Claude du VPS, vérifie que ce cron tourne vraiment, puis restaure la dernière copie sur un
backend **jetable**, sans jamais toucher la production.

À coller dans le Claude du VPS (section « Le prompt »).

---

## Le prompt

Tu es sur le VPS de La Manchette (`/opt/worldwarsim`, Docker Compose, backend Convex auto-hébergé
dont l'état vit dans le volume `convex-data`, SQLite). Je veux savoir si une sauvegarde se
restaure. **Règles absolues** : ne touche ni au conteneur `backend` de production, ni à son
volume, ni à sa configuration ; n'affiche jamais une clé d'administration, une clé VAPID ou un
secret d'instance ; ne supprime aucune sauvegarde. Si un garde-fou t'arrête, ne contourne pas :
donne-moi le bloc de commandes à lancer moi-même, qui n'affiche aucun secret.

1. **Le cron existe-t-il ?** `crontab -l` (cherche la ligne `.backup`). Liste `~/sauvegardes`
   (dates, tailles). Si le dossier est vide, ou si la plus récente a plus de 26 h, arrête-toi ici
   et dis-moi pourquoi (par exemple : `sqlite3` absent de l'image du backend — vérifie avec
   `docker compose exec -T backend sh -c 'command -v sqlite3'`).
2. **Ce que la sauvegarde couvre.** Liste le contenu de `/convex/data` dans le conteneur de
   production (`docker compose exec -T backend ls -la /convex/data`, lecture seule). Dis si des
   dossiers (fichiers stockés, modules) existent à côté de `db.sqlite3` et ne sont donc pas dans la
   sauvegarde.
3. **Intégrité.** Copie la sauvegarde la plus récente dans `/tmp/wws-restau/db.sqlite3` et lance
   `PRAGMA integrity_check;` dessus (avec `sqlite3` de l'hôte ou une image `alpine` jetable).
4. **Restauration sur un backend jetable.** Démarre un conteneur à part, avec **la même image et
   la même version** que le backend de production (`docker inspect` pour les lire), le même
   environnement que lui **sauf** le port, publié sur `127.0.0.1:3299` uniquement, sans étiquette
   Traefik, nom `wws-restau`, avec `/tmp/wws-restau` monté comme `/convex/data`. Attends qu'il
   réponde.
5. **Lire les données restaurées.** Génère une clé d'administration **dans `wws-restau`**
   (`./generate_admin_key.sh`), garde-la dans une variable, et avec
   `npx convex data --url http://127.0.0.1:3299 --admin-key "$KEY"` compte les lignes de `seasons`,
   `players`, `accounts`, `troops` et `movements`. Fais les mêmes comptes sur la production (lecture
   seule, sa propre clé, jamais affichée). Les écarts doivent s'expliquer par ce qui s'est passé
   depuis l'heure de la sauvegarde.
6. **Démonter.** `docker rm -f wws-restau`, supprime `/tmp/wws-restau`. Vérifie avec
   `docker compose ps` que la production n'a pas bougé.

**Rends-moi en six lignes au plus** : date et taille de la dernière sauvegarde ; ce qu'elle ne
couvre pas ; intégrité ; restauration (oui ou non, et en combien de temps) ; tableau des comptes
restauré / production ; ce qu'il faudrait corriger. Puis la procédure de restauration réelle que tu
recommandes, en commandes complètes, à ajouter au README (§ Sauvegardes) — sans l'exécuter.
