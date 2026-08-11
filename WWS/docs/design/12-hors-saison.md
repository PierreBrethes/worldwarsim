# 12 — Hors-saison : accueil, salon, choix de nation

**Statut : à valider.** Cette fiche couvre tout ce qui précède le plateau. Elle remplace la note
« hors programme » du brief UI (fiche 11, périmètre de l'époque). L'identité des joueurs est
tranchée par l'[ADR 0009](../adr/0009-pseudo-et-code-plutot-que-comptes.md) : pseudo + code de
partie, pas de comptes.

## Le flux

```
accueil ──(fonder)──► salon (créateur) ──(lancer)──► plateau
   └────(rejoindre : code + pseudo)──► salon (invité) ──┘
```

Trois écrans, aucun autre. Pas de tutoriel, pas de paramètres de profil, pas d'écran de fin de
saison dans cette fiche — le wipe ramène à l'accueil.

## L'accueil

Une **une de journal** : le masthead du jeu, la date de l'édition, et deux actions seulement.

- **Fonder une saison** — demande un pseudo, crée la saison, mène au salon.
- **Rejoindre** — demande un code et un pseudo, mène au salon.

Si le navigateur porte un jeton de saison en cours (ADR 0009), l'accueil affiche à la place une
manchette « la saison III continue — N mouvements ont été résolus depuis votre départ » et un seul
bouton : reprendre.

## Le salon

Le salon **est déjà la carte**. Pas d'écran de formulaire : le plateau 3D, vu de plus haut, avec un
panneau de réglages pour le créateur.

- **Le code de partie** s'affiche en grand, façon petite annonce encadrée — 6 caractères, sans
  ambiguïté typographique (pas de O/0, I/1).
- **Le créateur règle** : durée (48 h / 7 j) et curseur de compensation (fiche 01). Ces réglages se
  verrouillent au lancement.
- **La région jouable s'élargit en direct** avec le nombre de joueurs présents (fiche 01) : Europe
  à 2-3, + Méditerranée et Moyen-Orient à 4-6, monde à 7-8. L'arrivée d'un ami agrandit le monde
  sous les yeux de tous — c'est le moment spectaculaire du salon.
- **Chaque joueur présent** apparaît avec son pseudo et son encre ; la liste dit qui a choisi sa
  nation et qui est prêt, jamais quelle doctrine.

## Le choix de nation

**Premier arrivé, premier servi, sur la carte.** Cliquer une nation libre la réserve immédiatement ;
elle prend l'encre du joueur aux yeux de tous. Pas de draft, pas de cérémonie : entre amis, la
négociation se fait à la voix.

Deux adoucissements, sans lesquels « premier servi » devient « premier connecté rafle tout » :

- **On peut relâcher ou changer** de nation librement tant que la saison n'est pas lancée. La
  réservation n'est définitive qu'au lancement.
- **La graine de saison est révélée au lancement**, pas avant : la richesse des pays neutres est
  inconnue au moment du choix. On choisit un pouvoir et une géographie, pas un revenu optimisé.

**La doctrine se choisit dans le salon, en privé** (fiche 05 : secrète jusqu'à 25 % de
progression). Le salon montre « prêt / pas prêt », jamais le choix. Un joueur est prêt quand il a
une nation et une doctrine.

**Le lancement** appartient au créateur, possible dès 2 joueurs prêts. Les nations non prises
restent neutres toute la saison.

## Pièges

- **Ne jamais révéler une doctrine dans le salon**, même par un détail d'interface (icône, ordre,
  temps de choix affiché).
- **Les États-Unis sont le 🔴 en cours** (avantage d'isolement, cf. QUESTIONS.md) : tant qu'il n'est
  pas corrigé, le salon affiche « à équilibrer » sur la nation — les amis choisissent en
  connaissance de cause. Pas de ban système.
- **Le code est le seul secret.** Il ne doit apparaître dans aucune URL partageable par accident
  (pas de `?code=` dans l'adresse du salon).

## Défauts assumés — pas des questions

Entre amis, on ne construit pas de garde-fous sociaux : le lancement est **immédiat** quand le
créateur le décide, un salon jamais lancé **n'expire pas** (le wipe nettoie), et il n'y a **pas
d'exclusion** de joueur — ça se règle à la voix, comme le partage des nations.
