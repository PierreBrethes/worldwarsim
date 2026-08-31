# Prompt Claude Code — un seul format de saison

Lis `CLAUDE.md`, `CONVENTIONS.md`,
`WWS/docs/adr/0017-format-de-saison-et-socle-place.md`,
`WWS/docs/adr/0020-domination-par-couleur.md` (§11).
Ne commit pas, ne push pas. Un seul commit, préparé mais pas créé.

## Pourquoi

Décision de Pierre (31/08) : **il n'y a plus d'escarmouche ni de campagne**. L'horloge était déjà
optionnelle depuis le 27/08 ; ce qui restait au format, c'était un jeu de constantes de départ et
le plafond de bâtiments — et l'ADR 0020 §10 vient de retirer ce plafond de ses mains en le rendant
local. Ce qui reste ne justifie plus deux tables ni un choix au lobby.

⚠️ **Ce prompt vient après `retrait-doctrines-et-mode-unique.md`**, qui touche les mêmes écrans de
lobby. Ne les mène pas en parallèle.

## Ce qui change

**Les valeurs qui survivent sont celles de `campaign`.** Sans horloge, une partie n'a plus de fin
programmée : c'est la campagne qui décrit le jeu réel. `startingAlloy` est la seule valeur du
projet issue d'une mesure (`WWS/simulation/opening/run.mjs --sweep`) — garde la valeur de campagne
et **garde son commentaire**, qui explique ce qui a été mesuré et pourquoi la courbe est fragile.

**`convex/constants.ts`** : `SEASON_FORMATS`, `SeasonFormatSpec` et `formatOf` disparaissent au
profit de constantes simples (`HQ_LEVEL_AT_LAUNCH`, `MAX_HQ_LEVEL`, `STARTING_ALLOY`,
`STARTING_OIL`, `STARTING_AMMUNITION`, `DEFAULT_DURATION_HOURS`). La fonction qui projette le
palier de déverrouillage d'un bâtiment (`UNLOCKED_AT`, ~ligne 140) se simplifie : plus de format de
référence, plus de règle de trois — elle lit le palier directement.

**`buildingCap(format, hqLevel)`** : ne le réécris pas ici. Si l'ADR 0020 §10 n'est pas encore
codée, garde-le en lisant les seules valeurs survivantes et laisse un `@a-mesurer` renvoyant à
l'ADR ; sinon il aura déjà disparu.

**`formatOfSeason`** (porte unique posée le 30/08) disparaît, et avec elle tous ses appelants :
`view.ts`, `constructions.ts`, `troops.ts`, `movement/orders.ts`, `seasons.ts`.

**Schéma** (`convex/schema.ts`) : `seasons.format` part. Applique la règle du dépôt — un champ
retiré d'une table déjà écrite se retire proprement ou reste `v.optional` non lu ; ne casse pas la
poussée en production (vu le 27/08 sur `buildings.seasonId`). `durationHours: number | null` reste :
l'horloge optionnelle n'est pas remise en cause.

**`seasons.create`** : plus d'argument `format`. `durationHours` garde `null` et ses deux littéraux.

**Front** : `accueil.tsx` ne propose plus qu'une horloge (48 h / 7 jours / sans horloge), plus de
choix de format. `fr.lobby.formats` et tout libellé d'escarmouche ou de campagne disparaissent de
`src/i18n/fr.ts` — aucun libellé mort.

**Tests** : retire l'argument `format` de tous les montages. `economy.test.ts` assertait que le
plafond de bâtiments reste sous le nombre de régions de la plus petite nation jouable — cette
assertion doit survivre sous sa nouvelle forme, pas disparaître.

## Docs

Note de révision datée (31/08) en tête de l'ADR 0017 : le format de saison est retiré, seule
l'horloge optionnelle survit ; renvoi à l'ADR 0020 §11. `WWS/CONTEXT.md` : retire *escarmouche* et
*campagne* du glossaire.

## Vérifications

`npm run verifier`. À la main : fonder une partie → aucun choix de format → lancer → les valeurs de
départ sont celles de la campagne → le catalogue déverrouille aux mêmes paliers qu'avant pour une
campagne.
