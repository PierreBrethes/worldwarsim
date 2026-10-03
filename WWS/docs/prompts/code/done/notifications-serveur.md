---
type: prompt
statut: livré
maj: 2026-10-03
code: [convex/schema.ts, convex/accounts.ts, convex/combat.ts, convex/outposts.ts, convex/messages.ts, convex/seasons.ts, convex/constants.ts, package.json]
decisions: [notif-1a-2026-10-03, notif-2a-2026-10-03, notif-3a-2026-10-03, notif-4b-2026-10-03, notif-5a-2026-10-03, notif-6-2026-10-03]
voir: [../../../design/propositions/notifications-push-et-alarmes.md, notifications-appareil.md]
---

# notifications-serveur — abonnements, file d'envoi, repos, envoi Web Push

**En bref.** Premier des deux lots des notifications : tout ce qui vit dans Convex. Un appareil
s'abonne pour un compte ; les événements qui comptent entrent dans une file ; la file part en une
notification groupée, jamais pendant la fenêtre de repos du joueur, jamais quand il est déjà en
jeu, et le télégraphe au plus une fois par heure. Le second lot (`notifications-appareil.md`)
fera le service worker et les réglages.

> Décisions de Pierre du 03/10/2026, résumées en tête de
> `WWS/docs/design/propositions/notifications-push-et-alarmes.md` (lis ce résumé, puis le texte
> du 28/08 pour l'esprit ; le résumé l'emporte où ils divergent).

Lis `CLAUDE.md`, `CONVENTIONS.md`, l'ADR 0022 (comptes), l'ADR 0016 (le jeu parle français, le
code anglais), `convex/schema.ts`, `convex/accounts.ts`, `convex/auth.ts` (action Node déjà en
place), `convex/combat.ts` (`firedDry`), les notices (`outpostDisabled`…), `convex/messages.ts`,
`seasons.launch` et `seasons.conclude`, la fenêtre de repos (`REST_WINDOW_MINUTES`,
`players.restWindow`), la présence (`players.lastSeenAt`), et `src/routes/-plateau/board-search.ts`
(les fenêtres ouvertes vivent dans l'URL). Ne commit pas, ne push pas. Un chantier, un commit.

## 1. Les abonnements

- Une table d'abonnements : le compte, l'`endpoint` (unique), les clés `p256dh` et `auth`, un
  libellé d'appareil lisible (tiré de l'user-agent, pour la liste des réglages), la date de
  création et celle du dernier envoi réussi.
- Mutations publiques, authentifiées par la session comme le reste des comptes :
  `subscribe` (crée ou rattache l'endpoint au compte courant ; un endpoint déjà connu d'un autre
  compte change de compte), `unsubscribe` (cet endpoint), et une query qui dit si l'endpoint
  courant est abonné.
- `accounts:logout` supprime l'abonnement de l'appareil qui se déconnecte (le client passe son
  endpoint). Un envoi qui revient en 404 ou 410 supprime l'abonnement : l'appareil l'a révoqué.
- Les préférences par type, sur le compte : `attack`, `outpost`, `sighting`, `dryFire`,
  `season`, `telegraph`, toutes vraies par défaut (un compte sans préférences écrites = tout
  coché). Une mutation pour les changer, une query pour les lire.

## 2. Ce qui entre dans la file

Un événement n'entre que pour un joueur dont le compte a au moins un abonnement et a laissé son
type coché. Le texte suit le ton des dépêches du journal (phrases entières, vocabulaire imposé
de `WWS/CONTEXT.md` : passe de résolution, avant-poste désactivé ou détruit, relevé, télégraphe).

| Type | Quand | Pour qui |
|---|---|---|
| `attack` | une passe de résolution où il défend | le défenseur |
| `outpost` | un de ses avant-postes désactivé ou détruit | son propriétaire |
| `sighting` | une colonne adverse relevée qui entre sur son territoire | l'observateur |
| `dryFire` | un de ses camps a tiré à sec (`firedDry`) | ce joueur |
| `season` | la saison est lancée ; la saison est close ou dominée | chaque joueur assis |
| `telegraph` | un message d'un autre joueur au canal général | les autres joueurs assis |

Le texte affiché vit dans un seul fichier de chaînes, comme l'exige l'ADR 0016 : si Convex peut
importer `src/i18n/fr.ts` sans rien traîner du front, ajoute-y une section `push` ; sinon un
module de chaînes côté Convex, testé, et dis lequel tu as choisi.

## 3. La file et son envoi

- Une table de file : le compte, la saison, le type, l'instant, la phrase, l'adresse à ouvrir
  (`/plateau` de la saison avec `windows=journal`, ou `windows=telegraph` pour le télégraphe ;
  reprends les noms de `board-search.ts`).
- Après chaque entrée, planifie un **vidage** pour ce compte dans 60 secondes (un seul en attente
  à la fois) : les événements d'une même passe partent ensemble.
- Au vidage, pour chaque saison du compte :
  - **en jeu** : le joueur a été vu il y a moins de deux minutes → ce qui est en file est
    abandonné (l'écran le lui montre déjà), sauf le télégraphe ;
  - **au repos** : on est dans sa fenêtre de repos → rien ne part, un vidage est replanifié à la
    fin de la fenêtre ;
  - **télégraphe** : s'il est parti une notification de télégraphe pour cette saison il y a moins
    d'une heure, les messages attendent ; sinon une seule notification les compte (« 3 messages
    au télégraphe ») ;
  - le reste part en **une seule notification** : un événement, sa phrase ; plusieurs, un résumé
    (« 3 alarmes : une passe de résolution, un avant-poste désactivé, une colonne relevée ») qui
    ouvre le journal.
- L'envoi est une action Node (`"use node"`) avec la bibliothèque `web-push`, à tous les
  abonnements du compte. Clés VAPID dans les variables d'environnement de Convex
  (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), jamais dans le dépôt ; la clé
  publique est servie par une query pour le client. Explique dans `deploiement/README.md` comment
  les générer (`npx web-push generate-vapid-keys`) et les poser sur le Convex du VPS.
- Charge utile : `title` « La Manchette », `body` la phrase, `url` l'adresse à ouvrir, `tag`
  (saison + type, pour qu'une notification remplace la précédente du même genre), et l'icône
  `/icons/icon-192.png`.
- Le nettoyage d'une saison effacée emporte ses lignes de file.

## Ne pas faire

Pas de service worker, pas d'écran : c'est le second lot. Pas de notification d'intendance
(chantier, livraison, arrivée). Pas de préférence d'horaire en plus de la fenêtre de repos.

## Acceptation

- `npm run verifier` vert, avec des tests `convex-test` pour : un événement par type entre bien
  dans la file (et pas quand le type est décoché ou le compte sans abonnement) ; le vidage groupe ;
  rien ne part pendant le repos et tout part à sa fin ; rien ne part quand le joueur est en jeu ;
  le télégraphe attend l'heure ; un 410 supprime l'abonnement (l'envoi bouchonné). Aucun test ne
  part sur le réseau.
- Une mutation de développement qui envoie une notification d'essai au compte courant, pour le
  second lot.
- `WWS/docs/design/propositions/notifications-push-et-alarmes.md` : ce qui a été codé, et les
  écarts avec le résumé s'il y en a.
