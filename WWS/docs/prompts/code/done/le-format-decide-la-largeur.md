# Prompt Claude Code — le format décide la largeur du catalogue et la place sur la carte

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0017** (format de saison, socle placé)
et l'**ADR 0015** (le quartier général est l'unique étranglement). Ensuite `convex/constants.ts`
(`BUILDING_CAP_BASE`, `BUILDING_CAP_PER_HQ_LEVEL`, `buildingCap`, `UNLOCKED_AT`, `SEASON_FORMATS`,
`tier2HqLevel`), `src/domain/economy.ts` (`placementRefusal`), `src/domain/construction.ts` et
`convex/economy.test.ts:769`.
Ne commit pas, ne push pas.

## Le défaut, en chiffres

En escarmouche, `buildingCap(2) = 7` et le socle en consomme sept — six bâtisses plus le quartier
général. **Zéro emplacement libre au lancement.** Au quartier général 3, plafond du format,
`buildingCap(3) = 9` en laisse deux, dont un part dans la caserne que le socle ne donne pas. Il
reste **un choix libre pour toute la partie**, entre billets, moulin, puits, intendance, dépôt,
écoute, aérodrome et port.

Et `UNLOCKED_AT` place `port: 3` et `airfield: 3` alors que l'escarmouche plafonne à
`maxHqLevel: 3` : la mer et le ciel ne s'ouvrent qu'au dernier palier du format. Une nation
insulaire n'a rien à faire avant la fin.

L'ADR 0017 avait posé le rendez-vous : *« ça tient parce que le recrutement occupe le trou, pas
parce que la construction respire. À surveiller quand les mouvements existeront. »* Ils existent.

## Ce que tu codes

### 1. Le plafond de bâtisses appartient au format

`BUILDING_CAP_BASE` et `BUILDING_CAP_PER_HQ_LEVEL` migrent dans `SeasonFormatSpec`.
`buildingCap` prend le format en plus du niveau.

| | base | par palier | au lancement | au maximum |
|---|---|---|---|---|
| `skirmish` | 5 | 3 | 11 (QG 2) | **14** (QG 3) |
| `campaign` | 3 | 2 | 5 (QG 1) | **13** (QG 5) |

La campagne ne bouge pas. L'escarmouche passe de zéro à quatre emplacements libres au lancement,
et de un à sept sur la fin.

**Le garde-fou est dur et il n'est pas négociable** : `convex/economy.test.ts:769` exige que le
plafond reste **strictement sous** le nombre de régions de la plus petite nation jouable —
l'Allemagne, seize Länder. Au-delà, la règle d'une bâtisse par région se mettrait à brider
l'Allemagne et personne d'autre, et le découpage de Natural Earth équilibrerait la saison. Fais
porter ce test sur le **maximum de tous les formats**, pas sur une constante globale qui n'existe
plus. C'est lui qui empêchera de monter trop haut dans six mois, il doit rester le juge.

### 2. Le seuil de déblocage se lit en fraction de la course du format

`UNLOCKED_AT` garde ses niveaux — ce sont ceux de la **campagne**, le format de référence, dont la
course va du quartier général 1 au 5. Un autre format les reprojette sur la sienne :

```
unlockLevel(key, format):
  ref     = SEASON_FORMATS.campaign
  f       = SEASON_FORMATS[format]
  course  = f.maxHqLevel - f.hqLevelAtLaunch
  refRun  = ref.maxHqLevel - ref.hqLevelAtLaunch        // 4
  advance = (UNLOCKED_AT[key] - ref.hqLevelAtLaunch) / refRun
  return f.hqLevelAtLaunch + Math.floor(advance * course)
```

En campagne c'est l'identité. En escarmouche, où la course vaut **un seul palier**, tout tombe au
quartier général 2 : le port et l'aérodrome sont disponibles dès la première minute. C'est la
bonne réponse et pas un effet de bord — un catalogue étagé sur un unique palier n'étage rien, il
retarde. Ce qui échelonne une escarmouche, c'est l'alliage et le temps, pas le quartier général.

Tout appelant de `placementRefusal` et tout producteur de `BuildSpec.unlockedAtHqLevel` passe par
cette fonction.

### 3. Ce que tu ne touches surtout pas : `tier2HqLevel`

`tier2HqLevel(format) = hqLevelAtLaunch + TIER_2_LEVELS_ABOVE_LAUNCH` reste tel quel, et ne doit
**pas** être unifié avec `unlockLevel`. Les deux règles disent des choses opposées et c'est voulu :

- `unlockLevel` dit **ce que le format rend accessible** — une largeur de catalogue, qu'un format
  court doit ouvrir tôt ;
- `tier2HqLevel` dit **quand la progression franchit un cap** — une profondeur, qu'un format court
  doit garder devant lui, sinon monter le quartier général ne récompense rien.

Écris cette phrase en commentaire au-dessus des deux. Quelqu'un essaiera de les fusionner.

## Critères d'acceptation

- Un test par format : le nombre d'emplacements **libres après le socle**, au lancement et au
  maximum — 4 et 7 en escarmouche, 1 et 9 en campagne. Ce sont ces nombres-là qui décrivent la
  partie, pas le plafond brut.
- Un test : en escarmouche, le port et l'aérodrome sont offerts par `buildableOn` dès le quartier
  général 2 ; en campagne, pas avant le 3.
- Le garde-fou allemand passe sur le maximum de chaque format et **échouerait** si l'un d'eux
  atteignait 16 — vérifie-le en montant temporairement une valeur, puis remets-la.
- `tier2HqLevel` rend toujours 3 en escarmouche et 2 en campagne.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne sors pas le socle du plafond — l'ADR 0017 dit que la fondation achète le prix et l'attente,
jamais une place sur la carte, et cette décision tient. Tu n'introduis pas de second compteur par
famille de bâtiment : le quartier général reste l'unique étranglement (ADR 0015). Tu ne changes ni
`maxHqLevel`, ni le socle d'aucun format.
