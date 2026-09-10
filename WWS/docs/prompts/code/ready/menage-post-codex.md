# menage-post-codex — une seule source d'instructions, une file qui dit vrai, un glossaire sans numéros de lot

Lis `CLAUDE.md`, `AGENTS.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/RESTE-A-CODER.md`,
`WWS/docs/prompts/code/ready/`. Ne commit pas, ne push pas. **Tidy first** : ce chantier ne change
aucun comportement — aucun fichier de `src/` ni de `convex/` ne bouge ; si un test casse, c'est une
régression du chantier, pas une correction à faire ici.

## Contexte

Du 08/09 au 09/09, Codex a livré les portées passives (ADR 0021 révisée), le stockage unique
(S2-S3), le pillage S4 → S8 et les comptes C1-C2, en écrivant dans `AGENTS.md` (copie de
`CLAUDE.md` désormais en avance d'une trentaine de lignes), dans le glossaire et en tête de deux
ADR. Le dépôt a deux fichiers d'instructions qui divergent, une file qui s'arrête avant le dernier
commit, et un glossaire qui raconte des numéros de lot.

## Ce qui change

1. **Un seul fichier d'instructions.** Fusionne dans `CLAUDE.md` ce qu'`AGENTS.md` dit de plus :
   le contact mobile (ADR 0021 révisée), le stockage unifié, le pillage — **résumé en un paragraphe
   d'état livré**, pas la liste S5b → S6b-3 —, et l'instruction « pas de worktree ». `AGENTS.md`
   devient trois lignes : « Lis `CLAUDE.md` — c'est le seul fichier d'instructions de ce dépôt. »
   Le paragraphe « Ce qui existe » décrit l'état **réel** du pillage : vérifie dans
   `convex/movements.ts` (`plunder`, `collectLoot`, `previewPlunder`, `previewLootCollection`) et
   `src/domain/compass-rose.ts` ce qui est public et branché, plutôt que de recopier la file.
2. **La file dit vrai.** Ce prompt se donne **après `s8-ouverture-du-pillage`** (qui rend le dépôt
   vert, livre S8-S9 et déplace `pillage-et-butin.md` + `stockage-unique.md` dans `done/`) :
   vérifie que `RESTE-A-CODER.md` dit, pour chaque lot S1 → S9, livré (avec sa preuve : fichier +
   test) ou non — corrige ce qui manque. Les bilans S2 → S7c-2 (≈ 300 lignes) partent dans
   `WWS/docs/rapports/2026-09-09-pillage-s2-s8.md` ; la file garde **une ligne par lot** avec
   son état.
3. **Le glossaire ne porte pas de numéros de lot.** `WWS/CONTEXT.md` : les entrées Compte, Session,
   Entrepôt et Pillage disent la règle, jamais « S5b-S6a-1 livrent en interne ». L'entrée
   Interception est périmée (ADR 0021 : une force posée voit, n'intercepte plus) — corrige-la.
   Les termes morts (Sonde, Agent dormant, Embargo, Exposition, Occupation, Revanchisme) passent
   sous un titre « Retiré du vocabulaire » daté, comme le leurre.
4. **Les ADR ne portent pas de bannière de livraison.** Retire le bloc « Stockage unifié livré —
   S2-S3 » collé en tête des ADR 0015 et 0017 (le même texte, trois fois dans le dépôt) ;
   remplace-le par une ligne de statut « révisée le 09/09/2026 — stockage unique, voir §… » qui
   renvoie au paragraphe où la règle est écrite.
5. **`.gitignore`** : ajoute `.claude/settings.local.json` et `_wws_snapshot.tgz`
   (`git rm --cached` pour les deux, sans les supprimer du disque).

## Cas d'acceptation

1. `AGENTS.md` fait moins de cinq lignes et renvoie à `CLAUDE.md` ; `grep -c "S6a" CLAUDE.md` vaut 0.
2. `ready/` ne contient plus `stockage-unique.md` ; `done/` le contient.
3. `RESTE-A-CODER.md` dit, pour chaque lot S1 → S9, livré (avec sa preuve) ou non.
4. `grep -n "S5b\|S6a\|S2-S3" WWS/CONTEXT.md` ne retourne rien.
5. `npm run verifier` vert et `git diff --stat` ne liste aucun fichier de `src/` ni de `convex/`.

Un commit, message en français qui décrit le chantier entier.
