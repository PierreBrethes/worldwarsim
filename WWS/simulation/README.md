# Simulateur de saison

Instrument de mesure, **pas** un prototype de jeu. Des joueurs virtuels suivent des politiques
fixes, on fait tourner 48 h, on compte.

```bash
node run.mjs
```

Aucune dépendance. `world.json` fournit les coordonnées réelles des 163 pays : les temps de trajet
sont calculés en distance orthodromique, avec enroulement de la longitude.

| Fichier | Rôle |
|---|---|
| `sim.mjs` | le moteur : économie, slots, avant-postes, matrice de combat, doctrines, nations |
| `run.mjs` | le balayage de constantes, la calibration et le rapport |
| `derniere-sortie.txt` | la sortie de la dernière campagne |
| `resultats.json` | les mêmes données, exploitables |
| `etat-reference.mjs` | génère un instantané de partie destiné aux maquettes |
| `etat-reference.json` | l'instantané, exploitable |
| `ETAT-REFERENCE.md` | le même, lisible — **c'est ce qu'on donne à un designer** |

## Méthode

**Calibration avant mesure.** Les seuils de victoire ne sont pas posés à l'intuition. On fait
d'abord tourner 48 h *sans aucun seuil* — personne ne gagne — et on relève les scores bruts de
chaque doctrine. Le seuil est ensuite fixé au **90ᵉ centile** : il doit être atteint par le
meilleur joueur en fin de saison, pas par la moitié d'entre eux.

Cette étape est indispensable. Calibrer sur la médiane faisait terminer les saisons en 9 h.

**Ce qu'on mesure ensuite** : le taux de victoire par doctrine, l'écart maximal à 33 %, la part de
la saison au bout de laquelle le vainqueur prend définitivement la tête, le nombre de décisions par
joueur et par heure, et la répartition des victoires par couple nation × doctrine.

## Limites assumées

- **Pas de brouillard.** Les joueurs virtuels ont l'information parfaite. Le brouillard rendrait la
  matrice d'unités *plus* décisive, pas moins — les mesures d'équilibre sont donc optimistes.
- **Pas d'interception en vol.** Les combats ont lieu à l'arrivée, jamais en route.
- **Politiques fixes.** Un joueur virtuel ne s'adapte pas, ne négocie pas, ne trahit pas. C'est le
  plancher du comportement humain, pas sa moyenne.
- **Pas de Revanchisme ni de plancher de pertes.** L'anti-élimination n'est pas testée ici.
