# Prompt Claude Code — schéma économie v2 + troupes discrètes (ADR 0014, 0015)

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, puis les ADR `0013`,
`0014`, `0015` et `0016` avant d'écrire quoi que ce soit. Ne commit pas, ne push pas.

**Prérequis : le prompt `gisements-par-region.md` est passé** — `regions.json` porte des
`id` stables et `public/deposits.json` existe. Sans eux, arrête-toi.

**Identifiants en anglais, libellés en français** (ADR 0016). Toutes les clés introduites
ici sont anglaises ; chacune reçoit son libellé dans `src/i18n/fr.ts`, seule table de
traduction. Aucune chaîne française en dur ailleurs.

## Contexte

Le schéma actuel (`convex/schema.ts`) vit encore dans l'économie v1 — `resources` à trois
clés (`supply`, `steel`, `manpower`), `buildings` à cinq clés non localisées, `units` en
compteurs sans position (ADR 0011, révisée). L'ADR 0015 grave huit ressources, quatorze
bâtiments posés sur des régions et une production localisée ; l'ADR 0014 grave des troupes
discrètes. On refond la tranche entière. **Pas de migration de données** : le jeu fonctionne
par saisons wipées, les tables se remplacent.

**Repère d'abord l'existant** et liste-le-moi avant de coder : `convex/schema.ts`,
`validators.ts`, `constants.ts`, `resources.ts`, `units.ts`, `buildings.ts`,
`constructions.ts`, `errors.ts`, `view.ts`, `seasons.ts`, puis `src/domain/ids.ts`,
`troops.ts`, `player-view.ts`, `src/i18n/fr.ts`, et la surface 4.6.

Deux endroits récents à respecter plutôt qu'à contourner :

- **`convex/validators.ts`** est la source des unions vérifiées à l'exécution ; `ids.ts` est
  la source TypeScript. Les deux doivent bouger ensemble — c'est le point de dérive que ce
  fichier a été extrait pour supprimer.
- **`convex/buildings.ts`** porte déjà `levelOf` et `cappedByHq`. Étends-les, ne les
  redéclare pas ailleurs.

## Implémentation

1. **Ressources.** `ResourceKey` passe à huit clés : `food`, `textile`, `coal`, `oil`,
   `ore`, `alloy`, `ammunition`, `bandages` — dans `ids.ts` **et** `validators.ts`, avec
   leurs libellés dans `fr.ts`. Garde l'accrual paresseux (`stock`, `updatedAt`) mais
   `ratePerHour` n'est plus stocké : il se **calcule** à la lecture depuis les bâtiments
   d'exploitation du joueur et le gisement de leur région. `cap` bas par défaut, relevé par
   les entrepôts et dépôts (le `warehouse` plafonne matières et alliage, le `depot` pétrole
   et munitions — leur mort diffère, leur plafond aussi).

2. **Transformation.** `foundry` (`ore` + `coal` → `alloy`), `arsenal` (`alloy` →
   `ammunition`), `quartermaster` (`textile` → `bandages`). Conversion **continue et
   paresseuse**, au même rythme que l'accrual : à chaque lecture, le temps écoulé convertit
   ce que les intrants permettent, borné par le niveau du bâtiment. Pas de file, pas d'ordre
   du joueur — construire la fonderie *est* la décision.

3. **Bâtiments.** `BuildingKey` passe à quatorze clés :

   | famille | clés |
   |---|---|
   | commandement | `hq` |
   | exploitation | `farm` · `mill` · `mine` · `oilWell` |
   | transformation | `foundry` · `arsenal` · `quartermaster` |
   | projection | `barracks` · `airfield` · `port` |
   | renseignement | `listening` |
   | plafond | `billets` |
   | stockage | `warehouse` · `depot` |

   La table `buildings` gagne `regionId` (l'`id` de `regions.json`). Contraintes à
   l'écriture, en erreurs typées via `convex/errors.ts` : `hq` unique par joueur ; `farm`,
   `mill`, `mine`, `oilWell` exigent le gisement correspondant dans la région (la `mine`
   sort `coal` *ou* `ore` selon le gisement) ; `port` en région côtière ; hors de son
   territoire, une pose exige un avant-poste dans le rayon — si les avant-postes ne sont pas
   encore portés par le schéma, pose la contrainte « chez soi seulement » et **signale-le**,
   ne l'invente pas. `constructions` suit : `regionId` + `building` + `finishesAt`, un
   chantier à la fois par région.

4. **Troupes.** Remplace `units` par `troops` : une ligne **par troupe** — `playerId`,
   `role`, `tier`, `nominalStrength`, `currentStrength`, `specialization` (union discriminée
   par rôle, `null` tant que la recherche n'existe pas), `stationedAt` (le bâtiment de
   projection où elle stationne). Pas de position libre : une troupe est rattachée, les
   mouvements viendront la déplacer (4.7). Le nombre de troupes d'une nation est borné
   (constante, ordre 10–30) et la somme des `nominalStrength` respecte le plafond d'hommes
   porté par les `billets`. Les effectifs nominaux par rôle sont chiffrés dans
   `WWS/docs/design/propositions/chiffrage-combat.md` — reprends-les tels quels.

5. **Recrutement.** `recruitments` gagne le bâtiment producteur : une file séquentielle
   **par bâtiment de projection** — `barracks` forme le terrestre, `airfield` l'aérien,
   `port` le maritime (aligne-toi sur `DOMAIN_BY_ROLE` de `src/domain/troops.ts`). Datation
   paresseuse conservée : seule la tête d'une file porte `finishesAt` ; annulation
   remboursée d'un lot non commencé. À l'achèvement, le lot devient une **troupe** rattachée
   au bâtiment producteur. Un lot = une troupe entière (son effectif nominal), pas un
   compteur.

6. **Constantes.** Réécris `convex/constants.ts` : coûts d'unités **en matières** (`alloy`
   surtout, `ammunition` pour l'emport initial — plus d'acier, plus d'effectifs), débits
   d'exploitation par gisement et par niveau, ratios de transformation, entretien en `food`
   par troupe, consommation d'`oil` des motorisés (constante posée, consommée réellement par
   4.7 plus tard), plafonds de stock, kit de départ de l'ADR 0015 (de quoi bâtir `barracks`
   + `farm` + `mill`, plus une avance d'`alloy` et d'`ammunition`). Tout est placeholder,
   dit tel quel en tête de fichier — c'est le seul endroit à corriger quand le simulateur
   reprendra.

7. **Domaine, vue et traduction.** Adapte `src/domain/ids.ts`, `troops.ts` et
   `player-view.ts` : la vue liste des troupes (effectif lisible, rattachement) et huit
   stocks. `PlayerView` reste la seule forme qui sort du serveur — aucun stock ni aucune
   troupe d'un adversaire ne transite, structurellement. Ajoute dans `src/i18n/fr.ts` les
   libellés des huit ressources et des quatorze bâtiments, en respectant le vocabulaire
   imposé de `WWS/CONTEXT.md`.

8. **Surface 4.6 et tests.** Adapte la production au minimum pour que tout compile et
   fonctionne (choix du bâtiment producteur, files par bâtiment) — la refonte visuelle
   attendra un brief. Réécris les tests : `convex/units.test.ts` gravait « l'acier ne vient
   de nulle part » ; grave l'inverse — une `farm` sur gisement nourrit, une `foundry`
   convertit, une `barracks` forme une troupe, le plafond d'hommes bloque.

## Critères d'acceptation

- Un joueur avec `mine` (région à `coal`) + `foundry` voit son `alloy` monter sans aucune
  action, et s'arrêter quand `ore` ou `coal` manque.
- Bâtir une `mine` sur une région sans gisement est refusé par le serveur, avec une erreur
  typée de `errors.ts`.
- `ids.ts` et `validators.ts` déclarent exactement les mêmes clés — ajoute un test qui le
  vérifie plutôt qu'un commentaire qui le demande.
- Deux lots en file dans une `barracks` : seul le premier porte `finishesAt` ; annuler le
  second rembourse intégralement ; le premier achevé apparaît comme troupe rattachée à cette
  `barracks`.
- Créer une troupe au-delà du plafond d'hommes des `billets` est refusé.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts`.
- `npm run build` et `npm run test` passent ; aucun terme banni nulle part.

## Ce que tu ne fais pas

Pas de combat, pas de soin, pas de mouvements de troupes, pas d'espionnage, pas de
recherche ni de spécialisations actives, pas d'avant-postes s'ils n'existent pas déjà, pas
de rendu des gisements sur la carte, pas de refonte visuelle de 4.6. Si une de ces
frontières bloque la compilation, signale-le et arrête-toi plutôt que de déborder.
