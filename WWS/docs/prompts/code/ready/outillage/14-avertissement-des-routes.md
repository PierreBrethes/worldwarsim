# 14-avertissement-des-routes — `tsr.config.json` porte seul le motif qui écarte les tests de `src/routes/`, le plugin Vite et `generer-routes.mjs` le lisent tous deux, et `npm run types` n'imprime plus d'avertissement

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 13.

**À lire :** `scripts/generer-routes.mjs` (~1-6), `vite.config.ts` (~11-13),
`node_modules/@tanstack/router-generator/dist/esm/config.js` (~63-77 : `resolveConfigPath`,
`getConfig`), dans `node_modules/@tanstack/router-plugin/dist/esm/core/` : `config.js` ~33-34 et
`router-generator-plugin.js` ~18 et ~28-31 (le plugin passe par le même `getConfig` et relit le
fichier quand il change), `node_modules/@tanstack/router-generator/dist/esm/generator.js` ~505-520
(l'avertissement), `node_modules/@tanstack/router-plugin/package.json` ~110,
`WWS/simulation/README.md` ~11-16 et `scripts/exporter-etat-reference.mjs` ~11-15.

## Pourquoi

`scripts/generer-routes.mjs` ~6 appelle `getConfig({ target: 'react' }, root)` sans le
`routeFileIgnorePattern: '\\.test\\.tsx?$'` que `vite.config.ts` ~13 passe au plugin. Chaque
`npm run types` imprime donc dix lignes « Warning: Route file "…/src/routes/__root.test.tsx" does
not export a Route » (generator.js ~516) : deux fois par vérifieur avant 13, une fois depuis. L'IA
les lit à chaque vérification et apprend à passer sur un avertissement. Les deux configurations en
ligne du même générateur peuvent aussi diverger. Or `getConfig` lit un `tsr.config.json` à la racine
et fusionne les options en ligne par-dessus (config.js ~66-77), et le plugin Vite passe par la même
fonction (plugin `core/config.js` ~34) : un seul fichier suffit aux deux. Enfin, le script
importe `@tanstack/router-generator` sans le déclarer. Le paquet n'arrive que par
`@tanstack/router-plugin` 1.168.29, qui l'épingle **exactement** à `1.167.27`, la version installée
(son package.json ~110), et knip le signale : « Unlisted dependencies: @tanstack/router-generator
scripts/generer-routes.mjs:3:38 ». Le registre sert 1.167.38 le 23/09.

## Ce qui change

1. `tsr.config.json` (à créer), à la racine : `{ "routeFileIgnorePattern": "\\.test\\.tsx?$" }`,
   passé à prettier (il n'est pas dans `.prettierignore`). Rien d'autre : les défauts
   (`routesDirectory`, `generatedRouteTree`, `routeFileIgnorePrefix: "-"`) restent ceux d'aujourd'hui.
2. `vite.config.ts` ~13 : `TanStackRouterVite()`, sans option. Le fichier JSON n'admet pas de
   commentaire (`JSON.parse`, config.js ~73), donc le pourquoi reste ici. Le commentaire ~11-12,
   réécrit, dit que la config du générateur est `tsr.config.json`, lue par le plugin et par
   `scripts/generer-routes.mjs`, et qu'un `*.test.tsx` sous `src/routes/` n'est pas une route : le
   préfixer d'un tiret l'éloignerait du fichier qu'il teste.
3. `scripts/generer-routes.mjs` : l'appel ne change pas, puisqu'il lit déjà le fichier. Son
   commentaire d'en-tête nomme `tsr.config.json` en une phrase.
4. `package.json` : `@tanstack/router-generator` en devDependency, écrit `^1.167.27`, par
   `npm install -D @tanstack/router-generator@1.167.27` — **version exacte dans la commande** : avec
   `@^1.167.27`, npm prend la dernière (1.167.38), écrit `^1.167.38` et niche une seconde copie
   1.167.27 sous le plugin (vérifié à la relecture par `--package-lock-only` sur une copie). La
   commande exacte garde une seule copie, et npm écrit bien le caret. `package-lock.json` : une ligne.
5. Aucun script n'est renommé : `generer-routes.mjs`, `mesure-isolat.mjs` et
   `exporter-etat-reference.mjs` sont cités par 11 fichiers suivis (ADR 0023, RESTE-A-CODER,
   `convex/dev.ts`, prompts terminés…).
6. `WWS/simulation/README.md` (même constat d'audit ; aucun autre prompt ne le porte) : la commande
   ~12 prend `--token=… --saison=…`, et la phrase ~16 dit que le jeton de session et la saison se
   lisent dans le `localStorage` du joueur (`wws-session`, `wws-season`), comme l'en-tête du script.

## Ce que ce prompt ne fait pas

- Pas de renommage, et la chaîne du vérifieur ne bouge pas (13).
- Les noms de scripts faux de CLAUDE.md (`generer-monde.mjs`, `generer-regions.mjs`,
  `monde.json`), relevés par le même constat : 26.
- Ni `knip.json` ni knip au vérifieur (37).

## Cas d'acceptation (tests d'abord)

`T=$(mktemp -d)`, hors du dépôt. `src/routeTree.gen.ts` n'est pas suivi (`.gitignore`) : la
référence est une copie. Le cas 1 se lance **avant** tout changement.

1. Avant : `cp src/routeTree.gen.ts $T/routeTree.avant.ts` ; `npm run types > $T/types-avant.log 2>&1` ;
   `grep -c 'does not export a Route' $T/types-avant.log` vaut 1. `npx knip > $T/knip-avant.log`
   (code non nul attendu) cite `@tanstack/router-generator` sous « Unlisted dependencies ».
2. Après : `npm run types 2>&1 | grep -ci 'warning'` vaut 0.
3. `cmp src/routeTree.gen.ts $T/routeTree.avant.ts` est silencieux.
4. Le plugin lit le fichier : `npx vite build --logLevel warn --outDir $T/dist --emptyOutDir 2>&1 | grep -c 'does not export a Route'`
   vaut 0 alors que `vite.config.ts` ne passe plus d'option, et le `cmp` du cas 3 reste silencieux.
5. `npm ls @tanstack/router-generator` : une seule version, 1.167.27, la copie du plugin marquée
   `deduped`.
6. `npx knip` ne cite plus `@tanstack/router-generator`.
7. Le motif n'est écrit qu'une fois : `git grep --untracked -nF '\\.test\\.tsx' -- ':!WWS'` ne
   rend que `tsr.config.json` (sans `--untracked`, le fichier neuf est invisible à `git grep`).

## Vérifications

- Les commandes des cas 1 à 7.
- `npm run verifier` vert, et son journal sans `does not export a Route`.
- `git status --short` : `tsr.config.json` (nouveau), `vite.config.ts`, `scripts/generer-routes.mjs`,
  `package.json`, `package-lock.json`, `WWS/simulation/README.md`, rien d'autre.

## Rapport attendu

Format commun (README de la série), plus : les lignes d'avertissement de `npm run types` avant et
après ; les deux `cmp` ; la sortie de `npm ls @tanstack/router-generator` ; les lignes
« Unlisted » de knip avant et après ; `git diff --stat package-lock.json` (une ligne attendue).
