# 71-skill-wws-prompt — `/wws-prompt <nom>` applique un prompt de ready/ de bout en bout : lectures, boucle de vérification, docs à tenir, six recettes, rapport au format fixe

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 27, 28, 39, 48, 54 ; et ce que le skill nomme (cas 0) : 01, 02, 19, 21, 24, 25, 29 à 33, 43 à 45, 49, 53.

**À lire :** https://code.claude.com/docs/en/skills (`disable-model-invocation`, `argument-hint`, `$ARGUMENTS`,
fichiers d'appui) · `WWS/docs/skills/format-reponse.md` · `WWS/docs/prompts/code/_modele.md` (le rapport) · l'en-tête
de `WWS/docs/RESTE-A-CODER.md`. Recettes : `convex/errors.ts` ; `src/i18n/fr.ts` (`errors` ~347 et ~537,
`stamps.dispatches` ~960, `journal.notices` ~1065) ; `NOTICE` (`convex/validators.ts` ~217) ; `DispatchKind` ~542,
`Notice` ~605 (`src/domain/player-view.ts`) ; `written` ~137, `ALARMS` ~571 (`src/domain/journal.ts`) ; `named`
(`convex/view.ts` ~1065) ; `src/data/serverView.ts` ; `convex/view-shape.test.ts` (54), `convex/shared-rules.test.ts` (39).

## Pourquoi
« Lis …/ready/<nom>.md et applique-le » ouvre 25 messages dans 19 des 26 sessions de l'audit : l'agent y redécouvre
le rituel. Sur les 80 commits qui finissent à 7bc3a69 (18/09), `CLAUDE.md` change dans 26, `RESTE-A-CODER.md` dans
31, `a-mesurer.md` dans 18 ; l'agent a fait 14 `mv` ready → done, acte de Pierre ; le format du rapport vivait dans
le Project Cowork, et 22 des 44 commits depuis le 10/09 ont un sujet générique, un seul nomme un prompt. Les chemins
d'un lot ne sont écrits nulle part : 03b6dff, 2e2da13 et 078feb0 touchent tous `convex/errors.ts`,
`convex/validators.ts`, `src/domain/journal.ts`, `src/domain/player-view.ts`, `src/i18n/fr.ts`.

## Ce qui change
1. `.claude/skills/wws-prompt/SKILL.md` (à créer), 110 lignes au plus. Frontmatter : `name: wws-prompt`, une
   `description` d'une phrase, `disable-model-invocation: true` (un chantier ne part pas par déduction),
   `argument-hint: "<nom dans ready/ | texte collé>"`. Le corps, dans cet ordre :
   - **Le prompt** : `$ARGUMENTS`, cherché sous `WWS/docs/prompts/code/ready/` (slug, `outillage/NN-slug`, avec ou
     sans `.md`, chemin) ; seulement dans `done/` ou `plus-tard/`, ambigu, ou un seul mot qui ne résout pas :
     s'arrêter, candidats proches listés ; un texte de plusieurs phrases : un prompt collé, appliqué tel quel.
   - **Avant** : le prompt et le README de sa série ; un **Pierre d'abord** non fait, ou un **Suppose** encore dans
     `ready/` (`npm run prompts -- status`) → demander ; pour un fichier, `npm run prompts -- lint <fichier>` ; le
     paragraphe du système dans `WWS/docs/ETAT-DU-CODE.md` ; `WWS/docs/design/11-brief-ui.md` si `src/routes/`,
     `src/shell/` ou `src/map/` bougent. Le code a raison contre le prompt : on écrit selon le code, c'est un écart.
   - **Pendant** : tests d'abord, vus rouges puis verts ; même en mode auto, Read puis Edit/Write ;
     `npm run verif:rapide` à chaque étape ; sonde en `<nom>.sonde.test.ts` ; avant/après par `npm run sur-head` ;
     `recettes.md` dès que le prompt fait l'un de ses six gestes.
   - **Fin** : `npm run a-mesurer` si un `@a-mesurer` a bougé ; `npx vitest run convex/view-shape.test.ts` si
     `convex/view.ts`, `src/domain/player-view.ts`, `src/data/serverView.ts`, `convex/control.ts`, `convex/press.ts`
     ou `convex/objectives.ts` a bougé (un chemin ajouté à `SERVED_ABOUT_OTHERS` est une décision, dite au rapport
     et au commit) ; `npm run doc-lint -- --strict` (ce que le lot a cassé se corrige, le reste va au rapport) ;
     `npm run verifier` vert, sinon le dire.
   - **Docs** (des cas qui bornent les fichiers touchés priment : le doc va alors en « À trancher ») : le récit du
     lot dans `WWS/docs/ETAT-DU-CODE.md` ; un ADR révisé porte son bandeau daté, sa ligne d'index la date ; la fiche
     de `WWS/docs/design/` à jour ou « ⚠️ en retard sur l'ADR NNNN sur : … » ; dans RESTE, l'item livré passe dans
     « Livré » en `- ~~**N.** titre~~ — livré (hash au commit)`, un reste neuf prend le « Prochain numéro libre », qui
     avance ; `CLAUDE.md`, un invariant nouveau seulement (une ligne de `## Systèmes`, sans décompte, ≤ 8 000 car.).
   - **Interdits** : commit et `git add` sur demande de Pierre seulement ; ni push, ni stash ; le prompt reste dans
     `ready/` ; rien contre la prod.
   - **Rapport**, le « Rapport » de `format-reponse.md` en rubriques fixes : **Fait** · **Écarts assumés** ·
     **Vérifications chiffrées** · **Docs touchées** · **À trancher** (1a/1b, recommandation) · **À donner**
     (`/wws-prompt <suivant>` ou « — rien ») · **Message de commit proposé** (sujet français qui porte le slug,
     corps qui dit le pourquoi ; deux si rangement et comportement sont mêlés). Le « Rapport attendu » du prompt
     s'y range. Dernière ligne : `ready/<nom>.md → done/ à l'acceptation : npm run prompts -- done <nom>`.
2. `.claude/skills/wws-prompt/recettes.md` (à créer), 80 lignes au plus, lié depuis `SKILL.md` ; par recette, les
   fichiers dans l'ordre, ce que tsc ou un test garantit, ce qui reste à la main ; chaque nom vérifié par `git grep -w` :
   - **code d'erreur** : `ErrorCode`, `fail()`, la phrase de `fr.errors` que tsc exige, `rejects.toThrow('<CODE>')` ;
   - **dépêche** : `NOTICE`, la variante de `Notice`, un case de `written()` sur `fr.journal.notices` ; une sorte
     neuve de `DispatchKind` (tsc exige `fr.stamps.dispatches`), `ALARMS` pour une alarme ; `named()` si elle porte
     une région ; aucun cast, tsc compare la forme servie (01) ; un vieil onglet ignore le kind (02) ; un test
     convex la veut écrite une fois, chez le seul joueur concerné ;
   - **champ servi** : `viewOf`, `PlayerView`, `adaptServerView` (traduction testée par `convex/view-adapter.test.ts`,
     53) ; pas de `?? défaut` « version en retard » (`ServerView` le déclare obligatoire, `.github/workflows/ci.yml`
     déploie les fonctions avant le front) ; sur un adversaire, `SERVED_ABOUT_OTHERS` ; le contrat de la surface
     sous `WWS/docs/design/contrats-de-vue/` ;
   - **champ de table** : `v.optional` et un lecteur `??`, ou une migration ; `npm run compat` ; un wipe voulu en
     « À trancher » (le fichier `WIPE-REQUIS` de 44 est à Pierre) ; un reliquat porte `@wipe <sujet> — …` ;
   - **constante `@a-mesurer`** : le marqueur dit la mesure attendue ; `npm run a-mesurer` ;
   - **branche de rose** : une fonction exportée de `src/domain/` en `…Refusal`, `…RefusalOf` ou `…Hold` (les
     ordres : `src/domain/movement-orders.ts`) que la rose et la mutation lisent (ADR 0015), rangée dans
     `PARTAGEES` ou `CLIENT_SEUL` ; son refus suit la première recette.
3. `CLAUDE.md`, `## Instructions`, une ligne : « Appliquer un prompt de `WWS/docs/prompts/code/ready/` :
   `/wws-prompt <nom>`, ou lire `.claude/skills/wws-prompt/SKILL.md` et le suivre. » Le modèle ne voit pas ce
   skill : cette ligne garde l'ancienne phrase de lancement valable.
4. `WWS/docs/prompts/code/README.md` et le « Lancer » de la série : `/wws-prompt <nom>`, l'ancienne ligne gardée.
   Le rapport de `_modele.md` et la convention 8 de la série renvoient au skill, seule définition du format.

## Ce que ce prompt ne fait pas
Ni relecteur « brouillard » en sous-agent (le test de 54 d'abord), ni skill de rédaction, ni hook, ni
`.claude/settings.json`, ni doc-lint étendu à `.claude/` ; la fin de session est 72. Aucun prompt n'est réécrit.

## Cas d'acceptation
0. Existent `WWS/docs/ETAT-DU-CODE.md`, `format-reponse.md`, `_modele.md`, les trois tests cités, et les scripts
   `prompts`, `verif:rapide`, `sur-head`, `a-mesurer`, `compat`, `doc-lint` ; sinon s'arrêter, le manque nommé.
1. Chaque identifiant entre backticks de `recettes.md` sort de `git grep -w` sur `src convex scripts`, chaque chemin
   de `git ls-files` (un dossier par préfixe) ; seuls les gabarits (`<CODE>`, `<sujet>`) font exception.
2. Chaque `npm run <x>` de `grep -oh "npm run [a-z:-]*" .claude/skills/wws-prompt/*.md` existe dans `package.json`.
3. Le frontmatter se lit par le paquet `yaml` (dans `node_modules`) et `disable-model-invocation` y vaut `true` ;
   `wc -l` : 110 et 80 au plus ; les sept rubriques et la ligne finale sont dans `SKILL.md`.
4. `wc -m < CLAUDE.md` ≤ 8 000 ; `npm run doc-lint -- --strict` : `doc-lint : propre` ;
   `npm run prompts -- lint WWS/docs/prompts/code/_modele.md` : code 0.
5. `git status --short` : les deux fichiers du skill, `CLAUDE.md`, les deux README, `_modele.md`.

## Vérifications
Doc et skill seulement : les cas 0 à 5, sans `npm run verifier`. Le modèle ne peut pas invoquer le skill : Pierre l'essaie.

## Rapport attendu
Format commun (README de la série), plus : `wc -l` des deux fichiers ; chaque nom des recettes et sa preuve
(`fichier:ligne`), toute étape que le code contredisait. En « À donner » : `/wws-prompt outillage/72-skill-fin-de-session`.
