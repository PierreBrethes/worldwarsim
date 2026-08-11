# Registre de risques

Classé par gravité. Un risque qui n'est pas ici n'a pas été évalué.

## 🔴 Le ratio temps de trajet ÷ temps de construction

**Le seul risque qui peut tuer le projet.** Si un bâtiment monte en 6 h et qu'un trajet dure 8 min,
la saison est une salle d'attente entrecoupée de spam militaire. Si c'est l'inverse, personne ne
construit rien.

Ce ratio décide seul si une saison produit des décisions intéressantes ou de l'ennui, et il ne
s'évalue pas à l'intuition.

*Mitigation :* simulation hors ligne d'une saison de 48 h, avec des joueurs virtuels suivant les
trois doctrines, avant toute ligne de backend.

## 🔴 L'existence d'une stratégie dominante

Si l'économiste gagne toujours, le jeu de guerre est cassé. Trois doctrines aux conditions de
victoire différentes est la bonne structure, mais elle ne garantit rien tant qu'elle n'est pas
mesurée.

*Mitigation :* la même simulation, avec mesure du taux de victoire par doctrine et par couple
nation × doctrine.

## 🟠 L'abandon en cours de saison

Un joueur écrasé mardi a cinq jours de rien. Un joueur non notifié oublie le jeu au bout de deux
jours. Les deux vident la saison de sa substance pour tout le monde, pas seulement pour lui.

*Mitigation :* politique anti-élimination (design/07) côté design, notifications côté infra — cette
seconde partie n'est pas traitée.

## 🟠 Le fan-out du brouillard

Une requête réactive naïve recalcule pour tous les joueurs à chaque mouvement. Bombe de facturation
et fuite d'information potentielle.

*Mitigation :* dénormalisation des fenêtres de révélation, cf.
[brouillard-et-fanout.md](brouillard-et-fanout.md). Solution connue, à ne pas oublier d'appliquer.

## 🟠 Le graphe de routage

Terre/mer, droits de passage, portée : sous-estimé au départ comme « un point (lon, lat) ». C'est le
deuxième poste technique du projet.

*Mitigation :* aucune pour l'instant. À chiffrer avant de s'engager.

## 🟡 Huit nations à équilibrer

Huit pouvoirs asymétriques × trois doctrines = 24 combinaisons. L'audit en a déjà trouvé quatre
dégénérées et six mortes sur une première passe. Un dev solo n'équilibrera pas 24 combinaisons.

*Mitigation :* démarrer à six nations pour la première saison.

## 🟡 Le rubber banding du Revanchisme

Mécanique légitimement controversée. Mal réglée, elle punit le joueur qui joue bien.

*Mitigation :* offensive uniquement, non thésaurisable, ne compte pas dans la barre de Domination.
À surveiller dès la première saison test avec de vrais joueurs.

## 🟢 Le rendu de la carte

Levé. Le prototype tourne, le picking est vérifié à 163/163 sous courbure, les arcs sont animés sans
coût serveur.

## Noms réels (Rafale, Charles de Gaulle, etc.)

Marques déposées Dassault, Naval Group et consorts. Risque quasi nul pour un projet privé entre amis,
réel en cas de monétisation ou de diffusion publique. À reconsidérer si le projet sort du cercle.
