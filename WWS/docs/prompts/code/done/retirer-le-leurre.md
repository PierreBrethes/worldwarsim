# Prompt Claude Code — retirer le leurre (décision Pierre, 29/08)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/design/04-*.md` (la fiche du
leurre) et `WWS/docs/prompts/code/done/le-leurre.md` pour savoir tout ce qu'il a posé.
Ne commit pas, ne push pas.

**La décision, sans ambiguïté** : le leurre (fiche 04, livré en `d37e9b6`) est retiré du jeu.
Pierre le juge inutile en l'état. C'est une **révision d'une décision de design livrée** —
elle se documente, elle ne s'efface pas.

## Ce que tu retires

- L'entrée du menu contextuel et tout le chemin UI du leurre.
- Côté domaine et serveur : le type de mouvement leurre, `DECOY_PACE`, la tolérance « la pile
  vide est le leurre » — **un mouvement vide redevient refusé** (`MOVEMENT_EMPTY` passe de
  porte du leurre à refus franc, vérifie `refusalOf` et ses commentaires).
- Les dépêches et libellés dédiés (`columnFoundNothing` s'il ne sert qu'au leurre — vérifie
  qui d'autre le lit ; les entrées `fr.ts` du leurre).
- Les tests du leurre (supprimés, pas skippés) ; les autres tests qui le mentionnent en
  passant sont adaptés.

## ⚠️ Le piège du schéma (leçon du 27/08, règle CLAUDE.md)

Si un validateur (`movements.kind` ou équivalent) porte un littéral du leurre et que des
lignes existantes le portent en base, **retirer le littéral casse le déploiement**. Dans ce
cas : le littéral reste dans le schéma avec un commentaire « legacy, plus jamais écrit », la
création est refusée, et le littéral partira avec le prochain wipe. Dis dans le rapport quel
chemin tu as pris.

## Docs

- Note de révision datée (29/08/2026) en tête de la fiche 04 : retirée après décision de
  Pierre, jamais éprouvée en partie réelle ; la raison (un outil de plus sans demande) ; ce
  qui reprend son rôle d'incertitude d'intention le jour venu (rien pour l'instant).
- `WWS/CONTEXT.md` : retirer « leurre » du vocabulaire imposé (avec mention datée).
- La note de guet « un leurre a-t-il fait bouger quelqu'un ? » est retirée des fiches qui la
  portent.

## Vérifications

`npm run verifier` complet. `grep -ri "decoy\|leurre" convex src` ne rend plus que des
commentaires de révision. À la main : clic droit → pas de « Leurre » ; envoyer une colonne
vide → refus lisible.
