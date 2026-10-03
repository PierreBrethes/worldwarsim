---
type: marque
statut: en cours
maj: 2026-10-03
code: [src/routes/connexion.tsx, src/routes/rejoindre.$code.tsx, src/shell/Newspaper.tsx, src/shell/media.ts, src/shell/FilmTrailer.tsx, deploiement/nginx.conf, deploiement/compose.prod.yml, src/routes/accueil.tsx, src/routes/salon.tsx, src/shell/Masthead.tsx, src/styles/tokens.css]
decisions: [marque-nom-2026-10-02, marque-logo-2026-10-02, plan-5c-2026-10-02, charte-1a-2026-10-03, charte-1b-2026-10-03, charte-2a-2026-10-03, charte-2b-2026-10-03, marque-icone-2026-10-03, marque-apercu-2026-10-03, marque-1c-2026-10-02, marque-2b-2026-10-02, marque-3a-2026-10-02, plan-1b-2026-10-02, plan-2a-2026-10-02, plan-3b-2026-10-02, plan-4b-2026-10-02]
voir: [../design/10-direction-artistique.md, ../prompts/code/ready/invitation-par-lien.md]
---

# Marque et site — de l'invitation à la saison

**En bref.** Le jeu reste entre amis pour l'instant, mais il se construit comme une marque qui
pourrait s'ouvrir. Quatre lots : le parcours d'invitation, le nom, le film et la page d'accueil
publique, les notifications. Le film de 30 s et la boucle muette de 8 s existent (02/10/2026) ;
reste la page d'accueil.

## Décisions

| Id | Date | Décision |
|---|---|---|
| marque-1c-2026-10-02 | 02/10/2026 | Entre amis maintenant, public plus tard : pas de juridique ni de référencement tant que le jeu n'est pas ouvert. |
| marque-2b-2026-10-02 | 02/10/2026 | Chercher un nom maintenant (WorldWarSim est descriptif, et le créneau est occupé : *Ages of Conflict: World War Simulator*). |
| marque-3a-2026-10-02 | 02/10/2026 | Le temps de jeu par jour se **mesure** à la prochaine vraie partie, il ne se promet pas avant. Le multiplicateur de ressources récent le change. |
| plan-1b-2026-10-02 | 02/10/2026 | Le parcours (lot A) part tout de suite, en parallèle du nom, tant qu'il n'impacte pas le reste. |
| plan-2a-2026-10-02 | 02/10/2026 | Le nom sera français (le jeu est francophone, ADR 0016). |
| plan-3b-2026-10-02 | 02/10/2026 | Deux films : 30 s avec son, et une boucle muette de 8 s pour le haut de la page d'accueil. |
| plan-4b-2026-10-02 | 02/10/2026 | Les vidéos vivent dans un dossier média du VPS servi par Nginx, hors du dépôt. |
| marque-nom-2026-10-02 | 02/10/2026 | Le jeu s'appelle **La Manchette** (« ça sonne comme une gazette »). La variante de logo reste à choisir ; le nom de code `worldwarsim` (dépôt, Convex, domaine actuel) ne change pas. |
| marque-logo-2026-10-02 | 02/10/2026 | Logo : variante B de `planche-manchette.png` — « la » en italique, MANCHETTE en didone, filet rouge dessous ; icône : le M de Bodoni Moda sur le pavé rouge. Le renommage passe avant le film et la page d'accueil. |
| plan-5c-2026-10-02 | 02/10/2026 | La page d'accueil publique attend l'ouverture au public (marque-1c) : les amis arrivent par le lien d'invitation. D'abord la boucle derrière `/connexion` et `/rejoindre` avec le dossier média du VPS, puis le lot D (installation sur téléphone, notifications). |
| charte-1a-2026-10-03 | 03/10/2026 | La charte est relevée dans un design system (copie du dépôt, qui fait foi) avec la liste des écarts ; pas de nettoyage du code ni de vrai design system outillé pour l'instant. Une passe de nettoyage ciblée se décidera sur la liste ([charte](charte.md)). |
| charte-1b-2026-10-03 | 03/10/2026 | Le nettoyage passe avant les maquettes : les couleurs rattachées à leurs variables sans changer un pixel ([nettoyer-les-couleurs](../prompts/code/ready/nettoyer-les-couleurs.md)). Les changements visibles (échelle d'opacités, bureau unique, contraste) restent à décider. |
| charte-2a-2026-10-03 | 03/10/2026 | Les dégradés qui diffèrent de 2 à 4/255 après le nettoyage (arrondi du navigateur sur `color-mix`) sont acceptés ; pas de jeton `--ink-rgb`. |
| charte-2b-2026-10-03 | 03/10/2026 | Un seul gris de note : `--ink-note` passe à `#6b5b3b` (4,7:1 sur papier) et absorbe `--ink-faint` ([un-seul-gris-de-note](../prompts/code/ready/un-seul-gris-de-note.md), planche `Claude outputs/marque/planche-contraste.png`). |
| marque-icone-2026-10-03 | 03/10/2026 | L'icône de l'application est la piste B, « la feuille » : M de Bodoni à l'encre sur papier, filet rouge dessous ; partout, onglet compris, le favicon d'onglet redessiné sans trame, bordé d'encre, filet épaissi. Fichiers : `Claude outputs/marque/icones/`. |
| marque-apercu-2026-10-03 | 03/10/2026 | L'aperçu des liens est la piste B, « la carte » (le plateau, une feuille au centre), le même pour toutes les invitations : pas d'aperçu par partie pour l'instant. |
| notif-1a … notif-6-2026-10-03 | 03/10/2026 | Notifications : abonnement par compte et par appareil ; rien pendant la fenêtre de repos, groupé au réveil ; pas d'intendance ; télégraphe une fois par heure au plus ; le clic ouvre le plateau, journal ouvert ; une section Réglages (case par appareil, case par type pour le compte). Détail : [proposition reprise](../design/propositions/notifications-push-et-alarmes.md). |

## Les lots

| Lot | Contenu | Statut | Où |
|---|---|---|---|
| A | Lien d'invitation `/rejoindre/CODE`, compte créé sur la page, arrivée au salon | livré le 02/10/2026 (route `/rejoindre/$code`, `seasons.invitation`, `joinRefusalOf`) | [invitation-par-lien](../prompts/code/ready/invitation-par-lien.md) |
| B | Nom : pistes, vérifications (jeux existants, INPI, domaines), planche de logos | nom choisi (La Manchette), logo variante B tranché | ci-dessous |
| C | Film 30 s + boucle 8 s ; la boucle derrière `/connexion` et `/rejoindre` ; la page d'accueil publique à l'ouverture | film et boucle livrés le 02/10/2026 ; pages d'entrée livrées le 03/10/2026 (boucle derrière la feuille, lien vers le film, `/media/` servi par `front`) ; page d'accueil reportée (plan-5c) | [dossier-media](../prompts/vps/dossier-media.md), [film-sur-les-pages-d-entree](../prompts/code/ready/film-sur-les-pages-d-entree.md) |
| D | Installation sur téléphone (manifeste) et notifications push | icône et aperçu choisis (marque-icone, marque-apercu) ; D1 installation et aperçu : livrés et vérifiés sur téléphone le 03/10/2026 (manifeste servi en `application/manifest+json`, icônes, balises `og:`, `VITE_PUBLIC_ORIGIN` ; [installer-l-application](../prompts/code/ready/installer-l-application.md)) ; D2 notifications : spécification reprise le 03/10/2026 (notif-1a … notif-6), prompts prêts : [serveur](../prompts/code/ready/notifications-serveur.md) puis [appareil](../prompts/code/ready/notifications-appareil.md) | maquettes : « La Manchette — icônes et aperçu » (https://claude.ai/artifact/BGYTaPCDx6ew3UdsqNZ8jk, privé) | [notifications-push-et-alarmes](../design/propositions/notifications-push-et-alarmes.md) |

**Ce qui manque aujourd'hui** (constaté le 02/10) : `/` renvoie à `/accueil` puis à `/connexion`
— aucune page ne présente le jeu avant l'inscription ; les pushes sont validés (28/08) mais pas codés. Sur iPhone, un
site ne reçoit de push qu'une fois ajouté à l'écran d'accueil : D suppose le manifeste.

## Le film d'annonce v1

15 s, 1920 × 1080, 25 i/s, bruitages synthétisés. Une page de journal qui s'imprime puis devient
le plateau : manchette, planche I (mer tramée, huit nations), mouvements terre / air / mer, relevé
dans la portée d'un avant-poste, passe de résolution, dépêche, carton final.

- Fichiers : `Claude outputs/teaser/` à la racine du dépôt — `worldwarsim-teaser-16x9.mp4`
  (19 Mo), `-leger.mp4` (7,6 Mo, messageries), `-affiche.png`, `-source.zip` (scène HTML
  pilotée par le temps, rendu Playwright, `sfx.py`, README).
- Tout vient du jeu : `tokens.css`, `INK_BY_NATION`, `PALETTE`, `ARC_COLORS`, `SILHOUETTES`,
  `airRise`, `Masthead`, `Stamp`, la projection de `scripts/generate-world.mjs`.
- Choix tranchés pour v1 : DA des tokens (fin 40, pas les codes années 50), unités en
  similigravure découpée, carte reconstruite (pas de capture), 16:9, pas de musique, URL en pied.
- Le tic-tac est celui du télégraphe du jeu ; le relevé passe en morse (R-E-L-E-V-E).
- Les vidéos ont été commitées et poussées dans `0afc2ea` (31 Mo), à l'inverse de
  plan-4b-2026-10-02 (elles doivent vivre sur le VPS). Les retirer de l'historique est une
  réécriture : décision de Pierre.

## Le film de 30 s et la boucle muette (lot C)

Livrés le 02/10/2026, après le renommage. Même scène que la v1, retendue, avec le titre
**la Manchette** (variante B) et deux plans nouveaux qui disent « entre amis, sur une semaine ».

| Temps | Plan |
|---|---|
| 0 – 3 s | Manchette : les neuf lettres tombent, « la » en italique, le filet rouge frappe comme un tampon, les brèves |
| 3 – 8 s | Planche I : la carte s'imprime en deux passes, les huit nations s'encrent, « 2 à 8 joueurs — entre amis » |
| 8 – 14 s | Plateau : quartier général, aérodrome, port ; trois mouvements et une fiche par matériel — char lourd B1 bis, Dewoitine D.520, Le Fantasque (`src/emblems/units/equipment.ts`) |
| 14 – 18,4 s | Brouillard : portée de l'avant-poste, colonne relevée à 14:05, morse |
| 18,4 – 21,6 s | Passe de résolution, dépêche « Engagement en Lorraine » |
| 21,6 – 23,9 s | Presse : l'édition de 15:00 s'imprime (colonnes de `PressWindow`), « 2 rang », la France première aux faits d'armes |
| 23,9 – 26,8 s | Télégraphe : deux messages arrivent au tic-tac, le troisième s'écrit dans « télégraphier… » et part en silence (le jeu ne sonne qu'à l'arrivée des messages des autres) |
| 26,8 – 30 s | Carton : la Manchette, le principe directeur, le bureau des engagements, la frise des huit chasseurs |

Les cinq titres du cartouche : « Projeter de la force. », « L'information est chère. », « Tout
engagement est irréversible. », « La presse tient les comptes. », « Entre amis, sur sept jours. »

**La boucle** : les images de 3,5 à 12,3 s rendues sans aucun texte (`?loop`), la planche qui
s'imprime puis la carte qui bascule ; les 0,8 premières secondes sont fondues avec les 0,8
dernières, la fin enchaîne sur le début. 1600 × 900, muette, H.264 seul (en VP9 elle pesait plus
lourd), avec son image d'attente en JPEG.

- Fichiers : `Claude outputs/film/` à la racine du dépôt, **ignoré par git** (ligne ajoutée au
  `.gitignore`, plan-4b-2026-10-02) — `la-manchette-film-30s.mp4` (29 Mo, maître),
  `-leger.mp4` (11 Mo, messageries), `la-manchette-boucle-8s.mp4` (3 Mo),
  `la-manchette-boucle-poster.jpg` (150 Ko), `la-manchette-affiche.png`,
  `la-manchette-film-source.zip` (2 Mo : `film.html`, `film.js`, `sfx.py`, `loop.py`, README).
- Le domaine affiché reste `wws.pierrebrethes.cloud` : le film se refait en une ligne le jour où
  le domaine change.
- Le film de 15 s est périmé (il montre WW SIM).

**Sur les pages d'entrée** (03/10/2026). `/connexion` et `/rejoindre/CODE` passent
`backdrop="film"` à `Newspaper` : la table de carte reste dessous — c'est le repli — et la boucle
s'y pose en fondu à l'événement `playing`, peu floutée (1,5 px, luminosité 0,65) sous les
ombres de la table. Une seule fonction pure décide (`filmBackdrop`, `src/shell/media.ts`) :
économie de données ou largeur sous 900 px → la carte, sans aucune requête ; mouvement réduit →
l'image d'attente seule ; sinon la vidéo. Un lien « voir le film d'annonce — 30 s » ouvre une
`<dialog>` native sur le film léger (`FilmTrailer.tsx`), monté seulement à l'ouverture ; sans le
fichier, la fenêtre dit qu'il n'est pas disponible. Les trois fichiers sont servis par `front`
sous `/media/`, monté depuis `/opt/worldwarsim-media` (`deploiement/README.md`, § Médias) ; en
local, `public/media/`, ignoré par git. Captures : `Claude outputs/marque/captures-film/`.

## Le nom (lot B)

Critères : français, court, à soi (pas un mot générique de la presse ou du genre), qui dise
l'information ou la presse plutôt que la guerre seule, et qui tienne dans le système du logo
actuel — un pavé rouge en condensée + un mot en didone.

Écartés d'office : *Heure H* (titre français de *Command & Conquer: Generals – Zero Hour*),
*La Dépêche*, *Le Télégramme* (quotidiens), *Casus Belli* (magazine).

Pistes (02/10/2026) — aucune collision de jeu trouvée par une recherche web rapide ; INPI,
domaines et réseaux restent à vérifier sur les finalistes.

| Nom | Ce qu'il dit | Logo (pavé · didone) |
|---|---|---|
| **Sans contrordre** | le pilier « tout engagement est irréversible », et le dicton « ordre, contrordre, désordre » | SANS · CONTRORDRE |
| **Pli cacheté** | les ordres scellés : on ne voit pas ceux des autres, on ne reprend pas les siens | PLI · CACHETÉ |
| **Manchette** | le titre de une, et un coup porté | M · ANCHETTE, ou LA · MANCHETTE |
| **Édition de guerre** | déjà la ligne de date du jeu ; sûr, moins à soi | ÉDITION · DE GUERRE |
| **Estafette** | le messager d'état-major : l'information qui coûte | E · STAFETTE |
| **Belligérants** | le mot du jeu pour les joueurs | B · ELLIGÉRANTS |
| **Cartouche** | le cadre d'une carte gravée, et une munition | C · ARTOUCHE |
| **Communiqué** | le communiqué officiel, « rien à signaler sur le front » | COMMUNIQUÉ seul, pavé sur le C |

**Planche de logos (02/10/2026)** : `Claude outputs/marque/planche-noms.png` — chaque piste dans
le système actuel, sur papier (88 px), dans le bandeau du salon (18 px), sur le bureau sombre
(30 px), en icône (64, 32, 16 px).

Ce que la planche montre :

- **Le système pavé + didone veut un nom en deux morceaux qui ont chacun un sens**, comme WW + SIM.
  Un nom d'un seul mot se coupe en « E STAFETTE », « B ELLIGÉRANTS », « C ARTOUCHE » : il se lit
  comme deux mots. Estafette, Belligérants, Cartouche et Communiqué ne tiennent qu'en changeant le
  système du logo.
- *Pli cacheté* est le plus compact (proportions proches de WWSIM) et le seul dont l'icône se lit
  à 32 px (« PLI »). Il porte les deux piliers : on ne voit pas les ordres des autres, on ne
  reprend pas les siens.
- *Sans contrordre* a le meilleur sens mais c'est le plus long (15 lettres) et son icône « SC »
  ne dit rien.
- *La Manchette* : « LA » ne porte rien, l'icône « M » est générique.
- *Édition de guerre* double la ligne de date du jeu (« le monde en jeu — édition de guerre »).

**Préférence de Pierre (02/10/2026, soir) : *La Manchette*, avec des doutes ; les autres pistes ne
lui plaisent pas.** Planche des variantes : `Claude outputs/marque/planche-manchette.png` — A le
système actuel (pavé « LA »), B titre de quotidien (« la » italique, MANCHETTE en didone, le pavé
devient un filet rouge sous le mot), C le nom dans le pavé, D « La Manchette » en casse mixte avec
un tampon d'édition.

- Pour : le code appelle déjà le logo « la manchette » (`fr.masthead` : « le titre du journal, et
  le journal est le jeu ») ; double sens titre de une / coup porté ; tout le jeu est un journal.
- Contre : pour le grand public, « manchette » c'est d'abord le poignet de chemise ou la réception
  au volley ; Jean-Patrick Manchette occupe la recherche ; c'est un mot courant, difficile à posséder.
- Domaines (RDAP, 02/10/2026) : `lamanchette.fr` pris (OVH, 2013) · `la-manchette.fr` pris
  (OVH, 04/2025) · `lamanchette.com` détenu par un revendeur (DomainMarket) · `lamanchette.games`
  non trouvé, donc a priori libre. Sans conséquence tant que le jeu reste entre amis
  (marque-1c) : il vit sur `wws.pierrebrethes.cloud`. INPI non vérifié.

**Seconde série, même veine (02/10/2026, soir)** : des titres de journal d'époque qui sont aussi
des mots de guerre. Planche : `Claude outputs/marque/planche-titres.png`, toutes dessinées comme la
variante B (article en italique, mot en didone, filet rouge). Ce dessin accepte un mot seul : la
contrainte « deux morceaux » ne valait que pour le système pavé + didone.

| Titre | Presse | Guerre | `.fr` (RDAP) |
|---|---|---|---|
| la Drôle de guerre | — | 1939-1940, l'attente armée : l'année du jeu, et « attendre est parfois la bonne décision » (vision V1) | libre |
| la Vigie | titre courant de quotidien régional | le guetteur : la détection | pris (2022) |
| le Bandeau | le titre en bande sur toute la une | le bandeau sur les yeux : le brouillard | libre |
| la Cinquième colonne | les colonnes de la page | les agents dans les lignes ennemies | pris (08/2026) |
| l'Éclaireur | *L'Éclaireur de Nice*, quotidien jusqu'en 1944 | l'éclaireur, qui va voir | pris ; aussi une boutique de mode à Paris |
| le Bouclage | fermer l'édition | encercler | non vérifié |
| la Morasse | la dernière épreuve de la page avant l'impression | — | non vérifié |
| le Bélino | la photo transmise par fil (bélinographe) | — | non vérifié |

Aucune collision de jeu trouvée par recherche web pour la Drôle de guerre, la Vigie, le Bandeau,
la Cinquième colonne. INPI non vérifié.

Statut : **La Manchette retenu le 02/10/2026, variante B.** Renommage : `prompts/code/ready/renommer-la-manchette.md`. Favicon prêt : `Claude outputs/marque/favicon-manchette.svg`.
