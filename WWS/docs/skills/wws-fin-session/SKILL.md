---
name: wws-fin-session
description: >-
  Rituel de fin de session pour le projet worldwarsim (WWS) de Pierre. Synchronise la
  documentation du repo avec ce qui a été décidé et codé pendant la session — QUESTIONS.md,
  l'index des ADR, le cycle de vie des prompts (ready/ → done/), les chiffres de mesure périmés,
  l'en-tête des notes du coffre, WWS/INDEX.md et le registre des décisions —
  puis produit un récap structuré. Trigger dès que Pierre dit « note tout », « récap », « fin de
  session », « on s'arrête », « dodo », « je vais me coucher », « on a fini là », ou toute
  formulation laissant entendre qu'il clôt la session. Utiliser ce skill même si Pierre ne
  mentionne pas worldwarsim — dès qu'il y a eu du travail WWS dans la conversation et qu'il clôt,
  déclencher.
type: prompt
statut: validé
maj: 2026-10-02
code: []
decisions: []
voir: [../../prompts/code/README.md, ../../../INDEX.md, ../../decisions.md, ../../prompts/coffre/organiser-le-coffre.md]
---

# Fin de session worldwarsim

**En bref.** Le rituel qui recopie dans le dépôt ce que la session a décidé et codé : ancres des
décisions, index des ADR, cycle des prompts, chiffres périmés, fiches en retard, coffre (en-têtes,
INDEX, registre), puis le récap. Fait autorité sur la fin de session.

Le repo est la source de vérité (`CLAUDE.md` racine, `WWS/` pour le design). Une décision qui
reste dans la conversation est une décision perdue — la « question 21 du 18/08 », citée trois
fois dans le code et introuvable dans le repo, est l'accident fondateur de ce rituel. Tout ce qui
suit existe pour qu'il ne se reproduise pas.

Ne jamais commit ni push. Écrire les fichiers, c'est tout.

## Les sept passes, dans l'ordre

### 1. Les décisions prennent une ancre

Relire la session et lister chaque décision prise en conversation. Pour chacune, vérifier qu'elle
a une ancre **greppable** dans le repo :

- une décision de règle ou d'architecture → un ADR (nouveau, ou amendement daté d'un existant,
  statut et bandeau de révision comme les ADR 0015 et 0017 le font déjà) ;
- une décision de valeur → la constante et son commentaire, avec `@a-mesurer` si elle est
  assumée et non mesurée ;
- une piste non tranchée → `WWS/QUESTIONS.md`, dans la bonne section (🔴 / 🟠 / 🟡).

**Interdit** : citer « la décision de <date> » ou « la question N » dans un commentaire de code ou
un prompt sans que le grep de cette référence rende un fichier de `WWS/`.

Chaque décision prend aussi sa ligne dans `WWS/docs/decisions.md`, sous un identifiant **daté** —
`2b-2026-10-03`, jamais « 2b » seul : les codes courts repartent à chaque session, et `1a` désigne
déjà cinq décisions différentes. C'est cet identifiant qu'on cite partout ailleurs.

### 2. L'index des ADR est exact

`WWS/docs/adr/README.md` : chaque ADR de la session a sa ligne, chaque statut est juste
(proposée / acceptée / amendée par N). Un ADR amendé pendant la session porte son bandeau de
révision daté dans le fichier lui-même, pas seulement dans l'index.

### 3. Les prompts changent de dossier

`WWS/docs/prompts/code/` — la règle est dans son README :

- prompt dont le **rapport d'exécution a été accepté** pendant la session → `done/` ;
- prompt écrit ou amendé pendant la session, pas encore donné → `ready/` ;
- prompt périmé **avant** d'avoir été donné → `WWS/docs/_to_delete/` (il n'est la trace de rien) ;
- rappeler à Pierre que `_to_delete/` ne se vide pas tout seul (l'outil ne peut pas supprimer).

### 4. Les chiffres périmés sont bannis

Si une mesure a changé pendant la session (sweep, simulation, calibrage), chercher ses anciennes
valeurs dans `WWS/**/*.md` (grep des nombres eux-mêmes) et poser un bandeau daté « ⚠️ mesures
périmées » sur chaque document qui les cite — sur le modèle de celui de l'ADR 0017. Ne pas
réécrire les vieux chiffres : les marquer comme de l'histoire.

### 5. Les fiches ne mentent pas

Pour chaque règle codée pendant la session, vérifier la fiche design qui la raconte
(`WWS/docs/design/`). Deux issues : la mettre à jour, ou — si la session finit trop tard — poser
en tête de fiche une ligne « ⚠️ en retard sur l'ADR NNNN sur : <points> ». Une fiche qui ment
sans le dire est pire qu'une fiche marquée en retard.

### 6. Le coffre suit

`WWS/` est un coffre Obsidian qu'on lit en un saut depuis `WWS/INDEX.md`. Pour chaque note
créée, déplacée ou relue pendant la session :

- **l'en-tête** — `type`, `statut`, `code`, `decisions`, `voir` justes, et `maj` à la date du
  jour (la date de la dernière **vérification**, pas de la dernière frappe) ; une note nouvelle
  naît avec son en-tête et son « **En bref.** » sous le titre ;
- **le statut dit si la note est encore vraie** — `périmé` pour une note fausse dans son
  ensemble ; une note juste sur l'essentiel garde son statut et nomme ses passages faux dans son
  « **En retard** », ligne et citation ;
- **`INDEX.md`** — une ligne par note nouvelle, et le statut de chaque ligne qui a changé ;
- **`decisions.md`** — une ligne par décision de la passe 1, et l'état des décisions qu'elle
  révise ou annule.

Ni `[[wikilinks]]` ni lien absolu : des liens markdown relatifs, que GitHub lit aussi. Pas
d'en-tête sur `docs/technique/a-mesurer.md`, qui est généré et testé octet à octet, ni dans
`prompts/code/done/`, qui ne se modifie plus.

### 7. Le récap

Terminer par un récap dans le format du Project (trois sections) :

1. **Rapport** — décisions gravées (avec leur ancre), prompts passés en `done/`, prompts en
   attente dans `ready/` et leur ordre, documents mis à jour ;
2. **À trancher** — ce qui reste ouvert et appartient à Pierre, numéroté, options a/b/c,
   recommandation ;
3. **À donner** — le prochain prompt de `ready/` avec sa ligne à coller, ou « — rien ».

## Vocabulaire

Celui de `WWS/CONTEXT.md`, partout : *mouvement*, *passe de résolution*, avant-poste
*désactivé/détruit*. Bannis : tick, temps réel, micro, base, rush.
