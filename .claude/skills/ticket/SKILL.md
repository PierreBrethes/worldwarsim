---
name: ticket
description: Écrit une issue GitHub de La Manchette au format du projet. Use when Pierre demande une issue, un ticket, de ranger un retour ou une idée dans GitHub, ou de reporter ses décisions sur une issue « à trancher ».
---

# Ticket

Une issue = **un agent** : un lot qu'un seul agent de code (skill `lot`) mène jusqu'au dernier
commit. Trop gros pour un agent, coupe en deux issues qui se citent.

## 1. Lire avant d'écrire

Lis le code qui existe et la source du besoin (retour de Pierre, ADR, `WWS/docs/RESTE-A-CODER.md`,
`WWS/QUESTIONS.md`). Le constat du **Pourquoi** cite ce que le code fait aujourd'hui, avec le fichier.
Fini quand chaque affirmation du Pourquoi est vérifiée dans le code ou la source.

## 2. Écrire le corps

Titre : ce que le joueur gagne, en français, sans jargon de code.

```markdown
## Pourquoi
Le constat, la citation de Pierre s'il y en a une, ce que fait le code aujourd'hui.

## Ce que le joueur voit
- Un geste, une réponse de l'écran, par puce ; le téléphone si la surface change.
- Le refus dit, et ce que voit le joueur qui subit (carte, fiche, dépêche).

## À trancher
- **La question** : (a) option (recommandé) ; (b) option ; (c) option.

## Tâches
- [ ] Contrat : fonction pure, champs servis par la vue, refus (Opus)
- [ ] Règle et serveur, test d'abord (Sonnet)
- [ ] Écran et visuels (Sonnet, ou Opus pour une surface de design)
- [ ] Revue de code, puis corrections

## Sources
Retours du JJ/MM, point N. ADR, fiches de design, issues liées (#N).
```

- **Ce que le joueur voit** décrit des comportements observables : c'est la liste que l'agent
  doit tenir. Pour un chantier d'outillage ou de performance, remplace-la par **Ce qu'on livre**.
- **À trancher** n'existe que si une décision manque. Chaque question porte une recommandation,
  marquée « (recommandé) », et son pourquoi en une phrase si elle n'est pas évidente.
- **Tâches** : retire les lignes sans objet (pas de serveur, pas d'écran) ; chaque ligne garde
  son modèle et, si la tâche demande de la réflexion, son effort.
- Le vocabulaire suit `WWS/CONTEXT.md`.

Fini quand chaque section présente est remplie et qu'aucune ne redit une autre.

## 3. Labels

`gh label list` fait foi. Un label de nature (`enhancement`, `bug`, `performance`, `nettoyage`,
`question`) et un ou plusieurs labels de domaine (`interface`, `règle`, `animation`,
`architecture`, `outillage`). Ajoute `à trancher` tant qu'une décision de Pierre manque.

```bash
gh issue create --title "…" --label "enhancement,interface" --body-file <fichier>
```

Fini quand l'issue existe et que tu as rendu son numéro et son lien.

## 4. Reporter les décisions de Pierre

Quand Pierre tranche :

1. Un commentaire : `**Décisions (JJ/MM)** : (a) …`, ses mots et ses réserves, sans les lisser.
2. Le corps : retire la section **À trancher** et réécris **Ce que le joueur voit** selon la
   décision (`gh issue edit N --body-file …`).
3. Retire le label : `gh issue edit N --remove-label "à trancher"`.

Fini quand le corps ne pose plus aucune question tranchée.

## Clôture

Le dernier commit du lot porte `Closes #N` dans son message ; la fusion sur `main` ferme l'issue.
