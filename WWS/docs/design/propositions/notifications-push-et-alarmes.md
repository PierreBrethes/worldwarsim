# Notifications — pushes et alarmes (proposition du 28/08/2026, reprise le 03/10/2026)

> **Reprise du 03/10/2026 (décisions notif-1a … notif-6-2026-10-03).** Ce qui suit la ligne
> « Texte du 28/08 » est l'historique. La version qui fait foi :
>
> - **Abonnement par compte et par appareil** (notif-1a) : on accepte une fois, toutes les saisons
>   en profitent ; la déconnexion désabonne l'appareil. Remplace l'abonnement au jeton de place
>   (ADR 0009, dépassé par l'ADR 0022).
> - **Rien ne sonne pendant la fenêtre de repos du joueur** (notif-2a) : les alarmes de la nuit
>   partent groupées en une seule notification à la fin du repos. Remplace « les alarmes sonnent
>   aussi pendant le repos ».
> - **Pas de notification d'intendance** (notif-3a) : chantiers, livraisons, arrivées restent au
>   journal.
> - **Le télégraphe notifie, une fois par heure au plus** (notif-4b) : « 3 messages au
>   télégraphe », jamais pour ses propres messages.
> - **Le clic ouvre le plateau, journal ouvert** (notif-5a), ou le télégraphe pour un message.
>   Pas de route `/rapport`.
> - **Réglages** (notif-6, demande de Pierre) : dans la fenêtre Réglages, une case « recevoir les
>   notifications sur cet appareil » (l'abonnement de l'appareil), puis une case par type, valable
>   pour le compte entier : attaque subie, avant-poste, colonne relevée, tir à sec, la saison
>   (lancement et fin), télégraphe. Tout coché par défaut.
> - Pas de notification quand le joueur est déjà en jeu (vu il y a moins de deux minutes).
> - Prompts : `prompts/code/ready/notifications-serveur.md` puis `notifications-appareil.md`.

## Ce qui a été codé — lot serveur (03/10/2026)

Prompt : `prompts/code/ready/notifications-serveur.md`. Le lot appareil (service worker, Réglages)
n'est pas fait.

- **Tables** : `pushSubscriptions` (durable, côté identité du wipe), `pushQueue` (par saison,
  emportée par `seasons.destroy`), `presences` ; sur le compte `pushPreferences` et
  `pushFlushJobId`, sur la place `telegraphPushedAt` — tous `v.optional`.
- **API** (`convex/notifications.ts`) : `subscribe`, `unsubscribe`, `subscribed`, `devices`,
  `preferences`, `setPreference` (une case à la fois), `publicKey`, `present`, `sendTest` ;
  `accounts.logout` prend l'`endpoint` de l'appareil. Envoi : `convex/pushSend.ts` (action Node,
  `web-push`) ; 404 et 410 suppriment l'abonnement.
- **File** : `notifyPlayer` est appelé là où la dépêche équivalente s'écrit — `combat.ts` (attaque
  chez le défenseur, tir à sec), `movement/arrival.ts` (avant-poste désactivé), `outposts.ts`
  (chantier d'avant-poste perdu), `movement/detection.ts` (`revealSighting`), `seasons.ts`
  (lancement, `concludeSeason`), `messages.ts`. Le vidage part 60 s après la dernière entrée et se
  déplace plutôt que de s'empiler ; règles pures dans `src/domain/push.ts`.
- **Chaînes** : un module de chaînes à part (`push` dans `src/domain/push.ts`), pas `fr.ts` — `fr.ts`
  tire le catalogue des pays et la moitié du domaine dans le paquet Convex. Aucune phrase ne
  nomme un pays ni une nation (écran verrouillé).

**Écarts avec le résumé :**

1. **Présence** : `players.lastSeenAt` n'est écrit que toutes les 30 min, il ne peut pas dire « vu
   il y a moins de deux minutes ». Une table `presences` et un battement à la minute, onglet
   visible (`usePresence`, seule retouche front du lot) la remplacent pour cette règle.
2. **Avant-poste « détruit »** : la destruction par raids n'existe pas encore ; seuls
   comptent aujourd'hui la désactivation et la perte d'un chantier d'avant-poste.
3. **Colonne relevée** : seul le relevé de mouvement notifie, pas celui d'une force posée
   (`campSighted`) — le résumé ne parle que de colonnes.
4. **Adresse** : `/plateau?windows=journal` (ou `telegraph`), sans saison — le plateau lit sa
   saison dans le stockage local. Le `seasonId` voyage dans la charge utile pour le lot appareil.
5. **Clés VAPID** : à poser à la main sur le Convex du VPS (`deploiement/README.md`, § 5 bis).

## Texte du 28/08


**Statut : validée sur le principe par Pierre (28/08), en file d'attente derrière le premier
skirmish.** Rien ne se code avant que la partie ait éprouvé le journal actuel.

## Pourquoi

Le jeu est asynchrone : les passes de résolution tombent pendant qu'on n'est pas là, et
l'information est chère (le pitch). Une notification push est la dépêche qui sort de l'écran —
la valeur est maximale pour ce qu'on **subit** (on ne peut pas le deviner), faible pour ce
qu'on a soi-même lancé (on sait que ça finira).

## La taxonomie — une seule, pour les pushes ET le journal

Deux niveaux, décidés le 28/08 :

**Alarmes** — envoyées une par une, immédiatement, y compris pendant la fenêtre de repos
(le jeu protège des *conséquences* pendant le repos, pas de l'information) :
- une passe de résolution a eu lieu chez soi (on est attaqué — recouvre « batailles ») ;
- avant-poste désactivé ou détruit ;
- relevé d'écoute : une colonne repérée entrant chez soi (la push qui permet de réagir) ;
- tir à sec (le malus ×0,60 en cours) ;
- fin de partie (Domination, ou saison close par le fondateur) ;
- lobby : la partie est lancée.

**Intendance** — jamais pendant la fenêtre de repos (livrée groupée au réveil), et toujours
**groupée** en une seule push qui résume (« 3 chantiers finis, un lot livré ») :
- chantier fini / palier de QG ;
- lot de troupes livré ;
- arrivée d'un de ses propres mouvements.

## Technique

**PWA + Web Push, pas Capacitor** (décidé le 28/08). Service worker + Push API + clés VAPID ;
l'envoi part d'une action Convex (lib `web-push`) depuis la passe de résolution et les jobs
planifiés. Android/desktop natif ; iOS ≥ 16.4 via PWA ajoutée à l'écran d'accueil. Pas de
stores, pas de compte Apple, pas de coquille native à maintenir — réévaluer Capacitor
seulement si une présence store devient un objectif.

**ADR 0009 (pas de comptes)** : l'abonnement push s'accroche au jeton du joueur et **meurt
avec la saison** — re-demandé à chaque partie, orphelin nettoyé au wipe. Assumé en alpha.

**Prérequis UX** : la route mobile `/rapport` (file post-test de l'audit). Une push qui ouvre
un plateau injouable au téléphone dessert ; elle doit atterrir sur le journal lisible.

## Le journal à l'écran — même taxonomie, pas d'inbox

Idée examinée et écartée pour l'instant : un système « courrier » à la OGame (liste + coche
« lu » par événement). Le journal a déjà le lu/non-lu global (`journalReadAt`, 25/08), et une
inbox à cases casserait l'esthétique presse — on lit une édition, on ne coche pas des
articles. Le vrai besoin est de **ne pas rater l'important dans le tas** ; la réponse retenue,
conditionnelle :

- intendance : l'horodatage global suffit, rien à changer ;
- alarmes : un **tampon « VU » par dépêche** (le pattern POSÉE/COMPRIS), une alarme non
  tamponnée restant en tête du journal après fermeture — **seulement si le skirmish prouve
  que des alarmes se ratent** (note de guet : « combien de fois le journal dit rien »).

## Ce qu'on ne fait pas

Pas de Capacitor. Pas d'inbox à cases. Pas de préférences par joueur au premier jet (deux
niveaux fixes). Pas de push pour ce que l'écran montre déjà à un joueur connecté — à examiner
au moment du prompt.

## Suite

Après le skirmish : trancher le tampon VU sur pièces, puis prompt Claude Code (abonnement +
envoi + service worker + groupage) découpé en deux lots — serveur d'abord, PWA ensuite.
