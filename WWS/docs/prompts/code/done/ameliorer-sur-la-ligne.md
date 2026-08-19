# Prompt Claude Code — améliorer depuis la ligne du bâtiment

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md` et la proposition
[clic-batiment-et-surfaces.md](../../design/propositions/clic-batiment-et-surfaces.md).
Ne commit pas, ne push pas.

**Prérequis : `fenetre-industrie.md` est passé.** Sans la fenêtre Industrie, il n'y a que la moitié
des lignes à équiper. Sinon, arrête-toi.

## La décision

**Améliorer est disponible partout où le bâtiment apparaît, sur sa propre ligne** — Industrie et
Production. La fiche Nation garde la liste complète en **vue d'ensemble, en lecture**.

C'est un assouplissement délibéré de la règle « un verbe par surface » du brief construction.
Motif : améliorer est l'action la plus fréquente du jeu après recruter, et obliger à changer de
fenêtre pour l'exécuter transformerait chaque amélioration en trois clics. **La carte pose, la
fenêtre utilise et améliore.**

## Ce qui existe déjà — ne le réécris pas

**Toute la donnée est servie.** `view.ts` fait voyager, pour chaque bâtiment de
`PlayerView.me.buildings` :

```
key · regionId · level · nextLevelCost · nextLevelMinutes · cappedByHq
```

**La mutation existe.** `constructions.start` (`convex/constructions.ts`) prend `building` et
`regionId` et gère déjà le cas « il y a un bâtiment ici, donc on l'élève ». Tu n'écris **aucune
mutation nouvelle**.

Tu branches, tu ne construis pas.

## Les trois refus, qui sont trois messages différents

`constructions.start` refuse pour des raisons distinctes, et un bouton grisé sans motif est un bug
d'interface. Chaque refus a son texte :

1. **Un chantier tourne déjà.** `CONSTRUCTION_IN_PROGRESS` — un seul chantier par joueur, jamais un
   par région (ADR 0015, le commentaire de la mutation porte le raisonnement complet). Dis lequel
   tourne et quand il finit.
2. **Le QG plafonne.** `cappedByHq` arrive déjà cuit dans la vue : rien ne monte au niveau du QG.
   Dis qu'il faut élever le QG d'abord, pas « impossible ».
3. **Les matières manquent.** `INSUFFICIENT_RESOURCE` porte `resource`, `needed`, `available`.
   **Nomme la ressource et le manque** — c'est la même exigence que « à sec — charbon » dans
   Industrie, et ce doit être la même formulation.

**Le bouton n'est jamais absent, seulement empêché et expliqué.** Un bouton qui disparaît laisse le
joueur chercher ce qu'il a mal fait.

## Anticipe le refus, ne le subis pas

Le client tient déjà de quoi savoir qu'une amélioration échouera — coût, stocks, plafond QG,
chantier en cours. Grise le bouton et porte le motif **avant** l'aller-retour serveur.

**Mais le serveur reste le seul juge.** Ne recopie pas la règle : lis les mêmes champs et affiche
le même verdict. Si tu te retrouves à réimplémenter `placementRefusal` côté client, arrête-toi et
dis-le — c'est que la vue ne sert pas ce qu'il faut, et la réponse est d'enrichir `view.ts`.

## Critères d'acceptation

- Chaque bâtiment listé dans Industrie et Production porte son coût de niveau suivant, sa durée, et
  son bouton.
- Le bouton est grisé **avec son motif** dans les trois cas ci-dessus, jamais grisé sans texte.
- Améliorer depuis Industrie et améliorer depuis la fiche Nation produisent exactement le même
  effet — même mutation, mêmes arguments.
- Aucune mutation nouvelle n'a été écrite.
- Aucune règle de refus n'est réimplémentée côté client.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts`.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Tu ne touches pas à la **pose** d'un bâtiment : elle reste sur la carte, au clic droit sur la rose
des vents, et c'est une décision (ADR 0015). Tu ne changes pas la règle du chantier unique. Tu ne
fais pas la refonte visuelle des fenêtres.

**Signale, ne tranche pas :** si la section « bâtiments » de la fiche Nation devient un doublon
complet d'Industrie une fois ce prompt passé, dis-le dans ton rapport. C'est une décision de design
qui se prend en regardant les deux écrans.
