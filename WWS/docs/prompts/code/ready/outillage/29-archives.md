# 29-archives — `_to_delete/` et « Claude outputs/ » ont quitté le dépôt, leurs points encore ouverts vivent dans RESTE ou QUESTIONS, un seul HANDOFF.md les remplace, et le format de réponse de Cowork est versé au dépôt

> ⚠️ **À reprendre avant de le donner (02/10/2026).** Le chantier [organiser-le-coffre](../../../coffre/organiser-le-coffre.md) a posé un en-tête YAML (`type`, `statut`, `maj`…) sur les notes de `WWS/` et ouvert [INDEX.md](../../../../../INDEX.md) et [decisions.md](../../../../decisions.md). Le film d'annonce vit dans `Claude outputs/teaser/`, suivi par git, et [actifs.md](../../../../marque/actifs.md) le référence ; la décision plan-4b-2026-10-02 le veut sur le VPS : le déplacer **avant** de supprimer `Claude outputs/`. `_to_delete/` a aussi reçu le 02/10 deux prompts en doublon.

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 27.
**Pierre d'abord :** P4 — coller dans la conversation le `FORMAT-REPONSE.md` du Project Cowork. À
défaut, le reconstruire (§ 4) et le marquer « à relire par Pierre ».

**À lire :** la liste de `WWS/docs/_to_delete/` (`git ls-files`, sans l'ouvrir) ; les trois handoffs
de « Claude outputs/ » en entier ; `WWS/docs/skills/wws-fin-session/SKILL.md` (~50-52, passe 6
~66-76) ; `WWS/docs/RESTE-A-CODER.md` (sections, numéros : le premier libre est 32) ; `WWS/QUESTIONS.md`.

## Pourquoi

`WWS/docs/_to_delete/` : 16 fichiers suivis depuis le 19/08 (edaf3bd), 304 Ko dont une copie
périmée de `world.json` (156 Ko), jamais vidé et encore nourri les 14 et 15/09 (e008b32, 637279c) :
le skill croit que « l'outil ne peut pas supprimer » (SKILL.md ~52), ce qui est faux dans Claude
Code. Avec done/ et rapports/, les archives font ~48 % du markdown suivi, et
`git grep -lw heldRegions` rend 18 fichiers dont 9 d'archives, qui décrivent des règles mortes.
« Claude outputs/ » tient trois handoffs (11, 13 et 14/09), entrés en passagers de commits feat:
(653534f, 16373f8, e008b32), avec une espace dans le nom qui casse `xargs`, des renvois vers des
fichiers claude/ du Project (FORMAT-REPONSE, ETAT-PROJET, AUDIT-2026-09-10, HANDOFF-2026-09-12)
absents du dépôt, et des points jamais clos : celui du 14/09 (~28) dit que scenarios.mjs plante le
QG, corrigé par 21a9a53 quatre heures plus tard — il a trompé l'audit lui-même. Et le format de
réponse de Cowork vit dans le Project, hors de portée de Claude Code.

## Ce qui change

1. **`_to_delete/`.** `git status --short --ignored WWS/docs/_to_delete "Claude outputs"` doit être
   vide (un fichier non suivi serait perdu sans trace) ; sinon s'arrêter et le dire. Puis
   `rm -r WWS/docs/_to_delete`, pas `git rm` : l'index reste à Pierre, git garde l'histoire. Ses
   renvois vivants (`git grep -n _to_delete` hors done/ et série fait foi ; le 23/09, `WWS/CLAUDE.md`
   ~160, que 22 retire, `WWS/docs/RESTE-A-CODER.md` ~161 et le titre `WWS/simulation/README.md` ~39)
   disent « supprimé le <date du jour>, voir `git log --diff-filter=D -- WWS/docs/_to_delete` ».
   Dans SKILL.md ~51-52, les deux puces deviennent « prompt périmé avant d'avoir été donné →
   supprimé (voir `WWS/docs/prompts/code/README.md`) ».
2. **Les handoffs, point par point.** Chaque point présenté comme ouvert, à faire, à surveiller ou
   « non traité » est vérifié contre le dépôt, jamais contre le handoff (un prompt par le `git log`
   du README des prompts, du code par `git log -S`, une décision dans QUESTIONS.md). Verdicts :
   - **résolu**, avec le hash ou le `fichier:ligne` qui le prouve — déjà vus : scenarios.mjs →
     21a9a53 (`WWS/simulation/opening/scenarios.mjs` ~115-119) ; questions 89 et 90 → 1b du 13/09
     et ADR 0024 ; `_wws_snapshot.tgz` → a741073 ; objectifs-neutres → be9fcd5 ;
   - **ouvert** : l'item qui le porte déjà (restauration SQLite → « Bloquant » 1 de RESTE ; salve
     d'allonge → item 8 ; ordre « intercepter » → QUESTIONS 🟠), sinon un item de RESTE au premier
     numéro libre (32 le 23/09), une ligne en fin de « Évoqué, au Registre — pas tranché » (la garde
     de `countSeat`, `convex/seasons.ts` ~236), ou une entrée de QUESTIONS.md si c'est une décision ;
   - **hors dépôt** (VPS, Project : conteneurs Hueco, clone du VPS, ETAT-PROJET) ou **sans objet**
     (avec la raison) : au rapport seulement.
   Aucune consigne propre à Cowork (GIT_OPTIONAL_LOCKS=0, le Bulletin) n'entre dans le dépôt. Puis
   `rm -r "Claude outputs"`.
3. **`WWS/docs/HANDOFF.md` (à créer)**, 60 lignes au plus : une ligne d'en-tête (« réécrit à chaque
   fin de session ; l'historique est `git log -p -- WWS/docs/HANDOFF.md` ») et exactement quatre
   sections : `## État` (HEAD, date) ; `## Non commité` (ce que `git status` montre, par chantier) ;
   `## Points ouverts` (un par ligne, chacun avec son renvoi « RESTE N », « RESTE, <section> » ou
   « QUESTIONS 🟠 <titre> » ; les résolus des trois handoffs rayés avec leur hash, cette fois
   seulement) ; `## Prochain prompt` (la ligne à coller pour 30). Aucune URL de prod, aucune clé : le
   handoff du 13/09 en porte, rien n'en est recopié.
4. **`WWS/docs/skills/format-reponse.md` (à créer)** : le texte de Pierre tel quel, avec sa source ;
   sinon reconstruit depuis la passe 6 de SKILL.md (Rapport / À trancher / À donner) et le handoff du
   11/09 ~11-17 (français, concis, critique ; options a/b/c et recommandation ; Pierre répond
   « 1a 2b »), sous l'en-tête « reconstruit le <date>, à relire par Pierre ». La passe 6 de SKILL.md
   renvoie à ce fichier au lieu du « format du Project ».

## Ce que ce prompt ne fait pas

- Pas de `.ignore` (effet sur l'outil Grep non vérifié, VS Code le lirait) : done/ et rapports/ restent cherchables.
- RESTE-A-CODER n'est pas restructuré (30) : des items ajoutés, rien de renuméroté ni de corrigé.
- Le reste du skill (72). Aucun code : la « question 21, 18/08 » de `convex/movement/arrival.ts` ~429
  perd sa dernière ancre avec `_to_delete/` ; elle va en « À trancher », avec l'ancre qui la remplacerait.

## Cas d'acceptation

1. `ls WWS/docs/_to_delete "Claude outputs"` : introuvables ;
   `git status --short -- WWS/docs/_to_delete "Claude outputs" | grep -c '^ D'` rend 19 (16 + 3).
2. `git grep --untracked -n -E '_to_delete|Claude outputs|claude/[A-Z]' -- ':!WWS/docs/prompts/code/done/' ':!WWS/docs/prompts/code/ready/outillage/'`
   ne rend que les phrases « supprimé le … » (HANDOFF.md et format-reponse.md compris : la source se
   nomme « Project Cowork », jamais `claude/…`).
3. `grep -c '^## ' WWS/docs/HANDOFF.md` rend 4 ; chaque ligne non rayée de « Points ouverts » nomme
   RESTE ou QUESTIONS ; `grep -n -i -E 'pierrebrethes|admin_key' WWS/docs/HANDOFF.md` ne rend rien.
4. `grep -o -E '^[0-9]+(bis)?\.' WWS/docs/RESTE-A-CODER.md | sort | uniq -d` ne rend rien.
5. Chaque point des trois handoffs a son verdict au rapport.

## Vérifications

Les cas 1 à 5 ; `npm run verifier` : vert (des `.mjs` disparaissent sous `WWS/`, que vitest parcourt).

## Rapport attendu

Format commun (README de la série), plus : le tableau des points (handoff, point, verdict, preuve ou
renvoi) ; la source de `format-reponse.md` et, s'il est reconstruit, ce qui a été inféré ; les items
ajoutés à RESTE ou à QUESTIONS avec leur numéro ; le volume retiré (`du -sh` avant suppression).
