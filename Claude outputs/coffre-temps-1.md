# organiser-le-coffre — temps 1 : inventaire et plan

> 02/10/2026. Rien n'a été écrit dans `WWS/`. Ce fichier est hors du coffre, à jeter après le
> temps 2. Sources : lecture des six fichiers imposés, contrôles mécaniques (liens, `[[`,
> références `WWS/` du code), et sept inventaires en lecture seule, un par domaine, vérifiés
> contre le `CLAUDE.md` racine et par grep dans `src/` et `convex/`.

## 0. Ce qu'il faut savoir avant de lire

- **194 notes** dans le périmètre (hors `done/` : 138, hors `_to_delete/` : 8). Deux seulement
  ont un en-tête : `marque/marque-et-site.md` et `skills/wws-fin-session/SKILL.md`.
- **`technique/a-mesurer.md` est comparé octet à octet** par `scripts/a-mesurer.test.mjs:15`
  avec la sortie de `generate-a-mesurer.mjs`. Un en-tête posé à la main fait échouer
  `npm run verifier`. Prettier, lui, ignore `WWS/` : le YAML ne gêne pas le format.
- **La série `ready/outillage/` (74 prompts) prévoit une autre organisation de la doc**, et
  68 de ses prompts ne sont pas exécutés : 22 (réécrit `WWS/CLAUDE.md` et `README.md`), 24-26
  (`ETAT-DU-CODE.md`), 27 (`npm run prompts`, `plus-tard/`, prompt périmé *supprimé* et non
  envoyé en `_to_delete/`), 28 (`# slug` en ligne 1 des prompts), 29 (**supprime `Claude
  outputs/`** et `_to_delete/`), 30 (`RESTE-A-CODER` en file à statuts fermés), 31-33 (doc-lint
  qui attend `**Statut :**` en **ligne 3 sous le H1** des propositions, puis bloquant en CI),
  72 (réécrit le SKILL de fin de session). Le coffre doit les croiser sans les contredire —
  voir l'arbitrage A4.
- **Le film d'annonce est dans git, et poussé** : `0afc2ea` a ajouté 31 Mo
  (`Claude outputs/teaser/*.mp4`, `.png`, `.zip`), et `main` = `origin/main`. La décision
  plan-4b-2026-10-02 dit l'inverse. Le retirer de l'historique est une réécriture : à toi.

### Contrôles mécaniques

| Contrôle | Résultat |
|---|---|
| `[[` | 3 vrais wikilinks : `propositions/page-de-presse-et-scores.md:44`, `propositions/classement-bareme.md:14` et `:108`. Deux faux positifs : `outillage/70:59` (tableau JS), `outillage/63:75` (classe POSIX). Le 4ᵉ fichier est le prompt du coffre lui-même. |
| Références `WWS/` du code (20 fichiers) | Toutes existent, sauf trois légitimes : `etat-reference.json` et `ETAT-REFERENCE.md` (sorties de l'exporteur, absentes tant que personne n'exporte) et `simulation/verif-chiffrage.mjs` (`combat.test.ts:81`, au passé : « used to live in »). |
| Liens relatifs cassés hors `done/` | 5 : `adr/0020` → `0023-geographie-serveur-raster.md` (manque `-en-`) ; `propositions/ordre-de-mobilisation…:7,146` et `propositions/pillage-et-butin.md:11` → `ready/` au lieu de `done/` ; `RESTE-A-CODER.md:45-46` (`stockage-unique`, `pillage-et-butin`, même cause). Plus deux exemples volontaires (`outillage/33`, le prompt du coffre). |
| Liens cassés dans `done/` | 33, surtout `../../adr/…` écrits depuis `ready/` (il fallait `../../../`). Immuables : ils resteront « non résolus » dans le graphe sauf si `done/` est exclu (A6). |

## 1. Inventaire par domaine

Statut proposé, puis la raison. **⚠️** = la note est juste sur l'essentiel mais porte des
passages faux sans bandeau (détail en §3) ; voir l'arbitrage A1 sur ce que « périmé » veut dire.
Les « En bref », `code`, `decisions` et `voir` de chaque note sont rédigés et prêts pour le
temps 2.

### Jeu — fiches (`docs/design/`)

| Note | Statut | Pourquoi |
|---|---|---|
| design/README.md | validé ⚠️ | hiérarchie « code → ADR → fiche » juste ; colonne Statut vieillie (03, 12) |
| 01-vision-et-format | en cours | principe tenu ; format de saison supprimé (ADR 0020 §11) |
| 02-economie | livré ⚠️ | QG « posé au lancement », plafond de bâtiments, « pillage non livré » faux |
| 03-carte-et-avant-postes | livré ⚠️ | « granularité : le pays » contredit par l'admin-1 ; destruction annoncée, inexistante |
| 04-information | en cours ⚠️ | relevés codés ; sonde, agent dormant non ; `src/domaine/trajets.ts` |
| 05-doctrines | abandonné | bandeau du 31/08, ADR 0020 §9 |
| 06-nations | proposé ⚠️ | aucun atout ni troupe signature codé ; parle encore des doctrines |
| 07-friction-sociale | en cours ⚠️ | plage de repos codée ; revanchisme, occupation non |
| 08-combat | livré ⚠️ | §2 rencontre en route et §5 initiative contredits (ADR 0024 §3, 1b du 16/09) |
| 09-unites | livré ⚠️ | « France et Royaume-Uni dessinés » faux (huit nations) |
| 10-direction-artistique | en cours ⚠️ | « trois ressources », curseurs « jamais chargés » faux |
| 11-brief-ui | **périmé** | §4.3, 4.5-4.9 contredits ; seuls 4.1, 4.2, 4.4 tiennent ; aucun bandeau |
| 12-hors-saison | **périmé** | identité par pseudo + code (ADR 0009) remplacée par les comptes (0022) ; doctrine au salon |

### Jeu — contrats de vue (`docs/design/contrats-de-vue/`)

| Note | Statut | Pourquoi |
|---|---|---|
| 00-regles | validé | règles appliquées dans le code |
| 01-journal | livré ⚠️ | « 16 sortes » de dépêches, 33 en code |
| 02-economie | livré ⚠️ | « production reliée ⚠ pas-codé » faux depuis le 07/09 ; pillage « rien » faux |
| 02-economie-donnees | livré ⚠️ | « pas de tampon production reliée » faux |
| 03-caserne / 03-caserne-donnees | livré | `SiteModal` codée |
| 04-rose-batiment | livré ⚠️ | états retenus contredisent l'annexe ; « entrer en garnison » fait |
| 04-rose-batiment-donnees | livré | fait foi sur les états 1 et 2 |
| 05-carte-selection | livré ⚠️ | « adverse : rien servi » faux (ADR 0024 §1, `CampBadge`) |
| 05-carte-selection-donnees | livré | annexe |
| 06-abaque-catalogue | livré ⚠️ | « extension pas-codée » faux, le catalogue au pli est livré |
| 07-presse / 07-presse-donnees | livré ⚠️ | « pas-codé, entièrement » faux ; clés `fr` existent |

### Jeu — propositions et recherches

| Note | Statut | Pourquoi |
|---|---|---|
| brief-degraissage-surfaces | livré ⚠️ | exécuté, sauf §6-7 (panneau Réserves) remplacés par `ResourceBand` le 30/08 |
| carte-plaisirs-apres-test | validé | 4 pièces validées le 26/08, aucune codée |
| chiffrage-combat | en cours ⚠️ | table et munitions codées ; terrain, tenaille, soins non ; renvoie à « l'ADR 0017 » |
| classement-bareme | livré | `standings.ts`, `press.ts` ; fait loi |
| clic-batiment-et-surfaces | livré ⚠️ | principe livré ; table des destinations recâblée sans le dire |
| combat-simultane-terrain-retranchement | en cours ⚠️ | §1-2 livrés ; terrain, retranchement non ; prompts dits `ready/` |
| direction-v1-2026-09-09 | en cours ⚠️ | comptes et inscription livrés ; consignes de chantier obsolètes |
| economie-v2 | livré ⚠️ | gravée par ADR 0015 ; entrepôt/dépôt distincts faux |
| espionnage-et-formats | proposé ⚠️ | « rien n'est acté » ; doctrines et formats morts |
| flux-mouvement-en-carte | livré ⚠️ | widget de troupes, leurre, bloc Renseignement morts |
| frappe-de-batiment | validé ⚠️ | 78a ; « interceptable en route », « la garnison tire d'abord » faux |
| lot-petits-surs | en cours | tampon et canal livrés ; crayon, manchettes, départ programmé non |
| mouvement-libre-et-troupes-posees | livré ⚠️ | ADR 0019 fait foi |
| notifications-push-et-alarmes | validé ? | la note dit validée (28/08), `RESTE-A-CODER` n°20 dit « évoqué » — A7 |
| objectifs-mobiles | proposé | principe approuvé le 08/09, règles en proposition |
| objectifs-neutres | en cours ⚠️ | lot 1 livré le 17/09 ; « initiative au posé » faux |
| ordre-de-mobilisation-et-fenetre-economie | livré ⚠️ | lien cassé ; panneau haut-droit et format skirmish faux |
| page-de-presse-et-scores | **périmé** | tranches et 2 h révisées par la décision 80 ; remplacée par classement-bareme |
| pillage-et-butin | en cours ⚠️ | pillage livré ; capture et QG pillable non ; entrepôt/dépôt tranché |
| plan-progression-v1 | **périmé** | frise skirmish/campagne, doctrines ; seul `UNLOCKED_AT` a survécu |
| recherche-par-deblocage | validé | 44a ; ADR recherche à écrire |
| transport-terrestre-et-allure | livré ⚠️ | nom de constante (`LAND_SEATS_PER_TRANSPORT`) |
| vision-v1-expeditions | en cours ⚠️ | étapes 1-3 livrées, présentées à faire |
| recherches/3d-2026-09-08 | idée | sans décision |
| recherches/mecaniques-2026-08-29-tri | idée | tri sans décision |

### Jeu — racine

| Note | Statut | Pourquoi |
|---|---|---|
| CONTEXT.md | validé ⚠️ | glossaire tenu ; l'entrée « Interception » est fausse depuis l'ADR 0024 §3 |
| QUESTIONS.md | en cours | réécrit le 16/09 ; la section « Fermées » vit sur des résultats morts |

### Décisions — ADR (`docs/adr/`)

| Note | Statut | Pourquoi |
|---|---|---|
| adr/README.md | validé ⚠️ | liste complète ; titre de 0014 faux ; 12 statuts sans leurs révisions |
| 0001, 0005, 0007, 0010, 0014, 0016, 0022, 0023 | livré | codées, bandeaux à jour |
| 0002, 0003 | livré ⚠️ | react-three-fiber, angles, signature de `toWorld` |
| 0004 | livré ⚠️ | spécialisation « extraction » morte ; destruction annoncée |
| 0006 | livré ⚠️ | slots sur le centre logistique (dissous) et le leurre (retiré) |
| 0008 | livré ⚠️ | « séquentielle à l'initiative » : pas de bandeau du 16/09 |
| 0009 | abandonné | remplacée par 0022, le fichier dit encore « acceptée » sans bandeau |
| 0011 | livré | trace historique ; refondue par 0014/0015 |
| 0012 | livré ⚠️ | Øresund et Malacca cités comme portes ; `CANAL` absent ; chemins français |
| 0013 | livré ⚠️ | « économie au niveau de la nation » contredit par 0015 |
| 0015 | livré ⚠️ | plafond global de bâtiments (`buildingCap` disparu, 0020 §10) sans bandeau |
| 0017 | livré ⚠️ | contradiction interne sur l'écrêtage ; « 500 d'alliage » sous le bandeau 400 |
| 0018 | livré ⚠️ | §2.1-2.4 et §3 (contact à distance) en retard sur 0024 et 1b |
| 0019, 0024 | livré ⚠️ | « initiative à l'attaquant / à qui donne l'ordre » faux depuis le 16/09 |
| 0020 | livré ⚠️ | « la couleur est publique » contredit son §5 ; lien cassé vers 0023 |
| 0021 | livré ⚠️ | §4-5 (rencontres en route) sans bandeau |

### Technique (`docs/technique/`, `docs/rapports/`, file de travail)

| Note | Statut | Pourquoi |
|---|---|---|
| docs/RESTE-A-CODER.md | en cours ⚠️ | file utile ; 2 liens cassés, lots livrés présentés à faire |
| technique/a-mesurer.md | livré | **généré** — voir A2 |
| technique/architecture.md | **périmé** | « rien n'est engagé côté backend », objets retirés, react-three-fiber |
| technique/brouillard-et-fanout.md | livré ⚠️ | corps valide ; leurres, atout britannique |
| technique/partie-de-controle-a-deux.md | en cours | protocole réutilisable |
| technique/point-projet-2026-09-08.md | livré | photographie datée, se dit elle-même non permanente → type `rapport` |
| technique/rapport-simulation.md | **périmé** | simulateur v1 mort (doctrines, embargo) ; lié comme vivant par 3 notes ; seuls « 14 min / 1 000 km » et le diagnostic américain survivent |
| technique/risques.md | **périmé** | jeu d'avant le 15/08, sauf la section comptes |
| rapports/ (7 notes) | livré | rapports datés de clôture ou de tri |
| simulation/README.md | validé | à jour |
| simulation/opening/README.md | en cours ⚠️ | `SEASON_FORMATS`, `BUILDING_CAP_REACHED` disparus |

### Marque et site

| Note | Statut | Pourquoi |
|---|---|---|
| marque/marque-et-site.md | en cours | modèle de note, à jour au 02/10 |
| marque/actifs.md | (à créer) | livrable 4 |

### Prompts (`docs/prompts/`, `docs/skills/`)

| Note | Statut | Pourquoi |
|---|---|---|
| prompts/code/README.md | validé | règle du cycle ; ne dit rien de `outillage/` ni de `coffre/` |
| ready/contours-de-region-paresseux | livré | exécuté (`54678c5`) — encore en `ready/`, A3 |
| ready/noms-de-modules-convex | livré | exécuté (`46d2320`, `e959a08`) — encore en `ready/`, A3 |
| ready/fin-de-saison-au-seuil-tenu | proposé | remis à plus tard le 16/09, bloqué par une question 🟠 |
| ready/invitation-par-lien | validé | lot A, rien de codé |
| ready/outillage/README.md | validé | ne dit rien de l'état de la série |
| outillage 04, 05, 06, 10, 12 | livré | `480ef73`, `4d9f735`, `2561c07`, `35f5f8b`, `18675a9` (04, 06 et 10 sous une forme différente du prompt) |
| outillage 11 | en cours | hook exécutable, auto-activation manquante |
| outillage 01-03, 07-09, 13-74 sauf 04-06, 10-12 (68) | validé | aucune trace |
| prompts/coffre/organiser-le-coffre | en cours | ce chantier |
| prompts/controles-camera.md | livré, **doublon** | identique octet à octet à `done/controles-camera.md` |
| prompts/sprites.md | livré, **doublon** | identique octet à octet à `images/sprites.md` |
| prompts/design/maquette-couche-permanente | livré ⚠️ | planches 2-3 remplacées par la -2 ; entrepôt/dépôt |
| prompts/design/maquette-couche-permanente-2 | livré ⚠️ | branche « Voir le pays » retirée le 31/08 |
| prompts/design/maquette-economie-et-ordre | livré ⚠️ | « doctrine choisie » |
| prompts/design/recherche-mecaniques | livré | recherche du 29/08 rendue |
| prompts/images/avant-poste | validé | aucune planche produite |
| prompts/images/batiments | livré ⚠️ | « quinze bâtiments » (14) ; chemin vers `done/` faux en ligne 96 |
| prompts/images/logo | abandonné | marqué obsolète le 29/08 |
| prompts/images/objectifs, images/sprites | livré | planches en place |
| skills/wws-fin-session/SKILL.md | validé | à jour, mais ne tient ni en-tête, ni INDEX, ni registre |

### Actifs

| Note | Statut | Pourquoi |
|---|---|---|
| sprites/README.md | livré ⚠️ | la plus fiable des notes d'actifs ; « quatre trous » contre six nommés |
| maquettes/README.md | **périmé** | handoff d'août : 4.3 envoi, leurre, doctrine, « pas de chat », « aucune image » |
| prototypes/README.md | livré | prototype figé au 11/08, décrit à l'identique |

### Index d'état

| Note | Statut | Pourquoi |
|---|---|---|
| WWS/CLAUDE.md | **périmé** | tableau d'état figé mi-septembre, 8 ADR sur 24, « schéma de jeu pas écrit », « prochaine étape : le schéma puis le code ». Les trois règles, les pièges et les conventions restent justes. |
| WWS/README.md | **périmé** | « schéma de jeu pas écrit », « backend visé », arborescence incomplète. Le pitch tient. |

## 2. Déplacements

**Recommandation : n'en faire que deux.** Le prompt 27 de la série outillage prévoit un outil
(`npm run prompts`) qui déplace et réécrit les renvois ; déplacer à la main ce qu'il couvre
obligerait à réécrire six prompts de cette série.

| # | Déplacement | Raison | Références à modifier |
|---|---|---|---|
| D1 ✅ | `prompts/sprites.md` → `docs/_to_delete/` | doublon exact de `images/sprites.md`, qui fait autorité (citée par `recherches/3d-2026-09-08.md:28`) | aucune |
| D2 ✅ | `prompts/controles-camera.md` → `docs/_to_delete/` | doublon exact de `done/controles-camera.md`, cité par deux prompts `done/` | aucune |
| D3 ⏸ | `ready/contours-de-region-paresseux.md` et `ready/noms-de-modules-convex.md` → `done/` | livrés — mais la règle dit « quand le rapport est accepté », et c'est toi qui l'acceptes | `outillage/18:22`, `27:12-13,73-74,81`, `28:21`, `31:16`, `32:29`, `67:10` |
| D4 ⏸ | outillage 04, 05, 06, 10, 12 → `done/outillage/` (à créer) | livrés, idem | à mesurer ; les prompts de la série se citent entre eux |
| D5 ⏸ | `prompts/images/logo.md` → `_to_delete/` | obsolète depuis le 29/08 | `outillage/27:20` |
| D6 ✗ | `technique/point-projet-2026-09-08.md`, `technique/rapport-simulation.md` → `rapports/` | ce sont des rapports datés | `RESTE-A-CODER.md:7`, `WWS/CLAUDE.md`, `WWS/README.md:19`, `simulation/README.md`, `QUESTIONS.md`, `outillage/23` : trop de renvois pour un gain de rangement ; le `type: rapport` suffit |

Option « rien du tout » : tenable aussi ; les doublons se signalent alors par leur statut.

## 3. Ce qui ment — par note, la ligne qui l'est

Une note **périmée** prend `statut: périmé` et la ligne fausse dans son « En bref ». Une note
**⚠️** garde son statut de cycle de vie, et son « En bref » nomme les passages en retard. Rien
n'est corrigé dans le fond ; les corrections proposées sont celles des prompts 22, 23, 26 et 32
de la série outillage, qui les prévoient déjà presque toutes.

Les plus graves (liste complète prête pour le temps 2, plus de 120 lignes) :

- **`WWS/CLAUDE.md`** — L.10-11 « Saison de 48 h à 7 jours » (format supprimé, ADR 0020 §11) ;
  L.34 « France et États-Unis branchés, cinq nations à générer » (huit nations, 82 WebP, six
  trous `null`) ; L.36 « naval, aérien, agent, pillage : rien » (naval et cargo en mer existent,
  pillage livré le 10/09) ; L.39-43 « le schéma de jeu ne s'écrit qu'après le 🔴 » ; L.72-80 et
  L.112 « 8 décisions structurantes » (24 ADR) ; L.171-175 « ensuite seulement : le schéma, puis
  le code ».
- **`WWS/README.md`** — L.6 « Le schéma de jeu n'est pas écrit, délibérément » ; L.52-55 « Rien
  n'est engagé côté backend » ; L.47 « simulation/ le simulateur de saison » (retiré le 06/09).
- **Fiche 11** — §4.3 « Envoi d'un mouvement … modale ; types : agent, leurre » ; §4.5-4.6
  « trois ressources », « centre logistique » ; §4.7 « trois à quatre passes ».
- **Fiche 12** — L.4-6, 25-26 identité par « pseudo + code de partie, jeton de saison ».
- **Fiche 08** — L.41-44 « une passe à distance s'ouvre entre deux mouvements du même milieu » ;
  L.114-120 « l'interception en route inverse l'initiative ».
- **Fiche 02** — L.93, 125-127 « QG posé au lancement sur la capitale » ; L.146-172 « treize
  bâtiments en tout » ; L.14 « Le pillage n'est pas livré ».
- **ADR 0015** — L.228-265 plafond de bâtiments global indexé sur le QG, sans bandeau.
- **ADR 0009** — L.3 « Statut : acceptée » alors qu'elle est remplacée par 0022.
- **CONTEXT.md** — L.46 « Interception : combat déclenché en route par un mouvement offensif ».
- **`rapport-simulation.md`** — tout le modèle (doctrines, embargo, exposition, six joueurs),
  cité comme vivant par `WWS/CLAUDE.md:89` et `WWS/README.md:19`.

Hors coffre mais à savoir : le **`CLAUDE.md` racine** est lui-même en retard sur deux points —
« cinq nations sont dessinées » (huit) et « pas de naval, pas d'aérien » (contredit par son propre
paragraphe du 18/09) — et il écrit `scripts/generer-regions.mjs` / `generer-monde.mjs` pour
`generate-regions.mjs` / `generate-world.mjs`.

## 4. Doublons et autorité

| Sujet | Notes | Fait autorité |
|---|---|---|
| État du projet | `WWS/CLAUDE.md`, `WWS/README.md`, `CLAUDE.md` racine | le racine pour le code ; `INDEX.md` pour la doc |
| Presse | `page-de-presse-et-scores`, `classement-bareme`, contrat 07 | classement-bareme (formules), contrat 07 (vue), le code (les deux) |
| Mouvement libre | proposition `mouvement-libre…`, ADR 0019 | ADR 0019 |
| Économie | proposition `economie-v2`, fiche 02, ADR 0015/0017/0020 §10 | les ADR ; la fiche explique |
| Combat | fiche 08, `chiffrage-combat`, `combat-simultane…`, ADR 0014/0018 | 0014 (principe), 0018 (mécanisme), `constants.ts` (chiffres) |
| Rien ne se bat sans ordre | ADR 0008, 0019 §3, 0021 §2-3, 0024 §3 | ADR 0024 |
| Objectifs | `objectifs-neutres`, `objectifs-mobiles`, `vision-v1` §1 | fixes : ADR 0024 §4 ; mobiles : `objectifs-mobiles` |
| Identité | ADR 0009, ADR 0022, fiche 12 | ADR 0022 |
| File de travail | `RESTE-A-CODER`, `QUESTIONS`, `ready/` | QUESTIONS (à trancher), RESTE (ordre), prompts (contenu d'un lot) |
| Palette, tokens | fiche 10, fiche 11 §3, `maquettes/README` + `tokens.css/json`, `src/styles/tokens.css` | `src/styles/tokens.css` |
| Contrat / annexe | les cinq paires `NN` / `NN-donnees` | contrat pour la structure, annexe pour textes et chiffres |
| Prompts | `prompts/sprites.md` = `images/sprites.md` ; `prompts/controles-camera.md` = `done/controles-camera.md` | `images/`, `done/` |

## 5. Le registre des décisions

123 lignes relevées : 31 décisions numérotées, 7 `marque-`/`plan-`, 16 décisions datées sans
numéro (`pierre-AAAA-MM-JJ-mot-clé`), 24 ADR, 45 révisions datées d'ADR. Trois problèmes :

- **Les codes courts se réemploient** : `1a` désigne cinq décisions (06/09, 13/09, 15/09, deux
  le 16/09), `1b` deux, `3a` trois, `4a` deux. La date dans l'identifiant règle cela ; les deux
  `1a` du 16/09 restent indistinguables sans suffixe.
- **`12a` ne dit pas ce que le `CLAUDE.md` racine lui fait dire** : il le cite comme fondement
  de « le mouvement s'ordonne depuis la carte » ; dans sa source (`flux-mouvement-en-carte.md:5`)
  c'est « aucune troupe posée librement », règle annulée par l'ADR 0019.
- **Sans source dans `WWS/`** : « Voir le pays retiré » (31/08, seulement l'ADR 0024:81 et un
  commit), « pas de worktree » (08/09, seulement `outillage/21`), le stockage unique du 09/09
  (seulement des bandeaux d'ADR), 75 et 77a (ADR 0022 seul). Ils iront au registre avec la source
  la plus proche et la mention « source indirecte ».

## 6. Ce que le temps 2 écrirait

1. `WWS/INDEX.md` — six sections (Jeu, Décisions, Technique, Marque et site, Prompts, Actifs),
   une ligne par note : lien, phrase, statut. La série outillage y tient en une ligne par prompt
   regroupée sous un tableau compact.
2. L'en-tête YAML et l'« En bref » sur les 193 notes (194 moins `a-mesurer.md`, A2), au format de
   `marque-et-site.md`. Le YAML passe **avant** le H1.
3. `WWS/docs/decisions.md` — le registre amorcé.
4. `WWS/docs/marque/actifs.md` — unités (82 WebP, 8 nations, 6 trous), bâtiments (14, aucun
   avant-poste), objectifs (4), ressources (8 + icônes vectorielles), drapeaux (npm +
   `ussr.svg`), curseurs (5 PNG, **un seul branché**), pictogrammes (34 PNG), polices (Google
   Fonts, rien d'auto-hébergé), film (31 Mo dans git), maquettes, prototypes, données carte et
   leurs générateurs.
5. Le SKILL de fin de session : trois passes de plus (en-tête et `maj`, INDEX, registre).
6. `WWS/CLAUDE.md` et `WWS/README.md` : le tableau « Où en est le projet », la « Carte des
   fichiers » et l'« Arborescence » remplacés par un renvoi à `INDEX.md` et au `CLAUDE.md`
   racine. Rien d'autre — la réécriture complète est le prompt 22.
7. Les 5 liens cassés et les 3 wikilinks réparés (chemin seulement, pas le texte).
8. `.obsidian/app.json` : exclure `docs/prompts/code/done/` et `docs/_to_delete/` du graphe (A6).

Puis la vérification du prompt : script des liens relatifs (commande et sortie), grep des
références `WWS/` du code, `npm run verifier`.
