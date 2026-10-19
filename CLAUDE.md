# La Manchette — codebase (nom de code worldwarsim)

Jeu de stratégie web, carte du monde réel, esthétique presse illustrée 1940, en deux modes :
**Mondiale** (7 jours, asynchrone, monde entier) et **Blitz** (2 h, synchrone, un théâtre).
Le nom affiché vit dans `fr.masthead` et nulle part ailleurs ; `worldwarsim` reste le nom de
code (dépôt, paquet, Convex, domaine, clés de stockage).

## Instructions

Travaille directement dans le dépôt : pas de worktree séparé sauf demande explicite de Pierre.

## Commandes

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # types + build
npm run test     # vitest
npm run verifier # miroir local de la CI (types, lint, format, tests, build, simulation)
git config core.hooksPath .githooks   # une fois par clone : active le pre-push
```

## Sources de vérité

- **Le code et ses tests font foi** sur ce que le jeu fait. Une doc qui le contredit a tort :
  signale l'écart, laisse le code.
- **Le pourquoi** vit dans les ADR (`WWS/docs/adr/README.md`) et le registre
  (`WWS/docs/decisions.md`). Lis l'ADR avant de revenir sur une règle.
- **L'intention de ce qui n'est pas codé** vit dans `WWS/docs/design/` et ses `propositions/`.
  Une fois la règle codée, la fiche est figée : on ne la resynchronise pas.
- **Ce fichier est une carte.** Un chantier n'y ajoute qu'un invariant qu'on ne devine pas en
  lisant le code ; son récit va dans le commit, la PR ou l'ADR.
- `WWS/docs/technique/recit-du-code-2026-10-17.md` est l'ancien `CLAUDE.md`, figé : un pourquoi
  daté s'y retrouve, l'état du code jamais.

## Architecture

```
src/domain/      TS pur, testé. N'importe ni React ni Convex (sauf src/i18n/fr, ADR 0016).
src/data/        adaptateur Convex vers PlayerView, session et place, réglages, client Convex.
src/i18n/fr.ts   table unique de tout texte affiché.
src/map/         moteur three.js impératif qui n'importe pas React ; WorldMap.tsx, seule frontière.
src/shell/       réglette, colonne des surfaces, télégraphe : partagés par les surfaces.
src/routes/      une route par surface ; `-dossier/` = composants privés à la route.
src/emblems/     drapeaux, icônes, planches et figurines par nation, manifestes typés.
convex/          schéma et fonctions serveur, testés (convex-test).
scripts/         generate-*.mjs : écrivent public/*.json (carte, régions, grille, types).
deploiement/     docker compose (Convex auto-hébergé + front), guide VPS et CI.
```

## Invariants

- **Brouillard.** `PlayerView`, jamais `GameState` : le client reçoit ce qu'un joueur a le droit
  de voir, rien de plus. Un arc adverse n'a structurellement ni `type` ni `stack` (union
  discriminée) ; une force seulement relevée ne sert ni composition, ni effectif, ni nation —
  sauf la nation, au seul teneur de Lisbonne (P11, `convex/view.ts`).
  Chaque joueur lit son propre index de relevés (`sightings`, `campSightings`,
  `regionSightings`), jamais un filtre sur une table de vérité
  (`WWS/docs/technique/brouillard-et-fanout.md`). Toute mutation qui change un détecteur ou une
  colonne appelle `reassessDetection` elle-même, avec `changed` si un seul joueur est touché :
  on ne compte plus sur une réévaluation suivante.
- **Une règle, une fonction.** Ce que l'interface propose et ce que le serveur accepte sortent de
  la même fonction pure de `src/domain/` (`*RefusalOf`, `src/domain/movement-orders.ts`). Rien
  n'est grisé : un ordre est offert, ou son refus est dit (ADR 0015).
- **Couleur des régions.** Un seul calcul, `heldRegions` (`src/domain/control.ts`) servi par
  `heldOver` (`convex/holding.ts`), lu par carte, production, classement et relevé. Avant tout
  changement de couleur, `settleBeforeChange` règle les stocks à l'ancienne couleur, puis
  `reportChange` (`convex/production.ts`).
- **Porte serveur.** Chaque fonction de jeu prend `{ token, seasonId }` et passe par `playerOf`
  puis `requirePlayable` (`convex/seats.ts`) ; le serveur ne rend que des codes d'erreur
  (`convex/errors.ts`), le texte vit dans `src/i18n/fr.ts`. Aucune phrase n'écrit « clic droit » :
  un seul endroit traduit un bouton en rôle, `roleOf` (`src/map/engine/index.ts`, test par grep).
  Le serveur ne croit aucune donnée géographique du client (région, point, cible) : il la recoupe
  sur sa grille.
- **Échéance.** Un état long (chantier, tournée, recherche, livraison, largage) relit sa règle à son
  échéance : la carte a pu changer depuis l'ordre.
- **Deux modes.** `modeOf` dit le mode ; en Blitz, toute distance est une part du théâtre, lue par
  `contactKm`, `detectionRangeOf` et `fireReachOf` seuls (`null` = Mondiale).
- **Valeurs.** Une constante marquée `@a-mesurer` est un placeholder, pas une décision.
- **Carte à la demande** (`src/map/engine/frame-demand.ts`, vérifié par
  `frame-demand.test.ts`) : toute méthode publique de `MapEngine` qui change l'image commence par
  `this.invalidate()` (sinon `READ_ONLY` du test) ; une animation plus longue que `SETTLE_MS` se
  déclare à la boucle ; une ambiance sans fin est une couche d'`Ambience` qui demande une image
  par pas, jamais `invalidate()` ; un composant qui place ses nœuds depuis `onLabels`/`onEdges`
  appelle `engine.invalidate()` après chaque rendu. Toute animation suit le réglage
  `actives / réduites / coupées` (`src/domain/map-motion.ts`).
- **Données générées.** `world.json`, `regions.json`, `region-types.json`, `grid.json` sortent de
  `scripts/generate-*.mjs`, jamais retouchés à la main. `buildGrid` ne tourne jamais dans une
  query : la grille est cuite. Aucune règle de jeu ne lit `RegionType` sans ADR. Les districts
  allemands (BKG) doivent l'attribution « © GeoBasis-DE / BKG », sans page de crédits à ce jour.
- **Figurines GLB.** Textures en WebP avant commit
  (`npx @gltf-transform/cli webp <in.glb> <out.glb> --quality 90`, hors du dépôt) ; ni meshopt ni
  quantification. `glb.test.ts` tient triangles et noms de pièces.
- **Schéma Convex.** Un champ ajouté à une table existante est `v.optional`, lu avec un défaut
  par `??`, ou s'accompagne d'une migration de backfill : un champ obligatoire sans migration fait
  refuser la poussée en production.

## Conventions

`CONVENTIONS.md` fait autorité (penser local, commentaire de *pourquoi* seulement, nommer pour
être repris, tidy first, règles des modules `convex/`). Code en anglais, jeu en français.
Vocabulaire dans `WWS/CONTEXT.md` : **mouvement**, **passe de résolution**, avant-poste
**désactivé**, **détruit** ou **capturé**, **slot de mouvement**, **journal d'événements** ;
bannis : tick, temps réel, micro, base, rush.

## Où lire

- `WWS/docs/design/11-brief-ui.md` avant de coder une surface, et ses contrats de vue
  (`WWS/docs/design/contrats-de-vue/`).
- `WWS/docs/RESTE-A-CODER.md` (la file), `WWS/QUESTIONS.md` (ce qui n'est pas tranché).
- `deploiement/README.md` pour le VPS et la CI.
