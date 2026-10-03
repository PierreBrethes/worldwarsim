---
type: prompt
statut: validé
maj: 2026-10-03
code: [public/sw.js, src/main.tsx, src/routes/-plateau/SettingsWindow.tsx, src/i18n/fr.ts, deploiement/nginx.conf]
decisions: [notif-1a-2026-10-03, notif-5a-2026-10-03, notif-6-2026-10-03]
voir: [../../../design/propositions/notifications-push-et-alarmes.md, notifications-serveur.md]
---

# notifications-appareil — le service worker, la permission, les réglages

**En bref.** Second lot des notifications, après `notifications-serveur.md` (livré et déployé,
clés VAPID posées). L'appareil reçoit et affiche les notifications, s'y abonne depuis les
Réglages, et un clic ouvre le plateau au bon endroit.

> Décisions de Pierre du 03/10/2026, résumées en tête de
> `WWS/docs/design/propositions/notifications-push-et-alarmes.md`.

Lis `CLAUDE.md`, `CONVENTIONS.md`, l'ADR 0016, `src/main.tsx`, `src/routes/-plateau/SettingsWindow.tsx`
(et ses réglages existants, dont « Son du télégraphe »), `fr.settingsWindow`, `board-search.ts`,
`public/manifest.webmanifest`, `deploiement/nginx.conf`, et ce que le lot serveur expose
(abonnement, préférences, clé publique, essai). Ne commit pas, ne push pas. Un chantier, un commit.

## 1. Le service worker

- `public/sw.js`, sans outil de build ni dépendance : `push` affiche la notification de la charge
  utile (`title`, `body`, `tag`, icône, et `badge` à `/icons/icon-192.png`) ; `notificationclick`
  ferme la notification, met au premier plan un onglet déjà ouvert sur le site et l'y envoie, ou
  en ouvre un sur `url`. Aucun cache, aucune interception de `fetch` : ce service worker ne fait
  que les notifications.
- Enregistré au démarrage depuis `src/main.tsx`, portée `/`.
- Nginx : `/sw.js` en `no-cache` (un service worker figé en cache empêche toute correction),
  comme le manifeste.

## 2. Le bon plateau

Le lot serveur envoie `url` sans saison (`/plateau?windows=journal`) et le `seasonId` à part, parce
que le plateau lit sa saison dans `localStorage` (`src/data/session.ts`). Un service worker ne peut
pas écrire `localStorage` : un joueur assis dans deux saisons ouvrirait la mauvaise. Donc :

- le plateau accepte un paramètre `season` dans son adresse : si le compte a une place dans cette
  saison, elle devient la saison courante (même écriture que le choix au salon), puis le
  paramètre disparaît de l'adresse ; sinon il est ignoré sans erreur ;
- le service worker ajoute `season=<seasonId>` à `url` avant d'ouvrir ou de naviguer ;
- un test sur la lecture du paramètre (place tenue, place absente, paramètre absent).

## 3. La section Notifications des Réglages

Une section dans la fenêtre Réglages, dans le ton des autres (sur-titre, note sous chaque
réglage, textes dans `fr.ts`) :

- **« Recevoir les notifications sur cet appareil »** : une case. La cocher demande la
  permission du navigateur (toujours depuis ce clic, jamais au chargement) puis abonne l'appareil
  au compte ; la décocher le désabonne. Note : « Les alarmes de la saison, sur ce téléphone ou cet
  ordinateur. Rien ne sonne pendant votre fenêtre de repos. »
- Les cas où la case ne peut pas s'activer, chacun avec sa phrase au lieu d'une case morte :
  navigateur sans Web Push ; **iPhone dans Safari sans installation** (« Sur iPhone, ajoutez
  d'abord La Manchette à l'écran d'accueil, puis ouvrez-la depuis l'icône. ») ; permission
  refusée (« Les notifications sont bloquées pour ce site : rétablissez-les dans les réglages du
  navigateur. »).
- En dessous, **une case par type**, valables pour le compte entier (la note le dit : « pour
  tous vos appareils ») : attaque subie, avant-poste désactivé ou détruit, colonne relevée sur
  votre territoire, tir à sec, la saison (lancement et fin), télégraphe (« une fois par heure au
  plus »). Elles restent modifiables même quand cet appareil n'est pas abonné : ce sont des
  préférences du compte.
- Un bouton **« envoyer une dépêche d'essai »** quand l'appareil est abonné : la mutation
  d'essai du lot serveur. C'est la seule façon pour un joueur de vérifier que tout marche.
- La déconnexion passe l'endpoint de l'appareil au serveur pour le désabonner.

## Ne pas faire

Pas d'invite d'installation, pas de bannière qui pousse à s'abonner ailleurs que dans les
Réglages, pas de cache hors ligne.

## Acceptation

- `npm run verifier` vert ; tests du composant de la section (les quatre états : non supporté,
  iPhone non installé, refusé, actif) avec l'API Push bouchonnée.
- Dis à Pierre comment vérifier après déploiement : sur Android (Chrome) et sur iPhone (depuis
  l'icône de l'écran d'accueil), cocher la case, envoyer la dépêche d'essai, toucher la
  notification ; puis une vraie partie à deux comptes : une attaque, un message au télégraphe, et
  rien pendant la fenêtre de repos.
- `WWS/docs/marque/marque-et-site.md` (lot D) et la proposition à jour.
