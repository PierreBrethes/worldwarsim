# 36-regles-react-compiler — Les règles du React Compiler sont actives, chaque fonction qu'il saute l'est pour une raison écrite, et la ligne du fondateur suit l'heure

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 34.

**À lire :** `vite.config.ts` ~15 (`reactCompilerPreset({ target: '18' })`), `eslint.config.js`
(bloc `react-hooks`), `useClock` (`src/shell/clock.ts` ; modèle `LootCrateCard.tsx` ~20),
`recommended-latest` dans `node_modules/eslint-plugin-react-hooks/cjs/eslint-plugin-react-hooks.production.js`
(~55242-55290). Les sites : `-plateau/NationWindow.tsx` ~234-245 (`FounderLine`), `dragging.ts`
~132-156, `plateau.tsx` ~481-497 et ~1425-1433, `__root.tsx` ~80-102 (la boucle React #301) et
`__root.test.tsx`, `src/map/` : `WorldMap.tsx` ~245-296, `MapLabels.tsx` ~221, `EdgeIndicators.tsx` ~103.

## Pourquoi
Le compilateur est branché depuis 3d9545a (18/08), mais `eslint.config.js` n'active que deux règles
du plugin 7.1.1. `recommended-latest` donne **13 erreurs**, rejouées à la rédaction : 6
`immutability` (`EdgeIndicators.tsx` ~103/105, `MapLabels.tsx` ~221/223, `WorldMap.tsx` ~247/296),
3 `set-state-in-effect` (`plateau.tsx` ~483, ~490, ~1432), 2 `refs` (`__root.tsx` ~97/101), 1
`purity` (`NationWindow.tsx` ~240), 1 `preserve-manual-memoization` (`dragging.ts` ~133,
« Compilation Skipped »). Le logger du compilateur compte 194 fonctions compilées et 6 sautées :
`WorldMap` ~127, `MapLabels` ~52, `EdgeIndicators` ~37, `useAccount` (`__root.tsx` ~88),
`useDragOffset` (`dragging.ts` ~102) et `ConnectedSignIn` (`connexion.tsx` ~68), qui bute sur un
`try … finally`, limite du compilateur que le lint ne signale pas. **Un vrai bug** : `FounderLine`
est compilée, et sa sortie ne recalcule `… <= Date.now()` que si `absence.concludeOpensAt` ou
`absence.hours` change : « la saison peut être close » (`founderAbsentOpen`) arrive en retard.

## Ce qui change
1. **Comportement, seul dans `NationWindow.tsx` et son test.** `FounderLine` commence par
   `const now = useClock(60_000);`, avant son `return null` (règle des hooks), et compare
   `absence.concludeOpensAt <= now`. Elle est exportée pour son test.
2. `eslint.config.js` : le bloc `react-hooks` vise `src/**/*.{ts,tsx}` et prend
   `...reactHooks.configs['recommended-latest'].rules`. Les deux règles écrites à la main
   disparaissent : elles y sont, aux mêmes sévérités. `convex/` perd `rules-of-hooks` (34 y interdit React).
3. Corrigés :
   - `dragging.ts` ~132 : `useCallback` retiré (`const grab: Grab = (event) => { … }`), le
     compilateur mémoïse seul ; vérifié sur une copie, `useDragOffset` passe en `CompileSuccess`.
   - `plateau.tsx` ~483 (`selectedCamp`) et ~490 (`selectedLoot`) : chaque effet qui remet la
     sélection à `null` devient un ajustement au rendu, gardé par sa condition :
     `if (selectedCamp !== null && !view.camps.some(…)) setSelectedCamp(null);`. Vérifié sur une
     copie : le lint n'y garde que ~1432, `BoardContent` compile. Le rendu cache déjà la fiche d'un
     relevé disparu (~1312, ~1318) ; l'effet sert à oublier la sélection, pour qu'elle ne rouvre pas
     au retour du relevé — d'où l'interdit : ne pas dériver `selected && présent ? selected : null`.
4. **Désactivés, chacun avec son pourquoi** (`// eslint-disable-next-line <règle> -- <pourquoi>`,
   ou une paire `disable`/`enable`) :
   - `react-hooks/immutability` sur les rappels du moteur (`onAct`, `onOrientationStarted`,
     `onLabels`, `onEdges`), couture du §10 ; ces trois composants restent non compilés. `MapLabels`
     et `EdgeIndicators` sont signalés deux fois : à `useEffect(` (~221, ~103) et à l'affectation ;
   - `react-hooks/refs` sur `__root.tsx` ~97/101 : la dernière réponse connue vit hors de l'état
     exprès ; un `setState` au rendu est le ressort de la boucle #301 (~80-86, `__root.test.tsx`) ;
   - `react-hooks/set-state-in-effect` sur `plateau.tsx` ~1432 : un recadrage unique, à l'arrivée
     de la vue. C'est un événement, pas un état dérivé.
   **Jamais `exhaustive-deps` ni `rules-of-hooks`** : vérifié, une telle directive fait sauter tout le
   composant (« …React ESLint rules were disabled ») ; sur une règle du compilateur, elle ne change rien.

## Ce que ce prompt ne fait pas
- Pas d'API d'abonnement du moteur qui rendrait `WorldMap`, `MapLabels` et `EdgeIndicators`
  compilables. Pas de `'use no memo'`. `ConnectedSignIn` ne change pas.
- Les `Date.now()` qu'un rendu atteint par une fonction, invisibles au lint, ne sont pas corrigés.
  `remaining` (`accueil.tsx` ~449, lu par `GameRow` ~331) est mémoïsé, vérifié, sur
  `seat.launchedAt` et `seat.durationHours`. `previewArc` (`plateau.tsx` ~1876-1919) est à voir.

## Cas d'acceptation (tests d'abord)
0. Sonde dans `T=$(mktemp -d)`, hors du dépôt : un script CJS passe chaque `src/**/*.{ts,tsx}`
   (hors tests et `routeTree.gen.ts`) par `transformSync` de `@babel/core`
   (`parserOpts.plugins: ['typescript', 'jsx']`) avec `babel-plugin-react-compiler`, tous deux
   requis par chemin absolu du dépôt, et `{ target: '18', logger: { logEvent } }`. Il compte
   `CompileSuccess` et liste chaque `CompileError` (`fnLoc.start.line`). Avant : 194 à la rédaction
   (un prompt passé depuis a pu le déplacer : seul l'écart compte au cas 4), et 8 `CompileError`
   pour les 6 fonctions (`WorldMap` et `useAccount` en émettent deux chacune).
1. `FounderLine` exportée d'abord, seule, pour que le rouge porte sur le texte et non sur
   l'import. `src/routes/-plateau/NationWindow.test.tsx` (à créer) : jsdom,
   `@testing-library/react`, faux temps. `FounderLine`, avec `concludeOpensAt` à maintenant + 30 s,
   rend `fr.nationSheet.founderAbsent(…)`. Après `act(() => vi.advanceTimersByTime(61_000))`, il
   rend `founderAbsentOpen(…)`. Rouge avant la correction, puisque rien ne re-rend ; vert après.
2. Puis la config seule : `npm run lint` rouge, les 12 erreurs restantes (la `purity` est tombée
   avec le cas 1), et aucune autre.
3. Après : lint vert, 0 avertissement ; `git grep -n "eslint-disable" -- src` ne rend que les
   directives du point 4, chacune avec `-- `. Sans celle de `WorldMap.tsx` ~247, le lint rougit.
4. Sonde après : une compilée de plus (`useDragOffset` ; `FounderLine` toujours), 5 fonctions
   sautées (7 événements). Le code compilé de `FounderLine` ne contient plus `Date.now()`.

## Vérifications
- `npx vitest run src/routes` : vert, dont `__root.test.tsx`, qui compte les rendus de la porte.
- `npm run verifier` : vert ; durée de `npm run lint`, avant et après.

## Rapport attendu
Format commun (README de la série), plus :
- la sonde avant et après (compteurs et liste), la sortie rouge du cas 1, les 12 erreurs du cas 2 ;
- **deux messages de commit**, dans cet ordre, chacun vert seul : A (comportement), `NationWindow.tsx`
  et son test ; B (outillage), `eslint.config.js`, `dragging.ts`, `plateau.tsx`, `__root.tsx`, `src/map/`.
- en « À trancher » : `remaining`, `previewArc`, `ConnectedSignIn`, l'API d'abonnement du moteur.
