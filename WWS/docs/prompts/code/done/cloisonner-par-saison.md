# Prompt Claude Code — cloisonner chaque lecture par saison

Lis `CLAUDE.md`, `CONVENTIONS.md`, puis `convex/movements.ts` en entier (cherche chaque
`.collect()`), `convex/schema.ts` (les index existants), `convex/combat.ts`, `convex/view.ts`,
`convex/victory.ts`. Ne commit pas, ne push pas. **Un sujet, bloquant avant le skirmish.**

## Pourquoi

Le rapport d'`ecoute-et-relais` l'a nommé : `postedForces`, `scheduleInterception`, `defenceOf`,
`defenceNear`, `forceOf` et les balayages de `buildings`, `outposts`, `movements`, `troops`
font des `ctx.db.query(table).collect()` **sans filtre de saison** (une dizaine d'occurrences
dans `movements.ts`, l.1017 à 2134 au 26/08). Tant qu'une seule saison existait, c'était
invisible. Depuis l'accueil multi-parties (24/08), la prod peut porter plusieurs saisons en même
temps — et le skirmish se jouera pendant que des parties de test traînent. Conséquence : une
colonne de la saison A peut être interceptée par une garnison de la saison B, une défense peut
compter des troupes d'une autre partie, un relais d'ailleurs peut accélérer chez nous. Ce n'est
pas de l'équilibrage, c'est de la contamination entre parties. `crossedSoil` (écoute) restreint
déjà à la saison ; c'est le modèle.

## Ce que tu codes

1. **Un index `bySeason`** sur chaque table qui n'en a pas et qui est balayée globalement
   (`buildings`, `outposts`, `movements`, `troops`, `engagements` si besoin). Si une table n'a
   pas de `seasonId` mais seulement `playerId`, ajoute `seasonId` (dénormalisé, gravé à
   l'écriture — jamais recalculé) plutôt qu'une jointure par joueur à chaque lecture.
2. **Plus aucun `.collect()` sans index de saison** dans `convex/` hors `destroy`, `dev.reset`
   et les tests de purge. Une fonction unique par table (`buildingsOf(ctx, seasonId)`, etc.)
   pour que le filtre ne soit pas réécrit à chaque appel.
3. **Un garde-fou** : un test qui crée **deux saisons** avec une garnison dans chacune sur la
   même région, envoie un mouvement dans la première et vérifie qu'aucun engagement ni relevé
   ni ralentissement/accélération ne vient de la seconde. C'est le test qui empêche le retour du
   bug.
4. Un grep en CI ou un test statique qui refuse `query('<table>').collect()` sans `withIndex`
   dans `convex/` (liste blanche pour `destroy`/`reset`) — sinon la prochaine mutation le
   réintroduira.

## Critères d'acceptation

- Le test à deux saisons passe ; les 456+ tests existants passent.
- `grep -n "\.collect()" convex/*.ts` ne montre plus que les cas de la liste blanche.
- Les schémas de `sightings` et `notices` sont inchangés (déjà par joueur).
- Aucun terme banni. `npm run build`, `npm run test`.

## Ce que tu ne fais pas

Pas d'optimisation au-delà du filtre de saison (les scans par saison restent bornés à 8 joueurs).
Pas de migration : `dev:reset` entre saisons reste la règle, les champs ajoutés sont
`v.optional` avec un lecteur qui tolère l'absence, ou la base locale est reset — dis lequel.
