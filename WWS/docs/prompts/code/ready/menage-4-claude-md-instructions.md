---
type: prompt
statut: proposé
maj: 2026-10-04
code: [CLAUDE.md, WWS/docs/ETAT-DU-CODE.md, convex/view.ts]
decisions: [menage-1c-2026-10-04]
voir: [outillage/25-claude-md-invariants.md, outillage/21-instructions-en-tete.md, menage-3-recit-hors-de-claude-md.md]
---

# menage-4-claude-md-instructions — les prompts outillage 25 et 21, recalés au 04/10

**En bref.** `CLAUDE.md` devient un fichier d'instructions de 8 000 caractères au plus :
consignes en tête, commandes, invariants, une ligne par système, et où lire le reste. Le reliquat
du récit rejoint `WWS/docs/ETAT-DU-CODE.md`.

**Lis `WWS/docs/prompts/code/ready/outillage/25-claude-md-invariants.md` et applique-le**, avec ses
conventions (`ready/outillage/README.md`), aux écarts près ci-dessous. Lis aussi
`ready/outillage/21-instructions-en-tete.md` pour son « Pourquoi ». Ne commit pas, ne push pas.
**Suppose :** menage-3 commité.

## Écarts à 25

1. **`## Instructions`** : 21 n'est pas donné, il est absorbé ici. La section part **en tête**
   (après le titre et l'introduction), **identique à celle de `HEAD`** — y compris la ligne
   « `Claude outputs/` » posée par menage-2. Le cas 2 de 25 (`diff` vide) tient tel quel.
2. **Introduction** : garde le titre « La Manchette — codebase (nom de code worldwarsim) » et la
   phrase sur `fr.masthead` (db27460).
3. **Table des systèmes** : revérifie chaque nom (`git grep -w`). Ajoute, dans la limite du budget,
   les systèmes livrés depuis le 23/09 : notifications (0807705, a8fe955), invitation par lien
   (062d6d3), application installable (64f7bca), surfaces mobiles (e47cc23, 85a2da1) — fichier et
   fonction lus dans `git show --stat`, pas devinés. Ce qui n'entre pas va au rapport.
4. **`## Où lire`** : ajoute `WWS/docs/decisions.md` (le registre). `WWS/INDEX.md` n'existe pas
   encore : menage-5 l'ajoutera, ne le cite pas.
5. **« Ce que ce prompt ne fait pas »** : `WWS/CLAUDE.md` revient à menage-5 (et non à 22) ; le
   budget n'est vérifié par aucun outil (31 à 33 sont abandonnés) ; 40 reste dans la série.
6. **Cas 4** : le décompte « six lignes » date du 23/09 ; recompte au départ, le cas tient si ne
   restent que les renvois d'architecture et `RegionType`.
7. Fin : supprime `ready/outillage/25-…` et `21-…` (consommés), mets à jour leurs lignes dans
   `ready/outillage/README.md`, et tout renvoi vivant vers eux (`git grep -n "21-instructions\|25-claude-md"`
   hors `done/` et rapports — `WWS/docs/decisions.md` cite 21 pour « pas de worktree »).

## Acceptation

Les cas 1 à 5 de 25 (avec les écarts 1 et 6), `npm run verifier` vert, et le rapport de 25 :
`wc -m` avant, après et par section ; systèmes laissés au récit ; exceptions du vérificateur ;
prompts de `ready/` qui demandent encore de mettre `CLAUDE.md` à jour. Message proposé :
« docs: CLAUDE.md redevient un fichier d'instructions — consignes en tête, une ligne par système ».
