# WorldWarSim — codebase

Jeu de stratégie web asynchrone, carte du monde réel, esthétique presse illustrée 1940.
**La documentation, les décisions et le simulateur vivent dans `WWS/`** — ce dépôt ne
contient que le code.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # types + build
npm run test     # vitest
npm run verifier # miroir local de la CI (types, lint, format, tests, build, simulation)
git config core.hooksPath .githooks   # une fois par clone : active le pre-push
```

## Ce qui existe

Les surfaces 4.1 à 4.4 : le plateau (carte 3D, bandeau nation, rail, panneaux d'angle), le
journal d'événements, et **le flux de mouvement en carte** — panneau de garnison, visée, rose
des vents de mouvement, aperçu d'arc et envoi. Les données
viennent **uniquement** du backend Convex, par la **session et la place** — un compte, une
saison (ADR 0022) : connexion → accueil → salon → saison réelle, carte vierge. Sans session,
toute surface renvoie à `/connexion` (`__root.tsx`) ; sans place, `/plateau` affiche « aucune
partie en cours » et renvoie à l'accueil. Le fixture de démonstration a été retiré. Le backend couvre le hors-saison et
l'état de nation (ADR 0009, 0010). **Trois mouvements terrestres existent côté serveur**
(`convex/movements.ts`) : la marche qui fonde un avant-poste, l'attaque et le raid — plus le
**retour**, que personne n'ordonne et que la résolution crée seule. Pas de naval, pas d'aérien,
pas d'agent. **Le leurre a été codé puis retiré le 29/08/2026** — décision de Pierre, révision
documentée en tête de `WWS/docs/design/04-information.md`. Son littéral survit dans
`convex/validators.ts`, en legacy et jamais réécrit, le temps d'un wipe.

**Le combat existe** : une passe de résolution déterministe, sans aléa, initiative à l'attaquant
(`src/domain/combat.ts` pour la règle, `convex/combat.ts` pour le branchement, table de dégâts et
modificateurs dans `convex/constants.ts`). **Rien ne se bat sans ordre** (ADR 0024 §3, 13/09/2026) :
une passe n'a lieu que si un ordre la vise. La rencontre en route de deux colonnes a disparu, une
marche s'arrête où elle arrive quoi qu'il y ait à 25 km, et `ARRIVAL_RADIUS_KM` a changé de sens —
de déclencheur il est devenu l'**allonge** d'une attaque (`defenceNear`, lu par `engageAt` et par
lui seul). Ce qui reste automatique est la **riposte** : attaqué, un camp se bat toujours, et
l'initiative va à qui a donné l'ordre (ADR 0014). Les neuf
portées sont des placeholders `@a-mesurer`. Un raid gagné **désactive** l'avant-poste, jamais ne le
prend. Chaque engagement laisse un **compte
rendu** que le journal sert en dépêches ; le rejeu visuel attend la surface 4.7 et se construira
sur ce compte rendu, sans re-résoudre.

**Et la table se lit** : l'**abaque de tir** (`src/routes/-plateau/GunneryWindow.tsx`, rangement
dans `src/domain/gunnery.ts`) affiche `DAMAGE_TABLE` **importée, jamais recopiée** — soixante-quinze
couples, une ligne par profil, l'encre dit la bande avant que le chiffre soit lu, le survol donne la
valeur. Depuis la décision 60b il est aussi le **catalogue** : au pli d'une ligne, sprite national,
équipement, coût alliage par marque, formation, effectif nominal, « en service » servi par
`workshop.roster`, fort / faible contre et **la condition en toutes lettres** — « se forme dans une
caserne », « quartier général niveau 2 requis ». C'est ce qui remplace les sections « bloqué :
aucun aérodrome » de l'ancienne fenêtre Production : tout le matériel du jeu se lit **sans rien
posséder**. En lecture seule, et il tient l'entrée de rail que l'onglet « prod. » a libérée.

**Le mouvement s'ordonne depuis la carte, et de nulle part ailleurs** (décisions 12a et 13a,
`WWS/docs/design/propositions/flux-mouvement-en-carte.md`). La fenêtre Troupes, la modale
« Envoi d'un mouvement » et le widget des trajets sont **supprimés**. À leur place : un
**panneau de garnison** qui compose la pile (le clic sur le mât d'un bâtiment de projection et
celui sur une pile qui porte plusieurs troupes ouvrent le même, un seul état de sélection) ; puis
la **visée** : clic droit sur la cible, rose des vents contextuelle, aperçu d'arc et confirmation
« envoyer — irréversible » au bout de l'arc.

**La carte au clic droit agit, la popin lit** (décision Pierre, 30/08). Le clic gauche sur une
troupe seule ouvre le cartouche (`TroopBadge.tsx`, qui ne porte aucun ordre) et **l'arme du même
geste** ; la destination se nomme au clic droit **ailleurs**. La rose ne s'ouvre avec lui que
s'il y a quelque chose à faire **sur place** — fonder un avant-poste, et rien d'autre
aujourd'hui : un bateau désigné n'ouvre donc aucun menu. Deux cibles, jamais un menu mixte : le
sprite rend la rose de la troupe, la région celle du bâti. Il n'y a plus de fenêtre « visée
armée » — le cartouche porte l'état.

**« Voir le pays » a été retiré** (décision Pierre, 31/08) : il doublait le clic gauche, qui
sélectionne déjà ce qu'il touche. La rose ne s'ouvre plus que là où un ordre existe — bâtir,
fonder, marcher — et **le clic droit reste inerte partout ailleurs**, pays et avant-postes
compris. Les types proposés par la rose et ceux que le serveur accepte
sortent de **la même fonction** (`src/domain/movement-orders.ts`) — rien n'est grisé, jamais
(ADR 0015). L'aperçu ne calcule rien : `movements.preview` sert la route
réelle et l'heure d'arrivée, seul le serveur date un mouvement.

**Ce qui a une position ne vit pas dans un panneau** (décision Pierre, 30/08, couche permanente) :
le widget de troupes est **supprimé** et remplacé, bas-gauche, par la carte **« à faire
maintenant »** (`src/routes/-plateau/NextActions.tsx`, règle pure dans
`src/domain/next-actions.ts`). Une ligne par chose qui attend le joueur — poses de fondation
offertes, chantier sans tête de file, bâtiment de projection sans lot, troupe posée sans ordre,
troupe hors ravitaillement, slot de mouvement libre — et chaque ligne recentre la carte ou ouvre
la surface. **Vide, la carte n'existe pas** : il n'y a pas d'état fermé, son absence est l'état
fermé. L'ordre de mobilisation en est devenu la première ligne, dépliable
(`FoundationRows.tsx`) ; la liste complète des troupes est passée dans la fenêtre Nation, où
chaque ligne recentre.

**La détection est passive et suit le rôle** (ADR 0021, révisée le 08/09/2026) : posée ou en
mouvement, une pile relève à la plus grande portée de ses rôles — **le tronçon vu, le cap à la
sortie, un horaire estimé — jamais la destination** (décision 4a du 13/09/2026), un domaine, et
**jamais le type ni la composition, jamais la nation**. Le relevé se réévalue
aux événements et se dénormalise dans la table `sightings` (`observateur, mouvement, tDébut,
tFin`) : chaque joueur lit son propre index, jamais un filtre sur la table des mouvements
(`WWS/docs/technique/brouillard-et-fanout.md`). Une fenêtre à venir est annulable et ne produit ni
arc ni dépêche avant son ouverture ; une fenêtre déjà vue devient la dernière position connue —
le tronçon figé, pion au bout — et **elle survit au mouvement** (ADR 0024 §2, 13/09/2026) : à sa
disparition le tronçon est gelé une dernière fois dans `sightings.frozen`, servi tel quel, et
effacé après `LAST_KNOWN_HOURS` par la réévaluation, qui touche déjà cet index. Elle s'évanouissait
avec la colonne, ce qui faisait de l'arrivée d'un adversaire une information qu'on perdait à
l'instant où elle comptait. Le tronçon et son cap sortent d'une seule fonction pure
(`src/domain/sighting-segment.ts`, `seenSegment`), que l'arc et la dépêche lisent tous deux ; et
« cap sur moi » est devenu une **estimation**, le cap prolongé sur ce qu'il reste à marcher par
pas d'une cellule de grille. Le
relevé se lit sur la carte — le fil adverse y est tracé — et dans le journal, en dépêches. La
station d'écoute et l'avant-poste d'écoute existent aussi ; l'agent dormant et la sonde non.

**Et une force posée se voit dans la portée** (ADR 0024 §1, 13/09/2026, qui révise l'ADR 0019 §6).
Une pile adverse — au sol, en garnison d'un avant-poste ou d'un bâtiment — est relevée par les
mêmes quatre détecteurs et aux mêmes conditions qu'un mouvement, dans la table `campSightings`,
jumelle immobile de `sightings` et lue sur le même index par observateur. Ce qu'elle sert est **une
position, un milieu, deux dates** — jamais la composition, jamais l'effectif, jamais la nation :
l'agent dormant garde son métier, qui est d'**identifier** et non de repérer. Sortie de portée,
elle devient une dernière position connue et s'efface après `LAST_KNOWN_HOURS`. Sur la carte c'est
la **silhouette de domaine** d'un arc adverse (`src/map/engine/silhouettes.ts`, une seule source
pour le pion et pour le mât), en encre sourde, délavée quand le relevé date ; le clic gauche ouvre
un cartouche qui dit ce qu'on sait, le clic droit la seule branche qui existe — attaquer. Sans ce
relevé, le §3 serait injouable : un adversaire camperait chez soi sans que rien ne le dise.

**Le recrutement se fait dans la modale d'un site, et de nulle part ailleurs** (décisions 59a,
60b, 61a du 01/09). La fenêtre Production générale et son onglet « prod. » sont **morts** : le
clic gauche sur une caserne, un aérodrome ou un port ouvre `src/routes/-plateau/SiteModal.tsx`,
qui ne parle que de **ce bâtiment-là** — en-tête (bâtiment, région, niveau, son élévation), les
cartes du **seul domaine du site**, la rangée de cases du plafond (global, `workshop.troopCap`),
la file de ce site seul, et la **garnison**, que la modale absorbe (61a) : composer et armer une
pile s'y fait, le mât n'a plus qu'une destination. `troops.workshop` n'a pas bougé — la modale la
filtre par bâtiment. Il n'y a **aucune section de domaine sans bâtiment** et aucun grisé : la
découverte vit dans l'abaque. Un lot commencé ne porte plus de bouton d'annulation, il porte la
phrase qui dit pourquoi. La composition elle-même est une seule pièce (`GarrisonStack.tsx`),
partagée avec le panneau de garnison d'un avant-poste ou d'une pile posée — deux cadres, un flux.

Cette surface a demandé la **première tranche du schéma de jeu** (`unites`, `recrutements`),
écrite avant la fermeture du 🔴 : c'est une entorse assumée à la règle de `WWS/CLAUDE.md`, pas un
oubli — elle est gravée dans l'ADR 0011. Les coûts et durées de `convex/constants.ts` sont
**arbitraires**, jamais simulés.

**Le télégraphe existe** : un canal général par partie, ouvert dès le salon et fermé sur une
saison conclue (`convex/messages.ts`). Un seul fil (`src/shell/TelegraphThread.tsx`), deux
cadres : une fenêtre qu'on ouvre au plateau, et une section posée à demeure au salon — c'est là
que l'écriture acceptée avant le lancement prend son sens, et le salon n'a ni rail ni badge, donc
il date la lecture en quittant la feuille. Trois bornes,
d'écran et non d'équilibrage (`src/domain/telegraph.ts`) : 300 caractères, un message par seconde
et par joueur, les 200 derniers servis — c'est un fil, pas une archive. Pas de canal privé, pas de
mention, pas de modération. Un tic-tac synthétisé en Web Audio sonne à l'arrivée d'un message des
autres, coupable dans Réglages et muet quand l'onglet est caché ; le badge du rail compte depuis
la dernière fermeture (`telegraphReadAt`, jumeau distinct de `journalReadAt`).

**Le compte possède ses places** (ADR 0022, livré le 11/09/2026). Un pseudo unique et un mot de
passe, sans e-mail : `/connexion` ouvre un dossier ou en reprend un, et l'accueil liste les
parties du **compte** — le même joueur les retrouve depuis un second appareil, ce que le jeton de
partie interdisait. Une seule porte côté serveur (`playerOf`, `convex/seasons.ts`) : un jeton de
session, une saison, et la place que le compte y tient ; chaque fonction de jeu prend
`{ token, seasonId }` et trois refus distincts disent trois choses — `UNKNOWN_SESSION` (on se
reconnecte), `NO_SEAT` (on rentre à l'accueil), `SEASON_GONE`. **Au plus une place par compte et
par saison** (`SEAT_TAKEN`) ; le pseudo se copie sur la place à l'entrée et y est figé pour la
saison. `players.token` est mort avec le wipe du 11/09 — aucune reprise, aucune migration
(décision 85a). La déconnexion se prend aux Réglages du plateau et à l'accueil.

**Le code est en anglais, le jeu reste uniquement francophone** (ADR 0016) : tout texte
affiché passe par la table unique `src/i18n/fr.ts` ; le serveur ne renvoie que des codes
d'erreur (`convex/errors.ts`), jamais une phrase.

Les sprites d'unités sont rangés par nation dans `src/emblems/units/` — **cinq nations sont
dessinées** : le Royaume-Uni et les États-Unis au complet, la France sans cargo, l'URSS sans
porte-avions, l'Allemagne sans avion de transport (le Ju 52 est à refaire). Un rôle sans planche
vaut `null` au manifeste et tombe sur le repli en cadre pointillé, comme les trois nations
restantes. Sur la carte, le jalon d'un mouvement `mien` porte le **véhicule du segment en
cours**, et chaque milieu est habillé par **ses propres unités** (`movementSprites`) : les
bottes majoritaires sur la route, la coque qui les transporte sur l'eau, l'aile qui les emporte
dans le ciel — il change de costume au quai en affichant déjà celui du segment suivant. Un
milieu dont la pile ne porte rien, et tout arc adverse, gardent la silhouette de domaine,
**identifié ou non** — le brouillard interdit structurellement mieux, et la nation sans planche
dessinée retombe sur la même silhouette. La planche est un billboard **lacet + tangage, pivoté
sur son pied** : elle se couche sur le plateau quand la caméra passe à la verticale, au lieu de
disparaître par la tranche, et sa taille est une **aire** constante — à hauteur égale, un
fantassin (planche haute et étroite) devenait un fil quand un bombardier tenait la mer.

**La carte se zoome jusqu'au pays** (littoraux Natural Earth 50m, trame de mer recalculée au
fragment pour rester nette — la mer est plate jusque sous la terre, aucune bande côtière
cuite en texels). Au rapproché (< 65 unités), les **régions admin-1** apparaissent en fondu :
traits intérieurs seulement, survol avec surbrillance teintée par type de terrain, infobulle
nom + type, et accessoires 3D qui poussent sur la région (sapins, dunes, pyramides… —
`src/map/engine/terrain.ts`, graine tirée du nom, taille et nombre suivant l'aire).

**Le type de région** (`regionType`) compte six valeurs — plaine, forêt, jungle, montagne,
désert, toundra — mais **reste un factice** : six régions témoins classées à la main (Oise,
Landes, Amazonas, Valais, Tamanghasset, Chukchi), hachage du nom pour toutes les autres. La
passe réelle est décidée mais pas écrite : classification hors ligne dans
`scripts/generer-regions.mjs` (ETOPO pour le relief, Köppen-Geiger pour aride/polaire/tropical,
landcover grossier pour forêt vs plaine), cuite dans `regions.json` en asset statique. Aucune
règle de jeu ne doit lire le type — s'il doit un jour toucher vitesse ou combat, ADR
obligatoire (la fiche 08 est figée « ni grille, ni terrain » ; le décoratif est libre).
`monde.json` et `regions.json` sont produits par `scripts/generer-monde.mjs` et
`scripts/generer-regions.mjs` — ne jamais les retoucher à la main.

**Le calcul de trajets terrestre/naval/aérien/combiné existe dans `src/domain/routing.ts`**
(ADR 0012) : grille raster, Dijkstra, enroulement est-ouest dans l'adjacence, détroits et
canaux gravés (`SEA_GATES`). **Un canal est de l'eau et un gué** (15/09) : un détroit se grave
en `SEA`, un canal en `CANAL`, troisième type de cellule que la recherche terrestre foule comme
la naval le transite — gravés en mer, Panama coupait les deux Amériques et Suez séparait
l'Afrique de l'Asie. Le milieu d'un pas suit dès lors **ce que la recherche a autorisé** et non
la seule couleur des cellules ; une berge de canal est une côte (Colón, Port-Saïd sont des
ports) ; la 72a tient telle quelle — on débarque d'une cellule de mer, un canal n'est pas une
plage. **Et aucune porte ne découpe une poche de terre** (15/09) : un détroit verse de l'eau là
où il y en a, donc il ne peut pas séparer deux terres qui se touchaient — `landComponentCount`
compte les morceaux de terre avant et après chaque gravure, et le test l'exige égal. Il a fait
sortir deux portes : **Malacca**, tracée dans le Perak et le Pahang, détachait Kuala Lumpur de
la péninsule ; l'**Øresund**, tracé juste, ne tient pas dans le pinceau de trois cellules
d'`engravePassage`. Aucune n'était nécessaire — les deux chenaux sont déjà de l'eau au pas de
la grille. Sept portes restent. **Le serveur l'appelle** (`convex/routes.ts`, un Dijkstra entre 13
et 125 ms) — pour l'instant en mode terrestre seul ; le droit de passage par les pays neutres
n'est toujours pas tranché. **La grille n'est plus calculée en ligne** : `buildGrid` reste la
référence, mais les 1,33 M de cellules sont cuites en plages par `scripts/generate-grid.mjs`
(chaîné par `generate-world.mjs`, `public/grid.json`, 65 Ko) et **décodées à la première
demande** de l'isolat, en 2 ms. Les « 31 ms » étaient mesurées à chaud sur une machine de
développement ; à froid sans JIT elles valaient des secondes, et une query n'a qu'une seconde —
`playerView` lit `afloat` et `coastal` sur cette grille et tombait par intermittence. Trois
garde-fous : l'égalité octet à octet de la cuisson et de `buildGrid`, un espion qui refuse
`buildGrid` dans une query, et le chrono du décodage.

## Architecture

```
src/domain/      TS pur. Aucune importation React ni Convex (sauf src/i18n/fr, ADR 0016). Testé.
src/data/        adaptateur Convex vers PlayerView, session et place, réglages, client Convex.
src/i18n/        table de traduction unique (fr.ts) — tout texte affiché au joueur.
convex/          schéma + fonctions serveur (hors-saison, nation, production, combat). Testé.
src/emblems/     drapeaux, icônes de ressources, sprites d'unités par nation + manifeste typé.
deploiement/     docker compose (backend Convex auto-hébergé + front), guide VPS et CI.
scripts/         générateurs de données cartographiques (monde.json, regions.json).
src/map/         moteur three.js impératif + des composants React qui l'enveloppent.
src/shell/       bandeau + rail, partagés par toutes les surfaces.
src/routes/      une route par surface ; `-dossier/` = composants privés à cette route.
```

**`PlayerView`, jamais `GameState`.** Le client ne reçoit pas le monde, seulement ce qu'un joueur a
le droit d'en voir. Le nom du type est la première défense contre la fuite d'information.

**Les états d'arc sont une union discriminée.** Un arc adverse n'a structurellement ni `type` ni
`stack` — on ne peut pas les afficher par distraction. C'est le brouillard garanti par le
compilateur, pas par la relecture.

**Le moteur de carte n'importe pas React.** Une classe impérative, une API d'appels, une seule
frontière : `WorldMap.tsx`. La géométrie est cuite une fois ; react-three-fiber n'apporterait rien
ici et coûterait un modèle mental de plus.

**La courbure est appliquée côté CPU**, jamais dans un shader : sinon le raycasting vise une
géométrie plate et le clic tombe à côté sur les bords de la carte.

**Stockage unifié livré — 09/09/2026.** Chaque niveau d'entrepôt ajoute
`STORAGE_CAP_PER_LEVEL` aux huit plafonds nationaux, au-dessus de `BASE_CAP`. Le QG ne
porte aucune capacité. Un nouveau `depot` est refusé (`UNKNOWN_BUILDING`) ; un dépôt
historique compte comme un entrepôt et sa vue sert `warehouse`. Son identité, son niveau
et son rattachement restent conservés, sans migration massive ni écrêtage de fusion.
Les chantiers historiques gardent prix, durée et remboursement ; leur fin crée un
`warehouse` avec `buildings.costKey?: 'depot'` pour conserver le tarif historique au
classement et aux élévations suivantes. Les bâtiments déjà `depot` gardent leur clé ;
`costKey ?? key` détermine leur tarif. Le stock reste national. L'interface, le bandeau et le
simulateur ne présentent plus qu'un entrepôt ; une clé `depot` historique reprend son nom et
son sprite. Le miroir vérifie les huit plafonds.

**Le pillage se joue — 10/09/2026.** Une expédition victorieuse tient le site
`PLUNDER_HOURS_PRESENT` (2 h), exige de l'infanterie à la prise, prélève le surplus disponible
avant la désactivation de `PLUNDER_DISABLED_HOURS` (12 h) et l'écrêtage, puis crée un **retour
chargé que personne n'ordonne**. Sur un producteur c'est le même ordre sans butin : la présence,
puis l'arrêt. Les deux durées restent `@a-mesurer`. Le retour vise un plan gravé **avant** la
présence — un seul Dijkstra vers les cellules des régions tenues — et la charge se crédite **au
premier franchissement exact**, une fois, dans la place libre ; la région perdue entre-temps perd
la charge. Une passe borne la charge à la capacité des survivants ; une force entièrement détruite
la cède à la capacité libre du vainqueur (`recoveryId`), et le reliquat tombe en **caisse**
(`lootCrates`, `LOOT_CRATE_HOURS` = 2 h, échéance fixe depuis le combat). Six dépêches — prise,
perte, récupération, ramassage, livraison, sabotage — chez le seul joueur concerné.

**L'ordre part de la carte, et de nulle part ailleurs.** Ce qu'on a relevé chez l'autre se tient
sur la carte — le mât de l'installation au centroïde de sa région, dans le délavé des relevés — et
le clic droit y ouvre **une seule branche**, « piller » sur un entrepôt (le `depot` historique
compris), « saboter » sur les sept producteurs : c'est le même ordre et le même dessin, seul le
verbe change avec ce que l'expédition rapporte. La caisse relevée ouvre « ramasser » ; à capacité
libre nulle il n'y a pas de branche, il y a la phrase qui dit pourquoi. Rien n'est grisé : la rose
et le serveur sortent de **la même fonction** (`plunderOrderRefusalOf`,
`lootCollectionOrderRefusalOf`, `src/domain/movement-orders.ts`), et l'aperçu — durée, capacité
libre, présence sur site, **butin estimé au relevé** — vient de `movements.previewPlunder` et
`previewLootCollection`, jamais d'un stock adverse que le brouillard n'a pas servi. La rumeur, la
caisse et le sabotage sont jugés à la partie à deux (ADR 0005, révisée le 10/09).
**Le contrôle à deux joueurs sur une partie réelle n'a pas été fait** : la preuve tient au
scénario public complet de `convex/plunder.test.ts`.

## Schéma Convex

**Un champ ajouté à une table existante est `v.optional`**, avec un lecteur qui donne le défaut
par `??` — ou bien il s'accompagne d'une migration de backfill. Un champ obligatoire posé sans
migration casse le déploiement en production : les documents déjà écrits ne le portent pas et
la validation du schéma refuse la poussée (vu le 27/08/2026 sur `buildings.seasonId`).

## Conventions

Elles sont dans [CONVENTIONS.md](CONVENTIONS.md) et font autorité. Les quatre qui structurent le
plus le dépôt :

- **Penser local.** Un sous-composant vit à côté de son unique usage ; on ne le remonte que quand un
  deuxième appelant apparaît, et du bon nombre de crans.
- **Pas de commentaire descriptif.** Un commentaire explique un *pourquoi*, jamais un *quoi*.
- **Nommer pour être repris.** Le nom porte l'intention ; `PlayerView` plutôt que `GameState` est
  déjà une décision de sécurité.
- **Tidy first.** Ranger et changer le comportement sont deux commits distincts.
- **Code en anglais, jeu en français.** Identifiants et fichiers en anglais ; tout libellé
  affiché passe par `src/i18n/fr.ts` (ADR 0016).

## Vocabulaire imposé

**mouvement** (pas convoi) · **passe de résolution** (pas tour de combat) · avant-poste **désactivé**
ou **détruit** (jamais pris) · **journal d'événements** · **slot de mouvement**.
Bannis : tick, temps réel, micro, base, rush. Glossaire complet dans `WWS/CONTEXT.md`.

## Ce qui reste

Les surfaces 4.7, 4.8 et 4.9 sont maquettées mais pas implémentées — le rail les affiche
grisées. Les §4.5 et §4.6 de la fiche 11 sont **périmées** : le flux de mouvement en carte a
remplacé la première, la modale de site la seconde (contrats de vue 03 et 06). Ce qui manque
encore au schéma de jeu : l'occupation et les revenus — le pillage, lui, se joue depuis le
10/09. Le dernier point bloquant du design (l'avantage d'isolement géographique) n'est toujours
pas tranché.

**Et un bâtiment ne produit que relié** (ADR 0020 §6, `src/domain/economy.ts` pour la règle —
`isLinked`, une comparaison et rien d'autre). Sa région porte la couleur de son propriétaire ou il
rend zéro : le sol national l'est toujours, une région d'avant-poste l'est tant que le point la
tient, et **un point désactivé décolore** (§7, première application de la règle) donc coupe.
Seuls les sept bâtiments qui produisent sont concernés — quatre extracteurs, trois chaînes ; le
stockage, la projection et le QG ne font rien entrer dans le monde. **Une seule fonction dit la
couleur** (`convex/holding.ts`, `heldOver` → `heldRegions`), et c'est la même pour la carte, le
classement, le relevé et la production : quatre lectures parallèles auraient divergé au premier
raid. Il n'y a **pas de champ `linked` stocké** et pas de cron : la couleur ne bouge qu'à trois
événements — fondation, désactivation, fin de désactivation — et à chacun le serveur **règle les
stocks à l'ancienne couleur avant d'écrire la nouvelle** (`convex/production.ts`), sans quoi la
coupure s'appliquerait rétroactivement aux heures déjà tenues. La fin d'une désactivation est le
seul de ces événements que personne n'ordonne : le raid en prend le rendez-vous, et le règlement
se fait à `disabledUntil` exactement même si le travail se réveille en retard. Au front : le
tampon **« hors réseau »** (un état, pas une action) sur la modale du site et en tête de filière,
où il l'emporte sur « à sec » — un site coupé n'est pas à sec, il est coupé — une ligne au pied de
la colonne QG, une ligne dans « à faire maintenant », et deux dépêches, `productionCut` (alarme,
encre rouge) et `productionRestored`, chez le seul propriétaire : l'adversaire qui a coupé la
frontière le lit sur sa carte. Une chaîne coupée refuse le lot (`SITE_UNLINKED`) mais l'abandonne
toujours. Le recrutement n'est pas touché — une caserne hors réseau forme encore, elle instruit,
elle ne produit pas.

**La carte se colore** (ADR 0020 §1) : une région est *tenue* par le joueur dont un avant-poste
la couvre dans **son** rayon (`outpostReachKm` — 120 / 180 / 240 km aux niveaux 1 / 2 / 3, le
rayon de construction et jamais une seconde constante) ou par la nation dont elle est le sol
d'origine, que rien ne lui prend. La règle est pure
(`src/domain/control.ts`, litige au plus proche, égalité exacte à personne), servie par une
**query à part** (`convex/control.ts`, `control.held`) et jamais par `PlayerView` : la couleur ne
bouge qu'à la fondation ou à la perte d'un avant-poste, quand la vue se réinvalide au moindre pas
d'une colonne. La teinte est **celle du siège**, pas de la nation, et elle reste au loin quand les
frontières de région s'effacent. La production, elle, y est reliée depuis le 07/09 (§6).

**Un joueur voit son dernier relevé, pas la vérité** (ADR 0020 §5). Trois états d'une région :
*vierge* — jamais observée, aucune couleur, inconnue et non pas neutre ; *relevée* — vue à une
date, avec le tenant vu ce jour-là, possiblement faux depuis ; *à jour* — couverte à l'instant par
une de ses portées, ou son propre sol. Le relevé se dénormalise par observateur dans
`regionSightings`, jumeau au sol de `sightings` : **`control.held` ne lit que les lignes du
joueur**, jamais la table des avant-postes — une requête qui filtrerait la vérité se recalculerait
pour tous à chaque fondation (`WWS/docs/technique/brouillard-et-fanout.md`). Ce qui écrit, ce sont
les **événements** et rien d'autre (`convex/surveys.ts`) : pose d'une troupe, fondation d'un
avant-poste, départ d'un mouvement, et le couloir relevé **à l'arrivée**, jamais au départ — il
n'y a pas d'horloge dans ce jeu et on n'en invente pas une ici. Les écritures sont bornées : même
tenant et ligne de moins d'une heure, rien n'est réécrit ; le sol de personne et son propre sol ne
fondent aucune ligne. L'ancienneté se voit **en permanence** — un relevé ancien est délavé
(`surveyWash`, cranté pour que la géométrie fusionnée ne se refonde pas à chaque minute) — et le
survol donne la date en clair, « relevé du 12 août ».

**L'avant-poste se conteste, il ne se prend pas** : un raid gagné le **désactive** pour
`OUTPOST_DISABLED_HOURS`, avec une fenêtre d'immunité derrière — et depuis le 07/09 la
désactivation **décolore sa zone** (§7), donc coupe ce qui y produit et rend au voisin les régions
qu'il disputait. **Elle ne l'efface plus pour autant, depuis le 15/09** : `control.held` sert à son
seul propriétaire une quatrième forme, `suspended`, calculée par la même `heldRegions` lue deux
fois — la carte telle qu'elle est, la carte que ce point debout donnerait, et la différence. La
zone s'y hachure dans l'encre du siège, au plancher du délavage, la trame posée au fragment en
pixels d'écran pour tenir à toute distance et passant **sous** la couleur pleine du voisin qui a
repris une région disputée. Ce n'est pas une couleur : ni le classement, ni la production, ni la
vérité ne la comptent. L'adversaire qui observe la zone la voit décolorée comme avant — l'heure du
retour lui donnerait la durée d'un raid qu'il n'a pas mené (ADR 0005) ; le mât la dit en clair au
propriétaire, et le survol de la zone avec elle. La **destruction** après
plusieurs raids n'existe toujours pas, et rien ne les compte — le pillage est passé sans elle. Il ouvre autour de son point un rayon qui
**suit son niveau** (`outpostReachKm`, révision du 31/08), où l'on bâtit comme chez soi (le puits
en Arabie), et
**héberge la colonne qui l'a fondé** — `stationedAt` accepte un avant-poste, la colonne y devient
garnison, et cette garnison est ce qu'une attaque trouve debout.

**Et il se monte, depuis le 15/09** (précision de l'ADR 0020 §10) : une entrée dans la **même**
file de chantier prépayée (`constructions.raiseOutpost`, clé de coût `outpost` et cible
`constructions.outpostId` — jamais un seizième bâtiment), un prix calé sur le port, une durée,
annulable comme le reste. La porte est le **panneau de garnison du point**, seul cadre qui porte
déjà sa région et son niveau, et les trois phrases « améliorez-le pour en ouvrir un de plus » y
mènent enfin. La règle sort d'**une** fonction pure lue par le bouton et par la mutation
(`outpostRaiseHold`, `src/domain/construction.ts`) : niveau maximal, désactivé, déjà en file,
facture. Sa fin est le **quatrième événement de couleur** — régler à l'ancienne, patcher `level`,
rapporter (`production.ts`) — puisque le rayon suivant relie des bâtiments qui ne l'étaient pas ;
elle relève aussi le sol neuf du cercle. **On ne rénove pas sous le feu** : un point désactivé
refuse, et un chantier déjà en file l'attend sans s'annuler.

**Le quartier général se pose, il n'est plus planté — 13/09/2026** (décision 1b, révision des
ADR 0015 et 0017 §2). Il est la **première dette du socle** (`{ key: 'hq', deposit: null }`,
`foundationFor`) : gratuite, immédiate, au niveau `HQ_LEVEL_AT_LAUNCH`, posée où le joueur veut
**sur son sol national** — capitale de 1940 comprise, mais elle n'a plus rien de spécial. Ce qui
a rouvert la question : une bâtisse par région, donc un gisement sous le QG est un gisement
perdu, et c'est au joueur de choisir ce qu'il sacrifie. `endow` ne plante donc plus rien — ni
QG, ni infanterie, seulement le kit — et **la compagnie d'infanterie naît avec le QG**, en
garnison, jamais à une élévation. Tant qu'il est dû, `constructions.start` refuse toute autre
clé : `HQ_FIRST`, qui **renomme** le refus que `UNLOCKED_AT` produisait déjà (« demande un QG de
niveau 1 » nommait un palier là où il n'y a qu'un ordre de pose). Une dette dont le `deposit`
est `null` s'acquitte quelle que soit la région (`settlesDebt`, `src/domain/economy.ts`, lue par
les deux bouts). `CAPITAL_REGION` survit pour ce qu'elle a toujours été — le seul point qu'on
connaisse d'une nation qui n'a rien bâti : le repli d'une troupe sans adresse (`surveys.ts`,
`movement/arrival.ts`, `movement/detection.ts`, lignes historiques seulement) et le **cadrage
d'ouverture** du plateau d'un joueur sans QG (`me.capitalPoint`).

**Les emplacements suivent le niveau du site** (ADR 0020 §10, `convex/sites.ts`) : le sol
national en porte `2 × niveau de QG`, un avant-poste en porte **son niveau**, et il n'y a plus
aucun total national — `buildingCap` a disparu. La **fondation est hors compte** : pour chaque
clé due par la nation, le premier exemplaire posé chez soi ne coûte pas un emplacement, ce qui
corrige le lancement à zéro placement libre. Le rattachement est écrit **à la pose**
(`buildings.outpostId`, `null` = sol national) et jamais recalculé ; les lignes d'avant se
relisent par la géographie. Un avant-poste détruit laisse ses bâtiments debout et son ancre
morte — on ne peut plus rien y poser. Le frein d'expansion n'est plus un plafond, et **ce n'est
plus l'entretien non plus** : c'est le **prix par niveau** (révision du 15/09 de l'ADR 0020 §10,
ci-dessous). `OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL` a disparu ; un avant-poste debout ne consomme
rien, et seul l'entretien des **troupes** reste. À sec, rien ne meurt.

**Et fonder ouvre un chantier, pas un point** (révision du 15/09 de l'ADR 0020 §10). Poser un
avant-poste coûte `buildCost('outpost', 1)` — débité à l'ordre, refusé par
`INSUFFICIENT_RESOURCE`, annoncé prix et durée sur la branche de la rose, qui lit la même
facture que le serveur (`foundationHold`) — et il reste **en chantier** jusqu'à
`outposts.standsAt`. En chantier, il ne tient rien, n'atteint rien, ne détecte rien, n'offre
aucun emplacement et ne relaie pas : une seule fonction pure le dit à tous ses lecteurs
(`isStanding`, `src/domain/outposts.ts`), même signature qu'un point désactivé pour la couleur,
**sans** l'immunité — on l'attaque. Sa garnison y est stationnée et se relève comme toute force
posée (ADR 0024 §1) ; **elle part entière ou elle tombe, le chantier meurt sans remboursement**
(`convex/outposts.ts`, dépêche `foundationLost`). Le lever est le **cinquième événement de
couleur** — régler à l'ancienne, écrire, rapporter, relever le sol, dépêche `outpostStands` — à
`standsAt` exactement même s'il se réveille en retard. Ce que la fenêtre achète : un voisin peut
répondre, alors que la fondation était le seul geste du jeu sans contre-coup possible.

**La saison se gagne, par un échafaudage assumé.** Une seule condition, publique et nominative :
la **Domination simplifiée** (`src/domain/victory.ts` pour la règle, `convex/victory.ts` pour le
branchement, `REDUCTION_FACTOR` dans `convex/constants.ts`). Un joueur est *réduit* quand sa
capacité tombe sous la moitié de son nominal ; le premier qui en tient `⌈(n−1)/2⌉` sous la barre
**au moment où sa passe la leur fait franchir** prend la saison, qui passe en `concluded` — elle
se relit, elle ne se joue plus, et le wipe reste manuel. **Réduit n'est pas éliminé** : la
capacité se calcule depuis les troupes à l'instant, jamais stockée, donc un joueur qui reconstruit
sort du compte de son bourreau. **La domination est le mode unique** (ADR 0020 §9) : il n'y a plus
de choix de condition de victoire, la fiche 05 est abandonnée et `doctrine` ne survit au schéma
qu'en legacy, jamais écrite ni lue. Ce module a vocation à être **remplacé** par la part de carte
(ADR 0020), pas amendé — aucun champ n'y prépare un territoire.

**On capitule, et on observe** (décision de Pierre, 31/08 ; `convex/players.ts`, `surrender`).
Un joueur dépose les armes : `players.defeated` passe à vrai, irréversible, et **une seule porte
le lit** — `requirePlayable(player, season)`, par où passait déjà chaque mutation de jeu. Le
télégraphe, lui, ne l'a jamais demandée : un observateur parle. Ce que la capitulation
**n'éteint pas** est l'essentiel — ses troupes posées tiennent et ripostent (une garnison n'a pas
besoin d'ordre, ADR 0019), ses avant-postes gardent son encre, son stock
s'épuise, et il reste pillable. **Sa vue reste la sienne** (décision 47a) : `PlayerView` se
calcule comme avant, portée par ses détecteurs restants et figée à mesure qu'ils tombent — lever
le brouillard ferait de la reddition un acte de renseignement au profit d'un survivant ami. La
capitulation est aussi l'événement qui manquait au **transfert du commandement** : le titre de
fondateur passe au plus ancien joueur non défait, et s'il ne reste qu'un belligérant debout la
saison se conclut par la sortie commune, à son nom — une victoire, pas une clôture
administrative. Au front : « Défaite : observer » à l'accueil, un cachet au bandeau, plus aucune
rose au clic droit, la carte « à faire maintenant » absente, les boutons d'action retirés plutôt
que grisés, et le bouton « déposer les armes » rangé dans Réglages à côté de « clore la saison ».

**La presse paraît toutes les trois heures, et le classement ne bouge pas entre deux** (décision
80 du 06/09, qui révise les 2 h de la 43 ; spec `propositions/classement-bareme.md`, contrat de
vue 07). Un travail serveur qui se replanifie (`convex/press.ts`, `PRESS_EDITION_HOURS = 3`) écrit
une ligne par joueur dans `editions` — territoire, industrie, puissance militaire, faits d'armes,
général — et dépose chez chacun une dépêche `editionPublished` qui ne dit que **son** rang. Le
barème est pur et testé sans base (`src/domain/standings.ts`) et **ne crée aucune table** : les
trois catégories chiffrées se mesurent en **alliage payé**, lu dans `buildCost` et `COST_BY_ROLE`
— un bâtiment vaut la somme des niveaux gravis, une troupe son prix au prorata de ses points de
vie, un bâtiment sous un avant-poste désactivé vaut zéro tant qu'il l'est. Le territoire est une
**part** (régions tenues ÷ régions tenues par quelqu'un, ADR 0020 §2), le général vaut
`industrie + militaire` sans coefficient, et les faits d'armes n'y entrent pas — un compteur
d'activité additionné à de l'alliage n'a pas d'unité. **`playerView` sert la dernière édition,
jamais un recalcul** : recruter entre deux éditions ne déplace pas un chiffre de la page, et c'est
tout le dispositif. Le cloisonnement est dans la forme servie — l'industrie et le militaire d'un
autre joueur **ne sortent pas du serveur** (la ligne n'a pas les champs), le général et le
territoire sont **exacts** : ce que le brouillard protège est *où* est la force, jamais *combien*.
La fenêtre Presse au rail liste par territoire (rang · drapeau · nation · pseudo · % · général ·
faits d'armes, tri de lecture sur les trois colonnes chiffrées), un défait y reste à son rang,
estompé et tamponné ; la fenêtre Nation gagne « nos registres », le seul endroit du jeu où le
détail existe, chaque chiffre avec sa variation depuis l'édition précédente. `concludeSeason`
écrit une **édition finale** avant de fermer, et rien ne suit : elle tient lieu d'écran de fin.
Pas de graphique, pas d'historique, pas de compte de régions.

**Et un fondateur qui ne revient plus ne gèle plus la saison** (décision 1a du 06/09) : le plateau
écrit une présence (`players.touch`, au montage puis toutes les `PRESENCE_THROTTLE_MIN` minutes), et
passé `FOUNDER_ABSENCE_HOURS` sans l'avoir vu, le **doyen des belligérants non défaits** clôt à sa
place (`concludeRefusal`, lue par la mutation et par la vue — le bouton est là ou il n'y est pas).
Le titre ne bouge pas, `destroy` reste au seul fondateur, et `lastSeenAt` ne sort de `playerView`
que pour lui, en durée et près du seuil : une « dernière connexion » adverse serait un canal sur les
plages de repos (ADR 0005).

**Ni terrain, ni tenaille, ni soin.** Le modificateur de terrain attend l'ADR qui autorise une
règle à lire `RegionType` ; la tenaille attend une définition de la convergence ; une troupe
entamée reste entamée — la boucle de soin attend la pharmacie et `consommation-continue.md`.

Avant de coder une surface, **lire `WWS/docs/design/11-brief-ui.md`** : chaque écran 4.x y est
spécifié. L'oublier coûte une réécriture.

## Instructions

Les tâches de développement travaillent directement dans le dépôt monté sous WSL. Ne crée pas de
worktree séparé sauf demande explicite de Pierre (préférence du 08/09/2026).

Git : 
Ne commit pas
Ne push pas

Utilise git seulement pour de l'exploration si besoin
