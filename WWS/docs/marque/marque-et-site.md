---
type: marque
statut: en cours
maj: 2026-10-02
code: [src/routes/connexion.tsx, src/routes/accueil.tsx, src/routes/salon.tsx, src/shell/Masthead.tsx, src/styles/tokens.css]
decisions: [marque-1c-2026-10-02, marque-2b-2026-10-02, marque-3a-2026-10-02, plan-1b-2026-10-02, plan-2a-2026-10-02, plan-3b-2026-10-02, plan-4b-2026-10-02]
voir: [../design/10-direction-artistique.md, ../prompts/code/ready/invitation-par-lien.md]
---

# Marque et site — de l'invitation à la saison

**En bref.** Le jeu reste entre amis pour l'instant, mais il se construit comme une marque qui
pourrait s'ouvrir. Quatre lots : le parcours d'invitation, le nom, le film et la page d'accueil
publique, les notifications. Le film d'annonce v1 (15 s) existe.

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

## Les lots

| Lot | Contenu | Statut | Où |
|---|---|---|---|
| A | Lien d'invitation `/rejoindre/CODE`, compte créé sur la page, arrivée au salon | prompt prêt | [invitation-par-lien](../prompts/code/ready/invitation-par-lien.md) |
| B | Nom : pistes, vérifications (jeux existants, INPI, domaines), planche de logos | en cours | ci-dessous |
| C | Film 30 s + boucle 8 s, puis maquette de la page d'accueil publique, puis intégration | attend B | — |
| D | Installation sur téléphone (manifeste) et notifications push | attend A | [notifications-push-et-alarmes](../design/propositions/notifications-push-et-alarmes.md) |

**Ce qui manque aujourd'hui** (constaté le 02/10) : `/` renvoie à `/accueil` puis à `/connexion`
— aucune page ne présente le jeu avant l'inscription ; `index.html` n'a ni description ni image
de partage ; pas de manifeste ; les pushes sont validés (28/08) mais pas codés. Sur iPhone, un
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
- `Claude outputs/` n'est pas ignoré par git : ne pas y laisser les vidéos au moment d'un commit
  (décision plan-4b-2026-10-02 : elles iront sur le VPS).

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

Statut : à trier par Pierre (trois finalistes), puis vérifications et planche de logos.
