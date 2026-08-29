# Notifications — pushes et alarmes (proposition, 28/08/2026)

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
