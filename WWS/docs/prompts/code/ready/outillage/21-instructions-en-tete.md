# 21-instructions-en-tete — les consignes de travail ouvrent CLAUDE.md, décrivent les deux postes et priment sur la consigne d'édition du mode auto

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 16, 19, 20.

**À lire :** `CLAUDE.md` (titre, introduction et commandes ~1-16 ; `## Instructions` ~617-626, en
fin de fichier), `.gitignore`, `.claude/settings.json` (16 : ses refus, à ne pas contredire),
`package.json` (script `sur-head` du 19), `.githooks/pre-push` (branche Windows ~6-22),
`.github/workflows/ci.yml` (~4-5 et job `deployer` ~40-54 : un push sur main déploie).

## Pourquoi

- `## Instructions` est la dernière section (~617), derrière ≈ 45 000 caractères d'état du jeu, et
  ne décrit qu'un poste (« dépôt monté sous WSL ») alors que deux commitent (voir 20).
- La consigne système du mode auto recommande d'éditer « with sed, heredocs, or short scripts
  instead of the dedicated Read, Edit, or Write tools ». Audit de 26 sessions : les 18 en mode auto
  comptent 0 Read, 16 Edit/Write et 484 heredocs python qui écrivent ; les 8 autres, 170 Read et
  286 Edit/Write. `~/.claude/file-history` n'a d'entrées que pour 3 des 18 sessions auto : ni retour
  arrière ni diff pour Pierre, et 20 copies `cp … /tmp/*.bak` pour compenser. Seule une règle écrite
  qui nomme le mode auto peut primer sur cette consigne.
- Git : « Ne commit pas » ne dit pas la pratique (10 commits demandés par Pierre du 12 au 14/09,
  5 `git add -A`, 12 `git stash` en trois sessions, dont un `pop` en conflit en 451da9dc).
- 51 commandes, en six sessions, créent puis effacent des tests jetables dans `src/` et `convex/`
  (`scratch-disc.test.ts`, `__probe.test.ts`…). Aucun n'a été commité ; rien ne l'empêche.

## Ce qui change

1. `CLAUDE.md` : `## Instructions` devient la **première section `##`**, sous le titre et ses trois
   lignes d'introduction ; le bloc de commandes passe dessous, intact, sous un intertitre
   `## Commandes` (l'ordre que 25 garde). L'ancienne section de fin disparaît.
2. Réécrite en **25 lignes au plus** (lignes vides comprises, titre exclu), en paragraphes courts à
   intitulé gras :
   - **Deux postes.** Windows + WSL : dépôt sous `/mnt/c`, `npm` depuis WSL ; un push lancé de
     Windows relaie le pre-push à WSL (`.githooks/pre-push`) ; Vite y scrute les fichiers. macOS :
     Node 24 par nvm ; tant que `npm --version` imprime plus d'une ligne (profil zsh pas corrigé),
     préfixer node, npm et npx par
     `unfunction node npm npx nvm 2>/dev/null; export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH";`.
   - **Édition**, au mot près : « Même en mode auto : lire avec Read ce qu'on modifie, modifier avec
     Edit/Write — c'est ce qui donne à Pierre le retour arrière et le diff. Un script (python, sed)
     seulement pour un remplacement mécanique sur trois fichiers ou plus, et il échoue si la cible
     manque. Jamais de copie de sauvegarde dans `/tmp`. »
   - **Git.** Commit seulement sur demande explicite de Pierre, par chemins explicites (jamais
     `git add -A` ni `git add .`) ; jamais de push, un push sur main déploie ; jamais de stash :
     pour mesurer avant et après, `npm run sur-head -- "<commande>"`. Les refus sont déclarés dans
     `.claude/settings.json`. Pas de worktree sauf demande explicite (préférence du 08/09/2026).
   - **Sondes.** Un test jetable s'écrit `<nom>.sonde.test.ts` (ou `.tsx`) à côté du code qu'il
     sonde : gitignoré, jamais commité, supprimé en fin de tâche.
   - **Tests.** Pendant la tâche, des tests ciblés (`npx vitest run <fichier>`) ; à la fin,
     `npm run verifier` vert.
3. `.gitignore` : `*.sonde.test.ts` et `*.sonde.test.tsx`, sous une ligne qui dit pourquoi :
   vitest les lance quand même, c'est voulu ; ils n'entrent jamais dans un commit.

## Ce que ce prompt ne fait pas

- Rien d'autre dans `CLAUDE.md` : pas une ligne du bloc de commandes (10, 11, 13), le récit part au
  24, la racine au 25. Ni `.claude/settings.json` (16), ni `settings.local.json` (P5), ni `AGENTS.md`.
- Le signalement des sondes oubliées au démarrage est au 18 ; `verif:rapide` arrive au 48.

## Cas d'acceptation (tests d'abord)

0. `git ls-files --error-unmatch .claude/settings.json` et `grep -q '"sur-head"' package.json` sortent
   en 0, sinon s'arrêter (16 ou 19 manque) ; puis les cas 1, 4 et 6 échouent sur l'arbre de départ.
1. `grep '^## ' CLAUDE.md | head -2` rend `## Instructions` puis `## Commandes` ;
   `grep -c '^## Instructions' CLAUDE.md`, 1.
2. `awk '/^## Instructions/{f=1;next} /^## /{f=0} f' CLAUDE.md | wc -l` rend 25 au plus.
3. Une boucle `grep -qF` sur cette section n'imprime aucun absent parmi : `mode auto`,
   `Edit/Write`, `/tmp`, `/mnt/c`, `.githooks/pre-push`, `nvm`, `git add -A`, `push`, `stash`,
   `npm run sur-head`, `.claude/settings.json`, `worktree`, `.sonde.test.ts`, `npm run verifier`.
4. `grep -n "monté sous WSL\|Utilise git seulement" CLAUDE.md` ne rend rien.
5. `git diff -U0 HEAD -- CLAUDE.md` : retirées (`^-[^-]`), l'ancienne section ; ajoutées
   (`^+[^+]`), la nouvelle et l'intertitre `## Commandes` ; rien d'autre.
6. Après `touch src/domain/essai.sonde.test.ts convex/essai.sonde.test.tsx`,
   `git status --porcelain --untracked-files=all | grep sonde` ne rend rien, `git check-ignore -v`
   nomme `.gitignore` pour les deux, `git check-ignore -q src/domain/combat.test.ts` sort en 1.
   Supprimer aussitôt les deux fichiers.
7. `git diff --stat` : `CLAUDE.md` et `.gitignore`, rien d'autre.

## Vérifications

- Les cas 0 à 7. Doc et `.gitignore` seulement : `npm run verifier` n'est pas exigé ;
  `npm run format:check` vert (Prettier lit `.gitignore`).

## Rapport attendu

Format commun (README de la série), plus :

- la section finale telle quelle, ses lignes et son `wc -m` ; `wc -m CLAUDE.md` avant et après ;
- ce que la nouvelle section change à l'ancienne (« Ne commit pas » devient « commit sur demande ») ;
- pour Pierre : après deux ou trois sessions en mode auto, compter Edit/Write contre heredocs dans
  les transcripts, pour voir si la règle prend.
