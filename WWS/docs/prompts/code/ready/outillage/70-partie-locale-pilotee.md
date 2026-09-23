# 70-partie-locale-pilotee — L'IA pilote une partie locale sans rien réinventer : `window.wws.toScreen` en dev, `dev:complet` dans `launch.json`, et le skill `wws-partie-locale`

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 69, P2.
**Pierre d'abord :** P2 fait, et `claude` relancé d'un terminal neuf. `launch.json`, les hooks et
les serveurs MCP tournent avec le PATH du process `claude`, où `/usr/local/bin` passe devant nvm :
c'est un node 19, sous lequel vite plante (vérifié par l'audit).

**À lire :** `src/map/WorldMap.tsx` (l'effet ~172-195 : `window.mapEngine` en DEV ~177, le
nettoyage), `src/map/engine/index.ts` (`camera` ~146, `renderer` ~147, `frame` ~149, privés ;
`pointAt` ~475 ; `aimAt` ~492, l'inverse de ce qu'on écrit), `src/map/engine/frame.ts`
(`projectLonLat` ~55), `src/map/engine/labels.ts` ~160-175 (la même projection, relative au
canevas), `src/map/engine/frame.test.ts` ~1-12 (un `WorldFrame` sans WebGL), `.claude/launch.json`,
`package.json` (`dev:complet` ~15), `scripts/partie-locale.mjs` et sa sortie (69).

## Pourquoi
Pendant les vérifications à l'écran, la projection lon/lat → écran a été réécrite en JS 8 fois dans
une seule session (b5f855fe : `window.__toScreen` par `e.frame.projectLonLat`), alors que le moteur
est exposé en DEV. `.claude/launch.json` ne lance que `npm run dev`, sans `convex dev`, et sous
node 19 il ne démarre pas. Le serveur a été lancé et tué à la main (`nohup … &`, `pkill -f vite`)
dans 4 sessions ; « Deux navigateurs Chrome sont connectés » a arrêté une session (327da3d6) ; l'état
a été lu par 19 appels `npx convex` en 3 sessions, jetons en dur, sortie coupée par `tail`.

## Ce qui change
0. `ps eww -p $PPID | tr ' ' '\n' | grep '^PATH='`, puis `env -i PATH=<ce PATH> node --version` :
   pas v24, P2 n'est pas fait ; faire 1 et 3, écrire 2 sans l'essayer, et le dire.
1. **`window.wws`, en DEV seulement.**
   - `src/map/engine/client-point.ts` (à créer) : `clientPointOf(position: Vector3, camera: Camera,
     rect: { left; top; width; height }): { x: number; y: number } | null`, par
     `position.clone().project(camera)` : des coordonnées client (celles de `MouseEvent.clientX/Y`),
     `null` derrière la caméra ou hors du canevas (NDC hors de [-1, 1]).
   - `MapEngine.clientPointAt(lonLat: LonLat)` : `clientPointOf(this.frame.projectLonLat(lonLat),
     this.camera, this.renderer.domElement.getBoundingClientRect())` — la hauteur par défaut de
     `projectLonLat` est celle que vise `aimAt`.
   - `WorldMap.tsx`, dans le `if (import.meta.env.DEV)` de `mapEngine`, même forme de cast :
     `wws = { toScreen: (lon, lat) => instance.clientPointAt([lon, lat]) }`, retiré au nettoyage
     de l'effet (sur un moteur libéré, `toScreen` rendrait n'importe quoi).
2. **`.claude/launch.json`** : une configuration `dev:complet` (`runtimeExecutable: npm`,
   `runtimeArgs: ["run", "dev:complet"]`, les autres clés comme `dev`, qui reste). Son
   `convex dev` pousse vers le `CONVEX_SELF_HOSTED_URL` de `.env.local` : d'où l'ordre du skill.
3. **`.claude/skills/wws-partie-locale/SKILL.md` (à créer)**, 60 lignes au plus. Frontmatter
   `name`, et une `description` qui dit quand le prendre (« vérifier à l'écran », « lancer le
   jeu », « partie locale », « tester dans le navigateur ») : le skill intégré `run` cherche d'abord
   un skill de lancement du projet. Dans l'ordre :
   a. Backend local seulement : jamais une URL `pierrebrethes.cloud`, jamais `convex deploy`.
   b. `npm run partie:locale [--qg]` d'abord : sa garde refuse un `.env.local` distant (sortie 2 :
      s'arrêter). Sur « Could not find public function » : c, puis relancer.
   c. Le serveur : la configuration `dev:complet` ; sans outil de lancement, `npm run dev:complet`
      par l'outil Bash en `run_in_background`, arrêté en fin de tâche (TaskStop) — jamais `nohup`,
      jamais `pkill`.
   d. Le navigateur : Chrome, par l'extension Claude in Chrome (`mcp__claude-in-chrome__*`, chargés
      en un seul `ToolSearch`). `list_connected_browsers` : s'il y en a deux, `select_browser` sur
      celui du Mac, nommé tel que l'outil le rend à l'essai. Mobile : `resize_window`, 375 px.
   e. Un siège : ses lignes `localStorage` (sortie de 69 ou `.partie-locale.json`) par
      `javascript_tool`. Un siège par origine : deux onglets de `localhost:5173` partagent le
      stockage. Deux sièges à la fois par `127.0.0.1:5173` seulement si le serveur y répond —
      mesuré à l'essai, et le skill dit ce qui est vrai.
   f. Viser : `window.wws.toScreen(lon, lat)` puis un clic en `{ x, y }` ; `null` : recentrer
      d'abord, `window.mapEngine.journeyTo([], [[lon, lat]])`.
   g. Lire sans capture : `npx convex run dev:snapshot '{"token":"…","seasonId":"…"}'` dans un
      fichier du scratchpad, puis les clés utiles ; une table : `npx convex data <table> --limit 20`.
   h. Fin : serveur arrêté, rien de neuf dans `git status`.

## Ce que ce prompt ne fait pas
Pas de serveur MCP Convex : réévalué, `dev:snapshot` et `convex data` suffisent. Rien d'exposé en
production. `scripts/partie-locale.mjs` ne change pas, ni aucun état mis en scène au-delà du QG.

## Cas d'acceptation (tests d'abord)
1. `src/map/engine/client-point.test.ts` (à créer), rouge d'abord : `WorldFrame` monté comme dans
   `frame.test.ts`, `PerspectiveCamera` au-dessus de l'Europe (`lookAt`, `updateMatrixWorld()`),
   rect `{ left: 10, top: 20, width: 400, height: 300 }`. (a) Paris tombe dans le rect, et le rayon
   `setFromCamera` bâti comme dans `aimAt` depuis ce point passe à moins de 1e-3 de
   `frame.projectLonLat(Paris)`. (b) Derrière la caméra : `null`. (c) Hors du cadre : `null`.
2. `npm run build`, puis `grep -l "toScreen\|mapEngine" dist/assets/*.js` ne rend rien.
3. Essai réel, skill suivi à la lettre : `partie:locale -- --qg`, `dev:complet`, siège A ouvert.
   Dans l'onglet, `const p = wws.toScreen(2.35, 48.86); mapEngine.pointAt(p.x, p.y)` rend Paris à
   0,1° près ; au rapproché, le survol de l'outil navigateur en `p` fait paraître l'infobulle de
   Paris (ses coordonnées sont donc celles du client). Même contrôle à 375 px.
4. `.claude/launch.json` se parse (`node -e "JSON.parse(…)"`) ; `npx prettier --check
   .claude/launch.json`. Serveur arrêté à la fin : `curl -s -m 1 http://localhost:5173` échoue.

## Vérifications
`npx vitest run src/map/engine/client-point.test.ts src/map/engine/frame.test.ts` ;
`npm run verifier` vert ; le nombre d'appels navigateur de l'essai du cas 3.

## Rapport attendu
Format commun (README de la série), plus : le PATH du process `claude` et son node ; les appels
navigateur de l'essai ; si `127.0.0.1:5173` répond ; le navigateur retenu ; « À trancher » :
`Bash(npx convex run dev:snapshot *)` et `Bash(npm run partie:locale*)` en `allow` de
`.claude/settings.json` ; un `window.wws.regionAt` si l'essai l'a réclamé.
