# Rapport de simulation — saison de 48 h

2 000 saisons simulées, 6 joueurs, distances orthodromiques réelles.
Code et méthode : [../../simulation/](../../simulation/README.md).

---

## 1. Le triangle de contres n'était pas décoratif — il est vital

C'est le résultat le plus net, et il tranche définitivement le débat ouvert par l'audit.

**Contre-épreuve, 200 saisons chacune, tout le reste identique :**

| | Domination | Hégémonie | Influence | écart à 33 % |
|---|---|---|---|---|
| **avec** embargo, exposition et raids | 33 % | 30 % | 36 % | **3 pts** |
| **sans** | 72 % | 17 % | 12 % | **39 pts** |

Sans outils de soustraction, **la Domination gagne près de trois saisons sur quatre**. Les deux
autres doctrines n'existent pas. C'est exactement ce que l'audit reprochait à la v0 : Domination
détruisait les points des autres, tandis qu'Hégémonie et Influence n'avaient aucune prise sur
quiconque.

Le premier jet du simulateur, écrit avant l'ajout des outils, donnait 100 % à une seule doctrine.
L'écart est passé de 67 points à 3.

**Conséquence : embargo, exposition et raid d'avant-poste ne sont pas des mécaniques de confort.
Retirer l'un des trois pour simplifier casserait le jeu.**

---

## 2. La question bloquante n°1 était mal posée

La question était : *« quel est le bon ratio temps de trajet ÷ temps de construction ? »*

**Il n'y a pas de ratio.** Les deux paramètres n'agissent pas du tout de la même façon.

| trajet (min/1000 km) | construction (min, niv. 1) | ratio | domination | hégémonie | influence | écart |
|---|---|---|---|---|---|---|
| 4 | 12 | 0.72 | 42 % | 38 % | 21 % | 12 pts |
| 4 | 25 | 0.35 | 50 % | 31 % | 20 % | 17 pts |
| 8 | 12 | 1.44 | 42 % | 36 % | 23 % | 11 pts |
| 8 | 25 | 0.69 | 46 % | 31 % | 24 % | 12 pts |
| **14** | **12** | **2.52** | **28 %** | **38 %** | **34 %** | **5 pts** |
| 14 | 25 | 1.21 | 43 % | 30 % | 28 % | 9 pts |
| 20 | 12 | 3.60 | 28 % | 44 % | 28 % | 11 pts |
| 20 | 25 | 1.73 | 42 % | 26 % | 33 % | 8 pts |
| 30 | 12 | 5.40 | 41 % | 33 % | 27 % | 7 pts |
| 30 | 25 | 2.59 | 39 % | 39 % | 23 % | 11 pts |

Deux enseignements :

**Le temps de trajet compte, en valeur absolue.** En dessous de ~10 min/1000 km, la Domination
récupère 42 à 50 % des victoires : les distances deviennent négligeables, frapper ne coûte plus rien
et l'agression devient la stratégie par défaut. Le monde réel cesse d'être une contrainte.

**Le temps de construction ne fait presque rien.** Doubler la durée des bâtiments déplace les taux
de quelques points, sans direction claire. Il agit sur le rythme personnel du joueur, pas sur
l'équilibre entre doctrines.

Autrement dit, ce qu'il faut régler, ce n'est pas un ratio : c'est **le temps de trajet, seul**.

### Réglage retenu

**14 min pour 1 000 km, bâtiment de niveau 1 en 12 min.**

- Paris – Berlin : 12 min
- Paris – Moscou : 35 min
- Paris – New York : 82 min
- Paris – Tokyo : 2 h 16
- bâtiment de niveau 3 : 39 min · de niveau 5 : 2 h 05

Un trajet transatlantique coûte donc à peu près deux niveaux de bâtiment. C'est le point où frapper
loin devient un vrai sacrifice économique.

---

## 3. Ce n'est pas une salle d'attente

**1,19 décision par joueur et par heure**, soit ~28 par jour, hors plage de repos.

Ce n'est pas un jeu qu'on regarde : c'est le rythme d'un Ogame actif. La saison n'est jamais vide,
et jamais frénétique.

**Le vainqueur ne prend définitivement la tête qu'à 90 % de la saison.** Aucune saison ne se décide
dans les premières heures — le risque « tout est joué mardi matin » ne se matérialise pas.

En revanche, **34 % des saisons se terminent avant 48 h**. Ce n'est pas grave en soi, mais il faut
choisir : soit la saison s'arrête quand quelqu'un gagne, soit les seuils montent pour tenir les 48 h.

---

## 4. Les États-Unis sont cassés, le Royaume-Uni est faible

Répartition des victoires par nation, sur 900 saisons. Attendu si tout était neutre : **12,5 %**.

| Nation | Domination | Hégémonie | Influence | **total** |
|---|---|---|---|---|
| **États-Unis** | 4.7 | 8.0 | 8.1 | **20.8 %** |
| Italie | 5.0 | 4.2 | 4.3 | 13.6 % |
| Chine | 4.2 | 4.9 | 4.4 | 13.6 % |
| URSS | 4.7 | 3.9 | 4.3 | 12.9 % |
| France | 4.7 | **1.8** | 5.4 | 11.9 % |
| Allemagne | 3.7 | 3.3 | 3.0 | 10.0 % |
| Japon | 2.9 | 2.3 | 4.0 | 9.2 % |
| **Royaume-Uni** | 3.7 | 2.0 | 2.4 | **8.1 %** |

**Les États-Unis gagnent 1,7 fois trop.** Et ce n'est pas leur pouvoir national : c'est leur
**position**. Isolés au centre de l'Amérique du Nord, ils sont hors de portée pratique de tout le
monde, y compris avec l'enroulement du Pacifique. Ils accumulent tranquillement pendant que
l'Eurasie se déchire.

C'est la démonstration chiffrée du problème d'asymétrie géographique, et **le curseur de
compensation ne le corrige pas** — il compense l'isolement par des bonus, alors que l'isolement
*est* l'avantage.

**Le Royaume-Uni est à 8,1 %.** Sa position insulaire ne le protège pas assez, et son pouvoir
(colonne Chasseur en défense) ne sert que contre l'aviation.

**France × Hégémonie est le couple le plus faible du jeu, à 1,8 %.** Le correctif appliqué après
l'audit — coût d'avant-poste croissant avec la distance — a sur-corrigé : la nation dont le pouvoir
consiste à poser des avant-postes partout est devenue la pire à la doctrine des avant-postes.

---

## 5. Ce qu'il faut corriger

1. **Neutraliser l'avantage d'isolement.** Piste : indexer le revenu de base sur la distance moyenne
   aux autres joueurs, à l'inverse de ce que fait le curseur de compensation aujourd'hui. Un joueur
   que personne ne peut atteindre doit produire moins, pas plus.
2. **Adoucir le correctif France.** Coût croissant, oui, mais moins vite : aujourd'hui il annule
   entièrement le pouvoir.
3. **Renforcer le Royaume-Uni.** Sa modification de colonne est trop étroite.
4. **Décider du sort des 34 % de saisons qui finissent tôt.**

---

## 6. Ce que la simulation ne dit pas

- **Le brouillard n'est pas modélisé.** Les joueurs virtuels ont l'information parfaite. Le
  brouillard rendrait la matrice d'unités *plus* décisive : les mesures d'équilibre sont optimistes.
- **L'interception en vol n'est pas modélisée.** C'est pourtant la mécanique de combat retenue
  (fiche 08). Les combats ont lieu à l'arrivée.
- **Les joueurs virtuels ne négocient pas et ne trahissent pas.** Entre amis, c'est précisément là
  que se joue la moitié du plaisir. Ce que mesure ce rapport, c'est le plancher — pas le jeu réel.
- **L'anti-élimination n'est pas testée.** Ni Revanchisme, ni plancher de pertes, ni occupation.
