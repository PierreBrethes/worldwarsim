# 40-hygiene-de-fr — Un test garde fr.ts : aucun terme banni, aucun texte accentué en dur ailleurs, et un rapport dit les clés mortes

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 03.
**Pierre d'abord :** (1) « convoi immobilisé » (`fr.objectives.names.stalledConvoy`, nom d'un
archétype d'objectif neutre) : **exception motivée** en liste blanche (défaut), ou renommage du
libellé. (2) Les désignations de `src/emblems/units/equipment.ts` : **fichier en liste blanche**
(défaut), ou table dans fr.ts. Sans réponse, appliquer les deux défauts et le dire au rapport.

**À lire :** `WWS/CONTEXT.md` (« ## Termes bannis » ~68-73, dernière section, avec **mouvement** en
gras dans la parenthèse de « convoi » ; la ligne Avant-poste ~18), `src/i18n/fr-hygiene.test.ts`
(le lecteur de littéraux posé par 03), `src/i18n/fr.ts` (~298 et les clés du point 3),
`src/emblems/units/equipment.ts` (en-tête ~5-10), `src/map/engine/regions.ts` (~575),
`CONVENTIONS.md` (§5 ~97-101), `WWS/CLAUDE.md` (section `## Conventions` ; le prompt 22 a déplacé ses lignes).

## Pourquoi

- 56 prompts suivis exigent « aucun terme banni » (`git grep -il "termes\? bannis\?" --
  WWS/docs/prompts`) ; aucun test ne le vérifie. Or `stalledConvoy: 'convoi immobilisé'` (fr.ts
  ~298, be9fcd5, 17/09, prescrit par `done/objectifs-neutres.md` ~42) est à l'écran : le mot y
  nomme un convoi historique, pas un mouvement, et personne n'a tranché.
- Rien ne vérifie « aucune chaîne française en dur hors de fr.ts » (CONVENTIONS §5). Les littéraux
  accentués de `src/` et `convex/` se réduisent à un `console.warn` (regions.ts ~575) et à trois
  désignations d'`equipment.ts` (~15 « char léger R35 », ~60 « Schießbecher », ~65 « Zerstörer
  1934 ») ; ses désignations sans accent (« soldat », « 2 appareils ») échappent à tout motif.
- knip ne voit pas les propriétés d'objet : neuf clés sans lecteur, vérifiées une à une ; 03 en a
  supprimé une, il en reste huit. Hors audit, deux sections entières n'en ont pas non plus depuis
  la mi-août : `git grep -n "movementTypesPlural\|regionTypes\b"` ne rend que leur définition
  (fr.ts ~138, ~233).
- Le vocabulaire est recopié dans quatre documents qui divergent : seul CONTEXT.md bannit « unité
  sélectionnée ».

## Ce qui change

1. `src/i18n/fr-hygiene.test.ts` reçoit deux `it` bloquants.
   - **(a) Vocabulaire.** Lire CONTEXT.md de « ## Termes bannis » au titre suivant ou à la fin du
     fichier, ôter les parenthèses, prendre chaque `**…**` (sans cette étape, « mouvement » serait
     banni). Un motif par terme, sans casse, pluriel permis sur chaque mot (`s?`), borné en Unicode :
     `(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])`, drapeaux `iu` — pas `\b`, qui prend « é » pour une
     frontière et lirait « base » dans « basée ». Sur les littéraux du lecteur de 03 seulement (le
     commentaire « daté en base » ~1638 n'en est pas). Gardes : au moins un terme, jamais
     « mouvement », et un titre introuvable échoue en nommant fichier et titre — ce test lit un
     document dans la CI qui précède le déploiement, il doit se réparer en une ligne. Liste blanche
     nommée et motivée : `{ path: 'fr.objectives.names.stalledConvoy', term: 'convoi', why: '…' }`,
     vide si Pierre renomme. Échec : `fr.ts:L chemin « … » contient « terme »`.
   - **(c) Textes en dur.** Les `.ts`/`.tsx` de `src/` et `convex/`, sauf fr.ts, `*.test.ts(x)`,
     `*.fixture.ts`, `convex/_generated/`, `src/routeTree.gen.ts` : aucun littéral, morceau de
     gabarit ou `JsxText` ne contient `/[À-ÖØ-öø-ÿĀ-ž]/`. La plage exclut `×` et `÷` (fermetures de
     ControlsCard, GarrisonStack, notifications ; liste cochée du salon). Liste blanche motivée :
     `equipment.ts`, noms propres rangés avec leur planche. Si Pierre choisit fr.ts : tables en
     `fr.equipment` lues par `equipmentLabel`, en-tête d'equipment.ts réécrit, liste blanche vide.
2. Dans regions.ts ~575, le `console.warn` passe en anglais (`…: ring spans the frame, not filled`).
3. Les huit clés sont supprimées, chacune après un `git grep -n "\b<clé>\b" -- src convex scripts`
   qui ne rend que la définition : `home.gamesCount` ~609, `gunnery.firesOn` ~1476,
   `production.perTroop` ~1581, `economy.builtIn` ~1706, `economy.lot.awaitingNote` ~1724,
   `economy.lot.nothingOrdered` ~1725, `economy.lot.inReserve` ~1735,
   `construction.foundationCount` ~2331. Une clé qui a retrouvé un lecteur reste, et se dit. Les
   deux sections mortes restent aussi : hors du lot vérifié par l'audit, elles vont au rapport.
4. `scripts/fr-cles-mortes.mjs` (à créer), rapport non bloquant ; package.json reçoit
   `"fr:cles-mortes": "node scripts/fr-cles-mortes.mjs"`, hors `verifier`. Il lit fr.ts avec
   `typescript` et parcourt l'arbre de `fr` en traversant `satisfies` et `as`. Une feuille, ou une
   section, est rapportée quand son dernier segment n'est lu nulle part : ni comme mot dans `src/`
   et `convex/` hors fr.ts, ni en accès `.segment` dans fr.ts (`gestures` lit `mapUi.mouse.drag`).
   Tester aussi les sections, sinon `fr.regionTypes` passe pour vivante (`plain`, `forest`… sont
   des mots du code). Toute section `fr.<chemin>[` du code, fr.ts compris, compte entière comme
   vivante (35 hors de fr.ts aujourd'hui), sans liste tenue à la main. Sortie : `chemin  fr.ts:L`
   par entrée, un total, la mention « heuristique » ; code de sortie toujours 0.
5. La liste n'existe plus qu'à un endroit, CONTEXT.md.
   - CONTEXT.md dit déjà qu'un avant-poste « ne se capture jamais » (~18), mais seules les autres
     listes bannissent le mot : ajouter dans « Termes bannis », en texte simple (pas de gras, que le
     test lirait), qu'un avant-poste est *désactivé* ou *détruit*, jamais *pris*. Règle de sens,
     relue mais pas testée : « butin pris » est juste.
   - `CONVENTIONS.md` §5 : les exemples de « Le vocabulaire du jeu reste imposé » cèdent la place à
     un renvoi vers CONTEXT.md et le test ; la phrase sur les identifiants anglais reste. Même
     renvoi, sans liste, dans `WWS/CLAUDE.md`, `## Conventions`.

## Ce que ce prompt ne fait pas

- Le bloc « Vocabulaire imposé » de CLAUDE.md racine revient à 24-25.
- Le vocabulaire n'est contrôlé que dans les libellés de fr.ts : ni commentaires, ni docs, ni
  identifiants (`stalledConvoy`). `done/` n'est pas touché, le script ne supprime rien, et il n'y a
  pas de règle ESLint (34, 68).

## Cas d'acceptation (tests d'abord)

1. Sans liste blanche, (a) est rouge et ne nomme que `fr.objectives.names.stalledConvoy` ; vert une
   fois la décision appliquée. Mutation temporaire : `'deux bases'` le fait tomber, `'une zone
   basée'` non.
2. Avant les corrections, (c) est rouge et ne nomme que regions.ts et equipment.ts.
3. La lecture de CONTEXT.md rend exactement tick, temps réel, micro, unité sélectionnée, base,
   rush, tour de combat, convoi — avant comme après l'ajout du point 5.
4. `npm run fr:cles-mortes` sort avec 0 les deux fois ; avant la suppression il liste les huit clés
   et les deux sections, après, plus aucune des huit.
5. `git grep -n -i "convoi\|temps réel" -- CONVENTIONS.md WWS/CLAUDE.md` ne rend rien (aujourd'hui
   trois lignes : CONVENTIONS ~97, WWS/CLAUDE.md ~121 et ~123).

## Vérifications

- `npx vitest run src/i18n/fr-hygiene.test.ts` : vert, avec le nombre de cas et la durée.
- `npm run fr:cles-mortes` (sortie et durée), puis `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : pour chaque point de Pierre, la décision appliquée et
d'où elle vient (lui ou le défaut) ; la liste lue dans CONTEXT.md ; la sortie du script avant et
après ; en À trancher, `fr.movementTypesPlural` et `fr.regionTypes` (recommandation : les supprimer)
et toute autre entrée que le script signale.
