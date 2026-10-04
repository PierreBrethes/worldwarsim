---
type: prompt
statut: proposé
maj: 2026-10-04
code: []
decisions: [menage-1c-2026-10-04, menage-3a-2026-10-04]
voir: [../../rapports/2026-10-04-etat-outillage.md, ../README.md, ../../skills/wws-fin-session/SKILL.md]
---

# menage-2-archives — les notes de Cowork hors du coffre sont dépouillées, la série outillage dit vrai

**En bref.** Doc seule. Trois rangements qui ne demandent aucun jugement de jeu : (1) les notes
`.md` de `Claude outputs/` (handoffs, copie des docs du Project claude.ai, relevé du Bulletin)
versent ce qu'elles ont encore d'ouvert dans la file, les questions ou le registre, puis quittent
le dépôt ; (2) la règle `_to_delete/` disparaît ; (3) `ready/outillage/` suit le rapport du 04/10.
Remplace les prompts outillage 27, 28 et 29 (voie menage-1c).

Lis `CLAUDE.md`, `WWS/docs/prompts/code/README.md`, `WWS/docs/skills/wws-fin-session/SKILL.md`,
`WWS/docs/rapports/2026-10-04-etat-outillage.md` (§ 1 et § 2), `WWS/docs/decisions.md` (« Lire un
identifiant »). Ne commit pas, ne push pas. Un chantier, un commit.
**Suppose :** menage-1 commité. Ne touche pas `Claude outputs/coffre-temps-1.md` (menage-5 le consomme).

## 1. Dépouiller les archives

Sources : `Claude outputs/HANDOFF-2026-09-11.md`, `-13.md`, `-14.md`, et les huit fichiers de
`Claude outputs/project-claude-ai/`. Pour chaque point **ouvert** qu'elles nomment (« reste ouvert »,
« à faire », « non traité », « à vérifier », questions numérotées), un verdict, avec sa preuve :

- **résolu** — commit (`git log -S`), fichier ou prompt de `done/` ;
- **déjà tenu** — où (`RESTE-A-CODER.md`, `QUESTIONS.md`, un ADR, `decisions.md`) ;
- **encore ouvert** — une ligne ajoutée à la fin de `WWS/docs/RESTE-A-CODER.md` sous
  `## Repris des archives du 04/10` (une puce par point : ce qu'il faut faire, source entre
  parenthèses), ou à `WWS/QUESTIONS.md` dans la section de gravité qui convient si c'est une question.

Attendus au moins : restauration SQLite jamais testée, `scenarios.mjs:109`, `countSeat`, conteneurs
Hueco `Exited`, rotation d'`INSTANCE_SECRET` (clé d'admin passée dans une conversation le 12/09),
« vrai téléphone » (Safari iOS), mesures Panama → Colombie et avant-postes debout par joueur au
jour 7. Pas de verdict sans preuve : dans le doute, « encore ouvert ».

## 2. Le registre des décisions

- `Claude outputs/decisions-du-bulletin.md` se fusionne dans `WWS/docs/decisions.md` comme son
  en-tête le dit : une ligne par décision, identifiant normalisé, lien vers la fiche qui fait foi
  si elle existe dans `WWS/`, sinon « Bulletin WWS N° 71 » ; une décision déjà au registre complète
  sa ligne (date, sens) au lieu d'en créer une seconde.
- Les six décisions du film du 02/10 (`Claude outputs/project-claude-ai/TEASER-2026-10-02.md`,
  « 1a » à « 6a ») entrent sous le préfixe `teaser-` (`teaser-1a-2026-10-02`…), état « film
  remplacé (plan-3b) », source « Project claude.ai, retiré le 04/10 (historique git) ».
- Les sources indirectes déjà signalées en fin de `decisions.md` qui se résolvent par ces archives
  y gagnent leur source.

## 3. Sortie du dépôt

`git rm` : les trois `HANDOFF-*.md` de `Claude outputs/`, `Claude outputs/project-claude-ai/`,
`Claude outputs/decisions-du-bulletin.md`. Puis, dans `## Instructions` de `CLAUDE.md` (sans rien
y changer d'autre) et dans le SKILL de fin de session, la règle en une ligne : « `Claude outputs/`
ne reçoit que des livrables binaires (planches, images) ; une note va dans `WWS/`. »

## 4. Plus de `_to_delete/`

Le dossier n'existe plus. Règle nouvelle : **un prompt périmé avant d'avoir été donné est
supprimé ; le message de commit le nomme**. Elle remplace l'ancienne dans
`WWS/docs/prompts/code/README.md` (~20, et son « En bref ») et dans le SKILL (§ 3, ~66-67). Les
renvois vivants à l'ancien dossier disent « retiré du dépôt le 04/10 » avec la commande
`git log --diff-filter=D --name-only -- '<chemin>'` : `WWS/simulation/README.md` (~39),
`WWS/CLAUDE.md` (~161), `WWS/docs/RESTE-A-CODER.md` (~161). Les prompts (`done/`, `ready/`),
les rapports datés et `coffre-temps-1.md` restent tels quels : ce sont des traces.

## 5. `ready/outillage/` suit le rapport du 04/10

- `05` et `12` (faits) → `WWS/docs/prompts/code/done/outillage/` (à créer), par `git mv`.
- Supprimés : `04`, `10` (caducs) ; `27`, `28`, `29`, `31`, `32`, `33` (remplacés par la voie
  menage-1c : pas de `npm run prompts`, pas de doc-lint, pas de modèle de prompt outillé).
- `README.md` de la série : sous le titre, un bandeau de quatre lignes au plus — état au 04/10 dans
  `WWS/docs/rapports/2026-10-04-etat-outillage.md` ; 21, 22, 24, 25, 30 et 72 sont repris par
  menage-3 à menage-6 ; 23 et 26 (corrections de fond) restent, à rebaser après menage-5 ; les
  numéros supprimés ne se réemploient pas. Dans les tableaux, chaque ligne supprimée ou déplacée
  porte son sort (« fait — done/outillage », « caduc — supprimé le 04/10 », « remplacé par menage-N »).
- Tout renvoi **hors** `done/`, rapports et prompts vers un fichier supprimé ou déplacé est mis à jour
  (`git grep -n '<slug>'`).

## Acceptation

- `ls "Claude outputs"/*.md` ne rend que `coffre-temps-1.md` ; `Claude outputs/project-claude-ai/` n'existe plus.
- `git grep -n "_to_delete" -- WWS CLAUDE.md ':!WWS/docs/prompts' ':!WWS/docs/rapports' ':!Claude outputs'` :
  seulement les lignes « retiré du dépôt le 04/10 ».
- Chaque entrée du relevé du Bulletin (59) et du film (6) a sa ligne au registre, ou une raison au
  rapport ; chaque lien relatif ajouté à `decisions.md` résout.
- `ls WWS/docs/prompts/code/ready/outillage/ | wc -l` = 75 − 10 = 65 (README compris) ; `done/outillage/` contient 05 et 12.
- `npm run verifier` vert (rien de code n'est touché ; il le confirme).
- Rapport au format de `ready/outillage/README.md` (Fait · Écarts · Vérifications · Docs touchées ·
  Message de commit proposé · À trancher), avec **le tableau des points ouverts** (point, source,
  verdict, preuve ou destination). Message proposé : « docs: archives de Cowork dépouillées, plus de
  _to_delete, série outillage au 04/10 ».
