# 20-deux-postes — Vite ne scrute les fichiers que sous `/mnt/` (le poste WSL), et le README de déploiement décrit le dev local des deux postes

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `vite.config.ts` (`server.watch` ~21-23 et son commentaire ; l'alias `@` ~19, qui lit
déjà `import.meta.url` ; la ligne `process.env.TZ` posée par 05, à laisser), `.githooks/pre-push`
(branche Windows ~6-22, à laisser), `deploiement/README.md` (titre ~19 « Dev local (Windows,
Docker Desktop) », § « Démarrage local » ~80-111).

## Pourquoi

Deux postes commitent. Windows + WSL, dépôt sous `/mnt/c` : 124 commits de Taco depuis le 01/08,
le dernier le 16/09 (81b476d), plus 17 de root@DESKTOP-49L19S7. macOS : 38 commits de
PierreBrethes. Or `vite.config.ts` ~21-23 impose `usePolling: true, interval: 300` à tous, au nom
de `/mnt/c` (« inotify ne traverse pas le pont WSL2 ») : sur le Mac, où les événements natifs
arrivent, chokidar relit l'arbre toutes les 300 ms pour rien (coût non mesuré). Vérifié à la
rédaction : la configuration chargée sur le Mac rend `{"usePolling":true,"interval":300}` (cas 1).
`deploiement/README.md` ~19 intitule « Dev local (Windows, Docker Desktop) » une procédure qui
tourne telle quelle sur le Mac (Docker Desktop, image backend arm64), et rien ne dit ce qui diffère.

## Ce qui change

1. `vite.config.ts` : une constante de module, `onWindowsDrive`, vraie quand le dossier du fichier
   de configuration commence par `/mnt/` : `fileURLToPath(new URL('.', import.meta.url))`, le
   mécanisme de l'alias `@`, indépendant du dossier d'où l'on lance Vite. Puis
   `server: { watch: { usePolling: onWindowsDrive, interval: 300 } }`.
   **Décision : le chemin, pas `WSL_DISTRO_NAME`.** La cause est le pont 9P de `/mnt/`, pas WSL :
   un clone dans le home de WSL (ext4) reçoit les événements inotify.
2. Le commentaire garde le pourquoi, mis à jour, trois lignes au plus : sous `/mnt/` (le disque
   Windows lu depuis WSL), inotify ne traverse pas le pont WSL2 et le HMR resterait muet ; ailleurs
   (macOS, ou un clone dans le home de WSL), les événements natifs suffisent.
3. `deploiement/README.md` : le titre ~19 devient `## Dev local (macOS ou Windows/WSL)`. Dans
   « Démarrage local », avant l'étape 1, un bloc « Ce qui diffère entre les deux postes », huit
   lignes au plus :
   - les deux : Docker Desktop, le même `docker-compose.yml`, les mêmes fichiers `.env` et
     `.env.local` à créer (étapes 1 à 3) ;
   - Windows + WSL : dépôt sous `/mnt/c`, `npm install` et `npm run` depuis WSL (les binaires
     natifs de `node_modules`, rolldown et esbuild, sont des `.so` Linux) ; un `git push` lancé de
     Windows relaie le pre-push à WSL ; Vite y scrute les fichiers ;
   - macOS : Node par nvm, la version de `.nvmrc` (posé par 10 ; « Node 24 » s'il manque encore) ;
     pas de scrutation.
4. L'étape 3 garde ses trois variables. `VITE_CONVEX_SITE_URL` n'est lu nulle part
   (`git grep -n VITE_CONVEX_SITE_URL -- src convex scripts` ne rend rien) : il ne s'y ajoute pas.

## Ce que ce prompt ne fait pas

- La section « Instructions » de `CLAUDE.md` : c'est le 21. `.githooks/pre-push` ne bouge pas : la
  branche Windows reste, nvm et le garde-fou de version sont au 11.
- Les procédures de prod rangées sous ce titre (wipe de C3, presse, mot de passe, paragraphe C2)
  restent où elles sont : la restructuration du README est au 67.
- `.env.local` n'est pas modifié (il porte la clé d'admin locale), et aucune de ses valeurs ne
  s'affiche.
- Pas de variable de forçage (`WWS_POLLING`) : le chemin suffit.

## Cas d'acceptation (tests d'abord)

Commande de contrôle, depuis la racine (le chargeur `runner` n'écrit aucun fichier temporaire) :

```
node --input-type=module -e "const { loadConfigFromFile } = await import('vite'); const r = await loadConfigFromFile({ command: 'serve', mode: 'development' }, undefined, process.cwd(), 'silent', undefined, 'runner'); console.log(JSON.stringify(r.config.server.watch))"
```

1. Avant tout changement, sur le Mac : `{"usePolling":true,"interval":300}` (vérifié à la
   rédaction). C'est le test rouge.
2. Après : `{"usePolling":false,"interval":300}`.
3. `git grep -n "usePolling" -- vite.config.ts` : une seule ligne, qui lit `onWindowsDrive`.
4. `grep -n "^## Dev local" deploiement/README.md` rend `## Dev local (macOS ou Windows/WSL)`, et
   `git grep -n "Windows, Docker Desktop"` ne rend rien.
5. `git diff --quiet -- .githooks/pre-push` sort en 0 ; `git diff --stat` ne montre que
   `vite.config.ts` et `deploiement/README.md`.

## Vérifications

- La commande de contrôle, avant et après.
- `npx prettier --check vite.config.ts` : vert.
- `npm run verifier` : vert (le build charge la configuration).

## Rapport attendu

Format commun (README de la série), plus :

- les deux sorties de la commande de contrôle ;
- le contrôle que Pierre fera sur le poste Windows : depuis WSL, `npm run dev`, enregistrer un
  fichier de `src/`, le HMR doit suivre ; sinon, afficher sur ce poste la valeur de
  `fileURLToPath(new URL('.', import.meta.url))` ;
- à signaler : `VITE_CONVEX_SITE_URL`, présent dans `.env.local`, n'est lu nulle part. Pierre peut
  retirer la ligne ; l'agent n'y touche pas. Le constater par
  `grep -c '^VITE_CONVEX_SITE_URL=' .env.local`, qui n'affiche qu'un compte.
