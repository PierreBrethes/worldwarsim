# Questions ouvertes

Ce qui n'est pas tranché. Rien ne se code tant que les questions marquées 🔴 ne sont pas fermées.

## 🔴 Bloquantes

**L'avantage d'isolement géographique.** Mesuré : les États-Unis gagnent 20,8 % des saisons pour
12,5 % attendus, uniquement parce que personne ne peut les atteindre. Le curseur de compensation
aggrave le problème au lieu de le corriger — il récompense l'isolement, qui est déjà un avantage.
→ [rapport de simulation](docs/technique/rapport-simulation.md)

## 🟢 Tranchées par la simulation

**Le temps de trajet : 14 min pour 1 000 km.** La question était mal posée : il n'y a pas de ratio
trajet ÷ construction. Le temps de construction ne déplace l'équilibre que de quelques points ; le
temps de trajet, lui, décide tout. En dessous de 10 min/1 000 km, la Domination remporte la moitié
des saisons.

**Les outils de soustraction sont vitaux.** Sans embargo, exposition et raid, la Domination gagne
72 % des saisons contre 33 % avec. Aucun des trois n'est retirable.

**Ce n'est pas une salle d'attente.** 1,19 décision par joueur et par heure, et le vainqueur ne
prend définitivement la tête qu'à 90 % de la saison.

## 🟠 Structurantes

**La soupape anti-élimination des bâtiments de projection.** L'ADR 0013 fait dépendre chaque
domaine d'un bâtiment : sans port, pas de départ maritime. Si perdre ses ports ferme un domaine
entier, un joueur peut se retrouver enfermé chez lui — ce qui heurte la promesse qu'aucun joueur
n'est éliminé. Pistes non tranchées : port de fortune coûteux et temporaire, embarquement depuis
un avant-poste allié, ou domaine dégradé (plus lent, plus cher) plutôt que fermé.

**Le sort des cinq bâtiments d'économie.** Centre logistique et complexe industriel recouvrent en
partie ce que port, aérodrome et caserne expriment mieux. Fusion, spécialisation ou statu quo ?
→ [ADR 0013](docs/adr/0013-batiments-de-projection-sur-regions.md)

**Le rayon d'interception.** Fixe, ou fonction de la composition de la force ? S'il est trop grand,
plus aucun convoi ne passe et la carte se fige. → [08](docs/design/08-combat.md)

**Peut-on refuser le combat ?** Une force rapide devrait pouvoir se dérober au prix d'un détour.
Sans cette issue, l'interception est une punition sans contre-jeu.

**Le secret des doctrines à 2 joueurs.**
Avec deux joueurs, la doctrine adverse se déduit immédiatement. Faut-il la révéler d'emblée en
dessous de 4 joueurs, ou accepter que le secret ne serve qu'au-delà ?

**La granularité de l'occupation.**
Binaire (occupé / libre) ou progressive (pourcentage du territoire) ? La version progressive est plus
riche mais demande un découpage interne du pays, ce que l'ADR 0004 a justement voulu éviter.

**La régénération des effectifs pendant l'occupation.**
Si elle continue, l'occupation ne pèse pas assez. Si elle s'arrête, elle devient définitive et
contredit la promesse anti-élimination. Une piste : elle continue mais les effectifs produits sont
plafonnés à un usage défensif.

## 🟡 À trancher plus tard

**L'unité spéciale par nation.** Idée retenue mais non tranchée. Elle devrait casser une règle
plutôt qu'améliorer un rôle existant, sinon c'est un dixième rôle à équilibrer pour rien. 8 nations
= 8 systèmes de plus : à réserver à 4 ou 5 nations, et après la première saison test.

*Piste la plus avancée — les parachutistes français.* Une spécialisation de l'infanterie qui
se pose **sans rien avoir sur place** : elle casse la règle que l'ADR 0013 vient de poser
(un domaine s'ouvre par un bâtiment). L'exception porte sur ce qu'il faut à l'arrivée, jamais
sur le voyage : le largage reste un mouvement, avec son fil aérien visible, parti d'un
aérodrome — sinon il perce le brouillard et l'interception d'un coup, et toute la couche
d'information s'effondre. Le réalisme fait l'équilibrage : rayon limité depuis l'aérodrome,
infanterie légère seule, effectif modeste, aucun retour possible. Un coup de main, pas une
flotte. Reste à définir la condition de déblocage.

**Le pouvoir italien n'a jamais été simulé.** *Reconnaissance aérienne* est arrivé avec la révision
1940 de la fiche 06, après la campagne de mesure. Il touche au brouillard, que le simulateur ne
modélise pas — donc il est le moins fiable des huit.

**France × Hégémonie est le couple le plus faible du jeu** (1,8 % de victoires pour 4,2 % attendus).
Le correctif post-audit — coût d'avant-poste croissant avec la distance — a sur-corrigé.

**Le Royaume-Uni est sous-représenté** (8,1 % pour 12,5 %). Sa modification de colonne est trop
étroite.

**34 % des saisons se terminent avant 48 h.** Soit la saison s'arrête quand quelqu'un gagne, soit
les seuils montent pour tenir la durée annoncée.

**Le nerf du Japon.** *Doctrine du porte-avions* annule le levier de drame n°1 (l'irréversibilité).
C'est assumé et c'est fun, mais c'est le premier candidat au nerf après la première saison test.

**Le nombre de nations.** Huit aujourd'hui. Huit est déjà beaucoup à équilibrer pour un dev solo ;
six serait plus sage pour la première saison.

**L'auto-battler à plans (option B).** Gardé en réserve : plan de bataille enregistré à l'avance,
résolution déterministe. Seule façon connue de rendre de la décision tactique sans casser
l'asynchrone. À reconsidérer si le combat automatique paraît trop passif après la première saison.

**Notifications.** Push, mail, ou rien ? En asynchrone sur sept jours, « rien » signifie que les
joueurs oublient le jeu au bout de deux jours. Mais c'est de l'infra, pas du design.
