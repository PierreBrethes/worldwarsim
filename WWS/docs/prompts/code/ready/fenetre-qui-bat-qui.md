# Prompt Claude Code — l'abaque de tir : qui bat qui

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`,
`WWS/docs/adr/0018-anatomie-de-la-passe-de-resolution.md` (§4),
`WWS/docs/design/maquette-couche-permanente.md` (le principe : *une information, une fois, au bon
endroit* — la grille est du « détail au clic »), puis `convex/constants.ts` (`DAMAGE_TABLE`) et
`src/routes/-plateau/`. Ne commit pas, ne push pas. **Petit prompt, un seul sujet.** Un seul
commit, préparé mais pas créé.

## Pourquoi

La table de dégâts existe, unique et testée (75 couples, garde-fou anti-contre-absolu) — et le
joueur ne la voit nulle part. Il recrute à l'aveugle. Décision de Pierre (31/08) : un bouton
« grille », on clique, on voit tous les ratios.

## Ce que tu codes

**Une fenêtre en lecture seule qui affiche `DAMAGE_TABLE` — la vraie, importée, jamais une
copie** (la leçon de `verif-chiffrage.mjs` : une copie est un mensonge en sursis).

- Matrice attaquant × défenseur, une ligne par rôle et marque qui combat, les trois transports
  affichés comme victimes par design (pas de colonne de tir vide qui a l'air d'un bug).
- Les valeurs s'affichent comme la table les pense : des parts de dégâts. Un marquage d'encre
  pour les contres forts et les frappes faibles (fort / neutre / faible) — lisible avant d'être
  chiffré, le survol donne la valeur exacte.
- **Accès** : un petit bouton (pictogramme d'abaque/graphe) dans la fenêtre où l'on recrute —
  au moment où l'information sert — et depuis la popin de troupe. Pas d'entrée de rail
  supplémentaire : le rail a déjà trop d'entrées (audit du 25/08 §3).
- Habillage 1940 : un « abaque de tir » ou « manuel d'identification », pas un tableau Excel.
  Libellés dans `src/i18n/fr.ts`, vocabulaire de `WWS/CONTEXT.md`.
- La fenêtre dit ce que la table garantit, en une ligne de chapeau : *aucune arme ne bat tout,
  aucune n'est battue par tout* — c'est le garde-fou du projet, autant l'imprimer.

## Ce que ce prompt ne fait pas

Aucun changement à la table, aux marques, au combat. Aucune recherche d'armement (question 44,
non tranchée).

## Vérifications

`npm run verifier`. À la main : ouvrir depuis le recrutement → chaque rôle recruté aujourd'hui a
sa ligne → les transports sont présentés comme victimes, pas comme trous → le survol donne la
valeur → la fenêtre se ferme comme les autres (pattern des popins existantes).
