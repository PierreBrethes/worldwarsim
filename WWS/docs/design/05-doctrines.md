# 05 — Doctrines et conditions de victoire

## Pourquoi des conditions de victoire différentes

Si tout le monde partage le même objectif, une stratégie est optimale et toutes les autres sont des
pièges. C'est la réponse structurelle à l'exigence « il faut que toutes les façons de jouer soient
fun ». La leçon vient de Root : chaque faction a une économie **et** une condition de victoire
distinctes.

## Les trois doctrines

Chaque joueur en choisit une au départ. **Elle reste secrète jusqu'à 25 % de progression, ou jusqu'à
sa première action offensive.** La barre de progression est publique de manière anonyme : tout le
monde voit que « quelqu'un est à 60 % », sans savoir qui.

> La révélation était à 50 % en v0. Compte tenu des temps de trajet, quand tu apprenais qui contrer,
> tu n'avais plus le temps de te repositionner : le triangle était désactivé sur la moitié de la
> saison.

| Doctrine | Condition | Ce que ça force à faire |
|---|---|---|
| **Domination** | réduire de X % la capacité militaire d'au moins `K = ⌈(n-1)/2⌉` joueurs **distincts** | attaquer plusieurs cibles, donc se découvrir longtemps |
| **Hégémonie** | accumuler `N(n)` **avant-poste-heures** d'extraction | tenir du terrain dans la durée, donc devenir prévisible |
| **Influence** | aligner `N(n)` pays neutres, ou atteindre la suprématie de renseignement | jouer la couche PNJ et l'information |

### Mise à l'échelle du nombre de joueurs

Toutes les cibles sont indexées sur `n`. Une formulation naïve comme « détruire X % de la capacité
adverse **cumulée** » se divise par 7 à 8 joueurs et par 1 à 2 joueurs : Domination devient triviale
à 2 et impossible à 8, tandis qu'« aligner N neutres » ne dépend d'aucun adversaire.

### Hégémonie se compte en cumulé

`avant-poste-heures`, pas « durée continue ». Sinon un raid à deux sous remet le compteur à zéro
indéfiniment, sans aucun contre-jeu possible pour l'hégémon.

## Le triangle de contres doit être mécanique

C'était la faille principale de la v0 : le triangle était **déclaratif**. Domination détruit les
armées et les avant-postes qui font les points des deux autres, tandis qu'Hégémonie et Influence
n'avaient littéralement aucun moyen de réduire la progression de qui que ce soit. « Influence bat
Domination » reposait sur le fait de *voir venir* l'attaque — mais voir n'annule rien. C'est une
atténuation, pas un contre.

**Chaque doctrine dispose d'un outil de soustraction :**

| Doctrine | Outil | Effet |
|---|---|---|
| Domination | destruction | détruit armées et avant-postes, donc les points d'Hégémonie |
| Hégémonie | **embargo** | plafonne la production militaire d'une cible pendant X h, donc étrangle Domination |
| Influence | **exposition** | révèle publiquement la doctrine d'une cible et **gèle sa progression** X min |

```
        Domination
         ↗       ↘
   Influence ← Hégémonie
```

- **Domination bat Hégémonie** — l'hégémon concentre de la valeur immobile et prévisible.
- **Hégémonie bat Influence** — l'influence s'achète, l'hégémon a plus de moyens, et l'embargo
  assèche l'acier qui paie les agents.
- **Influence bat Domination** — l'exposition gèle la barre du militaire au pire moment, et le
  sabotage casse ses convois en vol.

Le secret de la doctrine est ce qui rend le triangle vivant : tu ne sais pas encore qui contrer.
