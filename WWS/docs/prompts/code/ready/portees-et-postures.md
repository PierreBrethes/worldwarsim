# portees-et-postures — ADR 0021 §1-§4 et §6 : la portée, le contact réévalué, la posture

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, **l'ADR 0021 en entier**, l'ADR 0018 §3 et
§5 (révisés), l'ADR 0019 §5, `convex/movement/detection.ts` (`scheduleInterception`,
`fileSightings`, `watchersAgainst`), `convex/movement/forces.ts` (`postedForces`, `defenceOf`,
`stanceOf`), `src/domain/interception.ts` (`firstInterception`, `Watcher`, `Sighting`),
`convex/constants.ts` autour de `INTERCEPTION_RADIUS_KM`, `SCOUT_RADIUS_KM`,
`LISTENING_STATION_RADIUS_KM`, `convex/schema.ts` (`movements`, `sightings.detector`),
`WWS/docs/technique/brouillard-et-fanout.md`, `src/routes/-plateau/MovementPreview.tsx`,
`src/domain/compass-rose.ts`, `WWS/docs/design/contrats-de-vue/06-abaque-catalogue.md` (l'œil
« portée », 68a). Ne commit pas, ne push pas. **Un chantier, un commit** — la salve d'allonge
(§5) est le prompt suivant, ne la prépare pas. Suppose `production-reliee` livré ou non.

## La règle (ADR 0021, à relire avant chaque décision)

Une seule notion : la **portée de détection**. Un joueur voit ce qui entre dans une de ses
portées. Le contact se **réévalue en route**, il n'est plus calculé une fois au départ. Le
contact n'est pas le combat : **seule une force en posture offensive engage**. Trois postures par
mouvement, chacune se paie.

## Ce qui change

1. **Portées par rôle** — `DETECTION_RANGE_KM: Record<UnitRole, number>` dans `constants.ts`,
   toutes `@a-mesurer` (points de départ : infanterie 60 = l'ancien `SCOUT_RADIUS_KM`, blindé 60,
   transports 40, chasseur 150, bombardier 100, transport aérien 80, escorte 120, cargo 60,
   porte-avions 200) ; la portée d'une force = **la plus longue de ses troupes**. La station
   d'écoute garde `LISTENING_STATION_RADIUS_KM` (120) comme portée posée au sol (§6) ; l'avant-
   poste n'en a pas (il tient, il ne voit pas — ADR 0020 §8 dit « posée au sol », c'est la
   station). **`INTERCEPTION_RADIUS_KM` et `SCOUT_RADIUS_KM` disparaissent** ; `a-mesurer.md` se
   régénère.
2. **Voir** = la distance entre les deux forces ≤ **ma** portée (pas la somme des deux — « ce qui
   entre dans une de mes portées », §1). Le **contact** = l'un des deux voit l'autre. En posture
   discrète, ma portée **et** la distance à laquelle on me voit sont multipliées par
   `DISCREET_RANGE_FACTOR = 0.5` (`@a-mesurer`, facteur unique — question ouverte de l'ADR
   tranchée au plus simple).
3. **Réévaluation** — le contact se recalcule **à chaque événement qui change le plateau** de la
   saison : départ d'un mouvement, arrivée, retour, troupe posée ou rentrée, avant-poste
   fondé/désactivé, changement de posture (jamais en route — voir 5). Une fonction
   `reassessContacts(ctx, seasonId)` : pour chaque mouvement en vol, annule son job
   d'interception planifié (`movements.interceptJobId`, `ctx.scheduler.cancel`) et le
   replanifie au premier contact **engageant** à venir, à partir de maintenant. Pas de cron ;
   c'est la grammaire « un job par événement » de `architecture.md`. `fileSightings` se
   réexécute de même : un relevé se **crée** pour un observateur qui n'existait pas au départ —
   la phrase « une sentinelle ne voit que ce qui part après elle » (widget, `fr.ts`) **disparaît**,
   elle est devenue fausse (ADR 0021, conséquences). `except: aim.outpostId` (ADR 0018 §3) reste.
4. **Posture** — `movements.stance: 'offensive' | 'defensive' | 'discreet'`, défaut porté par
   l'ordre (`src/domain/movement-orders.ts`, une seule table) : attaque/raid → offensive, marche
   → défensive, retour/rappel → discrète. **Engage** au contact : la force en vol offensive qui
   voit l'autre ; **et rien d'autre** — une troupe posée ou en garnison n'intercepte plus ce qui
   passe (§3 : elle défend sa région, à l'arrivée — `defenceOf` inchangé). ⚠ C'est un retrait de
   comportement : aujourd'hui une garnison posée attrape à 200 km ; à lire dans `CLAUDE.md`
   comme une révision, pas un bug. Deux forces en vol toutes deux offensives : la passe
   d'interception existante, initiative à celle qui a vu la première (départage par la portée,
   puis par l'heure de départ — jamais par un id).
5. **Changer de posture** : avant l'envoi seulement — dans l'aperçu de mouvement, trois branches
   dans la rose en visée ou un sélecteur dans `MovementPreview` (design a la main, voir fin) ;
   **interdit une fois parti** (question ouverte de l'ADR, réponse la plus asynchrone).
6. **Lisible sur la carte** (conséquence de l'ADR) : la portée de la troupe ou de la pile
   sélectionnée et celle d'un mouvement à moi se dessinent en cercle (encre du siège, pointillé
   pour la discrète) — la mienne seulement, jamais celle d'un adversaire. L'abaque reçoit l'œil
   « portée » dans la fiche dépliée (68a, contrat 06 : donnée désormais servie, même mécanique
   de popin que lingot/horloge/cœur). Le relevé (`sightings`) porte déjà `detector` — il gagne
   la portée qui l'a vu, rien de plus.

## Ce que ce prompt ne fait pas

Pas de salve d'allonge (§5, prompt suivant). Pas de portée pour l'avant-poste ni le QG. Pas de
posture pour une troupe posée (toujours défensive). Aucun changement à `resolveEngagement`
(ADR 0018 §1-2-4) : les 75 couples de `combat.test.ts` repassent tels quels.

## Cas d'acceptation (tests d'abord — 53a)

1. Étant donné une colonne A offensive (portée 60) et une colonne B défensive (portée 60) dont
   les routes se croisent à 30 km, un engagement est planifié au premier point où A voit B ;
   les deux défensives → aucun engagement, mais **chacune relève l'autre** (`sightings` des deux
   côtés).
2. Étant donné A discrète (portée 30 effective, vue à 30) croisant une garnison posée adverse
   à 45 km : aucun relevé, aucun engagement ; à 25 km : relevé chez l'adversaire, aucun
   engagement (la garnison n'engage pas — §3).
3. Étant donné un mouvement parti à T sans aucun observateur, une troupe adverse posée à T+1 h
   sur sa route → un relevé existe après `reassessContacts`, avec `tDébut ≥ T+1 h`.
4. Étant donné une colonne offensive en vol et une seconde colonne adverse offensive qui part
   après elle vers son chemin : l'engagement se planifie chez les deux à la même heure, une
   seule passe (`interceptJobId` de l'une annulé et remplacé, pas doublé — test sur le nombre de
   jobs planifiés).
5. Le raid vers un avant-poste n'engage jamais sa propre cible en route (`except` intact).
6. `movements.march` refuse une posture qui n'est pas dans l'union ; le défaut est celui de
   l'ordre ; la rose et le serveur lisent la même table.
7. `playerView` ne sert jamais la portée ni la posture d'un mouvement adverse (`ArcView` reste
   une union sans ces champs).
8. Budget : la réévaluation à 8 joueurs × slots pleins reste sous le seuil de
   `view-budget.test.ts` ; un test mesure le nombre de lectures de `reassessContacts`.

`npm run verifier` vert. Mets à jour `CLAUDE.md` (le paragraphe « une seule détection existe »
est à réécrire entier), `WWS/CONTEXT.md` (posture, portée déjà au vocabulaire — vérifie),
`QUESTIONS.md` (« le rayon d'interception » et « peut-on refuser le combat ? » se ferment),
`RESTE-A-CODER.md`. **Design** : si le sélecteur de posture ne tient pas dans l'aperçu sans un
huitième geste, dis-le dans le rapport au lieu de l'inventer — un contrat de vue suivra.
