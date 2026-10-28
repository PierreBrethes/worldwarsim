---
name: lot
description: Consigne d'un agent qui code une issue GitHub de La Manchette (#N) ou une feature de la file, seul et sans Pierre. Use when on lance un agent sur une issue, un lot ou une feature de RESTE-A-CODER.
---

# Lot

Tu codes **une** issue (`gh issue view N --comments`) ou une feature de
`WWS/docs/RESTE-A-CODER.md`. Pierre est absent : aucune question, tu tranches et tu le notes.

## 1. Lire

- `CLAUDE.md` (carte, invariants), `CONVENTIONS.md`, `WWS/CLAUDE.md` (boussole, trois règles),
  `WWS/CONTEXT.md` (vocabulaire imposé).
- Les ADR, fiches de `WWS/docs/design/` et prototypes de `WWS/prototypes/` que cite l'issue.
  Les commentaires « Décisions » de l'issue l'emportent sur son corps, l'encadré « Précisée le… »
  d'un ADR sur le texte de l'ADR.
- Le code qui existe : il fait foi. Une doc qui le contredit a tort : signale l'écart.

Fini quand tu sais nommer la fonction pure de `src/domain/` qui porte la règle, les champs de
`PlayerView` qu'elle lit, et chaque puce de **Ce que le joueur voit**.

## 2. Coder

- Skills : `ponytail` pour tout le code, `tdd` pour la règle (logique, calcul),
  `domain-modeling` si un terme neuf apparaît (mets `WWS/CONTEXT.md` à jour).
- Les invariants de `CLAUDE.md` tiennent tous. Ceux que les revues ont le plus souvent trouvés
  cassés sont la grille du skill `revue-lot` : relis-la avant ton dernier commit.
- **L'UX de la règle, des deux côtés** : comment le joueur la voit et la vit, qu'il agisse ou
  qu'il subisse (carte, fiche au survol, refus dit avant le geste, dépêches). Chaque puce de
  **Ce que le joueur voit** est obligatoire.
- **Rouge d'abord** : une règle ou un bug a son test, ou le banc, lancé au rouge avant la
  première ligne de code, et le rapport cite ce rouge. Le test vise le chemin que prend le
  joueur (moteur, rose, porte serveur), pas seulement la fonction pure. Un bug sans rouge :
  rapporte la cause « à vérifier » et ne corrige rien.
- **Mondiale seule** sauf mention contraire : la Blitz garde ses règles (`modeOf`).
- **Code mort** : ce que le lot rend inutile se retire partout (constantes, refus, textes,
  tests, docs), dans un commit séparé.
- **Périmètre** : ton issue, rien d'autre ; tu n'anticipes pas les suivantes.
- **Décisions de Pierre** : ce que tranchent l'issue, ses commentaires « Décisions », un ADR ou
  la maquette choisie tient tel quel. Un conflit entre une décision et ce que tu vois dans le
  code se rapporte, et tu attends la réponse. Laisser de côté un élément de la maquette choisie
  (une couche, une ligne d'état, un fondu) est un tel conflit, jamais une décision prise seul.
- **Décisions prises seul** : quand tout se tait, prends l'option la plus simple qui reste
  cohérente avec eux, et note-la pour le rapport, même petite. Tout chiffre neuf porte
  `@a-mesurer`.

## 3. Environnement

- **Node** : si `npm --version` imprime plus d'une ligne (le Mac), préfixe chaque commande node
  par `unfunction node npm npx nvm 2>/dev/null; export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH";`.
- **Un seul vérifieur à la fois** sur la machine : `ps -Ao pid,command | grep "[n]pm run verifier"`,
  lancé dans une commande à part, doit ne rien rendre avant `npm run verifier`. Des timeouts
  dans `convex/` qui changent d'un passage à l'autre viennent de la charge : relance ces
  fichiers seuls.
- **Attendre un processus** : attends son pid (`while kill -0 <pid>; do sleep 5; done`).
  `pgrep -f <motif>` dans une boucle trouve la boucle elle-même et ne rend jamais la main.

## 4. Voir son rendu

Obligatoire dès que le lot touche un écran. Le mode d'emploi est dans `deploiement/README.md`,
section « Voir une partie Mondiale en local ».

1. Docker `worldwarsim-backend-1` levé ; `npm run dev` sur 5173 (`lsof -i :5173` dit s'il tourne).
2. `grep CONVEX_SELF_HOSTED_URL .env.local` doit viser `127.0.0.1`, puis `npx convex deploy`.
   Pierre a autorisé ce déploiement local. Si le contrôle des permissions le refuse quand même,
   n'essaie pas une autre commande qui ferait la même chose (`convex dev --once`, script) :
   capture ce qui est déjà déployé, et dis dans ton rapport que le déploiement manque :
   l'orchestrateur déploie et te renvoie capturer.
3. `npm run demo:mondiale`. Si le lot a besoin d'une scène, ajoute-la en option à
   `scripts/demo-mondiale.mjs`.
4. `PLAYWRIGHT_DIR=<dossier hors du dépôt> npm run capture -- '<route>' <sortie.png> …`, en
   1440×900 puis `--largeur 390 --hauteur 844`, avec `--geste` pour amener l'état voulu.
   Captures rangées hors du dépôt, dans ton dossier temporaire.
5. Regarde chaque capture avec l'outil Read, à côté de sa référence : la maquette choisie, ou
   la capture d'avant le lot. Un écart se corrige, ou se rapporte s'il vient d'une décision.
   La capture ou le banc d'avant se prend dans un clone du scratchpad (`git clone --shared`,
   `node_modules` en lien symbolique, `.env.local` copié), jamais dans un worktree.

Fini quand chaque puce de **Ce que le joueur voit** apparaît sur une capture, aux deux tailles,
au même cadrage que sa référence. Un état que la démo ne sait pas montrer devient une scène de
`scripts/demo-mondiale.mjs`.

## 5. Git

- Branche courante (`git branch --show-current`) : tu n'en changes pas.
- Un commit par étape logique terminée et vérifiée ; message en anglais au style de
  `git log --oneline -15`, terminé par la ligne `Co-Authored-By` de ta consigne.
- `git add <fichiers>` : seulement les tiens. `.claude/launch.json`, `WWS/prototypes/` et
  `WWS/GLBs/` sont à Pierre, un autre agent peut coder à côté de toi.
- Le dernier commit porte `Closes #N`. L'orchestrateur pousse, ouvre la PR et fusionne : tes
  commits restent locaux.

## 6. Fin

1. `npm run verifier` vert sur ton dernier commit.
2. Issue : ni `RESTE-A-CODER.md` ni GitHub, Pierre met l'issue à jour depuis ton rapport.
   Feature de la file : barre-la dans `WWS/docs/RESTE-A-CODER.md`.
3. Rapport en français, 15 lignes au plus : commits ; ce que le joueur voit ; **décisions prises
   seul**, chacune ; code retiré ; changements de schéma ; ce qui reste ou inquiète ; chemins
   des captures.

**Règle d'arrêt** : si la même vérification échoue 3 fois, arrête-toi et rends un rapport
d'échec, sans chercher de nouvelle stratégie.
