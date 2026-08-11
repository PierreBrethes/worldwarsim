# ADR 0010 — Convex auto-hébergé sur VPS plutôt que Convex cloud

**Statut :** acceptée

## Contexte

Le backend démarre (tranches hors-saison et état de nation). Convex reste l'outil — l'ADR 0001 s'y
adosse — mais il se consomme de deux façons : le cloud Convex (free tier suffisant pour prototyper,
zéro ops) ou la version open source auto-hébergée. Le projet dispose d'un VPS personnel et d'un
développeur qui préfère posséder son infrastructure plutôt que dépendre d'un plan gratuit.

## Décision

Convex **auto-hébergé** sur le VPS, en conteneurs Docker (backend + dashboard + front statique),
avec un déploiement par CI. Le développement local utilise le même compose.

## Justification

**Pas de dépendance à un free tier.** Un plan gratuit est une politique commerciale, pas un
engagement : quotas, sunset, changements de prix arrivent sans préavis. Le VPS est déjà payé.

**Le même artefact partout.** Docker compose identique en local et sur le VPS : pas de « ça marche
sur le cloud Convex mais pas chez moi ».

**L'échelle du jeu le permet.** 2 à 8 joueurs entre amis, accumulation paresseuse, mouvements
bornés par les slots (ADR 0006) : la charge est dérisoire, un VPS modeste suffit largement.

## Conséquences

- **L'ops nous appartient** : sauvegardes du volume de données, mises à jour de l'image
  convex-backend, admin key à protéger. C'est le prix accepté de l'indépendance.
- Le déploiement des fonctions passe par `npx convex deploy` avec `CONVEX_SELF_HOSTED_URL` +
  `CONVEX_SELF_HOSTED_ADMIN_KEY` — la CI porte ces secrets.
- Le dashboard Convex est auto-hébergé aussi, derrière le même VPS.
- Pas de fonctionnalités cloud-only (log streaming managé, etc.) — aucune n'est nécessaire.

## Ce qu'on abandonne

Le zéro-ops du cloud Convex, et son free tier comme filet. Si l'ops devient une charge réelle
(pannes, migrations pénibles), le code Convex est identique des deux côtés : re-basculer vers le
cloud est une opération de configuration, pas une réécriture.
