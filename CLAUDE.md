# La Manchette — codebase (nom de code worldwarsim)

Jeu de stratégie web asynchrone, carte du monde réel, esthétique presse illustrée 1940.
**La documentation, les décisions et le simulateur vivent dans `WWS/`** — ce dépôt ne
contient que le code. **Le nom affiché du jeu vit dans `fr.masthead` et nulle part ailleurs** ;
`worldwarsim` reste le nom de code (dépôt, paquet, Convex, domaine, clés de stockage).

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

**Le combat existe, et les deux camps tirent en même temps** (ADR 0014, révision 1b du
16/09/2026) : une passe de résolution déterministe, sans aléa, **une salve de chaque camp calculée
sur l'état d'avant la passe**, les pertes appliquées ensemble et la déroute lue une seule fois
après — donc **un défenseur détruit dans la passe a tiré quand même** (`src/domain/combat.ts` pour
la règle, `convex/combat.ts` pour le branchement, table de dégâts et modificateurs dans
`convex/constants.ts`). Il n'y a plus d'initiative ni de phase « riposte » : `Strike.phase` vaut
toujours `'strike'`, le littéral `'riposte'` survit au seul validateur, legacy comme `decoy`, et
c'est `bySide` qui dit qui a tiré. `DEFENDER_BONUS` devient le seul avantage de la défense —
cinquante fantassins contre cinquante en plaine, le défenseur perd 25 et l'attaquant 29 : l'attaque
ne vaut qu'en supériorité ou en surprise. **Rien ne se bat sans ordre** (ADR 0024 §3, 13/09/2026) :
une passe n'a lieu que si un ordre la vise. La rencontre en route de deux colonnes a disparu, une
marche s'arrête où elle arrive quoi qu'il y ait à 25 km, et `ARRIVAL_RADIUS_KM` a changé de sens —
de déclencheur il est devenu l'**allonge** d'une attaque (`defenceNear`, lu par `engageAt` et par
lui seul). Ce qui reste automatique est la **réponse** : attaqué, un camp se bat toujours, sans
que personne l'ordonne (ADR 0024 §3). Les neuf
portées sont des placeholders `@a-mesurer`. Un raid gagné **désactive** l'avant-poste, jamais ne le
prend. Chaque engagement laisse un **compte
rendu** que le journal sert en dépêches, et **ce compte rendu se rejoue** (surface 4.7, ADR 0026
§7, 13/10/2026) : « rejouer » sur la dépêche d'un combat à soi — marge du journal, sa manchette
au téléphone, feuille d'arrivée — et nulle part ailleurs ; une dizaine de secondes sur la carte,
sans re-résoudre (`replay.replayOf`, `src/routes/-plateau/ReplayDeck.tsx`), un bandeau qui coupe
la lecture et avance étape par étape, la carte muette jusqu'à « quitter », qui se confirme et
rend la caméra. Chez soi des figurines par rôle ; en face **un bloc par troupe et des totaux**,
jamais un rôle — le brouillard ne se lève pas parce qu'on a tiré.

**Et un cargo peut rester en mer avec des unités dedans** (décision de Pierre, 18/09/2026, qui
révise la 72a du 04/09 — bannières dans les ADR 0019 §2 et 0012). Une colonne embarquée
(terre + mer) vise **un point de mer** comme elle vise une plage : elle y arrive, coques et
passagers à la même adresse, et elle y reste — être à bord demeure un état calculé
(`StackRow.carrier`), aucun champ de plus. L'intérieur des terres reste refusé
(`LANDING_NEEDS_A_COAST`) parce que la jambe terrestre après la mer n'existe toujours pas, et le
débarquement reste une opération qu'on vise. **Elle repart par sa coque, ou elle ne repart pas** :
sans rien qui flotte sous elle, `NO_HULL_AT_SEA` — le *mouvement fantôme* dit à voix haute faute
de pouvoir être empêché, puisque c'est le joueur qui fait partir son transport seul. **Le large
prend ce qu'il n'y a plus de banc pour porter** : après toute passe à un point de mer, une troupe
terrestre que la capacité des coques **debout** ne couvre plus est **détruite** — pas déroutée, il
n'y a rien où se replier ; une coque déroutée emporte ses passagers à sa capacité et l'excédent
coule (`drownedOf`, `src/domain/combat.ts`, pure et testée seule ; le siège est celui de
`stackRows`, pas une seconde arithmétique de places). Les issues de la passe sont **amendées une
fois** dans `convex/combat.ts` et c'est la liste amendée qui descend partout — compte de
l'engagement, charges, réduction, repliés —, sans quoi un noyé marcherait jusqu'à son ancrage.
Dépêche `drownedAtSea` chez le seul propriétaire, en hommes et en machines, la place nommée en
degrés. **On ne vit pas en mer** : aucun ravitaillement (`UPKEEP_UNSUPPLIED_MULTIPLIER`, et ce
n'était pas déjà le cas — un rayon de point côtier couvrait l'eau devant lui), et on n'y fonde pas
(`NO_FOUNDING_AT_SEA`, le large passait *parce que* le sol de personne satisfait la seule condition
de la fondation). Un **camp relevé porte son milieu** depuis ce lot (`onLand`, `coastal` sur la
visée) : sans cela une pile mouillée était une cible qu'aucune flotte ne pouvait viser, et la règle
du noyé n'avait aucune passe où s'appliquer. Ce que la carte en dit est une silhouette de coque et
rien de la cargaison (ADR 0024 §1) — **un cargo vide et un cargo plein sont indiscernables du
dehors**, le gain de leurre que l'ADR 0014 annonçait et que ce lot rend réel.

**Et l'on embarque par proximité — 08/10/2026** (ADR 0025). Un transport a une **capacité**
(cargo 12, porte-avions 6, transport aérien 2), une troupe terrestre un **encombrement**
(infanterie 1, camion 2, blindé 3), en places ; une troupe s'assoit dans **un seul** transport
(`strandedIn`, lu sur `stackRows`), donc un blindé ne vole jamais. **Embarquer n'est pas un
mouvement** : la troupe prend l'adresse d'un transport posé à moins de `BOARDING_RADIUS_KM` (50),
sur-le-champ et sans slot (`movements.board`) — par air dans un aérodrome seulement, et une colonne
qui vole des passagers ne descend que dans un de ses aérodromes (`AIRFIELD_TARGET_REQUIRED`). La
rose et la mutation lisent `boardingRefusalOf`. La branche « embarquer » (l'ancre) s'ouvre sur le
transport, sur son mât, et sur la pile qu'on tient : ce dernier chemin sert quand les étiquettes
se serrent. Le port et l'aérodrome s'ouvrent à toute troupe terrestre ; le camion garde son
rendez-vous en marche (`joinTransport`), parce qu'il motorise et ne fait rien traverser.

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
ADR 0026 §6). On **lève** une pile, on la **pose** : une seule main au plateau (`Hand`), dont
dérivent la colonne armée et la pièce que porte le moteur, et une seule règle pour les clics sur
ses piles (`clickPile`, `src/domain/hand.ts` — lever, reposer, ou viser l'autre pile). Un bâtiment
ou un avant-poste n'a pas de figurines : son **panneau de garnison** compose la pile et
« préparer » la met dans la même main. Pointeur arrêté, `movements.preview` trace la route et
l'heure du premier ordre — sur le sol comme sur un mât, un camp ou un objectif, dont
l'étiquette relaie l'arrêt que la toile ne voit pas ; la pose ouvre la rose au point de pose, ou passe droit à
« envoyer — irréversible » s'il n'y a qu'un ordre (`soleOrderOf`). Échap, un clic sur la pièce, ou
la rose et l'aperçu refermés la reposent.

**La fiche lit, la carte agit** (décision Pierre, 30/08, révisée par l'ADR 0026 §6). Pièce en
main, la **fiche au bord** (`HandSheet.tsx`) reprend les cases de `GarrisonStack` et compose la
main sans la lâcher ; elle ne porte qu'un ordre, **« fonder un avant-poste ici »**, la branche
même que la rose de la pile offrirait (même prix, même motif, rien de grisé) — sans quoi le
toucher, qui ne fait plus que lever, n'avait plus de chemin vers la fondation. Le cartouche `TroopBadge` et la feuille de visée
du téléphone sont **supprimés**. Le bouton « agir » garde la rose sur place — fonder sur sa pile,
bâtir sur sa région. Au toucher, un tap lève, un tap sur la carte pose, un tap sur la pièce
repose.

**Et quel bouton agit est une préférence, pas une règle** (retour de la partie du 11/09,
`src/domain/mouse-mapping.ts`). La grammaire ne bouge pas — un bouton oriente, un bouton déplace,
un bouton agit — mais les trois métiers se permutent sur les trois boutons dans les Réglages : le
défaut reste la décision du 30/08, et le preset « molette agit » met la rose au clic molette et la
carte au clic droit. **Un seul endroit traduit un bouton en rôle** (`roleOf`, un test l'exige par
grep sur `src/map`), sans quoi permuter deux boutons n'en déplacerait qu'un. Quatre invariants ne
se règlent pas : le clic net gauche sélectionne et lit, `espace + glisser gauche` déplace, `agir`
est un clic net quand les deux autres sont des glissers, et le menu du navigateur est coupé quel
que soit le bouton. Le réglage vit dans `localStorage` — c'est la main du joueur, pas la partie —
et s'applique sans rechargement ; un glisser en cours garde son rôle jusqu'au relâchement. La
fiche `?`, le bandeau de première fois et l'aide-mémoire nomment le bouton courant
(`fr.mapUi.gestures` est une fonction du mappage) : aucune phrase du jeu n'écrit « clic droit ».

**« Voir le pays » a été retiré** (décision Pierre, 31/08) : il doublait le clic gauche, qui
sélectionne déjà ce qu'il touche. La rose ne s'ouvre plus que là où un ordre existe — bâtir,
fonder, marcher — et **le clic droit reste inerte partout ailleurs**, pays et avant-postes
**adverses** compris. **Un point à soi, lui, se commande au clic droit depuis le 16/09**
(décision de Pierre, Registre 27) : sans pile armée la plate porte « élever » — la mutation même
du panneau de garnison, arbitrée par `outpostRaiseHold` —, les **deux** métiers avec celui en
cours *marqué* et non grisé, et « démanteler » en dernier, en rouge, avec sa carte de
confirmation ; avec une pile armée, une seule branche, « entrer en garnison »
(`movements.enterOutpost`), l'assaut et le raid restant refusés `FRIENDLY_TARGET` sur les siens. Les types proposés par la rose et ceux que le serveur accepte
sortent de **la même fonction** (`src/domain/movement-orders.ts`) — rien n'est grisé, jamais
(ADR 0015). L'aperçu ne calcule rien : `movements.preview` sert la route
réelle et l'heure d'arrivée, seul le serveur date un mouvement.

**Ce qui a une position ne vit pas dans un panneau** (décision Pierre, 30/08, couche permanente) :
le widget de troupes est **supprimé** et remplacé, bas-gauche, par la carte **« à faire
maintenant »** (`src/routes/-plateau/NextActions.tsx`, règle pure dans
`src/domain/next-actions.ts`). Une ligne par chose qui attend le joueur — poses de fondation
offertes, chantier sans tête de file, bâtiment de projection sans lot, troupe posée sans ordre,
troupe hors ravitaillement, slot de mouvement libre — et chaque ligne recentre la carte ou ouvre
la surface. **Vide, la carte n'existe pas** ; pleine, elle se replie sur son
titre et tient aux trois quarts de l'échelle au bureau (décision Pierre, 10/10/2026 — elle
prenait l'écran). L'ordre de mobilisation en est devenu la première ligne (`FoundationRows.tsx`),
dépliable au téléphone seulement ; la liste complète des troupes est passée dans la fenêtre Nation, où
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
partie interdisait. Une seule porte côté serveur (`playerOf`, `convex/seats.ts`) : un jeton de
session, une saison, et la place que le compte y tient ; chaque fonction de jeu prend
`{ token, seasonId }` et trois refus distincts disent trois choses — `UNKNOWN_SESSION` (on se
reconnecte), `NO_SEAT` (on rentre à l'accueil), `SEASON_GONE`. **Au plus une place par compte et
par saison** (`SEAT_TAKEN`) ; le pseudo se copie sur la place à l'entrée et y est figé pour la
saison. `players.token` est mort avec le wipe du 11/09 — aucune reprise, aucune migration
(décision 85a). La déconnexion se prend aux Réglages du plateau et à l'accueil.

**Et une session se garde comme un secret — 05/10/2026** (`convex/sessions.ts`). La table ne
porte plus le jeton mais son **empreinte** (SHA-256, `sessions.hashed`) : une base qui fuit
n'ouvre rien. Une ligne d'avant, encore en clair, se relit par son jeton et se convertit à sa
première écriture — personne n'est déconnecté. Une session **expire après trente jours sans
servir** (`SESSION_IDLE_MS`) ; c'est le plateau ouvert qui la tient en vie (`players.touch` →
`refreshSession`, une écriture par jour au plus), et le ménage se fait à la connexion suivante.
« Déconnecter les autres appareils », aux Réglages, ferme les autres sessions du compte **et**
leurs abonnements aux notifications (`accounts.logoutOthers`). La connexion n'examine qu'**une
tentative toutes les trois secondes par pseudo** (`LOGIN_TOO_FAST`, `LOGIN_MIN_INTERVAL_MS`) :
une pause et jamais un verrouillage — les pseudos sont publics, et une tentative refusée ne
repousse pas la suivante. Elle ne protège pas le CPU d'essais sur des pseudos inconnus : cela
reste l'affaire d'une limite par IP au proxy.

**Et une invitation est un lien** (02/10/2026, lot A du plan marque et site) : `/rejoindre/CODE`,
publique — la porte de `__root.tsx` l'ouvre par la **même** condition que `/connexion`
(`opensWithoutAccount`). La page lit `seasons.invitation`, une query **sans session obligatoire**
qui ne rend jamais d'exception (un code inconnu est `refusal: 'UNKNOWN_GAME_CODE'`, sans requête
si le code ne peut pas en être un) et ne donne le `seasonId` qu'à un jeton qui tient déjà une
place (`seated`) : le code reste le seul secret du salon. **Les refus de `join` et ceux de
l'invitation sortent d'une seule fonction** (`joinRefusalOf`, `src/domain/off-season.ts` : place
tenue, saison close, fenêtre, nation, plafond) — l'écran annonce ce que le serveur refuse. Le
formulaire de compte est partagé (`src/shell/AccountForm.tsx`) ; l'inscription enchaîne
`register` → `keepSession` → `join` → salon, et si `join` refuse entre-temps le compte est gardé
sans place — la page le dit, sans retour en arrière. Le salon copie
`${origin}/rejoindre/${code}` ; reprendre une place passe par `resumeSeat` depuis l'accueil comme
depuis l'invitation. Pas d'aperçu de lien : il porterait un nom qui va changer.

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

**Et au rapproché, mes pièces sont des figurines** (ADR 0026, lots 1 et 2 — 12-13/10/2026).
Sous 30 unités de distance, la planche rétrécit et une figurine 3D pousse à sa place ; au-delà
de 65, la planche seule (`nearWeight`, les seuils des régions admin-1). **Une seule entrée** :
`figurineFor(nation, rôle, marques)` (`src/map/engine/figurines/figurine.ts`) rend les GLB du
manifeste `src/emblems/figurines/` — un homme par marque pour l'infanterie, posé par ses
articulations nommées (`squadOf`), un modèle pour le reste — ou `null` dès qu'une marque n'a pas
de fichier : rien plutôt que la mauvaise figurine. Les GLB sortent de Claude Design sur un
gabarit commun (y en haut, avant vers +z, origine au sol, longueur de la planche, pièces
nommées, repères `fx_*`) ; `glb.test.ts` tient chaque fichier listé au plafond de triangles et
aux noms de son rôle. La France et l'Allemagne sont sculptées ; il manque le R35
(blindé MK1 français) et le Ju 52 (transport aérien allemand). Seul le MK1 de l'infanterie
marche : un MK2 garde la pose où il a été sculpté (le bazooka français à genou). Le **pion d'un mouvement `mien`** porte sa figurine sur le fil, tournée vers sa
route ; les arcs adverses n'en ont jamais (`movementRoles` rend `null` hors `mine`). Une **pile
posée** à un point se lit en groupes (`pilePieces`, `src/domain/pile-pieces.ts` : un groupe par
rôle, trois au plus et un jeton « +N », jeton « ×N », 3/2/1 hommes par tiers de force, seules
les marques présentes), dessinés par `src/map/engine/standing.ts` ; elle n'est **habillée que si
tous ses groupes ont leur figurine et qu'elles sont chargées** — sinon elle garde sa planche
entière. Habillée, son étiquette DOM efface sa planche et reste l'emprise du clic et du survol ;
le survol ouvre la **fiche** (`PileSheet.tsx`, vie sur 100 en dix crans, charge). **Et toute
pièce se lit au survol en affiche** (13/10/2026, gabarit `.card`/`.fiche` du prototype
`table-etat-major.html`) : ma pile (la fiche), mon mouvement (trajet, heure, barre ocre), mon
bâtiment (production, « relié »/« hors réseau », chantier ou lot), un relevé adverse (délavé, une
heure, « composition inconnue, nation inconnue » — rien que ce que l'arc sert) et un objectif
(palier, dépôt). Ce qu'elle dit sort d'**une** fonction pure, `posterOf`
(`src/domain/map-poster.ts`) ; le dessin est une seule pièce (`MapPoster.tsx`) que la couche des
étiquettes tient au-dessus de la pièce et fait suivre la caméra (`PosterLayer`, `MapLabels.tsx`).
Souris seulement — au toucher, le tap lit déjà et ouvre ce que la pièce ouvre ; un clic la ferme,
pour ne pas doubler la surface qu'il ouvre ; elle efface le cartouche le temps du survol. La page
`/figurines.html`, servie en développement seulement, montre chaque figurine à côté de sa
planche. Un arc adverse porte un **bloc** de son milieu, dos à l'œil, et une dernière position
connue un **bloc délavé** au bout de son tronçon figé (`lastKnownMedium`, `arcs.ts`) — rien de plus
que le milieu servi. Au rapproché, le pion dit son milieu : une coque en mer laisse un **sillage**
(`Wake`, `smoke.ts`), un avion porte son **ombre** au sol, l'écart valant son altitude — le fil
aérien d'une route tout aérienne monte, tient sa croisière et redescend (`flightAltitude`,
`thread.ts`) ; un véhicule entamé de mes mouvements **fume** comme posé (`movementWear`, lu sur
mes troupes, `null` hors `mine`). Les garnisons de bâtiment sont le lot suivant.

**La carte se zoome jusqu'au pays** (littoraux Natural Earth 50m, trame de mer recalculée au
fragment pour rester nette — la mer est plate jusque sous la terre, aucune bande côtière
cuite en texels). Au rapproché (< 65 unités), les **régions admin-1** apparaissent en fondu :
traits intérieurs seulement, survol avec surbrillance teintée par type de terrain, infobulle
nom + type, et des **pictogrammes de cartographe tracés à la plume** dans la région — sapins,
monts hachurés, dunes, palmiers, touffes, blés —, du centre vers les bords, effacés en fondu
quand on la quitte (`src/map/engine/terrain.ts`, une table `PICTOGRAMS` où chaque dessin se
change seul ; graine tirée de l'identifiant, taille et nombre suivant l'aire). Ils ont remplacé
les accessoires 3D le 13/10. **Au téléphone, il n'y a pas de survol** : un tap qui sélectionne lit la région
sous le doigt une fois (`regionTapped`, `updateHover`) et la même plume la trace ; elle s'efface au
prochain tap ou quand la sélection part. La feuille du sol s'ouvre alors à l'aperçu, compacte
(`Panel compact`, `GroundPanel`).

**Et la carte s'allège pour que les pièces ressortent — 13/10/2026.** Le bord de l'écran ne
porte plus qu'**un jeton par bord et par sorte**, avec son compte, posé à la moyenne de ses
membres (`cluster`, `src/domain/indicators.ts`) ; un clic recentre sur **le plus proche** du
groupe (`nearest`) — cadrer tout un bord de gisements renverrait à la vue monde.

**L'Allemagne est la seule exception à Natural Earth — 07/10/2026.** Seize Länder en faisaient
la nation la plus grossière du jeu (la France en a 101), et une bâtisse par région la plafonnait
à seize sites chez elle. La Bavière, le Bade-Wurtemberg et la Hesse sont donc découpés en leurs
**Regierungsbezirke** (VG2500 du BKG, `scripts/german-districts.mjs`, licence dl-de/by-2-0 —
**attribution « © GeoBasis-DE / BKG » due, et le jeu n'a encore aucune page de crédits**) :
27 régions, identifiants `DEU-` + code NUTS 2 (`DEU-DE21`, Oberbayern). Le découpage se fait
**après** la simplification, dans le contour déjà tracé : tout le reste de `regions.json`, de
la grille et de l'index sort à l'octet près. La Rhénanie-du-Nord-Westphalie et la Basse-Saxe
restent entières parce qu'elles portent le Ruhr et Salzgitter. Le tirage blé/textile de
l'Allemagne est **figé** (`FROZEN_DRAWS`, `generate-deposits.mjs`) : découper la carte ne
redistribue pas la main d'une nation.

**Le type de région** (`RegionType`) compte six valeurs — plaine, forêt, jungle, montagne,
désert, toundra — classées hors ligne par `scripts/generate-region-types.mjs` (relief ETOPO, Köppen-Geiger, forêt
Hansen ; rasters hors dépôt, SHA-256 vérifiés) et servies par `public/region-types.json`, à part
de `regions.json` : `{ type: [ids] }`, une région absente se lit plaine. Détail et seuils dans
`WWS/docs/design/propositions/classification-regions.md`. Aucune
règle de jeu ne doit lire le type — s'il doit un jour toucher vitesse ou combat, ADR
obligatoire (la fiche 08 est figée « ni grille, ni terrain » ; le décoratif est libre).
`world.json`, `regions.json` et `region-types.json` sont produits par `scripts/generate-world.mjs`,
`scripts/generate-regions.mjs` et `scripts/generate-region-types.mjs` — ne jamais les retoucher à la main.

**Le calcul de trajets terrestre/naval/aérien/combiné existe dans `src/domain/routing.ts`**
(ADR 0012) : grille raster, Dijkstra, enroulement est-ouest dans l'adjacence, détroits et
canaux gravés (`SEA_GATES`). **Un canal est de l'eau et un gué** (15/09) : un détroit se grave
en `SEA`, un canal en `CANAL`, troisième type de cellule que la recherche terrestre foule comme
la naval le transite — gravés en mer, Panama coupait les deux Amériques et Suez séparait
l'Afrique de l'Asie. Le milieu d'un pas suit dès lors **ce que la recherche a autorisé** et non
la seule couleur des cellules ; une berge de canal est une côte (Colón, Port-Saïd sont des
ports) ; la 72a tient telle quelle — on débarque d'une cellule de mer, un canal n'est pas une
plage, et la révision du 18/09 ne la touche pas non plus : rester en mer ajoute une destination,
pas un pas mer → terre. **Et aucune porte ne découpe une poche de terre** (15/09) : un détroit verse de l'eau là
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

**La carte est une feuille posée sur une table — 13/10/2026.** Plus de courbure d'horizon : le
réglage n'était plus jamais au-dessus de zéro, et `Curvature`, `frame.drop`, `setCurvature` et le
test d'horizon des étiquettes sont partis avec lui — un point du plateau se relit tel quel, et le
raycast vise la géométrie qu'on voit. Plus d'épaisseur non plus : un pays est un aplat
(`ShapeGeometry`) à `COUNTRY_THICKNESS` au-dessus de la mer, sans paroi — la côte est le trait
d'encre des frontières, et l'écart ne sert qu'au tampon de profondeur. **La pente suit la
distance** (`steepestTiltAt`, `camera-tilt.ts`) : on se penche jusqu'à 66° au rapproché, on ne
dépasse plus 52° à la vue monde ; l'aplomb reste permis partout et la pente sous ce plafond reste
celle du joueur.

**Une seule lampe porte les ombres** (`lamp.ts`), chaude, dans la direction de l'ancien soleil,
en attendant le jour et la nuit. Une pièce éclairée et opaque (`MeshStandardMaterial`) porte la
sienne — figurines, blocs, jetons, copie portée, rejeu ; une planche, un disque ou un fil, non —,
et la feuille la reçoit : pays, mer et encres de région. La carte d'ombres (2048², PCF doux) est
**recalée sur ce que la caméra regarde** à chaque image, par crans de 2^¼ et calée au texel pour
ne pas scintiller, et **éteinte au-delà du fondu des régions** (`shadowReach`) : à la vue monde
aucune pièce ne tient debout, et l'ombre ne coûte rien. Elle ne demande aucune image — elle se
rend avec celles que la carte doit déjà. Les disques de contact restent, très légers : ils posent
la pièce sous ses pieds quand l'ombre de la lampe tombe à côté. **Et un flou tilt-shift léger** (1,5 px au plus, `tiltShiftOf`, `camera-tilt.ts`) borde le haut et le bas de la carte : nul à l'aplomb, plein à la pente la plus rasante, nul au-delà du fondu des régions et coupé par « animations coupées » ; deux bandes DOM `backdrop-filter` sous les étiquettes, force écrite par le moteur dans `--tilt-shift` (`onTiltShift`).

**La carte ne rend que sur demande — 05/10/2026** (`src/map/engine/frame-demand.ts`). Elle
dessinait soixante images par seconde même posée et immobile. La boucle tourne toujours, mais
l'image n'est due que si quelque chose a remué la carte dans les 1,5 s (`SETTLE_MS`, qui couvre
l'inertie de la caméra et la plume du terrain survolé), si un fil est affiché — ses tirets coulent,
donc **un mouvement à l'écran garde le rendu continu** (sauf animations « coupées ») —, ou au
battement de secours, deux fois par seconde. **Quatre règles quand on touche au moteur**, et la première est vérifiée par un test
qui lit la source (`frame-demand.test.ts`, même procédé que `roleOf`) :

- toute méthode publique de `MapEngine` qui change ce qu'on voit **commence par
  `this.invalidate()`** ; une méthode qui ne fait que lire s'inscrit dans `READ_ONLY` du test ;
- une animation nouvelle qui dure plus que `SETTLE_MS`, ou qui tourne sans fin, se déclare dans
  la boucle comme `arcs.isFlowing` — sinon elle saccade à deux images par seconde ;
- une **ambiance** qui tourne sans fin (mer, vent) est une couche d'`Ambience` (`ambience.ts`) :
  elle déclare sa cadence (`hz`, 12 par défaut), reçoit un temps quantifié à ce pas, figé hors
  `full`, et le socle demande **une** image par pas (`FrameDemand.request`) — jamais
  `invalidate()`, qui tiendrait la carte à 60 i/s ;
- un composant React qui pose ses propres nœuds sur la carte et les place depuis `onLabels` ou
  `onEdges` appelle `engine.invalidate()` après chaque rendu (`MapLabels.tsx`,
  `EdgeIndicators.tsx`) : ses nœuds naissent cachés, c'est l'image suivante qui les place.

Le battement est un filet, pas une excuse : un oubli se lit comme une demi-seconde de retard au
lieu d'une carte gelée, et il se corrige.

**Et la carte vit — 10/10/2026** (`WWS/docs/design/propositions/carte-vivante.md`) : une houle
lente passe sur la marbrure de la mer (`sea.ts` — une trame de points, essayée, fatiguait
l'œil), des rubans de vent suivent une météo qui est la même pour tous, fonction pure de l'heure
(`weather.ts`, `ribbons.ts`), les courants marins y passent en filigrane (`currents.ts`), une
écume respire le long des côtes au rapproché, lue sur un seul champ de distance à la côte
(`coast-distance.ts`), un mouvement envoyé se trace à l'encre et une arrivée ou un combat
s'imprime (`ink.ts`, `ink-bursts.ts`), et le rayon d'un de mes avant-postes qui se lève ou
monte se trace une fois autour de lui (`raisedReaches`, muet à l'ouverture de la carte). **Décor pur** : rien ne
lit l'état de la partie, et l'encre ne joue que sur ce que le joueur reçoit déjà en dépêche. Le
réglage `actives / réduites / coupées` (`map-motion.ts`, « auto » suit le système) commande
aussi la caméra et la plume du terrain survolé (tracé, fondu court, posé d'un coup). C'est la
deuxième exception, décidée, au pilier « rien ne bouge sans raison ». **La mer est une feuille de carte imprimée** (13/10/2026, d'après
`WWS/prototypes/table-etat-major.html`) : un papier clair vert d'eau (`PALETTE.seaSheet`, que la
lampe chaude ne doit pas ramener à la couleur de la terre — d'où une part de lumière propre),
gravé au fragment d'isobathes lues sur le même champ de distance que l'écume, d'un quadrillage de
10° sur la mer seule et d'une rose des vents fixe dans l'Atlantique Nord (`sea.ts`) ; le
quadrillage en lignes de 30° posé sur tout le plateau est parti avec. **Et le jour tombe**
(13/10/2026) : il suit le **vrai soleil** — il fait nuit à Paris quand il fait nuit à Paris. Le
point subsolaire sort de l'heure UTC et de la date, déclinaison saisonnière comprise
(`subsolarPoint`, `src/domain/daylight.ts`), et la nuit d'un lieu se lit sur la hauteur du soleil,
crépuscule doux de +4° à −12° (`nightOfAltitude`). Sur la carte, un voile d'encre posé sur tout le
plateau, terre et mer, calculé **au fragment** sur le `lonLat` de la surface (`night.ts`) : la
terminaison glisse d'ouest en est en ombre douce. Une centaine de grandes villes de 1940, cuites à
la main faute de données, s'allument chacune à **son** crépuscule ; le ciel et la lampe suivent la
nuit **au point regardé**, au rapproché seulement — la vue monde montre les deux moitiés et garde
sa lumière. Lu au rendu, sans demande d'image : le battement suffit. `?heure=2026-01-15T23:00Z`
fige l'instant en développement. Pas de feux sur les pièces.

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
`previewLootCollection`, jamais d'un stock adverse que le brouillard n'a pas servi. **L'ordre
part sur la foi du relevé, depuis le 05/10** (`surveyedPlunderTarget`) : un bâtiment rasé ou mis à
l'arrêt depuis n'est plus refusé au départ — le refus apprenait à distance ce que seul le terrain
doit dire —, la colonne y va, rentre à vide, et la dépêche `expeditionFoundNothing` dit pourquoi. La rumeur, la
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
d'origine, que rien ne lui prend. **Ce que le rayon touche, et non ce qu'il centre** (révision du
17/09) : une région est tenue dès qu'**une de ses cellules** du raster (ADR 0023) entre dans le
disque — `coveredByDisc` mesure, `regionsWithinReach` la sert mémoïsée par point, et la couleur, le
sol qu'on peut bâtir (`view.ts`) comme le relevé du sol (`surveys.ts`) la lisent tous les trois. La
règle du pôle d'inaccessibilité ne tenait rien hors d'Europe — 969 régions sur 4 589 ont celui de
leur voisine à plus de 120 km — et la précision du 04/09 (« un point tient la région où il se
tient ») y est absorbée : sa cellule est à distance nulle. Un point en lisière tient donc les
géantes qu'il touche, Ontario et Québec depuis Gatineau. La règle est pure
(`src/domain/control.ts`, litige au plus proche **de la cellule la plus proche**, égalité exacte à
personne), servie par une
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
survol donne la date en clair, « relevé du 12 août ». **Et chaque état a sa matière** (13/10/2026,
`table-etat-major.md`) : le *vierge* est au crayon — un grain de graphite et un trait oblique sur
tout le sol (`countries.ts`), que l'encre des régions connues couvre —, le *relevé* est gravé —
tailles horizontales sur un fond pâle de la même encre, délavées par le même `surveyWash` —, le
*à jour* est à l'encre fraîche, pleine ; toutes trois en pixels d'écran (`screenTrame`,
`regions.ts`), comme la hachure des zones suspendues.

**Et il se démantèle** (décision du 16/09, `convex/outposts.ts`, `dismantle`) : un refus unique
(`outpostDismantleRefusalOf`, `NOT_YOURS` et `OUTPOST_SERVING` — on ne retire pas la route sous une
colonne, la lecture même qui scelle le métier), une popin qui chiffre ce qui part, et **rien n'est
remboursé** — ni la fondation, ni les élévations ; seule la file rend ce que la file rend. C'est
un **événement de couleur** de plus, réglé avant d'écrire, et il emporte ce que le point ancre :
les bâtiments de `buildings.outpostId` tombent chacun par la règle de la démolition
(`razeBuilding`, extrait de `buildings.demolish` pour n'avoir qu'une chute de mât), la garnison
passe au sol au point, et la dépêche `outpostDismantled` compte les mâts emportés. La couleur
perdue s'annonce avant le clic : `outposts.soleHold` lit la **même** différence de deux
`heldRegions` que la zone hachurée d'un point hors service (`soleHoldOf`, `convex/holding.ts`).

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

**Et le monde pose des réserves que personne ne garde pour soi — 17/09/2026.** Au lancement, un
travail immédiat pose des **objectifs neutres** — et ce travail est une **action** en trois temps
(`convex/objectives.ts`), parce que le Dijkstra multi-cibles par QG ne tient pas dans le plafond
d'une seconde d'une mutation sur le VPS : `placementInput` lit les sièges et leurs QG,
`place` mesure et décide hors transaction (690 à 710 ms à chaud sur huit sièges), `commit` écrit
le siège irrégulier, les objectifs, les garnisons et les dépêches en une transaction — et refuse
de rien poser si la saison porte déjà un objectif, ce qui rend deux exécutions inoffensives. Ils
tombent sur des régions de
pays sans siège : **deux par joueur** à moins de `OBJECTIVE_NEAR_KM` (1 500) de route de son QG et
séparées de `OBJECTIVE_SPREAD_KM`, plus **un dur par paire de voisins** — la région qui minimise
la plus grande des deux distances de route, à `OBJECTIVE_HARD_MIN_KM` au moins et à trois quarts
de partage, plafond `OBJECTIVE_HARD_MAX` = 4. Une paire qu'aucune route terrestre ne joint n'en a
pas, et la dépêche le dit (« aucune réserve signalée entre X et Y »). La règle de répartition est
**pure** (`src/domain/objective-placement.ts`) : elle dit ce qu'il faut mesurer, le serveur
mesure (`routeKmFrom`, un champ de distances par QG sur la grille de routage — en **vrais
kilomètres**, `routeDistanceKmField`, parce qu'une règle qui dit « mille kilomètres » ne peut pas
compter en unités de grille). Le proche se mesure en **combiné**, l'eau comprise (sans quoi un
insulaire n'aurait aucune réserve à portée) ; le dur se mesure **à pied**, parce qu'on cherche un
sol que les deux foulent.

Un objectif est un **archétype** — nom de 1940, palier, garnison, dépôt — tiré d'une palette de
quatre (`OBJECTIVE_ARCHETYPES`, `convex/constants.ts`). **C'est une table, jamais une branche** :
une entrée de plus est une ligne, une planche (`src/emblems/objectives/manifest.ts`, `null` tant
qu'elle manque) et trois phrases (`fr.objectives`). **L'objectif est public, sa garnison ne l'est
pas** : `playerView.objectives` le sert à tout le monde — lieu, archétype, dépôt restant, état —
et n'a structurellement aucun champ pour la garnison, qui est une force posée relevée comme les
autres (ADR 0024 §1). C'est **l'exception nommée de l'ADR 0024 §4** : on l'attaque sans l'avoir
relevé, parce qu'il n'y a rien à percer. Ce qui le tient appartient à un **siège irrégulier** —
un `players` marqué `irregular`, sans compte et sans vue, que `seatsOf` écarte en une ligne de
tout ce qui demande « qui joue ici » (salon, accueil, presse, classement, encre, doyen,
entretien). Ses troupes sont des `troops` ordinaires : elles défendent, tirent dans la même passe
simultanée et meurent pareil — **il n'y a pas d'IA**. Le dépôt part à qui **dégage le terrain**
(ADR 0014 : une passe, rien debout en face), borné par ce que la colonne porte, **le reste reste
au sol** pour le suivant ; le retour chargé est la mécanique du pillage, sans une ligne de plus.
Pas de capture au seuil tenu, pas de renfort, pas d'objectif mobile : c'est le lot 2.

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
