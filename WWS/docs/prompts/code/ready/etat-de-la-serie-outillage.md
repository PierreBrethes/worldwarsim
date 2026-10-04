---
type: prompt
statut: proposé
maj: 2026-10-04
code: []
decisions: [menage-1c-2026-10-04]
voir: [outillage/README.md, ../../coffre/organiser-le-coffre.md, ../README.md]
---

# etat-de-la-serie-outillage — savoir ce qui reste vrai des 74 prompts du 23/09 avant tout ménage

**En bref.** Lecture seule, sauf un rapport. La série `ready/outillage/` (23/09) a été exécutée en
partie, hors de son ordre, sans qu'aucun prompt passe en `done/` ; le chantier
`organiser-le-coffre` (02/10) en a recouvert une partie puis s'est arrêté à mi-temps 2. Avant de
choisir comment finir le ménage du dépôt, il faut l'état de chaque prompt contre `HEAD`.

Lis `CLAUDE.md`, `WWS/docs/prompts/code/README.md`, `WWS/docs/prompts/code/ready/outillage/README.md`
(conventions communes et tâches P1-P9), `WWS/docs/prompts/coffre/organiser-le-coffre.md` et
`Claude outputs/coffre-temps-1.md` (§ 0, § 2, § 6). **Ne commit pas, ne push pas, ne déplace aucun
prompt, ne modifie aucun fichier** : la seule écriture est le rapport ci-dessous.

## Pour chaque prompt de `ready/outillage/`

Un verdict parmi cinq, avec sa preuve :

- **fait** — le changement est dans `HEAD` ; SHA court du commit (`git log -S…`, `git log -- <fichier>`).
- **partiel** — ce qui est fait (SHA) et ce qui manque, en une ligne. Exemple attendu : 66,
  `.dockerignore` créé par `a4a8bd0` sans `WWS` ni `Claude outputs`.
- **à donner tel quel** — ce qu'il lit n'a pas bougé ; ses repères (`~NN`, SHA cités) tombent encore juste.
- **à réécrire** — le but tient, mais ce qu'il cite a bougé (React 19.3, TypeScript 6, mobile,
  notifications, renommage La Manchette, en-têtes YAML du coffre…) : dire quoi.
- **caduc** — but atteint autrement, ou contredit par une décision postérieure : citer laquelle
  (ADR, ligne de `WWS/docs/decisions.md`, prompt de `done/`).

Un « fait » ou un « caduc » sans preuve s'écrit **à vérifier**. Repères déjà connus, à confirmer :
04, 05, 06, 10, 12 livrés d'après le temps 1 du coffre ; 62 et 63 probablement par `87ed107`.

## Pour le chantier du coffre

Ce qui du temps 2 est posé (fichiers créés, notes avec en-tête par dossier), ce qui manque
(`WWS/INDEX.md` n'existe pas : lister les notes qui y renvoient), et le recoupement avec les
prompts outillage 22 à 33 et 72, prompt par prompt.

## Livrable

Un seul fichier, `WWS/docs/rapports/2026-10-04-etat-outillage.md` (à créer), avec l'en-tête YAML
des notes du coffre (`type: rapport`, `statut: livré`, `maj: 2026-10-04`), puis :

1. le tableau des 74 : numéro, slug, verdict, preuve ou manque — une ligne chacun ;
2. le décompte par verdict ;
3. le tableau du coffre (posé / manquant / recoupe quel prompt) ;
4. P1 à P9 : lesquels sont visiblement faits (preuve dans le dépôt), lesquels ne se voient pas d'ici.

## Acceptation

- `git status --short` ne montre que le rapport.
- Chaque « fait » et « partiel » cite un SHA qui existe (`git cat-file -t <sha>` → `commit`).
- Rapport en conversation au format de la série (Fait · Écarts · Vérifications · Docs touchées ·
  Message de commit proposé · À trancher), avec le décompte et les cinq constats les plus
  surprenants. Message proposé : « docs(rapports): état de la série outillage au 04/10 ».
