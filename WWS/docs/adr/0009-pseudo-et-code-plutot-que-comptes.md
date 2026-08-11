# ADR 0009 — Pseudo et code de partie plutôt que comptes

**Statut :** acceptée

## Contexte

Les écrans hors-saison (accueil, salon, choix de nation) posent la question de l'identité des
joueurs. Le réflexe web est un système de comptes : inscription, mot de passe, récupération,
sessions. Le jeu vise 2 à 8 joueurs **entre amis**, sans grand public, sans monétisation, sans
contrainte d'échelle.

## Décision

Pas de comptes. Un joueur est un **pseudo** saisi à l'entrée, rattaché à une **saison** par son
**code de partie**. Le navigateur garde un jeton local pour retrouver sa place dans la saison en
cours ; perdre ce jeton se répare en redemandant le code aux amis.

## Justification

**Le coût d'un système de comptes est constant, son bénéfice est nul à cette échelle.** Mots de
passe, récupération, e-mails, RGPD : des semaines de travail pour protéger… une partie entre amis
qui sera effacée au wipe.

**Le code de partie est déjà le modèle social du jeu.** Pas de matchmaking (ADR 0001) : on joue
avec des gens qu'on connaît, qu'on a invités soi-même. Le secret utile est le code, pas le mot de
passe.

**Le wipe rend l'identité jetable.** Tout est remis à zéro en fin de saison ; il n'y a rien de
durable à protéger derrière une authentification.

## Conséquences

- L'entrée dans le jeu tient en deux champs : pseudo + code. Aucune friction d'inscription.
- Le jeton local est la seule persistance côté client. Un joueur qui change de navigateur redemande
  le code et reprend sa nation — le serveur fait foi.
- L'usurpation entre amis est possible (entrer avec le pseudo d'un autre). Assumé : c'est un
  problème de confiance sociale, pas de sécurité logicielle.
- Si un jour le jeu s'ouvre au-delà du cercle d'amis, cette ADR saute — en connaissance de cause.

## Ce qu'on abandonne

L'historique inter-saisons par joueur (statistiques, palmarès) : sans identité durable, il n'existe
pas. Si le besoin émerge, il se traitera par un pseudo réservé côté serveur, pas par des mots de
passe.
