# Questions ouvertes

Ce qui n'est pas tranché. Réécrit le 16/09/2026 (décision 3a) : tout ce que les ADR 0013 à 0024
ont fermé est sorti du corps du texte et tient en une ligne au bas. Une question 🔴 bloque ce
qu'elle nomme, pas le reste du projet.

## 🔴 Bloquantes

**L'avantage d'isolement géographique.** Mesuré en août sur le simulateur v1 : les États-Unis
gagnaient 20,8 % des saisons pour 12,5 % attendus, parce que personne ne peut les atteindre. Ce
rapport ([simulation](docs/technique/rapport-simulation.md)) est **périmé** — il précède les
ADR 0013, 0014, 0015, 0020 — et le simulateur n'a plus d'état de référence (export de la saison
Japon jamais fait). Le principe dégagé le 15/08 tient : *l'isolement se paie en rareté*, et le
Japon le démontre. Les États-Unis sont l'inverse exact : inatteignables **et** sans manque, et
inventer un manque américain serait de la fiction. Trois leviers, aucun mesuré depuis : le
**coût de la distance** (codé : `routing.ts`, ~14 min / 1 000 km), l'**obligation de ports**
(codée, ADR 0013), une **condition de victoire** qui exige d'agir loin de chez soi — la
domination par part du théâtre (`fin-de-saison-au-seuil-tenu`) ne l'exige pas.

*Ce que ça bloque :* les **atouts nationaux** (fiche 06, aucun codé) et tout rééquilibrage
d'une nation. Pas le reste. *L'instrument :* la refonte du simulateur en client Convex
(Registre 24) — sans lui, toute réponse est une opinion.

## 🟠 Structurantes

**Que devient un quartier général frappé ?** Le QG est la première dette du socle, posé **par
le joueur** (1b du 13/09) ; il porte les emplacements du sol national (2 × niveau, ADR 0020 §10)
et la future recherche. La frappe de bâtiment (78a) a tranché pour les autres : intégrité,
désactivation, jamais de destruction, réparation seule. Pour le QG : *désactivé, jamais détruit,
son niveau ne redescend jamais* est la piste cohérente — la destruction du QG est une
recherche de palier 4+ qui réviserait « jamais éliminé » (question 39). À trancher avant
d'écrire la frappe aérienne, pas après.

**La soupape anti-élimination des bâtiments de projection.** Sans port, pas de départ
maritime (ADR 0013). Un joueur qui perd ses ports peut se retrouver enfermé chez lui. Pistes
non tranchées : port de fortune coûteux et temporaire, embarquement depuis un avant-poste
côtier (c'est l'atout italien *Mare Nostrum* — un atout qui casse cette règle pour une nation
ne règle pas la soupape des sept autres), ou domaine dégradé plutôt que fermé.

**Élever ou fonder.** Le niveau 2 d'un point coûte 117 alliage et donne un emplacement et
60 km de rayon ; une fondation coûte 65, donne un emplacement, un cercle neuf et de la couleur.
À tout prix supérieur à la fondation, élever est dominé par fonder tant qu'il reste de la place.
Le prix n'est pas le sujet ; ce qu'un niveau achète l'est. Mesure d'abord (7a : avant-postes
debout par joueur au jour 7, et combien d'élévations), règle ensuite.

**Le rendez-vous de l'ordre « intercepter ».** L'ADR 0024 a fermé la question « peut-on refuser
le combat » : rien ne se bat sans ordre d'attaque, une force qui marche n'est jamais chassée
d'office. Elle en ouvre une autre : « intercepter » (vision V1, point 2) propose un rendez-vous
atteignable sur un tronçon relevé — mais le relevé ne donne jamais la destination (4a du 13/09).
Un rendez-vous sur une estimation est-il un ordre, ou une marche ordinaire vers un point ?

**La reprise de la file après une famine est paresseuse.** À sec, la tête n'est plus datée ;
elle repart au premier événement qui écrit un stock, pas à l'instant analytique où la nourriture
redevient positive (`driedAfterHours` existe et permettrait de la planifier). Approximation
assumée le 19/08 ; à tenir à la lettre seulement si l'écart se sent en partie.

## 🟡 À trancher plus tard

**Les atouts nationaux et l'unité spéciale.** La fiche 06 décrit huit atouts qui cassent
chacun une règle, et huit troupes signature ; **aucun n'est codé** — les nations se distinguent
par la géographie, les gisements et les sprites. C'est le pitch d'origine (« chaque pays a son
identité réelle »). Deux contraintes déjà posées : un atout casse une règle, il ne bonifie
jamais (règle des pourcentages) ; l'unité spéciale passe par la recherche au QG (ADR 0014 :
médecin OU parachutiste pour l'infanterie mk1) et attend l'ADR recherche (44a). Quatre ou cinq
nations d'abord, jamais huit d'un coup. Le *nerf du Japon* (doctrine du porte-avions annule
l'irréversibilité) et le *pouvoir italien jamais simulé* se jugent quand ils existent.

**Le nombre de nations.** Huit aujourd'hui, huit atouts à équilibrer pour un dev solo ; six
serait plus sage pour la première saison avec atouts.

**L'auto-battler à plans (option B).** Plan de bataille enregistré à l'avance, résolution
déterministe — seule façon connue de rendre de la décision tactique sans casser l'asynchrone.
À reconsidérer si le combat automatique paraît trop passif après une saison complète.

**Notifications.** Proposition validée sur le principe le 28/08
([pushes et alarmes](docs/design/propositions/notifications-push-et-alarmes.md)), « après le
premier skirmish ». Trois parties plus tard, rien n'est codé ; en asynchrone sur sept jours,
« rien » veut dire que les joueurs oublient le jeu au bout de deux jours.

**La salve d'allonge.** Le brief (au contact, le camp qui porte le plus loin tire une salve
gratuite avant la passe) a été classé « abandonné » dans `done/` et l'ADR 0021 par la livraison
du 08/09 — pas par une décision. À confirmer ou à rouvrir ; une ligne suffit.

**« L'Allemagne est injouable ».** Plainte Discord du 15/09 ; le frein a changé de nature
depuis (plus d'entretien, un prix par niveau). Attend la mesure 7a, pas une réponse.

## Fermées — où la réponse vit

- Temps de trajet, outils de soustraction, cadence de décision : 🟢 simulateur v1 (14 min /
  1 000 km ; embargo, exposition et raid vitaux ; 1,19 décision par joueur et par heure).
  Chiffres d'août, à relire quand le simulateur refondu existe.
- Les unités quelque part → ADR 0014 ; tables de dégâts et effectifs dans `constants.ts`.
- Le rayon d'interception → ADR 0021 (portée par rôle, `DETECTION_RANGE_KM` `@a-mesurer`) et
  ADR 0024 (l'attaque se donne sur un objet relevé).
- Refuser le combat → sans objet depuis l'ADR 0024 (engagement intentionnel).
- Le secret des doctrines, Hégémonie, « 34 % des saisons finissent avant 48 h » → sans objet
  depuis l'ADR 0020 §9 et §11 (mode unique, plus d'horloge).
- La clôture quand le fondateur est parti → 1a du 06/09, codée (`FOUNDER_ABSENCE_HOURS`).
- Le plafond de bâtiments → ADR 0020 §10 (emplacements par site) ; le frein d'expansion est
  le **prix par niveau** depuis le 15/09, l'entretien a disparu.
- Le centre logistique → dissous : le relais est une spécialisation d'avant-poste
  (`SPECIALIZATION`, fiche 03), pas un bâtiment.
- Granularité et régénération de l'occupation → sans objet : il n'y a pas d'occupation, la
  couleur suit l'avant-poste (ADR 0004, ADR 0020 §1).
- La file de recrutement comme entrepôt à l'abri du pillage → D5 acquise le 09/09 : limite
  assumée pour la V1.
- Les bâtiments d'un point démantelé → 1a du 16/09 : ils tombent avec lui (`buildings.outpostId`).
