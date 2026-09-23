# 55-fenetres-montees — quatre fenêtres du plateau se montent en jsdom sur une vraie vue, sans exception ni boucle de rendu

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 53.

**À lire :** `src/routes/__root.test.tsx` (le motif : faux `ConvexReactClient`, `RENDER_CEILING =
5` et sa raison ~35), `src/routes/-plateau/Window.test.tsx` ~17-37 (`matchMedia` et
`ResizeObserver` posés à la main), `src/routes/plateau.tsx` ~1572, ~1623, ~1650 et ~1757 (les
props que le plateau donne à `ConstructionPanel`, `GarrisonPanel`, `MovementPreview` et
`EconomyWindow`) et ~1461 (`movements.preview`, d'où vient l'aperçu), les signatures
(`EconomyWindow.tsx` ~61, `GarrisonPanel.tsx` ~51, `ConstructionPanel.tsx` ~47,
`MovementPreview.tsx` ~81), `convex/view-adapter.test.ts` (créé par 53 : son scénario, ses
instants de lecture, son `worldOf`).

## Pourquoi

`src/routes/-plateau/` compte 34 fichiers et 4 tests. Sur les 80 derniers commits, `plateau.tsx`
(2 001 lignes) a changé 25 fois, `MovementPreview` et `GarrisonPanel` 9 fois, `EconomyWindow`
(1 537 lignes) et `ConstructionPanel` 7 fois. Aucun test ne les monte. Le 13/09, un React #301
(setState pendant le rendu) a cassé toutes les pages (6fcc670), et le correctif n'a ajouté qu'un
test de rendu, à `__root`. Monter `plateau.tsx` entier serait un chantier de taille L, et fragile :
route TanStack, loader, `useSearch`, dix points d'API, WebGL. On ne le fait pas. Les fenêtres
feuilles, elles, n'emploient aucun hook de routeur.

**Le code contredit le cahier des charges.** Aucune des quatre n'appelle `useQuery`. Chacune
reçoit la `PlayerView` adaptée en prop (`view`), l'aperçu aussi (`preview`), et n'emploie que
`useMutation`, qui exige un `ConvexProvider`. Le faux client sert donc d'abord au montage ; la
fixture passe par les props.

## Ce qui change

1. **La fixture.** `src/routes/-plateau/player-view.fixture.json` (à créer) contient
   `{ view, preview }`. `view` est la `PlayerView` que rend `adaptServerView` dans le scénario de
   53, pour le premier siège, à un instant où il a au moins une troupe posée et un bâtiment.
   `preview` est la réponse de `api.movements.preview` pour une marche de ce siège au même
   instant. `convex/view-adapter.test.ts` l'écrit **seulement** quand `WWS_ECRIRE_FIXTURE=1`
   (`writeFileSync` de `node:fs`, qu'`invariants.test.ts` importe déjà sous `edge-runtime` ; JSON
   indenté), et `npm run fixture:vue` (à créer) ne fait que cela. L'horloge est simulée et
   convex-test numérote ses identifiants par compteur : deux régénérations ne produisent aucun
   diff. Le fichier est généré, donc il entre dans `.prettierignore`.
2. **Le test.** `src/routes/-plateau/windows.smoke.test.tsx` (à créer), en
   `// @vitest-environment jsdom` :
   - le faux client : `watchQuery(query)` répond d'une petite table indexée par
     `getFunctionName(query)` (`convex/server`), et rend `undefined` (en cours) pour le reste ;
     `mutation(...)` enregistre l'appel et ne fait rien ;
   - l'horloge est posée à l'instant de la fixture (`vi.useFakeTimers({ toFake: ['Date'] })` puis
     `setSystemTime`), sans quoi toutes les durées partiraient du jour de l'exécution ;
   - `matchMedia` et `ResizeObserver` sont posés comme dans `Window.test.tsx`, et chaque fenêtre
     est montée à 1 280 px puis à 400 px (le cadre de bureau et la feuille) ;
   - les props viennent de la fixture, comme le plateau les tire : station de la première troupe
     de `view.me`, une région de `view.me.regions`, la visée et l'aperçu de la marche. Le JSON
     importé perd les littéraux des unions : un seul `as unknown as { view: PlayerView; … }`,
     commenté, comme `src/domain/compass-rose.test.ts` le fait déjà ;
   - pour chaque montage : aucune exception et aucun `console.error` (le « Cannot update a
     component while rendering a different component » de React est un `console.error`, pas une
     exception). Le nombre de commits, compté par un `<Profiler onRender>` autour de la fenêtre,
     vaut au plus `RENDER_CEILING = 5`, avec la valeur et la raison de `__root.test.tsx`.

## Ce que ce prompt ne fait pas

- Ne monte ni `plateau.tsx` ni `WorldMap`, ni `SiteModal` ou `GunneryWindow`, qui interrogent
  `troops.workshop`.
- Ne vérifie rien de ce que les fenêtres affichent : c'est une fumée. Les vérifications « à la
  main » des prompts restent manuelles.
- Ne garde pas la fixture fraîche d'office : on la régénère à la demande, après un changement de
  `view.ts` ou de l'adaptateur.

## Cas d'acceptation (tests d'abord)

1. `npm run fixture:vue` écrit la fixture ; une seconde exécution ne change rien : même
   `shasum -a 256` avant et après (le fichier est neuf et non suivi, `git diff` ne le verrait pas).
2. `npx vitest run src/routes/-plateau/windows.smoke.test.tsx` : 8 montages verts (4 fenêtres ×
   2 largeurs).
3. Le test mord : un `setState` inconditionnel, ajouté temporairement dans le corps de
   `GarrisonPanel`, le fait échouer. Retiré : vert.
4. Sans la variable, `npx vitest run convex/view-adapter.test.ts` passe et ne réécrit pas la
   fixture (date de modification inchangée).
5. `npm run format:check` : vert.

## Vérifications

Les commandes des cas 1 à 5, la taille de la fixture (`wc -c`), puis `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : la taille de la fixture et l'instant de 53 retenu ;
les commits comptés par fenêtre et par largeur ; les requêtes que la table du faux client a dû
servir (idéalement aucune) ; les globales qu'il a fallu poser en plus de `matchMedia` et
`ResizeObserver`.
