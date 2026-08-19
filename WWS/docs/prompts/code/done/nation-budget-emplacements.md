# Prompt Claude Code — la fiche Nation cède la liste et garde le budget

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'[ADR 0015](../../adr/0015-economie-v2-ressources-localisees.md)
et la proposition [clic-batiment-et-surfaces.md](../../design/propositions/clic-batiment-et-surfaces.md).
Ne commit pas, ne push pas.

**Prérequis : `ameliorer-sur-la-ligne.md` et `clic-jalon-surfaces.md` sont passés.** Sinon,
arrête-toi : retirer les boutons de Nation avant que la carte y mène serait retirer le seul chemin.

**Prompt court.** Il solde un doublon annoncé par la passe précédente, et une contradiction dans
les briefs qui l'a produit.

## D'où vient le doublon

`clic-batiment-et-surfaces.md` disait « la fiche Nation garde la liste complète en **vue
d'ensemble, en lecture** ». `ameliorer-sur-la-ligne.md` a écrit le critère inverse — « améliorer
depuis Industrie et depuis la fiche Nation produisent le même effet ». Tu as suivi le critère,
c'était le bon choix. **La fiche a raison, le critère avait tort.**

## Ce que Nation détient en propre

La couverture est déjà complète sans elle : Industrie tient dix bâtiments, Production en tient
quatre, Nation en tient **un** — le quartier général. Et chacun est à un clic sur la carte.

Ce que Nation seule peut porter, c'est le **budget d'emplacements**. `buildingCap(hqLevel)` est
l'étranglement central du jeu — la règle de l'ADR 0015 selon laquelle **aucune quantité ne se
compte en régions et le QG est le seul goulot** — et il n'a aujourd'hui pour maison qu'un nombre
enterré dans une liste de quinze lignes.

## Ce que tu fais

1. **Retire les boutons d'amélioration et les coûts** de la section « bâtiments » de la fiche
   Nation. `UpgradeControl` reste, inchangé, dans Industrie et Production — c'est là qu'on utilise
   un bâtiment, donc là qu'on l'élève.

2. **Donne au QG son bloc**, en tête. Nation est sa destination au clic (`WINDOW_OF_BUILDING`), et
   il n'apparaît nulle part ailleurs. Son niveau, et surtout **ce qu'il porte** : le plafond de
   bâtiments, les slots de mouvement, la porte du palier 2, la vitesse des chaînes. Tout est déjà
   servi ou calculable — ne réimplémente aucune formule, lis `constants.ts`.

   Le QG **garde son bouton d'amélioration** : c'est sa seule surface, la règle ne souffre pas
   d'exception. Réutilise `UpgradeControl`, n'en écris pas un second.

3. **Le budget d'emplacements devient une lecture, pas un nombre.** Combien sont pris, combien le
   QG en autorise, combien il en reste. Une jauge vaut mieux qu'une fraction : c'est l'arbitrage le
   plus structurant de la partie, et « 9 / 13 » se lit moins vite qu'une barre.

   `buildingCap` est déjà servi dans `PlayerView.me`, et le commentaire de `view.ts` explique
   pourquoi le nombre de bâtiments debout n'est **pas** servi à côté : la liste *est* le compte.
   Respecte-le — ne fais pas voyager un second nombre qui pourrait diverger.

4. **Le recensement reste, en dense et en lecture.** Les quinze bâtiments, clé, région, niveau.
   Pas de coût, pas de bouton, pas de durée. C'est une vue d'ensemble : *qu'est-ce que je tiens*,
   pas *que puis-je faire*. Une ligne doit tenir sur une ligne.

   `cappedByHq` reste visible : un bâtiment bloqué par le niveau du QG est une information sur le
   QG, donc elle est chez elle ici.

5. **Le chantier en cours reste** où il est. Un seul par joueur, jamais un par région (ADR 0015) —
   c'est une propriété de la nation, pas d'un bâtiment.

## Pendant que tu y es

Le client extrapole le stock pour dégriser le bouton d'amélioration sans aller-retour serveur
(`upgradeHold`). C'est le bon geste, mais il ouvre un écart : l'extrapolation client et le calcul
paresseux du serveur peuvent diverger à la seconde près, et le bouton s'activerait juste avant que
le serveur accepte. **Vérifie que l'extrapolation est conservatrice** — mieux vaut un bouton grisé
une seconde de trop qu'un refus après le clic. Si elle l'est déjà, dis-le et ne touche à rien.

## Critères d'acceptation

- La fiche Nation ne porte plus aucun coût ni bouton d'amélioration, **sauf pour le QG**.
- Le QG a son bloc en tête, avec ce qu'il débloque, et aucune formule n'y est réimplémentée.
- Le budget d'emplacements se lit d'un coup d'œil, sans compter les lignes.
- Le nombre de bâtiments debout n'est servi nulle part en double : la liste reste le compte.
- Un bâtiment plafonné par le QG est signalé dans le recensement.
- Aucun bâtiment n'est devenu inaccessible : les quinze restent joignables par la carte, et les
  quatorze autres gardent leur bouton dans Industrie ou Production.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts`.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Tu ne touches ni à Industrie, ni à Production, ni à la carte, ni à `UpgradeControl` lui-même. Tu
n'ajoutes aucune donnée nouvelle dans `PlayerView` sans dire pourquoi l'existant ne suffisait pas.
Tu ne chiffres pas le rayon de la station d'écoute — il n'existe dans aucun document, et l'inventer
serait une décision d'équilibrage.
