/**
 * **Une Mondiale lancée, en local, pour les captures.** Joue le parcours de deux vrais joueurs
 * par l'API publique : inscription (ou connexion), fondation, adhésion par le code, nation,
 * « prêt », lancement. Puis, sauf `--nu`, remplit les stocks et pose des troupes (`convex/dev.ts`).
 * `--crans` pose en plus, pour la France, une escouade en Rhénanie aux crans entamés : une
 * infanterie à sec et un blindé à un cran de plein (coups et plein, ADR 0028 §3). `--recolte`
 * date une visite du plateau personnel de neuf heures plus tôt : la prochaine ouverture montre la
 * récolte, des vivres et de l'acier entrés, du pétrole sorti (ADR 0028 §7) ; avec `--bac-plein`, le
 * charbon est au plafond de son bac : une part de la récolte y est perdue (#251). `--livraison` pose
 * pour la France un avant-poste près de Bruxelles, son dépôt entamé, un camion chargé au QG et un
 * autre au point (ADR 0028 §4). `--tournee` y ajoute Lille, au dépôt plein, et lance deux
 * tournées : le camion du QG par Lille, sautée, et Bruxelles ; celui de Bruxelles par Lille seule,
 * qui attend. `--largage` pose pour la France un aérodrome et un avion chargé, un avant-poste de
 * niveau 1 près de Bruxelles et une escouade à sec en Rhénanie : de quoi larguer (ADR 0028 §4).
 * `--recherche` donne à la France un Centre de recherche de niveau 2, l'infanterie MK2 et l'aviation,
 * et le blindé en cours sur le Centre (#123) ; `--centre`, le même Centre sans carte posée. `--artillerie` lui donne l'artillerie, une pièce au nord de Paris et une escouade
 * de quatorze troupes à Reims, pose seize troupes britanniques à Amiens, et les bombarde une fois
 * la pièce en batterie : la salve bornée et le fanion qui compte (ADR 0028 §6). `--points` fait
 * tenir à la France Bakou, Narvik, Singapour et Halifax (Dakar va à l'adversaire, avec un entrepôt relevé), avec un blindé au plein vide, un camion
 * au plein et une escorte envoyée en mer, et les dépêches d'un dépôt brûlé (P11). `--petrole` lui donne un arsenal, la carte du
 * pétrole synthétique et un lot de soixante pétroles en cours (ADR 0028 §1). `--tutoriel` laisse
 * une place neuve, comme `--nu` : les premiers pas commencent au QG à poser (ADR 0027 §2).
 * `--navire` pose pour la France un port à Marseille, un cargo à quai et un avant-poste à Agde :
 * de quoi voir un navire s'écarter du quai puis s'y ranger (#129). `--brest` (#436) y ajoute un chantier
 * de port à Brest, sur sa rade. `--exploitations` pose pour la France sa ferme et ses deux mines sur les gisements de son sol,
 * posées offertes comme la fondation : de quoi lire un registre de consommation à deux colonnes
 * (production et consommation, #121). `--chantiers` élève le QG au niveau 3 et met quatre
 * chantiers en file : un monte, 28 % plus vite, les autres attendent (ADR 0031). `--niveaux` y
 * ajoute une caserne de niveau 3. `--caserne-chantier` (#365) met en chantier une caserne dans
 * l'Aube, en tête de file : son premier niveau monte. `--caserne-montee` (#366) élève la caserne
 * de niveau 3 du QG au niveau 4, en tête de file.
 * `--edition` publie tout de suite deux éditions de presse : le classement et ses variations.
 * `--tournee --sans-depart` pose la scène des tournées sans les lancer. `--tournee --rangoun` fait
 * tenir Rangoun à la France avant le départ, et poste deux fantassins de l'adversaire près de la
 * route de Bruxelles : l'un à 12 km, qui relève la tournée à mi-portée, l'autre à 45 km, qui la
 * relèverait sans Rangoun, et un camion de tournée seul à l'arrêt en Picardie (#176).
 * `--voisins` pose un avant-poste britannique en Hainaut, contre le Nord français : deux
 * contours côte à côte (#217). `--liaisons` (#370) pose pour la France deux avant-postes en liaison,
 * Namur et Liège, un seul à Bâle, et une pile à Charleroi (`@liaisons`, `@charleroi`, `@aix`) ;
 * `--sans-charbon` y met le charbon national à zéro. `--metiers` (#371) pose pour la France quatre
 * avant-postes : un niveau 1 à élever à Arlon (`@arlon`), un généraliste d'avant la refonte au
 * niveau 2 à Luxembourg (`@luxembourg`), un Magasin qui change pour Guet à Trèves (`@treves`) et
 * un Guet à Sarrebruck (`@sarrebruck`) ; `@metiers` les cadre tous. `--zones` (#375) pose pour la
 * France un réseau lorrain (Luxembourg, Metz, Nancy, un Guet à Sarrebruck), Strasbourg désactivé et
 * une pile à Thionville (`@zones`, `@metz`, `@thionville`). `--ronde` (#376) pose pour la France
 * une étoile autour de Metz (Luxembourg, Nancy, Sarrebruck), un blindé en ronde de Luxembourg vers
 * Metz, une infanterie en halte à Nancy, une infanterie seule à Metz et une dépêche de fin
 * (`@ronde`, `@metz`, `@nancy`, `@luxembourg`). `--ligne` (#377) pose pour la France une ronde en
 * halte à Liège sur Liège–Sarrebruck, et en face une colonne que la seule ligne a relevée à son
 * franchissement (`@ligne`, `@liege`, `@sarrebruck`). `--deux-vigies` (#412) pose pour la France
 * deux vigies, à Cologne et à Erfurt, et en face un blindé d'Aix-la-Chapelle à Leipzig, dans le
 * trou d'entre les deux : l'arc est la dernière position connue sous Cologne ; avec `--reparue`,
 * il est sous Erfurt, et repart de la réapparition (`@deux-vigies`, `@cologne`, `@erfurt`). `--guet` (#373) pose pour la
 * France un Guet à Kaiserslautern et un généraliste à Berne, et en face une colonne britannique
 * lue en route vers Munich, un camp lu à Francfort, une dernière position lue à Mayence et un camp
 * que le généraliste relève sans le lire près de Berne (`@guet`, `@francfort`, `@mayence`, `@berne`). `--magasin` (#372) pose pour la France un
 * Magasin plein à Berne et un presque vide à Innsbruck (`@berne`, `@innsbruck`, `@magasins`), une
 * pile à sec à Turin (`@turin`, vers Stuttgart) et une à Vérone (`@verone`, vers Nuremberg), et
 * deux colonnes à sec sur ces routes qui arrivent vingt secondes après : le journal le dit. `--fort` (#374)
 * pose un Fort français à Namur et un Fort britannique sans charbon à Luxembourg ; une colonne
 * britannique partie de Gand entre dans la vigie de Namur trente secondes après (`@namur`, `@gand`,
 * `--compte b` pour la voir retenue), une française passe le Fort sec (`@luxembourg`). `--quais` pose pour la France trois avant-postes, à La Valette, à
 * Singapour et à Florence : de quoi y viser un port (#221). `--iles` (#224) y ajoute, pour la
 * France, un QG à Paris (niveau 2), une colonne débarquée à La Valette par une coque venue du
 * large, un avant-poste qu'une de ses infanteries y fonde, un port en chantier sur le quai de La
 * Valette et une infanterie à Syracuse, d'où viser Malte à pied.
 * `--accrochages` (#441) pose des piles françaises au contact de britanniques relevées : deux
 * piles françaises à Metz et Thionville face à une colonne sur la Moselle, deux escorteurs en
 * Manche face à deux autres, une pile devant Francfort (que `--guet` lit) et une à Alexandrie, hors
 * champ depuis la France (`@accrochages`, `@accrochage-metz`, `@accrochage-manche`,
 * `@accrochage-loin`).
 * `--epingles [N]` (#234) sème N piles sur la France (1000 par défaut, une sur deux en Lorraine),
 * pose en face trois camps britanniques relevés en Sarre et en Alsace, un quatrième perdu de vue près de
 * Metz et un entrepôt relevé en Belgique, puis fait marcher une pile française vers Madrid et une
 * britannique à travers la Lorraine. `--lisbonne` donne Lisbonne à la France : elle lit la nation de ses relevés (P11).
 * `--pile-mixte` (#286) pose un camion, un chasseur et deux fantassins sur un même point : une pile
 * où les nouveaux modèles côtoient les anciens. `--escouade` (#283) pose un camion, un char et deux
 * fantassins en Essonne et dans le Cotentin, et les dissout : la couronne, puis contre la mer.
 * `--files` (#276) fait partir de Champagne vers la Hesse trois colonnes françaises de douze
 * troupes à pied (six fantassins, trois chars, trois canons) : la file à mi-route, une
 * quinzaine de minutes après, et `lieu=@files` cadre la première où elle est dessinée.
 * `--trajet-mixte` (#276) embarque en baie de Seine, sur deux cargos, une pile mêlée (trois
 * fantassins, deux chars, deux canons) pour Ouistreham, et `lieu=@trajet-mixte` la cadre à son
 * arrivée. La route d'une colonne embarquée vers une côte finit en mer (`routeBetween`,
 * `combined`) : la pile y touche terre dans sa coque, sans tronçon de terre après le quai.
 * `--sans-place` (#295) pose huit pièces au bord de la côte irlandaise : U y est refusé, la barre
 * de sélection le dit avant le geste.
 * `--gisements` (#239) donne à la France un QG à Paris, une mine sur le charbon du Nord et un
 * avant-poste à Namur, et à l'adversaire une mine relevée sur la Sarre : une mine à poser, au
 * cadrage de la maquette des gisements.
 * `--sites` (#273) pose pour la France le Centre qui cherche de `--recherche`, quatre mines sur
 * leurs gisements, un chantier naval au Havre avec une coque sur cale et Bakou tenu avec son puits :
 * les sites qui vivent au repos (`@sites` cadre les six de France, `@bakou` le puits).
 * `--echelle` (#265) pose pour la France l'aérodrome et le port de `--largage` et `--navire`, la
 * caserne de `--niveaux`, puis y fait entrer trois fantassins et deux chars : une garnison à
 * l'échelle commune (ADR 0035). L'avion de l'aérodrome est le transport du largage : un chasseur
 * ne part d'un point sans piste. Deux chars restent seuls à Orléans : une pile hors garnison, pour la
 * figurine plancher (#266).
 * `--piste-mole [s]` (#269, #270) pose la scène de `--largage` et de `--navire` ; dans `s` secondes
 * (40 par défaut) une escorte venue de la mer d'Alboran accoste à Marseille ; dix secondes après, un
 * chasseur sort du hangar et un cargo neuf est lancé ; cinq encore, le transport décolle vers Naples
 * et le cargo de Marseille appareille vers Alexandrie ; vingt encore, le transport, porté près de
 * Naples, fait demi-tour et se pose vingt-cinq secondes après. Lieux `aerodrome` et `port`.
 * `--raser` (#326) pose la caserne de `--niveaux` et y fait entrer la garnison de `--echelle` :
 * une caserne à raser dans l'interface, sa garnison posée au point.
 * `--demanteler` (#340) pose l'avant-poste de `--livraison` près de Bruxelles, un camion en
 * garnison : un point à démanteler dans l'interface.
 * `--combat [s]` (#272) pose une garnison britannique à Sedan, deux fantassins et un char, et
 * lance sur elle une colonne française de même force, qui arrive dans `s` secondes (25 par
 * défaut) : le temps d'ouvrir la carte, où le combat se joue à son point.
 * `--combat-mer [s]` (#324) mouille deux escorteurs britanniques en Manche, au nord de
 * Cherbourg, et lance sur eux deux escorteurs français, qui arrivent dans `s` secondes (25 par
 * défaut) : le combat se joue en mer, et `lieu=@combat-mer` cadre son point.
 * `--bombarder [s]` (#325) met une pièce française en batterie au nord de Paris (`@batterie`), une
 * garnison britannique de douze troupes à 78 km, vers Amiens (`@bombarder`), et, en mer, une pièce
 * sur la côte du Cotentin (`@batterie-mer`) face à six escorteurs mouillés à 50 km (`@bombarder-mer`) ; un
 * fantassin français relève chaque cible. Les deux pièces tirent dans `s` secondes (40 par défaut,
 * le temps de la mise en batterie et d'ouvrir la carte), puis encore `--salves N` fois toutes les
 * 125 s, leur recharge passée : la démo tourne jusqu'à la dernière salve.
 * `--arrivee [s]` (#362) fait marcher de Reims vers l'est-nord-est une pile mêlée française (trois
 * fantassins, deux chars, un canon) qui arrive sur un point vide dans `s` secondes (25 par
 * défaut) : la colonne s'y déploie, et `lieu=@arrivee` cadre son point.
 * `--quai-dense` (#433) pose la scène de `--navire` et huit chantiers dans les régions voisines
 * de Marseille (le QG de `--chantiers` d'abord) : un anneau trop large pour sa côte, dessiné à son
 * plus petit (×0,4), le cargo à quai. Avec `--appareille`, le cargo part pour Agde, et l'heure du
 * départ s'imprime, pour `--horloge` de la capture (le fondu de 0,5 s). `lieu=@quai-dense`.
 * `--flotte-cote [s]` (#395) pose la scène de `--navire` et envoie le cargo de Marseille vers un
 * point de terre à Agde, arrivée dans `s` secondes (25 par défaut) : le fil d'une flotte finit sur
 * la pile (#381), et `lieu=@flotte-cote` cadre ce point d'arrivée.
 *
 * `--chargement [s]` (#271) pose pour la France un entrepôt dans l'Oise et un camion vide en
 * garnison à l'entrepôt et au QG, puis les charge dans `s` secondes (25 par défaut) : deux cents
 * munitions à l'entrepôt (deux caisses), soixante au QG puis soixante de pétrole une seconde après
 * (deux chargements joints). `lieu=@chargement` cadre l'entrepôt, `lieu=@chargement-qg` le QG.
 * `--en-tournee [s]` (#278) met en tournée par Bruxelles un camion de l'entrepôt de l'Oise et un
 * du QG, les y décharge, et les fait rentrer dans `s` secondes (25 par défaut) : ils rechargent et
 * repartent de la route. Avec `--cour`, ils attendent à la cour, les munitions à zéro, et le stock
 * rendu dans `s` secondes les fait repartir de leur rang. `lieu=@en-tournee`, `lieu=@en-tournee-qg`.
 *
 * `--huit` (#211) fait jouer huit comptes, a à h, une nation chacun (france, uk, germany, italy,
 * ussr, usa, japan, china) : une revue de deux fantassins et d'un blindé à chaque capitale, lieux
 * `capitale-<nation>`. `--evacuation` (#450, avec `--huit`) donne à l'URSS une caserne de niveau 2 à
 * Pskov et une caserne de niveau 3 en réserve (`evacuation`, compte e), un entrepôt sans réserve
 * (`evacuation-neuf`), un arsenal gardé au niveau 5 sous un QG de niveau 4, un avant-poste en
 * Roumanie dont le puits est sous capture française (`demantelement`), et pose sur une caserne
 * française de la Marne une capture soviétique qui court (`sous-capture`, compte a).
 * `--pret-bail` (#448, avec `--huit`) pose un avant-poste américain à Aix-la-Chapelle et son camion
 * chargé (`pret-bail-convoi`, compte f), deux avant-postes français que le relevé américain garde,
 * Namur au dépôt entamé (`pret-bail`) et Liège (`pret-bail-recu`), un camion français chargé à
 * Namur qui a relevé Aix-la-Chapelle (le refus, compte a), et un Prêt-bail déjà livré à Liège : le
 * convoi et le receveur (compte a) lisent chacun leur dépêche.
 * `--porte-avions` (#449, avec `--huit`) fait partir au large de Honshu une escadre japonaise au
 * cap libre (`porte-avions`, compte g) et une escadre française du même point au même instant
 * (compte a), et pose une seconde escadre japonaise passée la mi-parcours (`porte-avions-tenu`).
 * `--guerre-eclair` (#451, avec `--huit`) pose trois chars allemands devant Aix-la-Chapelle
 * (`guerre-eclair`, compte c), deux avant-postes français relevés (`liege`, `namur`), un point de
 * marche (`spa`) et un avant-poste allemand (`bastogne`) ; puis une attaque à deux cibles en vol
 * (`guerre-eclair-lancee`), une seconde jambe partie (`guerre-eclair-tenue`, que la France voit
 * repartir), une tombée (`guerre-eclair-perdue`) et une restée faute de coups (`guerre-eclair-restee`).
 * `--rangs` pose, à côté de Paris (`rangs`), infanterie et blindé des deux
 * rangs et une artillerie, et une escorte et un porte-avions en golfe de Gascogne (`rangs-mer`).
 * `--recrue [s]` forme une infanterie de rang 2 à la caserne de `--niveaux` et la fait sortir dans
 * `s` secondes (25 par défaut) : lieu `recrue`. `--rejeu` joue le combat de `--combat` tout de
 * suite et attend son compte rendu : un combat passé, à rejouer (`combat`). `--hors-portee` pose
 * un QG à Paris et une mine sur le charbon de la Ruhr, sans avant-poste (`hors-portee`).
 * `--pillage` pose la scène de `--points` sans y envoyer l'escorte, fait marcher deux fantassins
 * français sur l'entrepôt adverse relevé en Pologne, et recule leur présence d'une heure et demie :
 * trois caisses sur quatre sont tombées (`pillage`).
 *
 * `--absence` (#439) rend au Royaume-Uni (compte b) une absence de neuf heures : douze dépêches à
 * lieu autour de Londres, son rejeu jamais vu, ses premiers pas passés (`absence`). À rejouer sans
 * refonder : `npx convex run dev:absenceScene '{"playerId":"…"}'`.
 *
 * `--moments` (#442) pose les QG de Paris et de Londres et donne à la France Narvik, Istanbul et
 * Bakou (`moments` cadre les Sept, `tanger`, `narvik`, `londres`), puis écrit les commandes qui
 * jouent chaque moment à l'heure voulue, dans l'ordre : Tanger prise (le cachet « IV », la course
 * et ses anneaux), Narvik reprise (« compte rompu »), Londres prise (le QG tombé). La victoire aux
 * points se joue à part, sur une scène refondée : Tanger prise, puis la course close. Avec
 * `--huit`, un tiers les lit aussi.
 *
 * `--saboteur` (#432) ajoute à `--sites` (qu'il sous-entend) une seconde mine de charbon, sabotée
 * douze heures, à six cents mètres de celle de Lorraine, dans la même région : seule la première
 * doit s'animer (`saboteur`).
 * `--mine-chantier` (#454) pose pour la France le QG à Paris, la mine offerte du charbon du Nord et
 * une seconde mine de charbon, payée, sur le gisement de Lorraine : elle reste en chantier
 * (`mine-chantier` cadre le gisement). `--salon-huit` (#454) inscrit huit comptes, a à h, à une
 * saison de huit nations réservées et prêtes, sans la lancer : `/plateau?season={saison}` fait
 * entrer le compte dans le salon (`capture.mjs` y met la saison ; la route tombe sur
 * `SEASON_NOT_LAUNCHED`, une erreur de console attendue, puis renvoie au salon). `--huit` passe un compte qui
 * existe en base sans mot de passe connu : un pseudo neuf est inscrit à sa place, et écrit dans
 * le fichier des comptes — à chaque exécution, `--huit` ou non. Une connexion trop rapprochée
 * (`LOGIN_TOO_FAST`) attend trois secondes et retente, sans renommer.
 *
 * `--conclue <raison>` (#455) conclut la partie à huit (`points`, `clock`, `draw`, `closed`) :
 * son édition finale au lieu `edition`, une saison détruite après archive (`edition-detruite`)
 * pour l'accueil ; `--en-attente` retient l'édition sous presse, `--sans-archive` la laisse absente.
 * Voir `scripts/demo-conclusion.mjs`.
 *
 *     npm run demo:mondiale
 *
 * Refuse toute URL qui n'est pas 127.0.0.1 ou localhost. Les comptes (mot de passe compris) vont
 * dans `scripts/demo-mondiale.accounts.json`, ignoré par git, et lu par `scripts/capture.mjs`.
 * Une démo existante est réutilisée : les comptes restent, une nouvelle partie est fondée.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { conclusionAsked, concludeDemo } from './demo-conclusion.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const accountsFile = fileURLToPath(new URL('./demo-mondiale.accounts.json', import.meta.url));
/** `--tutoriel` : une place neuve, au début des premiers pas (ADR 0027 §2) — rien de posé. */
/** Les lieux des scènes posées, écrits dans le fichier des comptes : `lieu=@camion` de `capture.mjs`. */
const places = {};
/** The guns of `--bombarder` and their targets, fired once the accounts are written. */
const shelling = [];
const bare =
  process.argv.includes('--nu') ||
  process.argv.includes('--tutoriel') ||
  process.argv.includes('--salon-huit');
const steps = process.argv.includes('--crans');
const harvest = process.argv.includes('--recolte');
/** `--bac-plein` : avec `--recolte`, le bac de charbon plein et sa mine qui tourne : du perdu. */
const fullBin = process.argv.includes('--bac-plein');
const tours = process.argv.includes('--tournee');
/** `--sans-depart` : la scène des tournées, mais aucune lancée — à lancer page ouverte (#128). */
const held = process.argv.includes('--sans-depart');
const rangoon = process.argv.includes('--rangoun');
/** `--piste-mole [s]` (#269, #270) : des avions et des coques qui sortent, se posent, partent. */
const runwayAt = process.argv.indexOf('--piste-mole');
const runwayIn = runwayAt < 0 ? null : Number(process.argv[runwayAt + 1]) || 40;
const airdrops =
  runwayIn !== null || process.argv.includes('--largage') || process.argv.includes('--echelle');
/** `--centre` : le Centre de `--recherche`, mais aucune carte posée — à poser depuis l'arbre. */
const idleCenter = process.argv.includes('--centre');
/** `--sites` (#273) : les sites qui vivent au repos, le Centre qui cherche compris. */
const saboteur = process.argv.includes('--saboteur');
const livingSites = process.argv.includes('--sites') || saboteur;
const research = idleCenter || livingSites || process.argv.includes('--recherche');
const artillery = process.argv.includes('--artillerie');
const points = process.argv.includes('--points');
/** `--pillage` (#211) : `--points`, sans l'escorte en mer, plus un pillage en phase de présence. */
const pillaging = process.argv.includes('--pillage');
/** `--conclue <raison>` (#455, `scripts/demo-conclusion.mjs`) : une Mondiale à huit, conclue. */
const conclusion = conclusionAsked(process.argv);
/** `--huit` (#211) : huit comptes, une nation chacun, une revue à chaque capitale. */
const lobbying = process.argv.includes('--salon-huit');
const eight = process.argv.includes('--huit') || lobbying || conclusion !== null;
/** `--rangs` (#211) : les deux rangs d'infanterie et de blindé, une artillerie, une flotte. */
const ranks = process.argv.includes('--rangs');
/** `--chargement [s]` : deux camions chargés dans `s` secondes, à l'entrepôt et au QG (#271). */
const loadingAt = process.argv.indexOf('--chargement');
const loadingIn = loadingAt < 0 ? null : Number(process.argv[loadingAt + 1]) || 25;
let loadingTrucks = null;
/** `--en-tournee [s]` (#278) : un camion en tournée à l'entrepôt, un autre au QG, de retour de
 *  Bruxelles dans `s` secondes : ils rechargent et repartent. Avec `--cour`, ils attendent déjà à
 *  la cour, le stock de munitions vide, et repartent dans `s` secondes, le stock rendu. */
const touringAt = process.argv.indexOf('--en-tournee');
const touringIn = touringAt < 0 ? null : Number(process.argv[touringAt + 1]) || 25;
const yard = process.argv.includes('--cour');
let touringTrucks = null;
/** What `--piste-mole` sends off at the end: from its building, toward a far point. */
let runwayScene = null;
/** `--recrue [s]` (#211) : une infanterie de rang 2 formée à la caserne, sortie dans s secondes. */
const recruitAt = process.argv.indexOf('--recrue');
const recruitIn = recruitAt < 0 ? null : Number(process.argv[recruitAt + 1]) || 25;
/** `--rejeu` (#211) : le combat de `--combat`, joué tout de suite : un compte rendu à rejouer. */
const replaying = process.argv.includes('--rejeu');
/** `--hors-portee` (#211) : une mine qu'aucun avant-poste ne couvre. */
const unreached = process.argv.includes('--hors-portee');
/** `--edition` : deux éditions de presse tout de suite, la seconde avec ses variations (#180). */
const editions = process.argv.includes('--edition');
const oilLine = process.argv.includes('--petrole');
const mines = process.argv.includes('--exploitations');
/** `--niveaux` : `--chantiers`, plus une caserne de niveau 3 (ADR 0031). */
/** `--raser` (#326) : la caserne de `--niveaux` et la garnison de `--echelle`, à raser. */
const razing = process.argv.includes('--raser');
const levels =
  razing ||
  recruitIn !== null ||
  process.argv.includes('--niveaux') ||
  process.argv.includes('--echelle');
const works =
  levels || process.argv.includes('--chantiers') || process.argv.includes('--quai-dense');
/** `--caserne-chantier` (#365) : une caserne seule en chantier dans l'Aube, son premier niveau
 *  qui monte — le bâtiment coupé sur son socle entier. */
const risingBarracks = process.argv.includes('--caserne-chantier');
/** `--caserne-montee` (#366) : la caserne de niveau 3 du QG, tête de file d'une montée au niveau 4
 *  (le QG est élevé au niveau 5 pour la permettre) : sa cour montre les trois niveaux et le chantier. */
const raisingBarracks = process.argv.includes('--caserne-montee');
/** `--flotte-cote [s]` : une flotte partie de Marseille vise la côte d'Agde, arrivée dans s secondes (#395). */
const coastAt = process.argv.indexOf('--flotte-cote');
const coastIn = coastAt < 0 ? null : Number(process.argv[coastAt + 1]) || 25;
/** `--quai-dense` : deux ports dans un anneau à ×0,4, un cargo à quai, un qui appareille (#433). */
const denseQuay = process.argv.includes('--quai-dense');
const navy =
  denseQuay ||
  coastIn !== null ||
  runwayIn !== null ||
  process.argv.includes('--navire') ||
  process.argv.includes('--echelle');
/** `--deux-camions` : la scène de `--livraison`, avec un second camion vide au QG (#319). */
const twinTrucks = process.argv.includes('--deux-camions');
/** `--demanteler` (#340) : l'avant-poste de `--livraison` près de Bruxelles, à démanteler dans
 *  l'interface : son épingle, l'aire qu'il colore, un camion en garnison. */
const dismantling = process.argv.includes('--demanteler');
const logistics =
  dismantling || tours || twinTrucks || touringIn !== null || process.argv.includes('--livraison');
/** `--voisins` : un avant-poste britannique en Hainaut, contre le Nord français (#217). */
const neighbours = process.argv.includes('--voisins');
/** `--quais` : trois avant-postes français, à La Valette, à Singapour et à Florence (#221). */
/** `--iles` : `--quais`, plus Malte débarquée, fondée et son quai, et Syracuse en face (#224). */
const islands = process.argv.includes('--iles');
/** `--brest` (#436) : un chantier de port français à Brest, sur sa rade : un port dans une baie
 *  fermée, tourné vers l'eau qu'il a devant lui. */
const brest = process.argv.includes('--brest');
const quays = islands || process.argv.includes('--quais');
/** `--liaisons` (#370) : deux avant-postes français en liaison en Belgique, un seul à Bâle,
 *  une pile à Charleroi ; `--sans-charbon` met le charbon national à zéro (vigies aveugles). */
const liaisons = process.argv.includes('--liaisons');
/** `--zones` (#375) : un réseau lorrain à triangles, un Guet, un point désactivé, une pile. */
const zones = process.argv.includes('--zones');
/** `--ronde` (#376) : une étoile lorraine autour de Metz, une ronde en route depuis Luxembourg,
 *  une en halte à Nancy, une infanterie seule à Metz à lancer, une dépêche de fin. */
const patrols = process.argv.includes('--ronde');
/** `--ligne` (#377) : une ronde Liège–Sarrebruck, et une colonne adverse que sa seule ligne a relevée. */
const watchLine = process.argv.includes('--ligne');
/** `--deux-vigies` (#412) : une colonne dans le trou entre deux vigies ; `--reparue`, sous la seconde. */
const twoSentries = process.argv.includes('--deux-vigies');
/** `--metiers` (#371) : un point à élever, un ancien qui choisit, un Magasin qui change, un Guet. */
const specialties = process.argv.includes('--metiers');
/** `--magasin` (#372) : un Magasin plein à Berne, un presque vide à Innsbruck, une pile à sec
 *  devant chacun, et deux colonnes qui les traversent et arrivent vingt secondes après. */
const stores = process.argv.includes('--magasin');
/** `--fort` (#374) : une colonne adverse retenue à Namur, une française à côté d'un Fort sec. */
const forts = process.argv.includes('--fort');
/** `--guet` (#373) : un Guet qui lit une colonne et un camp britanniques, un généraliste qui non. */
const lookout = process.argv.includes('--guet');
/** `--accrochages` (#441) : des accrochages en Lorraine, en Manche, devant Francfort et en Égypte. */
const contacts = process.argv.includes('--accrochages');
const dryCoal = process.argv.includes('--sans-charbon');
/** `--epingles [N]` : N piles semées sur la France (1000 par défaut), des relevés en face (#234). */
const pinsAt = process.argv.indexOf('--epingles');
const pins = pinsAt < 0 ? null : Number(process.argv[pinsAt + 1]) || 1000;
/** `--lisbonne` : Lisbonne tenue par la France, qui lit la nation de ses relevés (P11). */
const lisbon = process.argv.includes('--lisbonne');
/** `--trajets` : une colonne Paris → Berlin à pied, une escorte Brest → Marseille par Gibraltar (#231). */
const threads = process.argv.includes('--trajets');
/** `--files` : trois colonnes de douze troupes de terre en route vers l'est (#276). */
const files = process.argv.includes('--files');
/** `--trajet-mixte` : une pile mêlée débarquée en baie de Seine, au quai d'arrivée (#276). */
const mixedLanding = process.argv.includes('--trajet-mixte');
/** `--passagers` : un camion chargé de deux fantassins en Beauce, un autre vide (#238). */
const passengers = process.argv.includes('--passagers');
/** `--gisements` : une mine à poser, le Hainaut prenable, la Sarre prise, la Ruhr hors de portée (#239). */
const depositsAt = process.argv.includes('--gisements');
/** `--echelle` : une garnison entière, caserne, aérodrome et port, pour l'échelle commune (#265). */
const scale = process.argv.includes('--echelle');
/** `--troupe-seule` : avec `--echelle`, un camion et un char seuls sur un point (#301). */
const lone = process.argv.includes('--troupe-seule');
/** `--chargee` : avec `--troupe-seule`, le camion du point porte un fantassin à son bord. */
const loaded = process.argv.includes('--chargee');
/** `--combat [s]` : une colonne française sur une garnison britannique, arrivée dans s secondes (#272). */
const combatAt = process.argv.indexOf('--combat');
const combatIn = combatAt < 0 ? null : Number(process.argv[combatAt + 1]) || 25;
/** `--combat-mer [s]` : deux escorteurs français sur deux britanniques en Manche (#324). */
const seaCombatAt = process.argv.indexOf('--combat-mer');
const seaCombatIn = seaCombatAt < 0 ? null : Number(process.argv[seaCombatAt + 1]) || 25;
/** `--bombarder [s]` : deux pièces en batterie qui tirent dans s secondes, `--salves N` fois (#325). */
const shellingAt = process.argv.indexOf('--bombarder');
const shellingIn = shellingAt < 0 ? null : Number(process.argv[shellingAt + 1]) || 40;
const salvoesAt = process.argv.indexOf('--salves');
const salvoes = salvoesAt < 0 ? 1 : Number(process.argv[salvoesAt + 1]) || 1;
/** `--arrivee [s]` : une pile mêlée française qui arrive sur un point vide dans s secondes (#362). */
const arrivalAt = process.argv.indexOf('--arrivee');
const arrivalIn = arrivalAt < 0 ? null : Number(process.argv[arrivalAt + 1]) || 25;
/**
 * **Une pile vivante** (#277), chaque geste à son heure, `s` secondes après la démo (25 par
 * défaut) : `--former [s]` une escouade de deux fantassins en Champagne, rejointe par un camion à
 * `s` puis par un fantassin et un char quatre secondes après (G) ; `--dissoudre [s]` une escouade
 * de quatre pièces dans le Berry, dissoute à `s` (U) ; `--monter [s]` un camion et deux
 * fantassins en Beauce, qui montent à `s` ; `--descendre [s]` un camion chargé de deux fantassins
 * dans le Nivernais, qui en descendent à `s` ; `--embarquer [s]` deux fantassins qui marchent vers
 * un camion du Gâtinais et y montent en arrivant, à `s`, depuis leur file. Leurs lieux : `former`,
 * `dissoudre`, `monter`, `descendre`, `embarquer`.
 */
const gestureIn = (flag) => {
  const at = process.argv.indexOf(flag);
  return at < 0 ? null : Number(process.argv[at + 1]) || 25;
};
const formingIn = gestureIn('--former');
const disbandingIn = gestureIn('--dissoudre');
const boardingIn = gestureIn('--monter');
const landingIn = gestureIn('--descendre');
const marchAboardIn = gestureIn('--embarquer');
/** What the gestures of `--former`… act on, once the accounts are written. */
const pile = {};

const env = Object.fromEntries(
  (existsSync(`${root}.env.local`) ? readFileSync(`${root}.env.local`, 'utf8') : '')
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim()]),
);
const url = process.env.VITE_CONVEX_URL ?? env.VITE_CONVEX_URL;
if (!url) throw new Error('VITE_CONVEX_URL absent (.env.local)');
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error(`Refus : ${url} n'est pas un backend local.`);
}
/** `npx convex run` lit `.env.local` : il doit viser le même backend, sinon on mélangerait deux bases. */
const cliUrl = process.env.CONVEX_SELF_HOSTED_URL ?? env.CONVEX_SELF_HOSTED_URL;
if (cliUrl !== url)
  throw new Error(`CONVEX_SELF_HOSTED_URL (${cliUrl}) ≠ VITE_CONVEX_URL (${url})`);

const saved = existsSync(accountsFile) ? JSON.parse(readFileSync(accountsFile, 'utf8')) : {};
/** L'ordre des nations est celui de `scripts/banc-mondiale.mjs` ; a et b restent la France et le Royaume-Uni. */
const NATIONS = ['france', 'uk', 'germany', 'italy', 'ussr', 'usa', 'japan', 'china'];
const NICKNAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
const KEYS = 'abcdefgh'.split('');
const seats = eight ? 8 : 2;
const accounts = Object.fromEntries(
  KEYS.slice(0, seats).map((key, k) => [
    key,
    saved[key] ?? {
      nickname: `Demo${NICKNAMES[k]}`,
      password: randomBytes(9).toString('base64url'),
    },
  ]),
);
const client = new ConvexHttpClient(url);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

const LOGIN_MIN_INTERVAL_MS = 3_000; // src/domain/account.ts

/** Connexion, puis inscription seulement si le compte n'existe pas (`BAD_CREDENTIALS`) : une
 *  connexion trop rapprochée (`LOGIN_TOO_FAST`, une capture vient de se connecter) attend, puis
 *  retente — elle ne dit rien du compte. */
async function signIn({ nickname, password }) {
  for (;;) {
    try {
      return (await client.action(api.auth.login, { nickname, password })).token;
    } catch (error) {
      if (String(error).includes('LOGIN_TOO_FAST')) {
        await pause(LOGIN_MIN_INTERVAL_MS + 200);
        continue;
      }
      if (!String(error).includes('BAD_CREDENTIALS')) throw error;
      await pause(400);
      return (await client.action(api.auth.register, { nickname, password })).token;
    }
  }
}

/** **À chaque exécution, pas seulement avec `--huit`** (#454) : un compte qui existe en base sans
 *  que son mot de passe soit connu (`BAD_CREDENTIALS` puis `NICKNAME_TAKEN`) reçoit un pseudo neuf,
 *  écrit dans le fichier des comptes. */
async function signInOrRename(key, k) {
  try {
    return await signIn(accounts[key]);
  } catch (error) {
    if (!String(error).includes('NICKNAME_TAKEN')) throw error;
    accounts[key] = {
      nickname: `Demo${NICKNAMES[k]}${randomBytes(2).toString('hex')}`,
      password: randomBytes(9).toString('base64url'),
    };
    console.log(`${key} : pseudo pris, nouveau pseudo ${accounts[key].nickname}`);
    return await signIn(accounts[key]);
  }
}

const cli = (args) => execFileSync('npx', ['convex', ...args], { cwd: root, encoding: 'utf8' });

const tokens = [];
for (const [k, key] of KEYS.slice(0, seats).entries()) {
  if (tokens.length > 0) await pause(400);
  tokens.push(await signInOrRename(key, k));
}
const [tokenA, tokenB] = tokens;

const { code, seasonId } = await client.mutation(api.seasons.create, {
  token: tokenA,
  compensation: 0,
  mode: 'mondiale',
});
for (const token of tokens.slice(1)) await client.mutation(api.seasons.join, { token, code });
for (const [k, token] of tokens.entries()) {
  const nation = NATIONS[k];
  await client.mutation(api.players.reserveNation, { token, seasonId, nation });
  await client.mutation(api.players.declareReady, { token, seasonId, ready: true });
}
if (!lobbying) await client.mutation(api.seasons.launch, { token: tokenA, seasonId });

const scene = { a: null, b: null };
if (!bare) {
  cli(['run', 'dev:fillStocks', JSON.stringify({ seasonId, stock: 400 })]);
  const rows = cli(['data', 'players', '--limit', '200', '--format', 'jsonl'])
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .filter((row) => row.seasonId === seasonId);
  const at = { france: [2.35, 48.85], uk: [-0.12, 51.5] };
  places.paris = at.france;
  for (const [key, nation] of [
    ['a', 'france'],
    ['b', 'uk'],
  ]) {
    const player = rows.find((row) => row.nation === nation);
    if (!player) continue;
    scene[key] = player._id;
    cli([
      'run',
      'dev:spawnTroops',
      JSON.stringify({
        playerId: player._id,
        role: 'infantry',
        count: 3,
        lon: at[nation][0],
        lat: at[nation][1],
      }),
    ]);
  }
  /** `--huit` : une revue à chaque capitale, et son lieu `capitale-<nation>`. */
  if (eight) {
    const capitals = JSON.parse(
      cli(['run', 'dev:reviewScene', JSON.stringify({ seasonId })]).match(/\{[\s\S]*\}/)[0],
    );
    for (const [nation, point] of Object.entries(capitals)) places[`capitale-${nation}`] = point;
  }
  /** `--evacuation` : la réserve soviétique et une capture qui court sur une caserne française. */
  if (eight && process.argv.includes('--evacuation'))
    Object.assign(
      places,
      JSON.parse(
        cli(['run', 'dev:evacuationScene', JSON.stringify({ seasonId })]).match(/\{[\s\S]*\}/)[0],
      ),
    );
  /** `--pret-bail` : un camion américain chargé, deux avant-postes français relevés, une livraison
   *  déjà reçue. */
  if (eight && process.argv.includes('--pret-bail'))
    Object.assign(
      places,
      JSON.parse(
        cli(['run', 'dev:lendLeaseScene', JSON.stringify({ seasonId })]).match(/\{[\s\S]*\}/)[0],
      ),
    );
  /** `--porte-avions` : deux escadres japonaises, l'une au cap libre, l'autre passée la
   *  mi-parcours, et une escadre française au même point que la première. */
  if (eight && process.argv.includes('--porte-avions'))
    Object.assign(
      places,
      JSON.parse(
        cli(['run', 'dev:carrierDoctrineScene', JSON.stringify({ seasonId })]).match(
          /\{[\s\S]*\}/,
        )[0],
      ),
    );
  /** `--guerre-eclair` : la colonne en main, et les quatre suites d'une attaque à deux cibles. */
  if (eight && process.argv.includes('--guerre-eclair'))
    Object.assign(
      places,
      JSON.parse(
        cli(['run', 'dev:blitzkriegScene', JSON.stringify({ seasonId })]).match(/\{[\s\S]*\}/)[0],
      ),
    );
  /** `--rangs` : les deux rangs, une artillerie à côté de Paris ; une flotte au large de la Bretagne. */
  if (ranks && scene.a !== null) {
    const beside = { lon: 2.47, lat: 48.85 };
    const offshore = { lon: -6, lat: 47.5 };
    places.rangs = [beside.lon, beside.lat];
    places['rangs-mer'] = [offshore.lon, offshore.lat];
    for (const [role, tier, at] of [
      ['infantry', 1, beside],
      ['infantry', 2, beside],
      ['armor', 1, beside],
      ['armor', 2, beside],
      ['artillery', 1, beside],
      ['escort', 1, offshore],
      ['carrier', 1, offshore],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, tier, count: 1, ...at }),
      ]);
  }
  /** `--hors-portee` : le QG de Paris et une mine de la Ruhr, que nul avant-poste ne couvre. */
  if (unreached && scene.a !== null) {
    const ruhr = JSON.parse(readFileSync(`${root}public/deposits.json`, 'utf8')).find(
      (deposit) => deposit.id === 'coal-DEU-1572',
    );
    places['hors-portee'] = [ruhr.lon, ruhr.lat];
    cli(['run', 'dev:unreachedMineScene', JSON.stringify({ playerId: scene.a })]);
  }
  if (process.argv.includes('--absence') && scene.b !== null) absenceScene(scene.b);
  if (process.argv.includes('--moments') && scene.a !== null && scene.b !== null)
    await momentsScene();
  /** `--pile-mixte` : un camion, un chasseur et deux fantassins sur un même point (#286). */
  if (process.argv.includes('--pile-mixte') && scene.a !== null)
    for (const [role, count] of [
      ['landTransport', 1],
      ['fighter', 1],
      ['infantry', 2],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, count, lon: 1.0, lat: 47.3 }),
      ]);
  /** `--escouade` : un camion, un char et deux fantassins, en Essonne (sous le regard de la caméra)
   *  et dans le Cotentin, que la France dissout (#283) : la couronne au large de tout, puis contre
   *  la mer. */
  if (process.argv.includes('--escouade') && scene.a !== null)
    for (const [lon, lat] of [
      [2.35, 48.55],
      [-1.6, 49.4],
    ]) {
      for (const [role, count] of [
        ['landTransport', 1],
        ['armor', 1],
        ['infantry', 2],
      ])
        cli([
          'run',
          'dev:spawnTroops',
          JSON.stringify({ playerId: scene.a, role, count, lon, lat }),
        ]);
      await client
        .mutation(api.movements.disband, { token: tokenA, seasonId, point: { lon, lat } })
        .catch((error) => console.log(`Dissoudre en ${lon}, ${lat} : ${error.message}`));
    }
  /** `--sans-place` (#295) : huit pièces au bord de la côte irlandaise, que U ne peut pas ranger :
   *  la barre de sélection dit son refus avant le geste. */
  if (process.argv.includes('--sans-place') && scene.a !== null)
    for (const [role, count] of [
      ['landTransport', 1],
      ['armor', 1],
      ['infantry', 6],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, count, lon: -9.75, lat: 51.75 }),
      ]);
  if (passengers && scene.a !== null) {
    places.camion = [1.6, 48.2];
    const spawn = (args) =>
      cli(['run', 'dev:spawnTroops', JSON.stringify({ playerId: scene.a, ...args })]);
    const [truck] = JSON.parse(
      spawn({ role: 'landTransport', count: 1, lon: 1.6, lat: 48.2 }).match(/\[[^\]]*\]/)[0],
    );
    spawn({ role: 'infantry', count: 2, lon: 1.6, lat: 48.2, carriedBy: truck });
    spawn({ role: 'landTransport', count: 1, lon: 3.4, lat: 47.6 });
  }
  /** Hors de tout ancrage : rien ne les recharge, elles vivent sur ce qu'elles portent. */
  if (steps && scene.a !== null)
    for (const troop of [
      { role: 'infantry', rounds: 0 },
      { role: 'armor', rounds: 1, fuel: 1 },
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, count: 1, lon: 7.1, lat: 50.4, ...troop }),
      ]);
  /** Un avant-poste et son dépôt, un camion chargé au QG, un autre au point (ADR 0028 §4). */
  if (logistics && scene.a !== null)
    cli([
      'run',
      'dev:logisticsScene',
      JSON.stringify({ playerId: scene.a, fullDepot: tours, twin: twinTrucks }),
    ]);
  /** Un avion chargé à l'aérodrome, un point sans piste, une escouade isolée (ADR 0028 §4). */
  if (airdrops && scene.a !== null)
    cli(['run', 'dev:airdropScene', JSON.stringify({ playerId: scene.a })]);
  /** Un port à Marseille, un cargo à quai, un avant-poste côtier à Agde (#129). */
  if (navy && scene.a !== null)
    cli(['run', 'dev:navyScene', JSON.stringify({ playerId: scene.a })]);
  if (runwayIn !== null && scene.a !== null) runwayScene = await runwayAndMole();
  /** `--trajet-mixte` : un cargo et deux fantassins à bord, sur la côte de Boulogne (#302). Une
   *  colonne embarquée ne débarque que sur une côte et part d'un port ou d'une plage : la scène
   *  donne des traversées toutes en mer, jamais un trajet terre puis mer (aucune marche avant
   *  l'eau). Ce trajet-là attend une scène qui embarque des fantassins à quai (`dev:navyScene`). */
  if (process.argv.includes('--trajet-mixte') && scene.a !== null) {
    const spawn = (args) =>
      cli(['run', 'dev:spawnTroops', JSON.stringify({ playerId: scene.a, ...args })]);
    const at = { lon: 1.6, lat: 50.72 };
    const [cargo] = JSON.parse(spawn({ role: 'cargo', count: 1, ...at }).match(/\[[^\]]*\]/)[0]);
    spawn({ role: 'infantry', count: 2, ...at, carriedBy: cargo });
  }
  /** Un Centre de recherche, deux cartes acquises, une troisième en cours (#123). */
  if (research && scene.a !== null)
    cli(['run', 'dev:researchScene', JSON.stringify({ playerId: scene.a, idle: idleCenter })]);
  if (livingSites && scene.a !== null) {
    cli(['run', 'dev:sitesScene', JSON.stringify({ playerId: scene.a })]);
    if (saboteur) {
      cli(['run', 'dev:sabotageScene', JSON.stringify({ playerId: scene.a })]);
      places.saboteur = [6.6, 49.05];
    }
    places.sites = [3.2, 49.2];
    places.bakou = [49.9, 40.5];
  }
  /** Une salve sur seize troupes, une fois la pièce en batterie (ADR 0028 §6). */
  if (artillery && scene.a !== null && scene.b !== null) {
    cli(['run', 'dev:artilleryScene', JSON.stringify({ playerId: scene.a, enemyId: scene.b })]);
    await pause(32_000);
    const { me, camps } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const gun = me.troops.find((troop) => troop.role === 'artillery');
    const camp = camps.find((one) => !one.lastKnown && Math.abs(one.point[1] - 49.9) < 0.1);
    if (gun === undefined || camp === undefined)
      throw new Error('scène de l’artillerie incomplète');
    await client.mutation(api.movements.bombard, {
      token: tokenA,
      seasonId,
      troopId: gun.id,
      target: { kind: 'camp', campId: camp.id },
    });
  }
  /** Un arsenal et un lot de pétrole synthétique en cours (ADR 0028 §1). */
  if (mines && scene.a !== null) {
    const deposits = JSON.parse(readFileSync(`${root}public/deposits.json`, 'utf8'));
    /** Le QG d'abord (`HQ_FIRST`), à Paris ; les exploitations suivent, offertes. */
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const paris = me.regions.find((region) => region.id === 'FRA-5333');
    await client.mutation(api.constructions.start, {
      token: tokenA,
      seasonId,
      building: 'hq',
      regionId: paris.id,
      point: { lon: paris.point[0], lat: paris.point[1] },
    });
    for (const [building, id] of [
      ['farm', 'food-FRA-5291'],
      ['mine', 'coal-FRA-5334'],
      ['mine', 'iron-FRA-5275'],
    ]) {
      const site = deposits.find((deposit) => deposit.id === id);
      await client.mutation(api.constructions.start, {
        token: tokenA,
        seasonId,
        building,
        regionId: site.regionId,
        point: { lon: site.lon, lat: site.lat },
      });
    }
  }
  /** `--mine-chantier` (#454) : la mine offerte du Nord, puis une seconde sur le charbon, payée. */
  if (process.argv.includes('--mine-chantier') && scene.a !== null) {
    const deposits = JSON.parse(readFileSync(`${root}public/deposits.json`, 'utf8'));
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const paris = me.regions.find((region) => region.id === 'FRA-5333');
    const sites = [
      ['hq', paris.id, paris.point],
      ...['coal-FRA-5334', 'coal-FRA-5328'].map((id) => {
        const site = deposits.find((deposit) => deposit.id === id);
        return ['mine', site.regionId, [site.lon, site.lat]];
      }),
    ];
    for (const [building, regionId, [lon, lat]] of sites)
      await client.mutation(api.constructions.start, {
        token: tokenA,
        seasonId,
        building,
        regionId,
        point: { lon, lat },
      });
    const [lon, lat] = sites[2][2];
    places['mine-chantier'] = [lon, lat];
  }
  if (risingBarracks && scene.a !== null) {
    const point = (
      await client.query(api.view.playerView, { token: tokenA, seasonId })
    ).me.regions.find((one) => one.id === 'FRA-5270').point;
    await client.mutation(api.constructions.start, {
      token: tokenA,
      seasonId,
      building: 'barracks',
      regionId: 'FRA-5270',
      point: { lon: point[0], lat: point[1] },
    });
  }
  if (raisingBarracks && scene.a !== null) {
    cli(['run', 'dev:promoteHq', JSON.stringify({ playerId: scene.a, level: 5 })]);
    cli(['run', 'dev:levelsScene', JSON.stringify({ playerId: scene.a })]);
    const paris = (
      await client.query(api.view.playerView, { token: tokenA, seasonId })
    ).me.regions.find((one) => one.id === 'FRA-5333');
    await client.mutation(api.constructions.start, {
      token: tokenA,
      seasonId,
      building: 'barracks',
      regionId: paris.id,
      point: { lon: paris.point[0], lat: paris.point[1] },
    });
  }
  if (works && scene.a !== null) {
    const paris = (
      await client.query(api.view.playerView, { token: tokenA, seasonId })
    ).me.regions.find((one) => one.id === 'FRA-5333');
    await client.mutation(api.constructions.start, {
      token: tokenA,
      seasonId,
      building: 'hq',
      regionId: paris.id,
      point: { lon: paris.point[0], lat: paris.point[1] },
    });
    cli(['run', 'dev:promoteHq', JSON.stringify({ playerId: scene.a, level: 3 })]);
    if (levels) cli(['run', 'dev:levelsScene', JSON.stringify({ playerId: scene.a })]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    for (const [building, id] of [
      ['barracks', 'FRA-5268'],
      ['warehouse', 'FRA-5312'],
      ['barracks', 'FRA-5321'],
      ['warehouse', 'FRA-5328'],
    ]) {
      const region = me.regions.find((one) => one.id === id);
      await client.mutation(api.constructions.start, {
        token: tokenA,
        seasonId,
        building,
        regionId: id,
        point: { lon: region.point[0], lat: region.point[1] },
      });
    }
  }
  /** `--recrue` : une infanterie de rang 2 formée à la caserne, qui sort dans `recruitIn` secondes. */
  if (recruitIn !== null && scene.a !== null) {
    cli(['run', 'dev:grantCards', JSON.stringify({ playerId: scene.a, cards: ['infantryMk2'] })]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const barracks = me.buildings.find((building) => building.key === 'barracks');
    places.recrue = barracks.point;
    await client.mutation(api.troops.recruit, {
      token: tokenA,
      seasonId,
      buildingId: barracks.id,
      role: 'infantry',
      tier: 2,
    });
    const finishing = cli([
      'run',
      'dev:finishRecruitments',
      JSON.stringify({ playerId: scene.a, afterMs: recruitIn * 1000 }),
    ]);
    if (Number(finishing.trim().split('\n').pop()) < 1)
      throw new Error('scène de la recrue : aucun lot daté');
  }
  if (loadingIn !== null && scene.a !== null) {
    loadingTrucks = JSON.parse(
      cli(['run', 'dev:loadingScene', JSON.stringify({ playerId: scene.a })]).match(/\{[^}]*\}/)[0],
    );
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    for (const [name, key] of [
      ['chargement', 'warehouse'],
      ['chargement-qg', 'hq'],
    ]) {
      const { point } = me.buildings.find((building) => building.key === key);
      places[name] = { id: `building-${key}@${point[0]},${point[1]}`, lonLat: point };
    }
  }
  if (touringIn !== null && scene.a !== null) {
    touringTrucks = JSON.parse(
      cli(['run', 'dev:loadingScene', JSON.stringify({ playerId: scene.a })]).match(/\{[^}]*\}/)[0],
    );
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const brussels = me.outposts.find((outpost) => Math.abs(outpost.lonLat[0] - 4.35) < 0.05);
    for (const [name, key] of [
      ['en-tournee', 'warehouse'],
      ['en-tournee-qg', 'hq'],
    ]) {
      const { point } = me.buildings.find((building) => building.key === key);
      places[name] = { id: `building-${key}@${point[0]},${point[1]}`, lonLat: point };
    }
    // Loaded, sent to Brussels, unloaded there: on their way back, empty.
    for (const [troopId, amount] of [
      [touringTrucks.warehouse, 200],
      [touringTrucks.hq, 60],
    ]) {
      await client.mutation(api.logistics.load, {
        token: tokenA,
        seasonId,
        troopId,
        resource: 'ammunition',
        amount,
      });
      await client.mutation(api.tours.start, {
        token: tokenA,
        seasonId,
        troopId,
        stops: [brussels.id],
      });
    }
    cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
    await pause(3000);
    if (yard) {
      // Back at the yard, the stock dry: they wait there.
      cli(['run', 'dev:fillStocks', JSON.stringify({ seasonId, stock: 0, only: 'ammunition' })]);
      cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
      await pause(3000);
    }
  }
  if (oilLine && scene.a !== null)
    cli(['run', 'dev:oilLineScene', JSON.stringify({ playerId: scene.a })]);
  /** Bakou, Narvik, Singapour et Halifax tenus par la France, Dakar par l'adversaire, de quoi lire leurs règles. */
  if ((points || pillaging) && scene.a !== null && scene.b !== null) {
    cli(['run', 'dev:pointsScene', JSON.stringify({ playerId: scene.a, enemyId: scene.b })]);
  }
  if (points && scene.a !== null && scene.b !== null) {
    /** L'escorte prend la mer : sous Halifax, ce mouvement maritime ne prend pas de slot. */
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const fleet = me.troops.find((troop) => troop.role === 'escort');
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: { lon: -30, lat: 45 } },
      troopIds: [fleet.id],
      point: { lon: -34, lat: 47 },
    });
  }
  /** Deux fantassins marchent sur l'entrepôt relevé, arrivent, et leur présence est déjà entamée :
   *  trois caisses sur quatre sont tombées (`loadingAt`). */
  if (pillaging && scene.a !== null && scene.b !== null) {
    const warehouse = (
      await client.query(api.view.playerView, { token: tokenA, seasonId })
    ).surveyedInstallations.find((one) => one.key === 'warehouse');
    if (warehouse === undefined) throw new Error('scène du pillage : aucun entrepôt relevé');
    const [lon, lat] = warehouse.point;
    places.pillage = [lon, lat];
    const from = { lon: lon - 0.4, lat };
    cli([
      'run',
      'dev:spawnTroops',
      JSON.stringify({ playerId: scene.a, role: 'infantry', count: 2, ...from }),
    ]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const column = me.troops.filter(
      (troop) =>
        troop.role === 'infantry' &&
        troop.stationedAt.kind === 'point' &&
        Math.abs(troop.stationedAt.lonLat[0] - from.lon) < 0.01,
    );
    await client.mutation(api.movements.plunder, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: from },
      troopIds: column.map((troop) => troop.id),
      buildingId: warehouse.id,
    });
    cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
    for (let tries = 0; ; tries++) {
      await pause(500);
      const { movements } = await client.query(api.view.playerView, { token: tokenA, seasonId });
      if (movements.some((one) => one.mission?.phase === 'presence')) break;
      if (tries === 59) throw new Error('scène du pillage : la colonne n’est pas arrivée en 30 s');
    }
    const moved = cli([
      'run',
      'dev:pastPresence',
      JSON.stringify({ playerId: scene.a, hours: 1.5 }),
    ]);
    if (!/\b1\b/.test(moved)) throw new Error('scène du pillage : aucune présence en cours');
  }
  /** Rangoun à la France, et deux guetteurs de l'adversaire de part et d'autre de la mi-portée. */
  if (tours && rangoon && scene.a !== null && scene.b !== null) {
    cli(['run', 'dev:holdPoint', JSON.stringify({ playerId: scene.a, key: 'rangoon' })]);
    for (const [lon, lat] of [
      [3.47, 50.46],
      [3.11, 50.65],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.b, role: 'infantry', count: 1, lon, lat }),
      ]);
  }
  /** Deux tournées : l'une saute un dépôt plein et roule, l'autre attend (ADR 0028). */
  if (tours && !held && scene.a !== null) {
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const outpostIn = (lon) =>
      me.outposts.find((outpost) => Math.abs(outpost.lonLat[0] - lon) < 0.05);
    const lille = outpostIn(3.06);
    const brussels = outpostIn(4.35);
    const truckAt = (kind) =>
      me.troops.find(
        (troop) =>
          troop.role === 'landTransport' &&
          troop.stationedAt.kind === kind &&
          (kind === 'building' || troop.stationedAt.outpostId === brussels.id),
      );
    const start = (truck, stops) =>
      client.mutation(api.tours.start, { token: tokenA, seasonId, troopId: truck.id, stops });
    await start(truckAt('building'), [lille.id, brussels.id]);
    await start(truckAt('outpost'), [lille.id]);
    /** Sous Rangoun, un camion de tournée seul à l'arrêt en Picardie : son mât montre la mi-portée. */
    if (rangoon && scene.b !== null)
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({
          playerId: scene.a,
          role: 'landTransport',
          count: 1,
          lon: 2.3,
          lat: 49.9,
          tourBase: lille.id,
        }),
      ]);
  }
  if (neighbours && scene.b !== null)
    cli(['run', 'dev:neighbourScene', JSON.stringify({ playerId: scene.b })]);
  if (quays && scene.a !== null)
    cli(['run', 'dev:quaysScene', JSON.stringify({ playerId: scene.a })]);
  if (liaisons && scene.a !== null) {
    cli(['run', 'dev:liaisonsScene', JSON.stringify({ playerId: scene.a, dryCoal })]);
    places.liaisons = [4.87, 50.47];
    places.charleroi = [4.44, 50.41];
    places.aix = [6.08, 50.78];
  }
  if (zones && scene.a !== null) {
    cli(['run', 'dev:zonesScene', JSON.stringify({ playerId: scene.a })]);
    places.zones = [6.5, 49.1];
    places.metz = [6.18, 49.12];
    places.sarrebruck = [7.0, 49.23];
    places.thionville = [6.17, 49.36];
  }
  if (patrols && scene.a !== null) {
    cli(['run', 'dev:patrolScene', JSON.stringify({ playerId: scene.a })]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const outpostIn = (lat) =>
      me.outposts.find((outpost) => Math.abs(outpost.lonLat[1] - lat) < 0.02);
    const [luxembourg, metz] = [outpostIn(49.61), outpostIn(49.12)];
    const armor = me.troops.find(
      (troop) => troop.role === 'armor' && troop.stationedAt.outpostId === luxembourg.id,
    );
    await client.mutation(api.patrols.start, {
      token: tokenA,
      seasonId,
      troopId: armor.id,
      ends: [luxembourg.id, metz.id],
    });
    places.ronde = [6.5, 49.2];
    places.metz = [6.18, 49.12];
    places.nancy = [6.18, 48.69];
    places.luxembourg = [6.13, 49.61];
  }
  if (watchLine && scene.a !== null && scene.b !== null) {
    cli(['run', 'dev:watchLineScene', JSON.stringify({ playerId: scene.a, enemyId: scene.b })]);
    places.ligne = [6.29, 49.93];
    places.liege = [5.57, 50.63];
    places.sarrebruck = [7.0, 49.23];
  }
  if (twoSentries && scene.a !== null && scene.b !== null) {
    cli([
      'run',
      'dev:twoSentriesScene',
      JSON.stringify({
        playerId: scene.a,
        enemyId: scene.b,
        reappeared: process.argv.includes('--reparue'),
      }),
    ]);
    places['deux-vigies'] = [9.0, 51.0];
    places.cologne = [6.96, 50.94];
    places.erfurt = [11.03, 50.98];
  }
  if (specialties && scene.a !== null) {
    cli(['run', 'dev:specialtiesScene', JSON.stringify({ playerId: scene.a })]);
    places.metiers = [6.4, 49.55];
    places.arlon = [5.81, 49.68];
    places.luxembourg = [6.13, 49.61];
    places.treves = [6.64, 49.75];
    places.sarrebruck = [7.0, 49.23];
  }
  if (stores && scene.a !== null) {
    cli(['run', 'dev:storesScene', JSON.stringify({ playerId: scene.a })]);
    places.magasins = [9.3, 47.0];
    places.berne = [7.45, 46.95];
    places.innsbruck = [11.4, 47.27];
    places.turin = [7.68, 45.07];
    places.verone = [10.99, 45.44];
  }
  if (forts && scene.a !== null && scene.b !== null) {
    cli(['run', 'dev:fortScene', JSON.stringify({ playerId: scene.a, enemyId: scene.b })]);
    places.namur = [4.87, 50.47];
    places.gand = [3.72, 51.05];
    places.luxembourg = [6.13, 49.61];
  }
  if (lookout && scene.a !== null && scene.b !== null) {
    cli(['run', 'dev:guetScene', JSON.stringify({ playerId: scene.a, enemyId: scene.b })]);
    places.guet = [8.6, 49.7];
    places.francfort = [8.68, 50.11];
    places.mayence = [8.27, 50.0];
    places.berne = [7.5, 47.05];
  }
  if (islands && scene.a !== null) {
    const valletta = { lon: 14.513, lat: 35.895 };
    places.valette = [valletta.lon, valletta.lat];
    const offshore = { lon: 14.6, lat: 35.75 };
    const paris = (
      await client.query(api.view.playerView, { token: tokenA, seasonId })
    ).me.regions.find((one) => one.id === 'FRA-5333');
    await client.mutation(api.constructions.start, {
      token: tokenA,
      seasonId,
      building: 'hq',
      regionId: paris.id,
      point: { lon: paris.point[0], lat: paris.point[1] },
    });
    cli(['run', 'dev:promoteHq', JSON.stringify({ playerId: scene.a, level: 2 })]);
    for (const [role, count, at] of [
      ['infantry', 2, offshore],
      ['cargo', 1, offshore],
      ['infantry', 1, { lon: 15.28, lat: 37.07 }],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, count, lon: at.lon, lat: at.lat }),
      ]);
    const afloat = (await client.query(api.view.playerView, { token: tokenA, seasonId })).me.troops
      .filter((troop) => troop.stationedAt.kind === 'point')
      .filter((troop) => Math.abs(troop.stationedAt.lonLat[0] - offshore.lon) < 0.01);
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: offshore },
      troopIds: afloat.map((troop) => troop.id),
      point: valletta,
    });
    cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
    await pause(3000);
    const founder = afloat.find((troop) => troop.role === 'infantry');
    await client.mutation(api.movements.foundOutpostHere, {
      token: tokenA,
      seasonId,
      point: valletta,
      regionId: 'MLT-5949',
      troopIds: [founder.id],
    });
    await client.mutation(api.constructions.start, {
      token: tokenA,
      seasonId,
      building: 'port',
      regionId: 'MLT-5949',
      point: { lon: 14.5145, lat: 35.8998 },
    });
  }
  if (brest && scene.a !== null)
    await client.mutation(api.constructions.start, {
      token: tokenA,
      seasonId,
      building: 'port',
      regionId: 'FRA-5292',
      point: { lon: -4.491, lat: 48.381 },
    });
  /** Mille pièces, des camps relevés, une dernière position, et deux mouvements (#234). */
  if (pins !== null && scene.a !== null && scene.b !== null) {
    for (let seed = 0, left = pins; ; seed++, left -= 100) {
      const piles = Math.max(0, Math.min(100, left));
      cli([
        'run',
        'dev:pinsScene',
        JSON.stringify({ playerId: scene.a, enemyId: scene.b, piles, seed }),
      ]);
      if (piles === 0) break;
    }
    const lone = { lon: 0.2, lat: 44.2 };
    const raider = { lon: 7.55, lat: 49.3 };
    cli([
      'run',
      'dev:spawnTroops',
      JSON.stringify({ playerId: scene.a, role: 'infantry', count: 1, ...lone }),
    ]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const marcher = me.troops.find(
      (troop) =>
        troop.stationedAt.kind === 'point' &&
        Math.abs(troop.stationedAt.lonLat[0] - lone.lon) < 0.01,
    );
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: lone },
      troopIds: [marcher.id],
      point: { lon: -3.7, lat: 40.4 },
    });
    const theirs = (await client.query(api.view.playerView, { token: tokenB, seasonId })).me.troops;
    const runner = theirs.find(
      (troop) =>
        troop.stationedAt.kind === 'point' &&
        Math.abs(troop.stationedAt.lonLat[0] - raider.lon) < 0.01,
    );
    await client.mutation(api.movements.marchTo, {
      token: tokenB,
      seasonId,
      origin: { kind: 'point', point: raider },
      troopIds: [runner.id],
      point: { lon: 5.2, lat: 47.5 },
    });
  }
  if (threads && scene.a !== null) {
    const legs = [
      { role: 'infantry', from: { lon: 2.4, lat: 48.9 }, to: { lon: 13.4, lat: 52.5 } },
      { role: 'escort', from: { lon: -4.9, lat: 48.2 }, to: { lon: 5.3, lat: 43.1 }, fuel: 20 },
    ];
    for (const { role, from, fuel } of legs)
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, count: 1, fuel, ...from }),
      ]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    for (const { role, from, to } of legs) {
      const troop = me.troops.find(
        (one) =>
          one.role === role &&
          one.stationedAt.kind === 'point' &&
          Math.abs(one.stationedAt.lonLat[0] - from.lon) < 0.01,
      );
      await client.mutation(api.movements.marchTo, {
        token: tokenA,
        seasonId,
        origin: { kind: 'point', point: from },
        troopIds: [troop.id],
        point: to,
      });
    }
  }
  if (files && scene.a !== null) {
    // Trois colonnes à la fois : un slot de mouvement de plus que les deux du départ.
    cli([
      'run',
      'dev:grantCards',
      JSON.stringify({ playerId: scene.a, cards: ['transmissions1'] }),
    ]);
    const columns = [49.6, 49.1, 48.6].map((lat) => ({
      from: { lon: 3.2, lat },
      to: { lon: 9.5, lat: lat + 0.8 },
    }));
    for (const { from } of columns)
      for (const [role, count] of [
        ['infantry', 6],
        ['armor', 3],
        ['artillery', 3],
      ])
        cli([
          'run',
          'dev:spawnTroops',
          JSON.stringify({ playerId: scene.a, role, count, fuel: 20, ...from }),
        ]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    for (const { from, to } of columns)
      await client.mutation(api.movements.marchTo, {
        token: tokenA,
        seasonId,
        origin: { kind: 'point', point: from },
        troopIds: me.troops
          .filter(
            (one) =>
              one.stationedAt.kind === 'point' &&
              Math.abs(one.stationedAt.lonLat[0] - from.lon) < 0.01 &&
              Math.abs(one.stationedAt.lonLat[1] - from.lat) < 0.01,
          )
          .map((one) => one.id),
        point: to,
      });
    const { movements } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const first = movements.find((one) => Math.abs(one.from.lat - columns[0].from.lat) < 0.01);
    places.files = { id: first.id, lonLat: [first.from.lon, first.from.lat] };
  }
  if (mixedLanding && scene.a !== null) {
    // Un slot de plus, à côté des colonnes de `--files`.
    cli([
      'run',
      'dev:grantCards',
      JSON.stringify({ playerId: scene.a, cards: ['transmissions1', 'transmissions2'] }),
    ]);
    const offshore = { lon: -0.45, lat: 49.42 };
    for (const [role, count] of [
      ['cargo', 2],
      ['infantry', 3],
      ['armor', 2],
      ['artillery', 2],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, count, fuel: 20, ...offshore }),
      ]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: offshore },
      troopIds: me.troops
        .filter(
          (one) =>
            one.stationedAt.kind === 'point' &&
            Math.abs(one.stationedAt.lonLat[0] - offshore.lon) < 0.01 &&
            Math.abs(one.stationedAt.lonLat[1] - offshore.lat) < 0.01,
        )
        .map((one) => one.id),
      point: { lon: -0.26, lat: 49.27 },
    });
    const { movements } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const landing = movements.find((one) => Math.abs(one.from.lon - offshore.lon) < 0.01);
    places['trajet-mixte'] = { id: landing.id, lonLat: [landing.from.lon, landing.from.lat] };
  }
  const spawned = (args) =>
    JSON.parse(
      cli(['run', 'dev:spawnTroops', JSON.stringify({ playerId: scene.a, ...args })]).match(
        /\[[^\]]*\]/,
      )[0],
    );
  if (formingIn !== null && scene.a !== null) {
    const to = { lon: 4.4, lat: 48.9 };
    places.former = [to.lon, to.lat];
    spawned({ role: 'infantry', count: 2, ...to });
    const truckFrom = { lon: 4.15, lat: 48.97 };
    const later = { lon: 4.6, lat: 48.75 };
    pile.former = {
      to,
      later,
      laterTroops: [
        ...spawned({ role: 'infantry', count: 1, fuel: 20, ...later }),
        ...spawned({ role: 'armor', count: 1, fuel: 20, ...later }),
      ],
    };
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: truckFrom },
      troopIds: spawned({ role: 'landTransport', count: 1, fuel: 20, ...truckFrom }),
      point: to,
    });
    cli([
      'run',
      'dev:arriveNow',
      JSON.stringify({ playerId: scene.a, afterMs: formingIn * 1000, onTime: true }),
    ]);
  }
  if (disbandingIn !== null && scene.a !== null) {
    const at = { lon: 2.2, lat: 47.0 };
    places.dissoudre = [at.lon, at.lat];
    spawned({ role: 'infantry', count: 2, ...at });
    spawned({ role: 'armor', count: 1, ...at });
    spawned({ role: 'landTransport', count: 1, ...at });
    pile.dissoudre = at;
  }
  if (boardingIn !== null && scene.a !== null) {
    const at = { lon: 1.75, lat: 48.3 };
    places.monter = [at.lon, at.lat];
    const [truck] = spawned({ role: 'landTransport', count: 1, ...at });
    pile.monter = { truck, riders: spawned({ role: 'infantry', count: 2, ...at }) };
  }
  if (landingIn !== null && scene.a !== null) {
    const at = { lon: 3.3, lat: 47.1 };
    places.descendre = [at.lon, at.lat];
    const [truck] = spawned({ role: 'landTransport', count: 1, ...at });
    pile.descendre = spawned({ role: 'infantry', count: 2, ...at, carriedBy: truck });
  }
  if (marchAboardIn !== null && scene.a !== null) {
    const at = { lon: 2.6, lat: 48.2 };
    const from = { lon: 2.35, lat: 48.3 };
    places.embarquer = [at.lon, at.lat];
    const [truck] = spawned({ role: 'landTransport', count: 1, ...at });
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: from },
      troopIds: spawned({ role: 'infantry', count: 2, fuel: 20, ...from }),
      boardsOn: truck,
      point: at,
    });
    cli([
      'run',
      'dev:arriveNow',
      JSON.stringify({ playerId: scene.a, afterMs: marchAboardIn * 1000, onTime: true }),
    ]);
  }
  if (arrivalIn !== null && scene.a !== null) {
    const from = { lon: 4.1, lat: 49.25 };
    const to = { lon: 4.9, lat: 49.5 };
    places.arrivee = [to.lon, to.lat];
    const column = [
      ['infantry', 3],
      ['armor', 2],
      ['artillery', 1],
    ].flatMap(([role, count]) =>
      JSON.parse(
        cli([
          'run',
          'dev:spawnTroops',
          JSON.stringify({ playerId: scene.a, role, count, fuel: 20, ...from }),
        ]).match(/\[[^\]]*\]/)[0],
      ),
    );
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: from },
      troopIds: column,
      point: to,
    });
    cli([
      'run',
      'dev:arriveNow',
      JSON.stringify({ playerId: scene.a, afterMs: arrivalIn * 1000, onTime: true }),
    ]);
  }
  if (denseQuay && scene.a !== null) {
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const site = me.buildings.find((one) => one.key === 'port');
    places['quai-dense'] = site.point;
    cli(['run', 'dev:fillStocks', JSON.stringify({ seasonId, stock: 2000 })]);
    // Sites in my regions within 150 km of the port, 30 km apart at least (`BUILDING_TOO_CLOSE`):
    // a ring too wide for its coast. A refusal is said, and too few stops the scene.
    const km = ([a, b], [c, d]) => 111 * Math.hypot((a - c) * Math.cos((b * Math.PI) / 180), b - d);
    const refusals = [];
    let started = 0;
    for (const region of me.regions
      .filter((one) => km(one.point, site.point) < 150)
      .sort((a, b) => km(a.point, site.point) - km(b.point, site.point))) {
      if (started === 8) break;
      await client
        .mutation(api.constructions.start, {
          token: tokenA,
          seasonId,
          building: started % 2 === 0 ? 'barracks' : 'warehouse',
          regionId: region.id,
          point: { lon: region.point[0], lat: region.point[1] },
        })
        .then(
          () => started++,
          (error) => refusals.push(`${region.id} : ${JSON.stringify(error.data ?? error.message)}`),
        );
    }
    console.log(`quai-dense : ${started} chantiers près de Marseille`);
    if (started < 4)
      throw new Error(`quai-dense : trop peu de chantiers près du port\n${refusals.join('\n')}`);
    if (process.argv.includes('--appareille')) {
      const cargo = me.troops.find((one) => one.role === 'cargo');
      await client.mutation(api.movements.marchTo, {
        token: tokenA,
        seasonId,
        origin: { kind: 'building', buildingId: site.id },
        troopIds: [cargo.id],
        point: { lon: 3.47, lat: 43.31 },
      });
      const view = await client.query(api.view.playerView, { token: tokenA, seasonId });
      const leaving = (view.movements ?? view.me.movements).find((one) =>
        one.troopIds.includes(cargo.id),
      );
      console.log(`quai-dense : départ ${new Date(leaving.departedAt).toISOString()}`);
    }
  }
  if (coastIn !== null && scene.a !== null) {
    const to = { lon: 3.47, lat: 43.31 };
    places['flotte-cote'] = [to.lon, to.lat];
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const port = me.buildings.find((building) => building.key === 'port');
    const fleet = me.troops.filter(
      (one) => one.role === 'cargo' && one.stationedAt.kind === 'building',
    );
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'building', buildingId: port.id },
      troopIds: fleet.map((one) => one.id),
      point: to,
    });
    cli([
      'run',
      'dev:arriveNow',
      JSON.stringify({ playerId: scene.a, afterMs: coastIn * 1000, onTime: true }),
    ]);
  }
  if ((combatIn !== null || replaying) && scene.a !== null && scene.b !== null) {
    const garrison = { lon: 4.94, lat: 49.7 };
    places.combat = [garrison.lon, garrison.lat];
    const from = { lon: 4.72, lat: 49.66 };
    const spawn = (playerId, role, count, at) =>
      JSON.parse(
        cli(['run', 'dev:spawnTroops', JSON.stringify({ playerId, role, count, ...at })]).match(
          /\[[^\]]*\]/,
        )[0],
      );
    for (const [role, count] of [
      ['infantry', 2],
      ['armor', 1],
    ])
      spawn(scene.b, role, count, garrison);
    const column = [...spawn(scene.a, 'infantry', 2, from), ...spawn(scene.a, 'armor', 1, from)];
    // A garrison is attacked once seen: the column relieves it first.
    cli(['run', 'dev:benchReassess', JSON.stringify({ seasonId })]);
    const { camps } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const camp = camps.find((one) => Math.abs(one.point[0] - garrison.lon) < 0.05);
    await client.mutation(api.movements.attack, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: from },
      troopIds: column,
      target: { kind: 'camp', campId: camp.id },
    });
    cli([
      'run',
      'dev:arriveNow',
      JSON.stringify({ playerId: scene.a, afterMs: replaying ? 0 : combatIn * 1000 }),
    ]);
    /** `--rejeu` : le combat est passé quand le compte rendu paraît dans la vue. */
    if (replaying) {
      for (let tries = 0; tries < 30; tries++) {
        await pause(1000);
        const { reports } = await client.query(api.view.playerView, { token: tokenA, seasonId });
        if (reports.length > 0) break;
        if (tries === 29) throw new Error('scène du rejeu : aucun combat résolu en 30 s');
      }
    }
  }
  if (contacts && scene.a !== null && scene.b !== null) contactsScene(scene.a, scene.b);
  if (seaCombatIn !== null && scene.a !== null && scene.b !== null) {
    const moored = { lon: -1.6, lat: 50.05 };
    // Framed between the two lines, three hulls apart (storyboard), not on the moored one: the
    // attacker's must stand on a phone too.
    places['combat-mer'] = [moored.lon - 0.9, moored.lat];
    const from = { lon: -1.95, lat: 50.0 };
    const spawn = (playerId, count, at) =>
      JSON.parse(
        cli([
          'run',
          'dev:spawnTroops',
          JSON.stringify({ playerId, role: 'escort', count, ...at }),
        ]).match(/\[[^\]]*\]/)[0],
      );
    spawn(scene.b, 2, moored);
    const fleet = spawn(scene.a, 2, from);
    cli(['run', 'dev:benchReassess', JSON.stringify({ seasonId })]);
    const { camps } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const camp = camps.find(
      (one) =>
        Math.abs(one.point[0] - moored.lon) < 0.05 && Math.abs(one.point[1] - moored.lat) < 0.05,
    );
    if (camp === undefined) throw new Error('combat en mer : la flotte mouillée n’est pas relevée');
    await client.mutation(api.movements.attack, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: from },
      troopIds: fleet,
      target: { kind: 'camp', campId: camp.id },
    });
    cli([
      'run',
      'dev:arriveNow',
      JSON.stringify({ playerId: scene.a, afterMs: seaCombatIn * 1000 }),
    ]);
  }
  if (shellingIn !== null && scene.a !== null && scene.b !== null) {
    const spawn = (playerId, role, count, at) =>
      JSON.parse(
        cli(['run', 'dev:spawnTroops', JSON.stringify({ playerId, role, count, ...at })]).match(
          /\[[^\]]*\]/,
        )[0],
      );
    const fronts = [
      // Ashore: a gun north of Paris on a garrison towards Amiens, 78 km.
      { gun: { lon: 2.35, lat: 49.2 }, target: { lon: 2.3, lat: 49.9 }, name: 'bombarder' },
      // At sea: a gun on the Cotentin on six escorts moored off it, 50 km.
      { gun: { lon: -1.55, lat: 49.55 }, target: { lon: -1.6, lat: 50.0 }, name: 'bombarder-mer' },
    ];
    for (const [k, { gun, target, name }] of fronts.entries()) {
      places[name] = [target.lon, target.lat];
      places[name.replace('bombarder', 'batterie')] = [gun.lon, gun.lat];
      places[`${name}-milieu`] = [(gun.lon + target.lon) / 2, (gun.lat + target.lat) / 2];
      const [piece] = spawn(scene.a, 'artillery', 1, gun);
      // Enough to stand a dozen salvoes, each striking four at most.
      if (k === 0) {
        spawn(scene.b, 'infantry', 9, target);
        spawn(scene.b, 'armor', 3, target);
      } else spawn(scene.b, 'escort', 6, target);
      // A rifle of mine within sight of the target: a gun fires on what is seen.
      spawn(scene.a, 'infantry', 1, { lon: target.lon + 0.15, lat: target.lat - 0.12 });
      shelling.push({ piece, target });
    }
    cli(['run', 'dev:benchReassess', JSON.stringify({ seasonId })]);
  }
  /** Les fantassins et les chars entrent dans la caserne (#265). */
  if ((scale || razing) && scene.a !== null) {
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const barracks = me.buildings.find((building) => building.key === 'barracks');
    const from = { lon: 2.0, lat: 48.6 };
    for (const [role, count] of [
      ['infantry', 3],
      ['armor', 2],
    ]) {
      const start = { lon: from.lon + count / 10, lat: from.lat };
      const spawned = JSON.parse(
        cli([
          'run',
          'dev:spawnTroops',
          JSON.stringify({ playerId: scene.a, role, count, ...start }),
        ]).match(/\[[^\]]*\]/)[0],
      );
      await client.mutation(api.movements.enterGarrison, {
        token: tokenA,
        seasonId,
        origin: { kind: 'point', point: start },
        troopIds: spawned,
        buildingId: barracks.id,
      });
    }
    cli([
      'run',
      'dev:spawnTroops',
      JSON.stringify({ playerId: scene.a, role: 'armor', count: 2, lon: 1.9, lat: 47.9 }),
    ]);
    cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
  }
  /** Des unités seules (#301) : le camion du QG, l'avion de l'aérodrome et la coque du port sont
   *  chacun seuls dans leur garnison ; un camion seul sur un point (avec `--chargee`, il porte un
   *  fantassin), et un char seul sur un autre. */
  if (scale && lone && scene.a !== null) {
    const spawn = (role, lon, lat, carriedBy) =>
      JSON.parse(
        cli([
          'run',
          'dev:spawnTroops',
          JSON.stringify({ playerId: scene.a, role, count: 1, lon, lat, carriedBy }),
        ]).match(/\[[^\]]*\]/)[0],
      );
    const [truck] = spawn('landTransport', 2.4, 47.2);
    if (loaded) spawn('infantry', 2.4, 47.2, truck);
    spawn('armor', 3.1, 47.6);
    cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
  }
  if (depositsAt && scene.a !== null && scene.b !== null)
    cli(['run', 'dev:depositsScene', JSON.stringify({ playerId: scene.a, enemyId: scene.b })]);
  if (lisbon && scene.a !== null)
    cli(['run', 'dev:holdPoint', JSON.stringify({ playerId: scene.a, key: 'lisbon' })]);
  if (harvest) {
    if (fullBin)
      cli(['run', 'dev:fillStocks', JSON.stringify({ seasonId, stock: 400, only: 'coal' })]);
    cli([
      'run',
      'dev:pastVisit',
      JSON.stringify({
        seasonId,
        hours: 9,
        gains: fullBin
          ? { food: 72, steel: 72, coal: 36, oil: -36 }
          : { food: 108, steel: 72, oil: -30 },
      }),
    ]);
  }
}

if (editions)
  for (const round of [0, 1]) {
    if (round > 0) await pause(1200);
    cli(['run', 'press:writeEditionJob', JSON.stringify({ seasonId })]);
  }

if (conclusion !== null)
  Object.assign(
    places,
    await concludeDemo({ client, cli, pause, tokens, seasonId, ...conclusion }),
  );

writeFileSync(
  accountsFile,
  `${JSON.stringify({ ...saved, ...accounts, code, seasonId, places }, null, 2)}\n`,
);
console.log(`Mondiale lancée : code ${code}, saison ${seasonId}`);
console.log(`Comptes : ${accounts.a.nickname} (a), ${accounts.b.nickname} (b) → ${accountsFile}`);

/** `--piste-mole` : what leaves, once the page has the view before it (#269, #270); the plane
 *  turns back to its airfield and lands, both arrivals brought forward. */
if (runwayScene !== null) {
  await pause((runwayIn + 15) * 1000);
  const ids = [];
  for (const { from, troopIds, to } of runwayScene)
    ids.push(
      await client.mutation(api.movements.marchTo, {
        token: tokenA,
        seasonId,
        origin: { kind: 'building', buildingId: from },
        troopIds,
        point: to,
      }),
    );
  console.log(`Départs de la piste et du môle à ${new Date().toISOString()}`, ids);
  // Its take-off played, the plane is brought near Naples, turned back, and lands in 25 s.
  await pause(20_000);
  cli([
    'run',
    'dev:arriveNow',
    JSON.stringify({ playerId: scene.a, afterMs: 300_000, onTime: true }),
  ]);
  const flight = ids[0];
  await client.mutation(api.movements.changeCourse, {
    token: tokenA,
    seasonId,
    movementId: typeof flight === 'string' ? flight : flight.movementId,
    type: 'march',
    target: { kind: 'building', buildingId: runwayScene[0].from },
  });
  cli([
    'run',
    'dev:arriveNow',
    JSON.stringify({ playerId: scene.a, afterMs: 25_000, onTime: true }),
  ]);
  console.log(`Retour à la piste dans 25 s, à ${new Date().toISOString()}`);
}

/** `--chargement` : the trucks load, the HQ's twice a second apart: the second load joins. */
if (loadingTrucks !== null) {
  await pause(loadingIn * 1000);
  const load = (troopId, resource, amount) =>
    client.mutation(api.logistics.load, { token: tokenA, seasonId, troopId, resource, amount });
  await load(loadingTrucks.warehouse, 'ammunition', 200);
  await load(loadingTrucks.hq, 'ammunition', 60);
  await pause(1000);
  await load(loadingTrucks.hq, 'oil', 60);
  console.log(`Camions chargés à ${new Date().toISOString()}`);
}

/** `--en-tournee` (#278): the trucks come back to load, or their stock comes back at the yard. */
if (touringTrucks !== null) {
  await pause(touringIn * 1000);
  // Stock for both consignes: two hundred at the warehouse, sixty at the HQ.
  cli(['run', 'dev:fillStocks', JSON.stringify({ seasonId, stock: 400, only: 'ammunition' })]);
  if (yard)
    for (const troopId of [touringTrucks.warehouse, touringTrucks.hq])
      cli(['run', 'tours:retry', JSON.stringify({ troopId })]);
  else cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
  console.log(`Tournées rechargées à ${new Date().toISOString()}`);
}

/** `--former`, `--dissoudre`, `--monter`, `--descendre` (#277): each gesture at its hour. */
const gestures = [
  // The second column leaves before the truck arrives, at its own pace: the squad is not formed
  // yet when the truck joins it. It is brought in four seconds after (`arriveNow` moves every
  // movement of mine, the truck's included, which has arrived by then).
  formingIn !== null &&
    pile.former && [
      formingIn - 8,
      async () => {
        const { later, laterTroops, to } = pile.former;
        await client.mutation(api.movements.marchTo, {
          token: tokenA,
          seasonId,
          origin: { kind: 'point', point: later },
          troopIds: laterTroops,
          point: to,
        });
        return 'seconde marche partie';
      },
    ],
  formingIn !== null &&
    pile.former && [
      formingIn + 2,
      async () => {
        cli([
          'run',
          'dev:arriveNow',
          JSON.stringify({ playerId: scene.a, afterMs: 4000, onTime: true }),
        ]);
        return 'seconde marche à quatre secondes';
      },
    ],
  disbandingIn !== null &&
    pile.dissoudre && [
      disbandingIn,
      async () => {
        await client.mutation(api.movements.disband, {
          token: tokenA,
          seasonId,
          point: pile.dissoudre,
        });
        return 'escouade dissoute';
      },
    ],
  boardingIn !== null &&
    pile.monter && [
      boardingIn,
      async () => {
        const { truck, riders } = pile.monter;
        await client.mutation(api.movements.board, {
          token: tokenA,
          seasonId,
          troopIds: riders,
          carrierId: truck,
        });
        return 'fantassins à bord';
      },
    ],
  landingIn !== null &&
    pile.descendre && [
      landingIn,
      async () => {
        await client.mutation(api.movements.disembark, {
          token: tokenA,
          seasonId,
          troopIds: pile.descendre,
        });
        return 'fantassins à terre';
      },
    ],
]
  .filter(Boolean)
  .sort(([a], [b]) => a - b);
const started = Date.now();
for (const [seconds, gesture] of gestures) {
  await pause(Math.max(0, started + seconds * 1000 - Date.now()));
  console.log(`${await gesture()} à ${new Date().toISOString()}`);
}

/** `--bombarder` : each gun fires on its target's camp, its battery set, then every reload. */
for (let salvo = 0; salvo < salvoes && shelling.length > 0; salvo++) {
  await pause(salvo === 0 ? shellingIn * 1000 : 125_000);
  cli(['run', 'dev:benchReassess', JSON.stringify({ seasonId })]);
  const { camps } = await client.query(api.view.playerView, { token: tokenA, seasonId });
  for (const { piece, target } of shelling) {
    const camp = camps.find(
      (one) =>
        !one.lastKnown &&
        Math.abs(one.point[0] - target.lon) < 0.05 &&
        Math.abs(one.point[1] - target.lat) < 0.05,
    );
    if (camp === undefined) {
      console.log(`bombarder : la cible ${target.lon}, ${target.lat} n’est plus relevée`);
      continue;
    }
    await client.mutation(api.movements.bombard, {
      token: tokenA,
      seasonId,
      troopId: piece,
      target: { kind: 'camp', campId: camp.id },
    });
  }
  console.log(`Salve ${salvo + 1}/${salvoes} tirée à ${new Date().toISOString()}`);
}

/** `--absence` : la scène du rejeu, et son lieu, la capitale. */
function absenceScene(playerId) {
  const answer = cli(['run', 'dev:absenceScene', JSON.stringify({ playerId })]);
  places.absence = JSON.parse(answer.match(/\[[\s\S]*\]/)[0]);
}

/** `--moments` (#442) : les deux QG, trois des Sept à la France, et les commandes des moments. */
async function momentsScene() {
  for (const [token, id, at] of [
    [tokenA, 'FRA-5333', null],
    [tokenB, null, [-0.12, 51.5]],
  ]) {
    const { me } = await client.query(api.view.playerView, { token, seasonId });
    const region =
      id !== null
        ? me.regions.find((one) => one.id === id)
        : me.regions.reduce((near, one) =>
            Math.hypot(one.point[0] - at[0], one.point[1] - at[1]) <
            Math.hypot(near.point[0] - at[0], near.point[1] - at[1])
              ? one
              : near,
          );
    await client.mutation(api.constructions.start, {
      token,
      seasonId,
      building: 'hq',
      regionId: region.id,
      point: { lon: region.point[0], lat: region.point[1] },
    });
    if (token === tokenB) places.londres = region.point;
  }
  for (const key of ['narvik', 'istanbul', 'baku'])
    cli(['run', 'dev:holdPoint', JSON.stringify({ playerId: scene.a, key })]);
  places.moments = [20, 40];
  places.tanger = [-5.8, 35.78];
  places.narvik = [17.43, 68.44];
  const run = (name, args) => `npx convex run dev:${name} '${JSON.stringify(args)}'`;
  console.log(
    [
      'Les moments (#442), dans cet ordre :',
      `  1. Tanger prise, le cachet IV et la course : ${run('captureSoon', { playerId: scene.a, point: 'tangier', inSeconds: 20 })}`,
      `  2. Narvik reprise, compte rompu : ${run('captureSoon', { playerId: scene.b, point: 'narvik', inSeconds: 20 })}`,
      `  3. Londres prise, le QG tombé (à deux sièges, la saison se clôt : l'autre fin) : ${run('captureSoon', { playerId: scene.a, hqOf: scene.b, inSeconds: 20 })}`,
      'À part, sur une scène refondée — elle clôt la saison, et le compte doit courir :',
      `  1. Tanger prise, comme plus haut, puis la victoire aux points : ${run('raceEndsSoon', { seasonId, inSeconds: 20 })}`,
    ].join('\n'),
  );
}

/** The stacks of `--accrochages` (#441): each French one stands within sight of a British one. */
function contactsScene(france, uk) {
  const spawn = (playerId, role, count, [lon, lat]) =>
    cli(['run', 'dev:spawnTroops', JSON.stringify({ playerId, role, count, lon, lat })]);
  const metz = [6.18, 49.12];
  const channel = [-1.95, 50.0];
  const cairo = [29.92, 31.2];
  spawn(france, 'infantry', 3, metz);
  spawn(france, 'armor', 2, [6.17, 49.36]);
  spawn(uk, 'infantry', 4, [6.6, 49.27]);
  spawn(uk, 'armor', 1, [6.6, 49.27]);
  spawn(france, 'escort', 2, channel);
  spawn(uk, 'escort', 2, [-1.6, 50.05]);
  spawn(france, 'infantry', 2, [8.45, 49.92]);
  spawn(france, 'infantry', 2, cairo);
  spawn(uk, 'infantry', 3, [30.25, 31.05]);
  cli(['run', 'dev:benchReassess', JSON.stringify({ seasonId })]);
  places.accrochages = [3.2, 49.6];
  places['accrochage-metz'] = [6.35, 49.24];
  places['accrochage-manche'] = [-1.78, 50.02];
  places['accrochage-loin'] = cairo;
}

/**
 * **`--piste-mole`** (#269, #270): an escort from
 * the Alboran Sea docks at Marseille in `runwayIn` seconds; a fighter and a cargo are recruited
 * there, finished ten seconds after. Returns what leaves at the end: the transport for Naples, the
 * cargo of Marseille for Alexandria.
 */
async function runwayAndMole() {
  const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
  const airfield = me.buildings.find((building) => building.key === 'airfield');
  const port = me.buildings.find((building) => building.key === 'port');
  places.aerodrome = {
    id: `building-airfield@${airfield.point[0]},${airfield.point[1]}`,
    lonLat: airfield.point,
  };
  places.port = { id: `building-port@${port.point[0]},${port.point[1]}`, lonLat: port.point };
  const leaving = [
    { from: airfield.id, role: 'airTransport', to: { lon: 14.25, lat: 40.85 } },
    { from: port.id, role: 'cargo', to: { lon: 29.9, lat: 31.3 } },
  ].map(({ from, role, to }) => ({
    from,
    to,
    troopIds: me.troops.filter((troop) => troop.role === role).map((troop) => troop.id),
  }));
  for (const [role, start, building] of [['escort', { lon: -3.0, lat: 36.0 }, port]]) {
    const spawned = JSON.parse(
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, count: 1, ...start }),
      ]).match(/\[[^\]]*\]/)[0],
    );
    await client.mutation(api.movements.enterGarrison, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: start },
      troopIds: spawned,
      buildingId: building.id,
    });
  }
  cli([
    'run',
    'dev:arriveNow',
    JSON.stringify({ playerId: scene.a, afterMs: runwayIn * 1000, onTime: true }),
  ]);
  for (const [building, role] of [
    [airfield, 'fighter'],
    [port, 'cargo'],
  ])
    await client.mutation(api.troops.recruit, {
      token: tokenA,
      seasonId,
      buildingId: building.id,
      role,
      tier: 1,
    });
  cli([
    'run',
    'dev:finishRecruitments',
    JSON.stringify({ playerId: scene.a, afterMs: (runwayIn + 10) * 1000 }),
  ]);
  return leaving;
}
