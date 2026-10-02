# 72-skill-fin-de-session — le rituel de fin de session est chargé dans ce dépôt, ne répond qu'ici, et ses passes mécaniques sont des commandes

> ⚠️ **À reprendre avant de le donner (02/10/2026).** Le chantier [organiser-le-coffre](../../../coffre/organiser-le-coffre.md) a posé un en-tête YAML (`type`, `statut`, `maj`…) sur les notes de `WWS/` et ouvert [INDEX.md](../../../../../INDEX.md) et [decisions.md](../../../../decisions.md). Le SKILL a gagné ce jour-là une passe « Le coffre suit » (en-tête et `maj`, INDEX.md, decisions.md) : la réécriture la garde, et ne réécrit pas le front-matter du SKILL sans ses clés `type`, `statut`, `maj`.

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 27, 29, 30, 31 à 33 ; et 24, 25, 71, dont le skill tient ou nomme les fichiers.
**Pierre d'abord :** rien avant. Après l'acceptation, P9 : publier le skill sur claude.ai pour Cowork, et conditionner
la description de `hueco-fin-session` au dépôt hueco_umbral.

**À lire :** `WWS/docs/skills/wws-fin-session/SKILL.md` (tel que 29 l'a laissé) · `WWS/docs/skills/format-reponse.md` ·
`WWS/docs/HANDOFF.md` · l'en-tête de `WWS/docs/RESTE-A-CODER.md` (forme d'un item, statuts, « Prochain numéro libre »)
· les sorties de `npm run doc-lint` et de `npm run prompts -- status` · `.claude/skills/wws-prompt/SKILL.md` ·
https://code.claude.com/docs/en/skills (« Symlinked folders », skills synchronisés).

## Pourquoi
`WWS/docs/skills/wws-fin-session/SKILL.md` (un seul commit, 150ef88, 19/08) n'est chargé nulle part : ni
`.claude/skills/`, ni `~/.claude/skills/` (`find-skills`, un zip, `synced/`), ni le manifeste synchronisé du compte.
Il n'a tourné dans aucune des 26 sessions de l'audit, et ready/ s'est rempli de prompts consommés (27). Or
`hueco-fin-session`, chargé partout, a les mêmes déclencheurs (« note tout », « récap », « dodo », « on s'arrête »)
et « même si Pierre ne mentionne pas explicitement "Hueco" » : le rituel d'un autre dépôt peut partir ici (risque
conditionnel, il demande du travail Hueco dans la conversation). Écrit pour Cowork, le skill fait greper à la main
ce que doc-lint (31) et `npm run prompts` (27) font, et ne tient ni `WWS/docs/ETAT-DU-CODE.md`, ni RESTE, ni le
handoff, ni le plafond de `CLAUDE.md` : les fichiers mêmes qui ont dérivé.

## Ce qui change
1. `.claude/skills/wws-fin-session` (à créer), lien relatif posé depuis la racine : `ln -s
   ../../WWS/docs/skills/wws-fin-session .claude/skills/wws-fin-session`. Une seule source : Claude Code lit le
   `SKILL.md` de la cible d'un dossier lié (`~/.claude/skills/find-skills` est un lien, et il est chargé), et c'est
   ce fichier que Pierre publie pour Cowork.
2. `WWS/docs/skills/wws-fin-session/SKILL.md` réécrit, 120 lignes au plus.
   - Frontmatter : `name` inchangé ; `description` de 1 024 caractères au plus (plafond de claude.ai), mêmes
     déclencheurs, conditionnée : « seulement dans le dépôt Worldwarsim (WWS) — le répertoire de travail contient
     `WWS/` — ou quand la conversation porte sur lui ; ailleurs, ne pas déclencher » ; plus de « même si Pierre ne
     mentionne pas » ; pas de `disable-model-invocation`.
   - En tête : commit et `git add` sur demande de Pierre seulement, ni push, ni stash ; sans node (Cowork), une
     passe outillée se fait à la main et le récap le dit ; vocabulaire : un renvoi à `WWS/CONTEXT.md`, sans la
     liste. Les rubriques de doc-lint se citent par leur titre, au mot près (31) : « registres », « index des
     ADR », « statuts suspects », « propositions », « décisions », « taille de CLAUDE.md ».
   - **0. Borne** : le HEAD de `## État` du handoff ; la session est `git log --oneline <ce HEAD>..HEAD` et `git status --short`.
   - **1. Ancres** : chaque décision de la conversation gagne une ancre greppable (ADR ou bandeau daté ; constante et
     `@a-mesurer` ; `WWS/QUESTIONS.md`), écrite datée (« 2a du 23/09 ») ; puis, pour les lignes de la session, les
     rubriques « décisions » et « registres ».
   - **2. Index des ADR** : la rubrique « index des ADR », ligne par ligne.
   - **3. Prompts** : `npm run prompts -- status` ; `-- done <nom>` pour chaque prompt accepté (Pierre l'a dit, ou un
     commit de la borne nomme son slug) ; `-- plus-tard <nom>` pour un prompt parqué ; un prompt périmé avant d'avoir
     été donné est supprimé (`rm`, git garde l'histoire).
   - **4. Chiffres périmés** : au jugement, sans script ; bandeau daté « ⚠️ mesures périmées », l'ancienne valeur gardée.
   - **5. Fiches** : les rubriques « statuts suspects » et « propositions », plus les fiches qui citent un ADR révisé
     pendant la session (`git diff --name-only <borne> -- WWS/docs/adr`, puis `git grep -l "ADR NNNN" --
     WWS/docs/design`) : à jour, ou « ⚠️ en retard sur l'ADR NNNN sur : … ».
   - **6. Récit** : chaque lot de la session a son paragraphe dans `ETAT-DU-CODE.md` ; sinon l'écrire.
   - **7. RESTE-A-CODER** : aucun numéro ne bouge ni ne se réemploie ; chaque « (hash au commit) » de `/wws-prompt`
     prend `git log --format=%h --grep '<slug>'` (le sujet porte le slug) ; un lot d'avant le skill, où le passage
     en done/ partait dans le commit même : `git log --diff-filter=AR --format=%h -- 'WWS/docs/prompts/code/done/*<slug>.md'` ;
     sinon la marque reste, dite au récap. Un item neuf prend le « Prochain numéro libre », qui avance ; statuts de l'en-tête.
   - **8. HANDOFF.md réécrit** : `## État` (HEAD, date) · `## Non commité` · `## Points ouverts` (un point clos depuis
     la dernière réécriture est rayé une fois avec son hash, puis disparaît ; un ouvert renvoie à « RESTE N » ou
     « QUESTIONS 🟠 <titre> ») · `## Prochain prompt` (`/wws-prompt <nom>`). Ni URL de prod, ni clé.
   - **9. Plafond de CLAUDE.md** : la rubrique « taille de CLAUDE.md » ; au-delà de 8 000 caractères, le récit part
     dans `ETAT-DU-CODE.md`, `CLAUDE.md` garde l'invariant d'une ligne ; aucun décompte (nations, tests, portes).
   - **10. Clôture** : `npm run doc-lint -- --strict` rend `doc-lint : propre` ; ce que la session a cassé se
     corrige, le reste va au récap.
   - **Récap** au format de `format-reponse.md` : Rapport (décisions et leur ancre, prompts déplacés, docs touchées,
     état de doc-lint) · À trancher · À donner.
3. `WWS/docs/prompts/code/README.md`, une ligne : la fin de session (`/wws-fin-session`, ou les mots) déplace les
   prompts acceptés par `npm run prompts` et réécrit le handoff.

## Ce que ce prompt ne fait pas
Ni publication sur claude.ai, ni retouche de `hueco-fin-session` (P9, hors dépôt). Aucun script nouveau ; la passe
4 reste au jugement. Le rituel ne tourne pas ici, hormis la répétition à blanc du cas 5.

## Cas d'acceptation
0. Existent `format-reponse.md`, `WWS/docs/HANDOFF.md`, `WWS/docs/ETAT-DU-CODE.md`, `.claude/skills/wws-prompt/SKILL.md`,
   et les scripts `doc-lint` et `prompts` ; sinon s'arrêter, le manque nommé.
1. `readlink .claude/skills/wws-fin-session` rend `../../WWS/docs/skills/wws-fin-session` ; `head -3` du `SKILL.md`
   se lit par le lien ; `git config core.symlinks` n'est pas `false` (non défini sur le Mac : vrai par défaut).
2. Le frontmatter, lu par le paquet `yaml` (dans `node_modules`, comme en 33) : `name` vaut `wws-fin-session` ; la
   description fait 1 024 caractères au plus, contient « Worldwarsim », pas « même si » ; aucune clé
   `disable-model-invocation` ; `wc -l` ≤ 120.
3. `grep -n -E "ne peut pas supprimer|format du Project|_to_delete" WWS/docs/skills/wws-fin-session/SKILL.md` : rien.
4. Chaque `npm run <x>` du skill existe dans `package.json` ; chacune des six rubriques citées figure mot pour mot
   dans la sortie de `npm run doc-lint`.
5. À blanc, sans rien écrire : les commandes des passes 0, 1, 2, 3 (`status` seul), 5, 9 et 10 ;
   `git status --porcelain` identique avant et après.
6. `npm run doc-lint -- --strict` : `doc-lint : propre` ; `git status --short` : `SKILL.md`, le lien, le README.

## Vérifications
Doc et lien seulement : les cas 0 à 6, sans `npm run verifier`. Le skill apparaît dans la liste de la session ou
non : le noter ; Pierre le vérifie par `/skills` dans une session neuve.

## Rapport attendu
Format commun (README de la série), plus : `wc -l` et longueur de la description ; la table passe → commande →
rubrique ; les comptes de chaque passe à blanc. « À trancher » : (1) après P9, `/wws-fin-session` lance la copie du
projet et la copie synchronisée répond en `/anthropic-skills:wws-fin-session`, mais les deux restent dans la liste
où le modèle choisit : 1a republier à chaque modification (recommandé), 1b publier pour Cowork sous un autre nom ;
(2) le lien sur le poste Windows + WSL (`ls -l .claude/skills` après un pull ; un fichier texte = `core.symlinks=false`).
