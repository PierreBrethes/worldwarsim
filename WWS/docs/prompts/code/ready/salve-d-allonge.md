# salve-d-allonge — ADR 0021 §5 : l'allonge donne une salve, jamais la victoire

Lis `CLAUDE.md`, `CONVENTIONS.md`, l'ADR 0021 §5, l'ADR 0018 §1-§2-§4, `src/domain/combat.ts`
(`resolveEngagement`, `hit`, l'ordre des rôles, la déroute à 0,25), `convex/combat.ts` (le
branchement, munitions au tir, `DEFENDER_BONUS`), `convex/validators.ts` (`phase: strike |
riposte`), `src/domain/journal.ts` (comptes rendus). **Suppose `portees-et-postures` livré** —
ce prompt lit `stance` et la portée d'une force. Ne commit pas, ne push pas. Un chantier, un
commit.

## La règle

Au contact, le camp dont la **portée est la plus longue** tire **une salve gratuite** avant que la
passe normale commence. Le camp **surpris** (celui qui n'a pas vu l'autre avant d'être vu — une
force discrète surprise en particulier) ne l'obtient pas, même s'il porte plus loin. Une salve,
pas la décision : la passe (`resolveEngagement`) est **inchangée**, la salve s'ajoute **en tête**.

## Ce qui change

1. `resolveEngagement` gagne un paramètre optionnel `opening: Side | null` — le camp qui tire la
   salve. La salve est **une frappe de chaque troupe de ce camp**, meilleure cible atteignable,
   même table, même `hit()`, **sans riposte** ; puis la passe normale commence exactement comme
   aujourd'hui, avec les forces restantes. Munitions facturées comme toute frappe (ADR 0018 §7 :
   la passe est la seule facturation — la salve est dans la passe).
2. Le branchement (`convex/combat.ts`) décide `opening` : portée la plus longue **et** non
   surpris ; égalité de portée → personne ; à l'arrivée sur une garnison (ADR 0014, initiative
   à l'attaquant) la salve suit la même règle — une garnison qui porte plus loin qu'une colonne
   qu'elle a vue venir tire la première, **c'est l'un des trois contre-pouvoirs** que l'ADR 0014
   exigeait.
3. Le compte rendu (`engagements.strikes`, table `strikes`) marque les frappes de la salve
   `phase: 'opening'` (troisième valeur de l'union) ; le journal en fait une phrase de plus dans
   le compte rendu (« salve d'allonge : X », `fr.journal`), jamais une dépêche à part.
4. L'abaque-catalogue (contrat 06) : rien de nouveau — la portée y est déjà (prompt précédent).

## Ce que ce prompt ne fait pas

Aucune constante nouvelle. Aucun changement à l'ordre des rôles, à la meilleure cible, à l'excès
perdu, à la déroute, à `DEFENDER_BONUS`. Aucune posture nouvelle.

## Cas d'acceptation (tests d'abord)

1. **Les 75 couples de `combat.test.ts` repassent tels quels** avec `opening: null`.
2. Étant donné A (portée 150) offensive voyant B (portée 60) avant d'être vue : A tire une salve,
   B ne riposte pas pendant la salve, puis la passe normale ; le total des frappes de A = salve
   + passe ; les munitions de A débitées pour les deux.
3. Étant donné A discrète surprise par B (portée plus courte mais B a vu A la première) : aucune
   salve pour A, aucune pour B (B ne porte pas plus loin) — passe normale, initiative à B
   (ADR 0021 §4 : surprise = perte de l'initiative).
4. Égalité de portée : aucune salve.
5. Une salve ne peut pas conclure seule : si toutes les troupes adverses tombent dans la salve,
   la passe est enregistrée avec ses frappes `opening` et un résultat — pas une exception.
6. `strikes.phase` accepte `opening` ; le rejeu futur (4.7) ne bouge pas (rien ne le lit).

`npm run verifier` vert. `CLAUDE.md` (deux phrases dans « le combat existe »), `RESTE-A-CODER.md`
(7 livré entier).
