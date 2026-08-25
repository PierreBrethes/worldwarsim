# Prompt Claude Code — l'écoute et le relais font ce qu'ils vendent

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/design/03-carte-et-avant-postes.md`
(§Spécialisation), `04-information.md` (§Le brouillard, §Elle voit ce qui bouge), ADR 0018 §3,
ADR 0019 §5, `WWS/docs/technique/brouillard-et-fanout.md`, puis `convex/constants.ts` (station
`listening`, `SCOUT_RADIUS_KM`, `OUTPOST_REACH_KM`, `INTERCEPTION_RADIUS_KM`),
`convex/movements.ts` (`fileSightings`, `scheduleInterception`), `src/domain/route-timing.ts`,
`convex/routes.ts`, `convex/validators.ts` (`SPECIALIZATION`). Ne commit pas, ne push pas.
**Suppose `journal-complet-et-lu` passé** (les relevés produisent des notices).

## Pourquoi

Un joueur peut aujourd'hui construire une **station d'écoute** (35 alliage, 15 charbon,
40 min) et choisir pour un avant-poste la spécialisation **écoute** ou **relais** — et rien ne
lit ces choix : `fileSightings` ne connaît que la troupe posée, `route-timing` ignore les relais.
La fiche 04 les nomme pourtant comme deuxième et troisième source de détection, avant la troupe
posée qui est « la seule qui existe dans le code ». Payer pour du décor est le contraire de la
règle 2 (ce qui est joli s'achète). Décision du 25/08 (2a) : on les code, on ne les cache pas.

## La règle

**Détection.** Trois détecteurs fixes s'ajoutent à la troupe posée dans `fileSightings`, au même
instant (départ du mouvement adverse, une fois, ADR 0018 §3), avec la même sortie (fil, cap,
horaire, domaine ; jamais type ni nation) :

| Détecteur | Rayon | Note |
|---|---|---|
| Territoire | les régions du sol national | déjà « territoire » dans la fiche, non codé : un mouvement dont la polyligne traverse mon sol est relevé. Pas de rayon en km : c'est le sol lui-même. |
| Station d'écoute (bâtiment) | `LISTENING_STATION_RADIUS_KM`, `@a-mesurer` | plus long que `SCOUT_RADIUS_KM` (60), plus court que `INTERCEPTION_RADIUS_KM` (200) — une station voit plus loin qu'une sentinelle et n'intercepte rien. Propose 120. |
| Avant-poste écoute | `OUTPOST_REACH_KM` | son rayon d'action : ce qu'il ravitaille, il l'écoute. |

Un détecteur **désactivé** (avant-poste après raid) n'écoute pas. Une station appartient à une
région : son centre est celui de la région. Le relevé porte quel détecteur a vu (pour la dépêche :
« relevé par la station de Brest » / « par l'avant-poste de Tunis » / « par vos sentinelles »).

**Relais.** Un mouvement **du propriétaire** (jamais un adverse, jamais un allié — il n'y a pas
d'alliés) dont une jambe passe dans le rayon `OUTPOST_REACH_KM` d'un de ses relais actifs
parcourt cette jambe à `RELAY_SPEED_MULTIPLIER` (`@a-mesurer`, propose ×1,5). Le calcul est
dans `src/domain/route-timing.ts`, partagé client/serveur comme le reste du temps de trajet,
pour que l'aperçu dise la même heure d'arrivée que le serveur. Un relais désactivé pendant le vol
ne ralentit pas un mouvement déjà parti (calcul au départ, comme tout le reste) — écris-le dans
le commentaire.

## Ce que tu codes

1. Constantes marquées `@a-mesurer` (le registre existe ou existera — pose le marqueur).
2. `fileSightings` : les trois détecteurs, avec `detector` dans le document `sightings`
   (`'troop' | 'territory' | 'station' | 'outpost'`) et l'id qui va avec. Toujours calculé au
   départ, toujours une table par observateur — ne réintroduis pas un filtre sur `movements`.
3. `route-timing.ts` : le relais ; la mutation et l'aperçu (`preview`) passent les relais actifs
   du joueur au calcul.
4. Front : sur la carte, le rayon d'écoute d'une station et d'un avant-poste écoute se voit
   quand on survole le bâtiment (même trait que le rayon d'avant-poste existant, encre sourde) ;
   la fiche d'un relevé dit son détecteur ; l'aperçu de mouvement dit « relais de … : −N min ».
5. Libellés des bâtiments (`fr.ts`) : la station et les deux spécialisations disent leur rayon en
   km et leur effet en une phrase — aujourd'hui l'invité choisit à l'aveugle.

## Critères d'acceptation

- Tests Convex : un mouvement adverse à 100 km d'une station est relevé, à 150 non ; à 300 km
  d'un avant-poste écoute (reach 400) relevé, désactivé → pas relevé ; un mouvement qui traverse
  mon sol est relevé même sans aucun bâtiment.
- Test domaine : une jambe dans le rayon d'un relais est ×1,5, hors rayon inchangée ; l'aperçu
  et le serveur donnent la même `arrivesAt`.
- Le fan-out reste borné : pas de lecture de `sightings` par filtre sur les mouvements.
- Aucun terme banni. `npm run build`, `npm run test`.

## Ce que tu ne fais pas

Pas d'identification (type/nation restent cachés). Pas d'agent. Tu ne changes pas
`INTERCEPTION_RADIUS_KM` ni `SCOUT_RADIUS_KM`. Le relais n'accélère jamais un adversaire.
