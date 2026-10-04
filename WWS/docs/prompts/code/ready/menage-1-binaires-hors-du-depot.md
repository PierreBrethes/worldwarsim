---
type: prompt
statut: proposé
maj: 2026-10-04
code: [.gitignore, .dockerignore, WWS/sprites/README.md, WWS/sprites/nettoyer-ombres.py, WWS/docs/marque/actifs.md, WWS/docs/marque/marque-et-site.md, WWS/docs/RESTE-A-CODER.md, WWS/docs/rapports/2026-10-03-releve-mobile.md]
decisions: [menage-2a-2026-10-04, plan-4b-2026-10-02]
voir: [../../../marque/actifs.md, ../../../../sprites/README.md]
---

# menage-1-binaires-hors-du-depot — les captures, le vieux film et les bruts de sprites quittent `HEAD`

**En bref.** Décision de Pierre du 04/10/2026 (ménage 2a) : environ 150 Mo de binaires suivis
par git sortent de `HEAD` — l'historique n'est **pas** réécrit, ils restent récupérables. Plus
le contexte Docker du front, qui embarque `WWS/` et `Claude outputs/` à chaque build sur le VPS.

Lis `CLAUDE.md`, `.gitignore`, `.dockerignore`, `deploiement/front.Dockerfile`,
`WWS/sprites/README.md` (§ unités et § 7), `WWS/docs/marque/actifs.md`. Ne commit pas, ne push
pas. Un chantier, un commit. Ne touche ni aux `.md` posés à la racine de `Claude outputs/`, ni à `Claude outputs/project-claude-ai/` (c'est menage-2).
**Suppose :** l'arbre de départ propre (`git status --short` vide) ; sinon, relève-le et dis-le au rapport.

## Ce qui sort de `HEAD` (`git rm -r`)

| Chemin | Pourquoi |
|---|---|
| `Claude outputs/teaser/` (4 fichiers, 30 Mo) | film « WW SIM » du 02/10, remplacé par les films La Manchette (plan-3b) servis depuis le VPS (plan-4b) ; `actifs.md` le dit déjà périmé |
| `Claude outputs/marque/captures-nettoyage/`, `captures-gris-de-note/`, `captures-film/`, `captures-renommage/` (~37 Mo) | captures d'acceptation de prompts livrés ; `captures-nettoyage/` contient 12 PNG identiques entre eux |
| `Claude outputs/marque/plateau-mobile/`, `plateau-mobile-entrees/`, `accueil/` (~55 Mo) | planches de design consommées par les prompts mobile-1 à 3 et la une (livrés le 04/10) |
| `Claude outputs/marque/icones/` : les 9 fichiers identiques octet à octet à un fichier de `public/` (`cmp`) | `public/` fait foi ; garder `badge.svg` et `controle.png` |
| `WWS/sprites/*.zip` (6), `WWS/sprites/UK/`, `WWS/sprites/USA/` (~30 Mo) | bruts de génération ; la source documentée est `units_<nation>_clean/` et `objectifs_clean/` |
| `WWS/sprites/ressources/Default_Emblme_…_7fa57d46-…png` | doublon octet à octet du `…_nobg.png` de même identifiant ; `noms.json` ne le cite pas |

Avant chaque suppression, vérifie par `cmp` ou `grep` ce que la table affirme ; si une ligne est
fausse, ne supprime pas cette ligne-là et dis-le dans le rapport.

## Hors git, sur le Mac

`Claude outputs/releve-mobile/` (674 Mo, ignoré) : supprime `captures/`, `une/`, `node_modules/`,
les `*.png` et `*.log` de la racine et les scripts de tâtonnement (`e*.mjs`, `explore*.mjs`,
`probe*.mjs`, `dbg*.mjs`). **Garde l'outil** : `releve.mjs`, `lib.mjs`, `mobile*.mjs`, `carte.mjs`,
`une.mjs`, `seed*.mjs`, `side.mjs`, `analyze.mjs`, `package*.json`, `results-*.json`, `layout-*.json`,
`state.json` — c'est ce qui permet de refaire le relevé. Si le rapport du 03/10 cite un autre
fichier comme outil, garde-le aussi.

## Garde-fous

1. `.gitignore`, avec une ligne de commentaire par bloc : `*.mp4`, `*.mov`, `*.webm` (plan-4b :
   les films vivent sur le VPS) ; `*.zip` ; `Claude outputs/marque/captures-*/` (les captures
   d'acceptation restent en local) ; `WWS/sprites/_bruts/` (là où se déposent désormais les bruts
   d'une nouvelle planche).
2. `.dockerignore` : ajoute `WWS` et `Claude outputs`, avec un commentaire — le build du front ne lit
   ni l'un ni l'autre (aucun import de `WWS/` dans `src/` ni `convex/`, vérifie-le à nouveau par grep).

## Les notes qui citent ces chemins

Mets à jour les notes **vivantes** pour dire où retrouver ce qui est parti — « retiré du dépôt le
04/10 ; dans l'historique : `git log --diff-filter=D --name-only -- '<chemin>'` » :
`WWS/sprites/README.md` (~85, ~122 : les exemples de `--source` pointent vers `WWS/sprites/_bruts/<nation>`),
la docstring de `WWS/sprites/nettoyer-ombres.py`, `WWS/docs/marque/actifs.md` (~33 : la corbeille `buildings/_to_delete/` est déjà vidée, ~45, ~115, ~157-161),
`WWS/docs/marque/marque-et-site.md` (~59, ~113), `WWS/docs/RESTE-A-CODER.md` (~302),
`WWS/docs/rapports/2026-10-03-releve-mobile.md` (~19, ~37 : captures supprimées, outil gardé).
**Ne modifie aucun prompt** (`WWS/docs/prompts/`, y compris `design/` et `coffre/`) ni
`Claude outputs/coffre-temps-1.md` : ce sont des traces.

## Acceptation

- `git status --short` : uniquement des `D` sur les chemins de la table, et des `M` sur
  `.gitignore`, `.dockerignore` et les notes listées.
- `git ls-files | grep -iE '\.(zip|mp4|mov|webm)$'` ne rend rien.
- `du -sh "Claude outputs/releve-mobile"` sous 5 Mo, `releve.mjs` et `lib.mjs` présents.
- `npm run verifier` vert (préfixe node de `ready/outillage/README.md` §4 si le profil zsh n'est pas réparé).
- Si Docker tourne sur le Mac : `docker build -f deploiement/front.Dockerfile --build-arg VITE_CONVEX_URL=http://127.0.0.1:3210 .`
  passe, et la taille du contexte transféré (avant / après) est dans le rapport. Sinon, le dire.
- Rapport : Fait · Écarts · Vérifications · Docs touchées · Message de commit proposé
  (« chore(dépôt): binaires hors du dépôt — captures, vieux film, bruts de sprites ; contexte Docker allégé ») · À trancher.
