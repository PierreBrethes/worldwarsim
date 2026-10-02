# organiser-le-coffre — WWS devient un coffre Obsidian qu'on lit en un saut

> **Demande de Pierre (02/10/2026).** `WWS/` est désormais un coffre Obsidian, versionné dans le
> dépôt (`WWS/.obsidian/` est ignoré par git, c'est voulu). Il doit dire **où trouver tout** :
> le jeu, les décisions, la technique, et aussi la marque et le site (identité, page d'accueil,
> film, parcours). Le modèle de note est `WWS/docs/marque/marque-et-site.md`.

Lis `WWS/README.md`, `WWS/CLAUDE.md`, `CLAUDE.md` à la racine, `WWS/docs/prompts/code/README.md`,
`WWS/docs/skills/wws-fin-session/SKILL.md` et `WWS/docs/marque/marque-et-site.md`. Ne commit
pas, ne push pas.

## Le but, en une phrase

Quiconque ouvre le coffre — Pierre, ou un assistant en début de session — trouve n'importe
quoi **en un saut depuis `WWS/INDEX.md`**, et sait **si ce qu'il lit est encore vrai**.
Ce n'est pas un chantier d'esthétique : la beauté du graphe Obsidian n'est pas un critère.

## Contraintes dures

1. **Liens markdown relatifs, jamais `[[wikilinks]]`** : GitHub ne lit pas les seconds. Dans
   `.obsidian/app.json` : `"useMarkdownLinks": true`, `"newLinkFormat": "relative"`. Vérifie
   les quatre fichiers où `[[` apparaît (certains sont peut-être des tableaux de coordonnées,
   pas des liens).
2. **Rien ne bouge sans que toutes ses références suivent.** Le code cite des chemins de `WWS/` :
   `grep -rnE "WWS/[A-Za-z0-9_./-]+" src convex scripts CLAUDE.md CONVENTIONS.md AGENTS.md .github .githooks`
   (16 fichiers de code au 02/10, plus le `CLAUDE.md` racine). Un déplacement se fait par
   `git mv` (l'historique suit) et met à jour chaque référence dans le même chantier.
3. **Ne déplace pas** `WWS/simulation/` (lu par `npm run verifier`), `WWS/sprites/` (ses
   scripts), `WWS/docs/technique/a-mesurer.md` (généré par `scripts/generate-a-mesurer.mjs`,
   ne s'édite pas à la main), ni `WWS/docs/prompts/code/done/` (immuable : les ADR les citent).
4. **Tu ne réécris pas le fond.** Tu ajoutes des en-têtes, des index, des statuts. Une fiche
   fausse se **signale** (statut `périmé` et la ligne qui l'est) ; sa correction se propose dans
   le rapport, elle ne s'applique pas.
5. Aucun binaire nouveau dans le coffre (vidéos, archives). Un actif se **référence** : où il
   vit, comment on le refait.

## Ce que tu livres

1. **`WWS/INDEX.md`** — « où trouver quoi ». Une section par domaine (Jeu, Décisions,
   Technique, Marque et site, Prompts, Actifs), une ligne par note : lien, une phrase, statut.
   `WWS/README.md` et `WWS/CLAUDE.md` y renvoient au lieu de tenir leur propre tableau d'état
   (ils sont en retard sur le code : le schéma de jeu est écrit, huit nations ont leurs planches).
   **Une seule source d'état** : le `CLAUDE.md` racine pour le code, `INDEX.md` pour la doc.
2. **Un en-tête sur chaque note** de `WWS/` hors `prompts/code/done/` et `_to_delete/` (environ
   190 notes) :

   ```yaml
   ---
   type: fiche | adr | proposition | contrat-de-vue | recherche | rapport | technique | prompt | marque | index
   statut: idée | proposé | validé | en cours | livré | abandonné | périmé
   maj: 2026-10-02          # date de la dernière vérification, pas de la dernière frappe
   code: []                 # chemins du dépôt que la note décrit, vérifiables par grep
   decisions: []            # identifiants : ADR 0022, 1b-2026-09-13…
   voir: []                 # notes liées, en chemins relatifs
   ---
   ```

   Et sous le titre, **un « En bref » de deux ou trois lignes** : ce que dit la note et si elle
   fait autorité. C'est ce qui permet de décider de lire la suite sans la lire.
3. **`WWS/docs/decisions.md`** — le registre des décisions numérotées, aujourd'hui éparpillées
   (« 1b du 13/09 », « 85a », « 72a », les ADR…). Une ligne par décision : identifiant
   normalisé (`85a-2026-09-11`, ou avec le préfixe de sa série : `marque-1c-2026-10-02`), date, phrase, lien vers sa source. Amorce-le avec toutes celles
   que citent le `CLAUDE.md` racine et les ADR ; le reste s'ajoutera au fil des sessions.
4. **`WWS/docs/marque/actifs.md`** — le registre des actifs : planches d'unités et de bâtiments
   (`src/emblems/`, chaîne dans `WWS/sprites/README.md`), drapeaux, curseurs, polices, film
   d'annonce (`Claude outputs/teaser/`, puis le dossier média du VPS), maquettes.
5. **Le rituel de fin de session suit la convention** : mets à jour
   `WWS/docs/skills/wws-fin-session/SKILL.md` pour qu'il tienne l'en-tête, `INDEX.md` et
   `decisions.md` à chaque session. Sans cela, la structure se défait en trois semaines.

## Méthode — deux temps

**Temps 1, aucune écriture.** Inventaire et plan, rendus à Pierre :
- la liste des notes par domaine, avec le statut que tu leur donnerais et pourquoi ;
- **chaque déplacement proposé**, avec sa raison et les références qu'il oblige à modifier
  (fichier et ligne) — et l'option de ne rien déplacer du tout ;
- les notes périmées et la phrase qui l'est ;
- les doublons (même sujet dans deux notes) et laquelle fait autorité.

**Temps 2, après l'accord de Pierre** : tu appliques le plan accepté, rien de plus.

## Vérification

- Aucun lien relatif cassé : un script liste tous les liens `](…\.md…)` du coffre et vérifie
  que la cible existe (donne la commande et sa sortie).
- Le `grep` des références `WWS/` du code ne pointe que vers des fichiers qui existent.
- `npm run verifier` vert.
- Le coffre s'ouvre dans Obsidian sans fichier « non résolu » dans le graphe.
