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
viennent **uniquement** du backend Convex, par le jeton de partie (accueil → salon → saison
réelle, carte vierge) ; sans jeton, `/plateau` affiche « aucune partie en cours » et renvoie à
l'accueil. Le fixture de démonstration a été retiré. Le backend couvre le hors-saison et
l'état de nation (ADR 0009, 0010). **Trois mouvements terrestres existent côté serveur**
(`convex/movements.ts`) : la marche qui fonde un avant-poste, l'attaque et le raid — plus le
**retour**, que personne n'ordonne et que la résolution crée seule. Pas de naval, pas d'aérien,
pas d'agent. **Le leurre a été codé puis retiré le 29/08/2026** — décision de Pierre, révision
documentée en tête de `WWS/docs/design/04-information.md`. Son littéral survit dans
`convex/validators.ts`, en legacy et jamais réécrit, le temps d'un wipe.

**Le combat existe** : une passe de résolution déterministe, sans aléa, initiative à l'attaquant
(`src/domain/combat.ts` pour la règle, `convex/combat.ts` pour le branchement, table de dégâts et
modificateurs dans `convex/constants.ts`). L'**interception** en route inverse l'initiative ; son
rayon est un placeholder assumé et non simulé, le trou le plus béant du modèle (fiche 08 §11). Un
raid gagné **désactive** l'avant-poste, jamais ne le prend. Chaque engagement laisse un **compte
rendu** que le journal sert en dépêches ; le rejeu visuel attend la surface 4.7 et se construira
sur ce compte rendu, sans re-résoudre.

**Et la table se lit** : l'**abaque de tir** (`src/routes/-plateau/GunneryWindow.tsx`, rangement
dans `src/domain/gunnery.ts`) affiche `DAMAGE_TABLE` **importée, jamais recopiée** — soixante-quinze
couples, une ligne par profil, l'encre dit la bande avant que le chiffre soit lu, le survol donne la
valeur. En lecture seule, sans entrée de rail : on l'ouvre du recrutement et de la popin de troupe,
aux deux endroits où « qui bat qui » se demande.

**Le mouvement s'ordonne depuis la carte, et de nulle part ailleurs** (décisions 12a et 13a,
`WWS/docs/design/propositions/flux-mouvement-en-carte.md`). La fenêtre Troupes, la modale
« Envoi d'un mouvement » et le widget des trajets sont **supprimés**. À leur place : un
**panneau de garnison** qui compose la pile (le clic sur le mât d'un bâtiment de projection et
celui sur une pile qui porte plusieurs troupes ouvrent le même, un seul état de sélection) ; puis
la **visée** : clic droit sur la cible, rose des vents contextuelle, aperçu d'arc et confirmation
« envoyer — irréversible » au bout de l'arc.

**La carte au clic droit agit, la popin lit** (décision Pierre, 30/08). Le clic gauche sur une
troupe seule ouvre **les deux à la fois** — le cartouche (`TroopBadge.tsx`, qui ne porte aucun
ordre) et la rose de cette troupe, posée sur le sprite ; le clic droit sur le sprite ouvre la
même. « Envoyer » y est la seule branche qui ne commande rien : elle arme la colonne et rend la
main à la carte, où la destination se nomme. Deux cibles, jamais un menu mixte : le sprite rend
la rose de la troupe, la région celle du bâti. Il n'y a plus de fenêtre « visée armée » — le
cartouche porte l'état, et son pied est le mode. Les types proposés par la rose et ceux que le serveur accepte
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

**Une seule détection existe, et c'est une troupe posée** (ADR 0019 §5) : elle révèle à son
propriétaire les mouvements adverses qui passent dans `SCOUT_RADIUS_KM` (60 km) — un fil, un cap,
un horaire estimé, un domaine, **jamais le type ni la composition, jamais la nation**. Le relevé
se calcule **au départ du mouvement, une seule fois**, et se dénormalise dans la table
`sightings` (`observateur, mouvement, tDébut, tFin`) : chaque joueur lit son propre index, jamais
un filtre sur la table des mouvements (`WWS/docs/technique/brouillard-et-fanout.md`). Conséquence
assumée et affichée : une troupe posée **après** un départ ne verra jamais ce mouvement. Le relevé
se lit sur la carte — le fil adverse y est tracé — et dans le journal, en dépêches ; la station
d'écoute, l'agent dormant et la sonde n'existent toujours pas.

**La surface 4.6, Production, existe aussi** — file de recrutement séquentielle, annulation
remboursée d'un lot non commencé, paliers MK1/MK2 déverrouillés par le complexe industriel.
Elle a demandé la **première tranche du schéma de jeu** (`unites`, `recrutements`), écrite
avant la fermeture du 🔴 : c'est une entorse assumée à la règle de `WWS/CLAUDE.md`, pas un
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
canaux gravés (`SEA_GATES`). **Le serveur l'appelle** (`convex/routes.ts`, grille construite une
fois par isolat depuis `world.json` : 1,33 M de cellules en 31 ms, un Dijkstra entre 13 et
125 ms) — pour l'instant en mode terrestre seul ; le droit de passage par les pays neutres
n'est toujours pas tranché.

## Architecture

```
src/domain/      TS pur. Aucune importation React ni Convex (sauf src/i18n/fr, ADR 0016). Testé.
src/data/        adaptateur Convex vers PlayerView, jeton, réglages, client Convex.
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
grisées. La §4.5 de la fiche 11 est **périmée** : le flux de mouvement en carte l'a remplacée. Ce qui manque encore au schéma de jeu : l'occupation, le pillage et les revenus — le
dernier point bloquant du design (l'avantage d'isolement géographique) n'est toujours pas tranché.

**La carte se colore** (ADR 0020 §1) : une région est *tenue* par le joueur dont un avant-poste
la couvre dans `OUTPOST_REACH_KM` — le rayon de construction, jamais une seconde constante — ou
par la nation dont elle est le sol d'origine, que rien ne lui prend. La règle est pure
(`src/domain/control.ts`, litige au plus proche, égalité exacte à personne), servie par une
**query à part** (`convex/control.ts`, `control.held`) et jamais par `PlayerView` : la couleur ne
bouge qu'à la fondation ou à la perte d'un avant-poste, quand la vue se réinvalide au moindre pas
d'une colonne. La teinte est **celle du siège**, pas de la nation, et elle reste au loin quand les
frontières de région s'effacent. Pas encore de score, pas de production reliée, pas de
décoloration au raid.

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
`OUTPOST_DISABLED_HOURS`, avec une fenêtre d'immunité derrière ; la **destruction** après
plusieurs raids attend le pillage, et rien ne les compte. Il ouvre un rayon de
`OUTPOST_REACH_KM` autour de son point, où l'on bâtit comme chez soi (le puits en Arabie), et
**héberge la colonne qui l'a fondé** — `stationedAt` accepte un avant-poste, la colonne y devient
garnison, et cette garnison est ce qu'une attaque trouve debout.

**Les emplacements suivent le niveau du site** (ADR 0020 §10, `convex/sites.ts`) : le sol
national en porte `2 × niveau de QG`, un avant-poste en porte **son niveau**, et il n'y a plus
aucun total national — `buildingCap` a disparu. La **fondation est hors compte** : pour chaque
clé due par la nation, le premier exemplaire posé chez soi ne coûte pas un emplacement, ce qui
corrige le lancement à zéro placement libre. Le rattachement est écrit **à la pose**
(`buildings.outpostId`, `null` = sol national) et jamais recalculé ; les lignes d'avant se
relisent par la géographie. Un avant-poste détruit laisse ses bâtiments debout et son ancre
morte — on ne peut plus rien y poser. Le frein d'expansion n'est plus un plafond mais
l'**entretien** : `OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL` (nourriture et charbon, placeholder
assumé) débite le stock national par niveau et par heure, dans le même terme du taux que
l'entretien des troupes. À sec, rien ne meurt.

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
besoin d'ordre, ADR 0019), ses avant-postes paient leur entretien et gardent son encre, son stock
s'épuise, et il reste pillable. **Sa vue reste la sienne** (décision 47a) : `PlayerView` se
calcule comme avant, portée par ses détecteurs restants et figée à mesure qu'ils tombent — lever
le brouillard ferait de la reddition un acte de renseignement au profit d'un survivant ami. La
capitulation est aussi l'événement qui manquait au **transfert du commandement** : le titre de
fondateur passe au plus ancien joueur non défait, et s'il ne reste qu'un belligérant debout la
saison se conclut par la sortie commune, à son nom — une victoire, pas une clôture
administrative. Au front : « Défaite : observer » à l'accueil, un cachet au bandeau, la rose
réduite à « voir », la carte « à faire maintenant » absente, les boutons d'action retirés plutôt
que grisés, et le bouton « déposer les armes » rangé dans Réglages à côté de « clore la saison ».

**Ni terrain, ni tenaille, ni soin.** Le modificateur de terrain attend l'ADR qui autorise une
règle à lire `RegionType` ; la tenaille attend une définition de la convergence ; une troupe
entamée reste entamée — la boucle de soin attend la pharmacie et `consommation-continue.md`.

Avant de coder une surface, **lire `WWS/docs/design/11-brief-ui.md`** : chaque écran 4.x y est
spécifié. L'oublier coûte une réécriture.

## Instructions

Git : 
Ne commit pas
Ne push pas

Utilise git seulement pour de l'exploration si besoin
