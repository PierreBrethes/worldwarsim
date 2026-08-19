# Prompt Claude Code — l'entretien dépend de l'ancrage, et l'avant-poste ravitaille

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0019 §4 et §5**, puis
**`WWS/docs/prompts/code/consommation-continue.md` en entier** — ce prompt en est le prolongement
direct et ses trois décisions du 16/08 ne se rediscutent pas. Ensuite `src/domain/economy.ts`
(`settleStocks`), `src/domain/outposts.ts` et `convex/constants.ts`.
Ne commit pas, ne push pas. **Petit prompt, un seul sujet.**

## Pourquoi

`consommation-continue.md` pose un forfait d'entretien **identique quel que soit le rôle** (D1) et
qu'à sec **rien ne meurt** (D3). Une troupe posée au bout du monde coûte donc exactement ce que
coûte une troupe restée chez soi, et ne mourra jamais. Depuis l'ADR 0019 une troupe peut rester
n'importe où : « à ses risques et périls » ne désigne aujourd'hui aucun risque, et vingt
sentinelles gratuites videraient le brouillard (ADR 0005) de son contenu.

## Ce que tu codes

Un multiplicateur appliqué au forfait, selon **où se tient la troupe** :

| Ancrage | Multiplicateur |
|---|---|
| Sur son territoire national | 1 |
| Dans le rayon d'un de **ses** avant-postes (`OUTPOST_REACH_KM`) | 1 |
| Partout ailleurs | `UPKEEP_UNSUPPLIED_MULTIPLIER` |

`UPKEEP_UNSUPPLIED_MULTIPLIER = 2`, dans `convex/constants.ts`. **C'est un point de départ
assumé, pas une valeur mesurée** — même statut que `INTERCEPTION_RADIUS_KM` (ADR 0018 §5), et le
commentaire doit le dire, avec le risque connu : à 2, le surcoût peut se noyer dans une économie
où l'alliage est le goulot et la nourriture abondante.

**Un avant-poste allié ne ravitaille pas.** Seuls les siens comptent. C'est une décision, pas un
oubli : le ravitaillement deviendrait une monnaie diplomatique avant que la diplomatie existe.

Le test d'ancrage réutilise `withinReach` (`src/domain/outposts.ts`) — c'est déjà la fonction qui
répond à « suis-je dans le rayon d'un de mes avant-postes », et elle ne doit pas avoir de jumelle.

## Ce qui ne change pas

- **Une constante et un multiplicateur, jamais une table de neuf nombres** (D1).
- **À sec, rien ne meurt** : le stock plancher à zéro, la file de recrutement s'arrête, `starving`
  passe à vrai (D3). Aucune attrition, aucune dissolution — règle n°3 du projet.
- `settleStocks` reste **la seule** fonction qui fait bouger un stock dans le temps. Un second
  endroit qui décompte serait une seconde vérité.

## Ce que l'écran doit dire

Une troupe qui coûte double doit le montrer là où le joueur la regarde — l'inventaire ou le widget
de troupes, pas un écran de comptabilité. Sans ça, la punition est invisible, ce qui est
exactement ce que D3 refusait pour l'attrition.

## Critères d'acceptation

- Un test : deux troupes identiques, l'une chez elle, l'autre au bout du monde, drainent dans le
  rapport `UPKEEP_UNSUPPLIED_MULTIPLIER`. Une troisième dans le rayon d'un avant-poste du joueur
  draine comme celle de chez elle ; dans le rayon d'un avant-poste **d'un autre joueur**, elle
  draine au tarif majoré.
- Un avant-poste **désactivé** ravitaille-t-il encore ? Tranche, teste, et écris le pourquoi —
  c'est la question que ce prompt ouvre et il ne doit pas la laisser sans réponse.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne poses aucune consommation de pétrole (D2 : le pétrole se brûle en se déplaçant, il appartient
au prompt des mouvements). Tu n'exploites pas `starving`. Tu ne touches pas au repérage.
