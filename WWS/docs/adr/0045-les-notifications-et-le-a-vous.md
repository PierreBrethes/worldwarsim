# ADR 0045 — Les notifications, et un « À vous » quand une colonne arrive

**Statut :** acceptée (23/11/2026). Recommandation de l'audit gameplay du 23/11 (point 7), acceptée
par Pierre. **Mondiale seule** (`modeOf`). **Inscrit** les décisions notif-1a à notif-6 de la
fiche `propositions/notifications-push-et-alarmes.md` (qui reste figée) et **révise notif-3a**
(« pas de notification d'intendance : chantiers, livraisons, arrivées restent au journal »).

## Contexte

Une saison de 7 jours se joue par retours : on lance des colonnes, on part, on revient quand elles
arrivent. Rien ne prévenait qu'il y avait de nouveau quelque chose à jouer. Les décisions de la
fiche n'étaient écrites ni dans un ADR ni dans le registre.

## Ce qui tient (fiche du 03/10, inchangé)

- **notif-1a** abonnement par compte et par appareil (ADR 0022) ; **notif-2a** rien pendant la
  plage de repos, une notification groupée à son terme ; **notif-4b** le télégraphe, une fois par
  heure au plus ; **notif-5a** le clic ouvre le plateau (journal, ou télégraphe) ; **notif-6** une
  case par genre dans les Réglages, tout coché par défaut ; rien quand le joueur est en jeu
  (vu depuis moins de deux minutes) ; aucune phrase ne nomme un pays ni une nation.

## Décision

1. **Un septième genre, `yourMove`**, phrase unique « À vous : une de vos colonnes est
   arrivée. », adresse `/plateau`. Il couvre l'arrivée et le slot de mouvement qu'elle rend.
2. **Ce qui sonne** : chaque arrivée qui rend la colonne à la main du joueur, y compris une
   colonne vaincue qui rentre ; la cadence d'une heure absorbe le retour qui suit. Exceptions : la
   capture affamée (#620, annulée à l'arrivée ou suspendue à l'échéance), les étapes de tournée
   et de ronde, le largage, la livraison, la seconde jambe engagée d'une Guerre éclair (arrêtée
   après la première victoire, la colonne sonne). Le pillage et la collecte de caisse sonnent à
   leur retour. Accroche : `movements.arrive`, `arriveForCapture`, `pressOn` (branche `halted`).
3. **Cadence** : au vidage, `yourMove` est une troisième branche, sur le patron du télégraphe.
   Les arrivées retenues se réduisent à **un seul** « À vous » ; au plus un par heure et par
   joueur (`YOUR_MOVE_PUSH_INTERVAL_MS`, `@a-mesurer`) ; retenu dans l'heure, il repart à son
   terme, une fois. Le repos le retient comme le reste ; un joueur en jeu l'abandonne, sans
   marquer l'heure. Il part seul, hors du lot des alarmes.
4. **La marque** est `readMarks.yourMovePushedAt` (optionnelle), jamais `players`.
5. **Réglages** : `PUSH_PREFERENCES.yourMove` est `v.optional`, lu coché à défaut (`pushPreferencesOf`) ;
   la case se libelle « À vous (colonne arrivée) » et n'est pas offerte en Blitz, où rien ne sonne.

## Ce qu'on abandonne

- Un journal pour seul témoin des arrivées : une saison longue ne se joue pas en regardant son
  téléphone.
- Une notification par arrivée : au plus une par heure, c'est le prix du silence de l'écran verrouillé.
