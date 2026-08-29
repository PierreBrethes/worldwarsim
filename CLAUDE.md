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
journal d'événements, et **le flux de mouvement en carte** — widget de troupes, panneau de
garnison, visée, rose des vents de mouvement, aperçu d'arc et envoi. Les données
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

**Le mouvement s'ordonne depuis la carte, et de nulle part ailleurs** (décisions 12a et 13a,
`WWS/docs/design/propositions/flux-mouvement-en-carte.md`). La fenêtre Troupes, la modale
« Envoi d'un mouvement » et le widget des trajets sont **supprimés**. À leur place : un **widget
de troupes** repliable (`src/routes/-plateau/TroopsWidget.tsx`) à deux sections aux pouvoirs
délibérément différents — *stationnaires* dirigeables, *en mouvement* observables et **sans
aucun gestionnaire d'action** ; un **panneau de garnison** qui compose la pile (le clic sur le mât
d'un bâtiment de projection et la carte du widget ouvrent le même, un seul état de sélection) ;
puis la **visée** : clic droit sur la cible, rose des vents contextuelle, aperçu d'arc et
confirmation « envoyer — irréversible » au bout de l'arc. Les types proposés par la rose et ceux
que le serveur accepte sortent de **la même fonction** (`src/domain/movement-orders.ts`) — rien
n'est grisé, jamais (ADR 0015). L'aperçu ne calcule rien : `movements.preview` sert la route
réelle et l'heure d'arrivée, seul le serveur date un mouvement.

**Une seule détection existe, et c'est une troupe posée** (ADR 0019 §5) : elle révèle à son
propriétaire les mouvements adverses qui passent dans `SCOUT_RADIUS_KM` (60 km) — un fil, un cap,
un horaire estimé, un domaine, **jamais le type ni la composition, jamais la nation**. Le relevé
se calcule **au départ du mouvement, une seule fois**, et se dénormalise dans la table
`sightings` (`observateur, mouvement, tDébut, tFin`) : chaque joueur lit son propre index, jamais
un filtre sur la table des mouvements (`WWS/docs/technique/brouillard-et-fanout.md`). Conséquence
assumée et affichée : une troupe posée **après** un départ ne verra jamais ce mouvement. Le bloc
« Renseignement » du widget de troupes sert ce relevé et rien d'autre ; la station d'écoute,
l'agent dormant et la sonde n'existent toujours pas.

**La surface 4.6, Production, existe aussi** — file de recrutement séquentielle, annulation
remboursée d'un lot non commencé, paliers MK1/MK2 déverrouillés par le complexe industriel.
Elle a demandé la **première tranche du schéma de jeu** (`unites`, `recrutements`), écrite
avant la fermeture du 🔴 : c'est une entorse assumée à la règle de `WWS/CLAUDE.md`, pas un
oubli — elle est gravée dans l'ADR 0011. Les coûts et durées de `convex/constants.ts` sont
**arbitraires**, jamais simulés.

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

**L'avant-poste se conteste, il ne se prend pas** : un raid gagné le **désactive** pour
`OUTPOST_DISABLED_HOURS`, avec une fenêtre d'immunité derrière ; la **destruction** après
plusieurs raids attend le pillage, et rien ne les compte. Il ouvre un rayon de
`OUTPOST_REACH_KM` autour de son point, où l'on bâtit comme chez soi (le puits en Arabie), et
**héberge la colonne qui l'a fondé** — `stationedAt` accepte un avant-poste, la colonne y devient
garnison, et cette garnison est ce qu'une attaque trouve debout.

**La saison se gagne, par un échafaudage assumé.** Une seule condition, publique et nominative :
la **Domination simplifiée** (`src/domain/victory.ts` pour la règle, `convex/victory.ts` pour le
branchement, `REDUCTION_FACTOR` dans `convex/constants.ts`). Un joueur est *réduit* quand sa
capacité tombe sous la moitié de son nominal ; le premier qui en tient `⌈(n−1)/2⌉` sous la barre
**au moment où sa passe la leur fait franchir** prend la saison, qui passe en `concluded` — elle
se relit, elle ne se joue plus, et le wipe reste manuel. **Réduit n'est pas éliminé** : la
capacité se calcule depuis les troupes à l'instant, jamais stockée, donc un joueur qui reconstruit
sort du compte de son bourreau. Ce module a vocation à être **remplacé** par les trois doctrines
secrètes de la fiche 05, pas amendé — aucun champ n'y prépare une doctrine.

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
