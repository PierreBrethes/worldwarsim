# Prompt Claude Code — back : ressources et bâtiments localisés (ADR 0015)

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, puis les ADR `0013`, `0015`
et `0016`, et la fiche [02 — Économie](../../design/02-economie.md) qui les explique.
Ne commit pas, ne push pas.

**Prérequis satisfait** : `public/deposits.json` existe, `regions.json` porte des `id` stables.

**Identifiants en anglais, libellés en français** (ADR 0016). Chaque clé introduite ici reçoit son
libellé dans `src/i18n/fr.ts`, seule table de traduction. Aucune chaîne française en dur ailleurs.

**Ce prompt est la moitié économique de l'ancien `schema-economie-et-troupes.md`**, qui a été
scindé. Les troupes discrètes et les files de recrutement font l'objet d'un prompt séparé, à
passer après celui-ci — ne les anticipe pas.

## Contexte

`convex/schema.ts` vit encore dans l'économie v1 : `resources` à trois clés (`supply`, `steel`,
`manpower`), `buildings` à cinq clés non localisées, un seul chantier à la fois par joueur, tout
payé en `supply`. L'ADR 0015 grave huit ressources, quinze bâtiments **posés sur des régions**,
et une transformation continue. **Pas de migration de données** : le jeu fonctionne par saisons
wipées, les tables se remplacent.

**Repère d'abord l'existant** et liste-le-moi avant de coder : `convex/schema.ts`, `validators.ts`,
`constants.ts`, `resources.ts`, `buildings.ts`, `constructions.ts`, `errors.ts`, `view.ts`, puis
`src/domain/ids.ts`, `off-season.ts` (l'accrual paresseux), `player-view.ts` et `src/i18n/fr.ts`.

Deux endroits récents à respecter plutôt qu'à contourner :

- **`convex/validators.ts`** porte les unions vérifiées à l'exécution ; `ids.ts` porte les types
  TypeScript. Les deux bougent ensemble — c'est la dérive que ce fichier a été extrait pour
  supprimer.
- **`convex/buildings.ts`** porte déjà `levelOf` et `cappedByHq`. Étends-les, ne les redéclare pas.

## Implémentation

1. **Ressources.** `ResourceKey` passe à huit clés — `food`, `textile`, `coal`, `oil`, `ore`,
   `alloy`, `ammunition`, `bandages` — dans `ids.ts` **et** `validators.ts`, avec leurs libellés
   dans `fr.ts`. Garde l'accrual paresseux (`stock`, `updatedAt`), mais **`ratePerHour` n'est plus
   stocké** : il se calcule à la lecture depuis les bâtiments d'exploitation du joueur et le
   gisement de leur région. Le `cap` est bas par défaut ; l'entrepôt le relève sur les matières et
   l'alliage, le dépôt sur le pétrole et les munitions.

2. **Transformation continue et paresseuse.** `foundry` (`ore` + `coal` → `alloy`), `arsenal`
   (`alloy` → `ammunition`), `quartermaster` (`textile` → `bandages`). À chaque lecture, le temps
   écoulé convertit ce que les intrants permettent, borné par le niveau du bâtiment. Pas de file,
   pas d'ordre du joueur : *construire la fonderie est la décision*. Même régime que l'accrual, et
   au même endroit — n'invente pas un second mécanisme à côté.

3. **Bâtiments.** `BuildingKey` passe à quinze clés :

   | famille | clés |
   |---|---|
   | commandement | `hq` |
   | exploitation | `farm` · `mill` · `mine` · `oilWell` |
   | transformation | `foundry` · `arsenal` · `quartermaster` |
   | projection | `barracks` · `airfield` · `port` |
   | renseignement | `listening` |
   | plafond | `billets` |
   | stockage | `warehouse` · `depot` |

   La table `buildings` gagne `regionId` (l'`id` de `regions.json`). **Un bâtiment n'existe plus
   par défaut** : la règle actuelle « niveau 1 est le plancher, tous les bâtiments existent dès le
   lancement » tombe — un bâtiment se construit sur une région ou n'existe pas. Adapte `levelOf`
   en conséquence et dis-moi ce que ça casse ailleurs.

   Contraintes à l'écriture, en erreurs typées via `errors.ts` :
   - `hq` unique par joueur ;
   - `farm`, `mill`, `mine`, `oilWell` exigent le gisement correspondant dans la région — la
     `mine` sort `coal` *ou* `ore` selon le gisement ;
   - `port` en région côtière ;
   - hors de son territoire, une pose exige un avant-poste dans le rayon. **Si les avant-postes ne
     portent pas encore de région**, pose la contrainte « chez soi seulement » et **signale-le** —
     ne l'invente pas.

4. **Chantiers.** `constructions` gagne `regionId`. **Une décision à trancher, pas à supposer** :
   aujourd'hui `start` fait un `.unique()` par joueur, donc un seul chantier à la fois dans tout
   l'empire. Passer à « un par région » multiplie la vitesse d'expansion par le nombre de régions
   possédées, ce qui est énorme et n'a jamais été mesuré. **Implémente un chantier à la fois par
   joueur** — le comportement actuel — et dis-le-moi explicitement dans ton compte rendu, avec ce
   que coûterait l'autre option. Le régulateur éventuel serait un plafond global indexé sur le QG,
   comme les slots de mouvement ; ce n'est pas à toi de le décider.

5. **Constantes.** Réécris `convex/constants.ts` : débits d'exploitation par gisement et par
   niveau, ratios de transformation, coûts et durées de construction **en matières** (plus de
   `supply`), plafonds de stock, et le kit de départ de l'ADR 0015 — de quoi bâtir `barracks` +
   `farm` + `mill`, plus une avance d'`alloy` et d'`ammunition`. Tout est placeholder, dit tel quel
   en tête de fichier : c'est le seul endroit à corriger quand le simulateur reprendra.

6. **Vue et traduction.** `PlayerView` expose les huit stocks et, pour les régions du joueur, le
   gisement et les bâtiments qui s'y trouvent. `PlayerView` reste la seule forme qui sort du
   serveur — aucun stock ni bâtiment d'un adversaire ne transite, structurellement. Ajoute dans
   `fr.ts` les libellés des huit ressources et des quinze bâtiments, en respectant le vocabulaire
   imposé de `WWS/CONTEXT.md`.

7. **Ce qui casse, et qu'il faut réparer au minimum.** `conscription` disparaît, donc le
   cas particulier de `constructions.finish` qui recalculait `manpower` n'a plus d'objet — le
   plafond d'hommes appartient désormais aux `billets` et il sera consommé par le prompt troupes.
   La surface 4.6 (Production) et `NationWindow` lisent des ressources qui n'existent plus : fais
   le minimum pour que tout compile et affiche quelque chose de vrai. **La refonte visuelle n'est
   pas dans ce prompt.**

8. **Tests.** Réécris ce qui grave l'ancien monde. `convex/units.test.ts` grave « l'acier ne vient
   de nulle part » ; grave l'inverse — une `farm` sur gisement nourrit, une `mine` sans gisement
   est refusée, une `foundry` convertit et s'arrête quand un intrant manque, un `warehouse` relève
   le plafond. Ajoute le test qui vérifie que `ids.ts` et `validators.ts` déclarent exactement les
   mêmes clés.

## Critères d'acceptation

- Un joueur avec une `mine` sur région à `coal` et une `foundry` voit son `alloy` monter sans
  aucune action, et s'arrêter quand `ore` ou `coal` manque.
- Bâtir une `mine` sur une région sans gisement est refusé par le serveur, avec une erreur typée.
- Bâtir un `port` sur une région non côtière est refusé.
- Un second `hq` est refusé.
- Le plafond d'une ressource monte quand le bâtiment de stockage correspondant est construit.
- `ids.ts` et `validators.ts` déclarent les mêmes clés, vérifié par un test.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts`.
- `npm run build` et `npm run test` passent ; aucun terme banni nulle part.

## Ce que tu ne fais pas

Pas de troupes, pas de recrutement, pas de combat, pas de mouvements, pas d'espionnage, pas de
recherche, pas de rendu des gisements sur la carte, pas de rose des vents, pas de refonte visuelle
de 4.6. Si une de ces frontières bloque la compilation, signale-le et arrête-toi plutôt que de
déborder.
