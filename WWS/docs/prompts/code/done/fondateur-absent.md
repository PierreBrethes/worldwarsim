# fondateur-absent — une saison dont le fondateur ne revient plus reste clôturable

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `convex/seasons.ts` (`conclude`, `destroy`,
`playerByToken`), `convex/players.ts` (`surrender` — le transfert de commandement existe déjà),
`WWS/QUESTIONS.md` (🔴 « la clôture d'une saison quand le fondateur est parti »). Ne commit pas,
ne push pas. Un chantier, un commit, message en français qui décrit le chantier entier.

## Le constat

La capitulation transfère le titre de fondateur au plus ancien belligérant (46, 40a — livré). Le
trou qui reste est **l'abandon silencieux** : un fondateur qui ne se connecte plus sans capituler
laisse une saison sans horloge que personne ne peut clore (`conclude` → `CREATOR_ONLY`). Décision
de Pierre (06/09, 1a) : ce trou se ferme **avant** la partie de contrôle à deux ; la victoire
territoriale, elle, attend.

## Ce qui change

1. **`players.lastSeenAt`** (nombre, optionnel jusqu'au wipe — leçon du 27/08). Une mutation
   `players.touch({ token })` l'écrit ; le client l'appelle **une fois au montage du plateau et au
   plus toutes les `PRESENCE_THROTTLE_MIN = 30` minutes** (une query ne peut pas écrire, et on ne
   veut pas un battement). Le serveur ignore un `touch` sous le seuil. No-op silencieux sur une
   saison non lancée ou un joueur défait.
2. **`conclude` s'ouvre au doyen** : si le fondateur n'a pas été vu depuis
   `FOUNDER_ABSENCE_HOURS = 48` (`@a-mesurer`), le **plus ancien belligérant non défait** (par
   `_creationTime`) peut clore à sa place. Pas de vote, pas de transfert de titre : le fondateur
   reste fondateur, il a perdu l'exclusivité. Erreur dédiée sinon : `FOUNDER_STILL_PRESENT`.
3. **`destroy` ne s'ouvre pas** — on clôt une saison abandonnée, on ne l'efface jamais à la place
   de son fondateur.
4. **Une ligne, pas de surface** : `playerView.me.founderAbsence = { hours, concludeOpensAt } | null`
   (servi seulement quand l'ouverture est à moins de 24 h ou passée). Fenêtre Nation, sous le
   fondateur : « absent depuis N h — la partie peut être close par X à partir de HH:MM ». Clé fr,
   `asDuration`.
5. Le bouton « clore la saison » existant s'affiche au doyen quand la porte est ouverte, même
   confirmation. Aucun grisé (ADR 0015).

## Ce que ce prompt ne fait pas

Ni victoire, ni `surrender`, ni hors-saison. **Jamais de « dernière connexion » d'un autre joueur**
servie ou affichée — ce serait un canal sur les plages de repos (ADR 0005) : `lastSeenAt` ne sort
que pour le fondateur, sous forme de durée, et seulement près du seuil.

## Cas d'acceptation (à transcrire en tests avant de coder — 53a)

1. Fondateur vu il y a 47 h, le doyen appelle `conclude` → `FOUNDER_STILL_PRESENT`.
2. Fondateur vu il y a 49 h, le doyen appelle `conclude` → saison conclue (comportement de
   `conclude` inchangé) ; un belligérant plus récent → `CREATOR_ONLY`.
3. `lastSeenAt` absent (saison d'avant le champ) → `launchedAt` fait foi.
4. Fondateur défait : le titre est déjà passé par `surrender` — la règle vise le fondateur courant.
5. `touch` deux fois en 10 min → une seule écriture.
6. `destroy` par le doyen → `CREATOR_ONLY`, même à 100 h.
7. `playerView` d'un joueur ne contient jamais le `lastSeenAt` d'un autre.

`npm run verifier` vert. Mets à jour `WWS/QUESTIONS.md` (le 🔴 se ferme) et `CLAUDE.md` (une
phrase).
