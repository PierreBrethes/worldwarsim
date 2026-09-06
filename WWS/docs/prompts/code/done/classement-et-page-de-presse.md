# classement-et-page-de-presse — l'édition toutes les trois heures

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, **`WWS/docs/design/propositions/classement-bareme.md`
(la spec — elle fait loi, validée 79a puis révisée par la décision 80 le 06/09 : **général exact, 3 h**)**, `page-de-presse-et-scores.md`, l'ADR 0020 §3-4,
`convex/control.ts` (`held`, `heldRegions`), `convex/constants.ts` (`BUILDING_SPEC`, `buildCost`,
`COST_BY_ROLE`, `TIER_2_FACTOR`), `convex/troops.ts` (`resumeQueues` — le modèle du job qui se
replanifie), `convex/seasons.ts` (`concludeSeason`, `GAME_TABLES`). Ne commit pas, ne push pas.
Un chantier, un commit, message en français. Suppose `fondateur-absent` livré ou non — indépendant. **Le contrat de vue `contrats-de-vue/07-presse.md`, son annexe et la maquette validée font loi pour le client** (phase design demandée par Pierre le 06/09) — ne pas donner ce prompt avant la maquette.

## Ce qui change

**Domaine (pur, testé sans base)** — `src/domain/standings.ts` :
`scoresOf({ buildings, troops, engagements, heldCount, heldByAnyone }) → { territory, industry,
military, deeds, general }` selon le §1 de la spec. Pas de tranche (§2 abandonné). Bâtiment
désactivé → 0. Troupes : posées, en garnison, en mouvement ; la file non.

**Schéma** — table `editions` `{ seasonId, playerId, at, final: boolean, territory, industry,
military, deeds, general }`, index `bySeasonAt` et `byPlayerAt`. Ajoutée à `GAME_TABLES`
(`destroy` et `dev.reset` la purgent — le test d'invariant existant doit la voir).

**Serveur** — `convex/press.ts` : `publish` (internalMutation) lit tout, écrit une ligne par joueur
(défaits compris), pose une dépêche `editionPublished` par joueur (gravité routine, texte : rang +
heure, jamais les scores des autres), et **se replanifie** à `+PRESS_EDITION_HOURS` (constante
`= 3`), gardée par `seasonStillPlays`. `launch` planifie la première à `launchedAt + 3 h`.
`concludeSeason` appelle `publish` avec `final: true` avant de marquer la saison conclue.

**Vue** — `playerView` sert `press: { at, next, mine: { …exact, delta depuis l'édition précédente },
others: [{ playerId, rank, territory, general, deeds, defeated }] }` — **la dernière édition
seulement, jamais un recalcul** ; `industry`/`military` d'autrui ne sortent jamais. Pas d'édition encore → `press: null`.

**Client** — fenêtre « Presse » sur le rail (entrée nouvelle, pictogramme journal plié) : liste
ordonnée par **territoire**, `rang · drapeau · nation · pseudo · territoire % · général exact · faits d'armes`, manchette
« scores relevés à HH:MM:SS » + prochaine édition, joueur défait marqué. La
fenêtre Nation gagne un bloc « nos registres » : quatre chiffres exacts + général + delta. Clés
`fr.press.*` ; habillage presse existant (`tokens.css`), aucune donnée inventée : tout vient de
`press`. Pas de graphique.

## Ce que ce prompt ne fait pas

Ni écran de fin (la page de presse en tient lieu — l'édition finale s'y lit), ni victoire,
ni objectifs neutres. Aucun coefficient : général = industrie + militaire.

## Cas d'acceptation

1. Étant donné 2 joueurs et une saison lancée à T, à T+3 h une ligne par joueur existe ; à
   T+6 h une seconde ; aucune entre.
2. Étant donné un joueur avec QG 2 + mine 1, `industry` = alliage(hq 1) + alliage(hq 2) +
   alliage(mine 1) exactement (`buildCost`), pas une constante recopiée.
3. Étant donné une infanterie MK1 à 25/50, `military` = 18 × 0,5 ; un blindé MK2 plein =
   95 × 1,6 ; une troupe en file = 0.
4. `playerView` de A contient `general` de B exact, et ni `industry` ni `military` de B (test sur
   la forme servie).
5. Recruter entre deux éditions ne change pas `press` (la vue sert l'édition, pas l'état).
6. `concludeSeason` écrit une édition `final: true` et aucune autre ne suit.
7. Chaque joueur reçoit une dépêche `editionPublished` par édition, texte avec son rang.
8. `destroy` purge `editions`.

`npm run verifier` vert. Mets à jour `CLAUDE.md` (un paragraphe « la presse ») et
`RESTE-A-CODER.md` (11 livré).
