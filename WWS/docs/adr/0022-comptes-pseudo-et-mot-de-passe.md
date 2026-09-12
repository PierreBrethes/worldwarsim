# ADR 0022 — Comptes pseudo et mot de passe, sans e-mail

**Statut :** acceptée (06/09/2026, « validé »), **révisée le 12/09/2026** — **révise l'[ADR 0009](0009-pseudo-et-code-plutot-que-comptes.md)**.
Décision de Pierre (06/09, 75 · 77a), acceptée le soir même.

## Contexte

L'ADR 0009 refusait les comptes : « le wipe rend l'identité jetable ». Deux choses ont changé.
La saison longue (7 j) exige des **notifications**, et une notification s'adresse à quelqu'un —
pas à un jeton dans un navigateur. Et un joueur qui change d'appareil (bureau le jour, téléphone
le soir — le mobile arrive) doit **retrouver ses parties** sans redemander le code aux amis à
chaque fois.

## Décision

**Un compte = un pseudo unique + un mot de passe. Rien d'autre.** Pas d'e-mail, pas de lien de
réinitialisation, pas d'envoi : un mot de passe perdu est remis à zéro par le fondateur de la
partie (ou l'admin du VPS) — entre amis, c'est un message sur le télégraphe.

- Table `accounts { nickname (unique, insensible à la casse), passwordHash, salt, createdAt }` ;
  table `sessions { accountId, token, createdAt, lastSeenAt }`. Un compte **possède** ses
  `players` (`players.accountId`) ; le jeton de partie de l'ADR 0009 disparaît au profit du
  jeton de session.
- Hachage **PBKDF2-SHA-256, 600 000 itérations, sel 16 octets**, via `crypto.subtle` — disponible
  dans le runtime Convex, aucune dépendance. Jeton de session : 32 octets aléatoires, en
  `localStorage` comme aujourd'hui. Pas de durée de vie : la session dure jusqu'à la
  déconnexion.
- **Pas de Convex Auth** : sa brique mot de passe suppose un e-mail comme identifiant et une
  vérification ; la contourner coûte plus que quarante lignes de PBKDF2. À reconsidérer si un
  fournisseur externe (Google) devient souhaitable.
- Le **code de partie** reste : c'est l'invitation. Un compte rejoint une saison par son code,
  comme avant ; l'accueil liste les parties du compte (elle listait celles du navigateur).
- Les notifications (Web Push, service worker — chantier à part) s'abonnent **par compte**, une
  souscription par appareil.

## Justification

Le coût que l'ADR 0009 refusait était celui des e-mails, de la récupération et du RGPD. Sans
e-mail, il reste : deux tables, une page de connexion, un hachage. Le bénéfice que l'ADR 0009
jugeait nul existe maintenant : deux appareils, sept jours, une notification.

## Conséquences

- L'entrée dans le jeu reste deux champs — pseudo + mot de passe au lieu de pseudo + code —
  puis le code pour rejoindre.
- **L'usurpation entre amis disparaît** (c'était l'aveu de l'ADR 0009).
- Migration : les `players` existants n'ont pas de compte — **wipe** (ADR 0001, comme tout
  changement de schéma non rétro-compatible). À faire avant la partie de contrôle à deux ou
  juste après, jamais pendant.
- Le pseudo devient durable et public entre saisons : le classement de fin (page de presse) peut
  un jour nommer les mêmes gens d'une saison à l'autre.

## Révision du 12/09/2026 — la porte ne lit pas les places

`accounts.me` servait le pseudo **et** la liste des parties du compte, « les deux en une lecture
parce que c'est une seule question ». Ce n'en était pas une : le gardien racine (`__root.tsx`)
s'abonne à cette requête depuis **tous** les écrans, plateau compris, et un abonnement Convex
garde en vue tout ce que sa requête a lu. La porte du jeu lisait donc, en permanence et pour
chaque écran, les `players` de chacune des saisons du compte — un `collect()` par ligne, en
série, dans `previewOf`. En production elle a fini par dépasser la seconde qu'une query a pour
répondre, et l'erreur remontait à l'`errorComponent` de la racine : un compte ancien démontait
son propre plateau.

Trois conséquences, et une seule idée — **ce que la porte lit doit être ce que la porte demande** :

- `accounts.me` ne renvoie plus que `{ nickname }`, deux documents (session, compte) et aucune
  table de jeu. La liste des parties est une requête à part (`accounts.seats`), demandée par le
  seul écran qui l'affiche, `/accueil`.
- `seasons` porte deux champs dénormalisés, `playerCount` et `winnerNation`, tenus à l'écriture
  (l'entrée d'une place, la conclusion) plutôt que recomptés à la lecture. Les deux sont
  `v.optional` avec un repli sur l'ancien comptage, et la migration
  `dev:backfillSeasonPreview` les pose sur les saisons d'avant — pas un wipe : le jeu décrit
  est le même, et une saison est en cours.
- Le gardien conserve la dernière réponse connue quand la requête échoue, et ne renvoie vers
  `/connexion` que sur un `null` explicite. Une panne d'infrastructure n'est pas une
  déconnexion, et elle ne doit pas fermer la surface qu'on regarde. Une erreur **sans réponse
  précédente** est relevée comme avant : il n'y a alors pas de porte à tenir ouverte, et l'écran
  d'erreur avec « réessayer » est une issue là où une page blanche n'en est pas une.

Ce qui ne change pas : la porte elle-même. Un jeton de session, une saison, une place
(`playerOf`), et les trois refus distincts.

## Ce qu'on abandonne

Le jeton de partie comme identité ; « perdre son jeton se répare en redemandant le code ».
L'ADR 0009 reste dans l'historique comme le raisonnement d'avant les sept jours.
