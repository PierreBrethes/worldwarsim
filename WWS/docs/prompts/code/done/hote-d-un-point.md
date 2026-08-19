# Prompt Claude Code — le pays hôte d'un point, et le prix du trajet combiné

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0016**, puis
`WWS/docs/design/03-carte-et-avant-postes.md` (§ Pays neutres). Ensuite `convex/regions.ts`
(`adm0Of`, `regionFacts`), `convex/routes.ts` (`countryAtPoint`), `convex/movements.ts:320-336`,
`src/domain/compass-rose.ts:274 et 290` et `src/domain/journal.ts:66`.
Ne commit pas, ne push pas.

**Correctif de `la-porte-se-lit-sur-la-route.md`.** La correction de `countryAtPoint` était juste
dans son diagnostic et trop étroite dans son remède.

## Le défaut

`adm0Of` ne connaît que les huit nations jouables (`NATION_BY_COUNTRY` → `ADM0_BY_NATION`) et
renvoie la chaîne vide pour tout le reste. Or la chaîne vide voulait déjà dire **mer ouverte** —
le commentaire de `movements.ts:320` le dit : *« the open sea owes none and answers the empty
string »*.

Deux faits distincts sont donc fondus en un seul : *« ce point est en pleine mer »* et *« ce point
est dans un pays que personne ne joue »*. Il y a 163 pays dans `world.json` et huit sont jouables :
la seconde catégorie est le cas ordinaire, pas le cas limite.

## Ce que ça casse

`hostCountry` n'est pas lu que par la fenêtre de repos.

- `compass-rose.ts:274` — `view.me.outposts.some((o) => o.hostCountry === target.country)` compare
  une chaîne vide à un vrai code ADM0 : **toujours faux**. La rose cesse de reconnaître mes
  propres avant-postes en pays neutre.
- `compass-rose.ts:290` et `journal.ts:66` — `countryName(hostCountry)` et
  `countryLabel(report.hostCountry)` rendent un lieu sans nom, à l'écran et dans les dépêches.
- **Et surtout la fiche 03.** « Rendement décroissant par joueur sur un même pays hôte »,
  « capacité d'échange finie par pays, et relation par joueur », « un pays saturé d'avant-postes
  voit sa relation chuter et peut expulser » : ces trois règles ont le pays hôte pour **clé**. Avec
  une chaîne vide partout, l'Arabie, la Roumanie et la Bolivie deviennent le même pays hôte, et le
  garde-fou que la fiche appelle *obligatoire* contre le farm PNJ devient inapplicable. Aucune de
  ces règles n'est codée aujourd'hui — c'est exactement pourquoi il faut que la donnée soit juste
  avant qu'elles le soient.

## Le correctif

Aucune table à inventer : les deux moitiés existent et chacune sait faire ce que l'autre ne sait
pas.

- `countryAt(world, point)` (`src/domain/routing.ts:287`) est un point-dans-polygone sur les 163
  pays. Il répond bien à « ce point est-il en mer ? » — mais `world.json` ne porte qu'un nom (`n`),
  aucun code.
- `public/region-index.json` porte le code ADM0 **de toutes les régions** et le point de chacune.
  Il répond à « quel code pour ce point ? ».

Écris `hostAtPoint(point)` : mer ouverte selon `countryAt` → chaîne vide ; sinon le code ADM0 de la
région la plus proche du point. `movements.ts:327` l'appelle à la place de
`adm0Of(countryAtPoint(point))`.

`adm0Of` **reste** — c'est le pont nation → ADM0, il a son emploi ailleurs. Ce prompt lui retire
seulement un travail qui n'était pas le sien.

Un point : le commentaire de `movements.ts:320` doit cesser de dire que la chaîne vide couvre tout
ce qui n'est pas jouable. Elle ne couvre plus que la mer.

## Le second sujet : ce que coûte le trajet combiné

`routeModeOf` renvoie désormais `'combined'` pour toute colonne terrestre, donc
`computeRoute` explore `[LAND, SEA]` — la mer entière entre dans le graphe de Dijkstra, y compris
pour aller de la Marne à la Ruhr. `COST_BY_MEDIUM` et `TRANSFER_COST` font que la terre gagne,
mais l'exploration a lieu quand même.

**Mesure-le** et rapporte le chiffre : un trajet terrestre court, un trajet terrestre long, une
traversée, avant et après le passage en `'combined'`. Ne l'optimise pas dans ce prompt — si le
coût est réel, il aura le sien, et la piste évidente (borner l'exploration maritime quand le
départ et l'arrivée sont sur la même masse continentale) est aussi celle qui sert la question
ouverte de la rose des vents. Un chiffre d'abord.

## Critères d'acceptation

- Un test : un point en Arabie saoudite rend `SAU` ; un point en pleine mer rend la chaîne vide ;
  un point en France rend `FRA`, comme `regionFacts().country` et `homeCountryOf('france')`.
- Un test qui grave l'intention : deux avant-postes dans deux pays neutres **différents** ont deux
  `hostCountry` différents.
- La rose reconnaît un avant-poste à moi posé en pays neutre (`compass-rose.ts:274` répond vrai).
- Les chiffres de routage sont dans le rapport, pas dans le code.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne codes aucune des trois règles de la fiche 03 — elles attendent leur tour, ce prompt rend
seulement leur clé fiable. Tu ne touches pas à la rose des vents ni au trajet combiné au-delà de
la mesure. Tu ne touches ni au schéma, ni à `stationedAt`, ni à `MovementAim`.
