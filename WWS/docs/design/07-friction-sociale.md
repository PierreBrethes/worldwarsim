# 07 — Friction sociale : élimination, sommeil, drame

Cette fiche regroupe ce qui ne relève pas des systèmes mais du fait que les joueurs sont des amis,
qu'ils dorment, et qu'ils veulent des histoires à se raconter.

## Anti-élimination

Le risque n°1 du format d'une semaine n'est pas l'équilibrage. C'est **le joueur écrasé mardi matin
qui a cinq jours de rien devant lui**. C'est le défaut fatal de Monopoly — le joueur ruiné regarde
les autres jouer — étalé sur sept jours au lieu de quatre-vingt-dix minutes.

**Trois règles :**

1. **La nation d'origine ne peut jamais être annexée**, seulement occupée. Occupation = production
   réduite de moitié. Tu joues moins bien, tu joues quand même.
2. **Revanchisme.** Un joueur très en retard reçoit une **régénération d'effectifs accélérée** — la
   seule exception à la non-convertibilité — plus un bonus de ressources dépensable **uniquement** en
   actions offensives et en sabotage.
3. **Plage de repos**, plus bas.

### Pourquoi le Revanchisme touche les effectifs

En v0, il ne distribuait que des ressources. Or les effectifs sont ni achetables ni convertibles :
un joueur vidé de ses effectifs recevait un multiplicateur sur une monnaie qu'il ne pouvait pas
transformer en armée. **Le filet de sécurité ne touchait pas la variable qui tue.** C'était une
contradiction directe entre l'économie et la promesse anti-élimination.

### Garde-fous anti-farm

- **Flux non thésaurisable** : décroît s'il n'est pas dépensé. On ne peut pas se laisser écraser
  volontairement pour accumuler un trésor de guerre.
- **Calculé sur les pertes infligées par le leader**, pas sur les pertes brutes. Sinon, entre amis,
  A laisse B farmer du Revanchisme pour frapper C : du kingmaking involontaire.
- **Les progrès de Domination financés par le Revanchisme ne comptent pas dans la barre.**

C'est du rubber banding, mécanique légitimement controversée. La variante défendable est celle-ci :
elle ne rend **pas** la victoire au perdant, elle le rend redoutable. Le leader ne peut pas écraser
quelqu'un puis l'oublier, et le perdant a une raison de se reconnecter mercredi.

## Le joueur qui dort

En asynchrone sur sept jours, avec des pertes d'effectifs quasi définitives, **se faire attaquer à
3 h du matin, c'est perdre sa saison en dormant**. Ogame a un mode vacances et un seuil de
non-pillage ; il nous faut l'équivalent.

- **Plage de repos** — chaque joueur déclare 7 h par 24 h. **Aucun mouvement ne peut arriver pendant
  sa plage** : il attend à la frontière et se résout à la fin. La plage est **publique**.
- **Plancher de pertes** — une attaque unique ne peut pas faire descendre en dessous de X % des
  effectifs.

La plage publique est meilleure qu'un bouclier caché : elle donne à l'attaquant une fenêtre connue à
planifier autour, ce qui **ajoute** une décision au lieu d'en retirer une. Et elle se calcule
entièrement à la création du mouvement — on décale `arrivesAt` — donc elle ne coûte rien côté serveur.

## Les quatre leviers de situation drôle

Ce ne sont pas des systèmes à coder, ce sont des propriétés à préserver. Meilleur rendement du
design : aucun ne demande de produire du contenu.

1. **Engagement irréversible avec délai.** Acquis gratuitement via les temps de trajet.
2. **Les troupes en transit ne défendent pas.** Attaquer, c'est se découvrir. Le « ta flotte était
   sortie » d'Ogame. Décision permanente et lisible.
3. **Résolution simultanée.** Deux joueurs qui s'attaquent mutuellement échangent leurs capitales —
   ça se raconte pendant des mois.
4. **Information asymétrique.** Cf. [04 — Information](04-information.md).

**Toute règle future qui casse un de ces quatre leviers doit être justifiée par écrit.**
Le pouvoir japonais est aujourd'hui la seule exception assumée : il annule le levier 1.

## D'où viennent ces idées

| Jeu | Ce qu'on lui prend |
|---|---|
| **Monopoly** | Par l'échec : l'élimination tue le jeu. Et par la réussite : c'est la **négociation**, pas le plateau, qui produit les souvenirs. |
| **Cosmic Encounter** | Un pouvoir casse une règle, il ne modifie pas un nombre. |
| **Root** | Chaque faction a sa propre condition de victoire, sinon une stratégie domine. |
| **Risk (missions secrètes)** | Objectif caché → pas de dogpile sur le leader. |
| **Diplomacy** | Ordres irréversibles, résolution simultanée, zéro hasard. |
| **Twilight Struggle** | Des événements qui forcent la main : beaucoup de récit pour peu de code. |
| **Ogame** | Les troupes en transit ne défendent pas. Et le mode vacances. |
