# Prompt Claude Code — la victoire de test (échafaudage du premier skirmish)

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, la fiche `05-doctrines.md`,
et l'étape 5 de `WWS/docs/design/propositions/plan-progression-v1.md`. Ne commit pas, ne push
pas.

## Le statut de ce que tu codes — à écrire en toutes lettres dans le code

**C'est un échafaudage de test, pas une décision de design.** Le jeu cible a trois doctrines
secrètes en triangle (fiche 05) ; rien de tout ça n'existe encore, et le premier skirmish entre
amis ne peut pas attendre. Une seule condition, publique, identique pour tous — et un
commentaire en tête du module qui dit que ce fichier a vocation à être **remplacé** par les
doctrines, pas amendé. Rien ici ne doit rendre le triangle plus difficile à construire.

## La condition

**Domination simplifiée**, indexée sur `n` comme la fiche 05 l'exige :

- La **capacité militaire** d'un joueur est la somme des effectifs *courants* de ses troupes
  debout (déroutées comprises — elles reviennent ; en file de recrutement exclues).
- Un joueur est **réduit** quand sa capacité passe sous `REDUCTION_FACTOR` (placeholder : 0,5)
  de sa capacité *nominale* (la somme des effectifs nominaux des mêmes troupes). Un joueur sans
  aucune troupe debout est réduit.
- Le premier qui **réduit `⌈(n−1)/2⌉` joueurs distincts** — être l'attaquant de l'engagement
  qui fait franchir le seuil — l'emporte. À 2 joueurs : un seul à réduire.
- La saison passe en `concluded`, le Journal l'annonce à tous, l'écran d'accueil le dit. Le
  wipe reste manuel — on relit la partie avant de l'effacer.

**La progression est publique et nominative** — contrairement à la fiche 05, et c'est voulu :
sans doctrine secrète, le secret n'a rien à protéger, et un test entre amis veut qu'on se
chambre. Le Journal écrit « X a réduit Y » ; un compteur `K réduits / cible` par joueur, servi
dans la vue.

## Les pièges

- **Réduit n'est pas éliminé.** Un joueur réduit joue, reconstruit, et peut regagner sa
  capacité — il sort alors du compte de son bourreau. Le compte se lit **à l'instant**, pas en
  cumulé : c'est plus dur pour l'attaquant et c'est conforme à la règle 3 (un joueur écrasé
  reste nuisible, jamais éliminé — y compris comme cible qui se relève).
- La capacité se calcule depuis les troupes, jamais stockée : un nombre stocké divergerait au
  premier soin ou recrutement.
- Aucun champ, aucun nom ne doit préparer « doctrine » — quand les doctrines arriveront, elles
  ne doivent rien hériter de l'échafaudage.

## Critères

- Tests : un engagement qui fait franchir le seuil crédite l'attaquant ; un joueur qui remonte
  au-dessus du seuil décrédite ; à 2 joueurs la saison conclut au premier réduit ; une saison
  `concluded` refuse mouvements, constructions et recrutements avec un code clair.
- `tsc` propre, tests verts, `verify.mjs` en 0 (le miroir gagne `REDUCTION_FACTOR`), garde-fou
  du simulateur tenu.
- Aucun terme banni.

## Ce que tu ne fais pas

Pas de barre anonyme, pas de secret, pas d'embargo ni d'exposition — tout ça appartient au
triangle de la fiche 05, qui reste la cible. Pas d'écran de fin travaillé : une manchette dans
le Journal et l'accueil suffisent au test.
