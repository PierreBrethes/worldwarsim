# 38-shell-sans-cycle — Le shell n'importe plus la route plateau, et un test refuse toute composante cyclique sous `src/`

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `src/routes/plateau.tsx` (~188-282 : `WINDOWS`, `BoardWindow`, `BoardSearch`,
`WINDOW_OF_BUILDING`, `FOCUSED_WINDOWS`, `withWindow`, `withoutWindow`, `toggleWindow`,
`windowOpen`, `readWindows` ; ~284-290 `validateSearch` ; ~593 seul lecteur de
`WINDOW_OF_BUILDING`), `src/shell/NationBanner.tsx` ~9, `src/shell/NationCartouche.tsx` ~4,
`src/shell/SurfaceRail.tsx` ~7-9 et ~75, `src/routes/-plateau/GunneryButton.tsx` (`AbacusMark`
~27-55), `src/routes/-plateau/board-search.test.ts`, `convex/invariants.test.ts` ~132-165.

## Pourquoi
1015758 (18/08) a retiré madge en affirmant que knip couvrait tout, or knip 6 exclut les cycles
par défaut (`node_modules/knip/dist/util/get-included-issue-types.js` ~3). Le graphe des imports de
valeur (188 fichiers de `src/` et `convex/`, tests exclus) a deux composantes fortement connexes :
- **cinq fichiers** : `plateau.tsx` importe `Shell.tsx`, qui importe `SurfaceRail.tsx` et
  `NationBanner.tsx` (lequel importe `NationCartouche.tsx`), et ces trois-là importent
  `plateau.tsx`. Le shell, « partagé par toutes les surfaces », importe
  l'état d'URL d'une route (`withWindow` et `BoardSearch` dans NationBanner ~9 et NationCartouche
  ~4 ; `BoardWindow`, `BoardSearch`, `toggleWindow` et `windowOpen` dans SurfaceRail ~7-8). Il
  importe aussi un composant du dossier privé de la route (`AbacusMark`, SurfaceRail ~9) ;
- **vingt modules de `convex/`** (`troops`, `combat`, `seasons`, `press`, `movement/*`…). C'est sans
  danger tant qu'aucun module ne travaille à l'import, ce que garde `invariants.test.ts` ~144.

## Ce qui change
Rangement pur, aucun changement de comportement.
1. `src/shell/board-search.ts` (à créer, sans React ni import de route) reçoit `WINDOWS` (~188-204,
   avec ses commentaires), `BoardWindow`, `BoardSearch`, `FOCUSED_WINDOWS` (~255), `withWindow`,
   `withoutWindow`, `toggleWindow`, `windowOpen` et `readWindows` (~277, désormais exporté).
   **Le code l'exige** : `BoardWindow` dérive de `WINDOWS`, `withoutWindow` lit `FOCUSED_WINDOWS`,
   `readWindows` lit `WINDOWS`. Les laisser dans la route forcerait à en exporter `WINDOWS`.
   `WINDOWS` reste privé au module.
2. `plateau.tsx` garde `WINDOW_OF_BUILDING` et `validateSearch`, et importe de
   `@/shell/board-search` ce qu'il lit (`BoardWindow`, `BoardSearch`, `withWindow`,
   `withoutWindow`, `readWindows`). Aucun ré-export (§6).
3. `src/shell/AbacusMark.tsx` (à créer) reçoit `AbacusMark` et sa JSDoc. La phrase « Exporté
   depuis que le rail le porte (59a) » devient la raison de son adresse : le rail et la porte de
   l'abaque le partagent. `GunneryButton.tsx` l'importe de là.
4. `NationBanner`, `NationCartouche` et `SurfaceRail` importent de `./board-search` et
   `./AbacusMark`.
5. `board-search.test.ts` devient `src/shell/board-search.test.ts` (Write, puis `rm` de l'ancien ;
   pas de `git mv`, qui indexerait) : seul son import change (`./board-search`).
6. `src/import-cycles.test.ts` (à créer, une quarantaine de lignes, projet vitest `front`) :
   - le graphe lit `src/**/*.{ts,tsx}` et `convex/**/*.ts`, sans les `*.test.*`,
     `convex/_generated/` ni `src/routeTree.gen.ts` ;
   - ses arêtes sont les `import … from` et `export … from`, y compris écrits sur plusieurs lignes
     (`convex/` en est plein). `@/` se résout vers `src/`, le relatif vers `.ts`, `.tsx` ou
     `index.ts`, et les paquets sont ignorés ;
   - `import type` et `export type … from` ne comptent pas : ils sont effacés. `import { type X }`
     compte : sous `verbatimModuleSyntax`, il reste un import à l'exécution. Les `import()`
     dynamiques (les fenêtres `lazy` du plateau) ne comptent pas non plus ;
   - Tarjan sur ce graphe. Le test échoue sur toute composante de plus d'un fichier qui en contient
     un de `src/`, et nomme ses fichiers. `convex/` est dans le graphe parce que `src/i18n/fr.ts`
     ~11 importe `convex/constants` : un cycle qui y passe pour revenir dans `src/` compte ;
   - une composante entièrement sous `convex/` est tolérée, et un commentaire renvoie à
     `invariants.test.ts` ~144 pour la raison.

## Ce que ce prompt ne fait pas
- Les vingt modules de `convex/` restent en une composante : pas de découpage.
- Pas de règle eslint « le shell n'importe pas les routes », bien que le test laisse passer un
  `import type` du shell vers une route : « À trancher ». Pas de `cycles` dans la configuration de knip (37).

## Cas d'acceptation (tests d'abord)
1. Écrit avant le déplacement, `import-cycles.test.ts` est rouge, nomme les cinq fichiers et rien
   de `convex/`.
2. Après : vert. `git grep --untracked -n "@/routes" -- src/shell` et
   `git grep --untracked -n "'\.\./plateau'" -- src` ne rendent rien.
3. Mutation : `import { Route } from '@/routes/plateau';` et `void Route;` dans `SurfaceRail.tsx`
   refont tomber le test. `import type { Route }` seul (sans le `void`), il reste vert. Retirer.
4. Si `knip.jsonc` existe (37), `npx knip --include cycles` ne liste plus que des chemins de
   `convex/`.

## Vérifications
- `npx vitest run src/import-cycles.test.ts src/shell` : vert, avec sa durée.
- Les blocs retirés de `plateau.tsx` et `GunneryButton.tsx` (`git diff`) et les nouveaux fichiers
  ne diffèrent que par les imports, l'`export` de `readWindows` et la phrase de la JSDoc
  d'`AbacusMark` (point 3) : le montrer par un `diff`.
- `npm run verifier` : vert.

## Rapport attendu
Format commun (README de la série), plus :
- la sortie rouge du cas 1 ;
- le nombre de fichiers du graphe et la taille de la composante `convex/`, tels que le test les voit ;
- la durée du test ;
- toute autre composante découverte en route.
