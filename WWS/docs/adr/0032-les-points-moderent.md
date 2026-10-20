# ADR 0032 — Les points modèrent

**Statut :** acceptée (20/10/2026, retours de la pré-prod, #173) — **précise la règle 1** de
`WWS/CLAUDE.md` : elle vaut pour les atouts et la recherche ; un point stratégique donne un
avantage mesuré, plus une règle cassée. Révise les règles de Singapour, de Bakou et de Halifax
(ADR 0027 §4, #133) ; Narvik, Dakar et Rangoun suivent dans #175 et #176.

## Contexte

Les points stratégiques cassaient une règle entière : Singapour annulait le plein des camions et
des cargos, Halifax sortait les mouvements maritimes des slots, Bakou ravitaillait partout. Le
premier joueur qui en prend deux ou trois creuse un écart que les autres ne rattrapent plus : une
boule de neige. Pierre voulait des bonus intéressants mais pas décisifs, du type « −20 % sur le
coût des trajets ».

## Décision

1. **Un point donne un avantage mesuré**, souvent un pourcentage (coût, durée, portée, débit). Il
   n'annule plus une règle entière. La règle 1 reste pour les atouts et la recherche.
2. **Aucune boule de neige.** Le gain d'un point ne croît pas avec la taille de l'empire, et les
   bonus de deux points tenus s'additionnent sans se multiplier : chaque point touche une variable
   différente. Aucun point ne touche le revenu brut ni le recrutement. Pas de plafond global.
3. **La course aux points reste la condition de victoire** : quatre points tenus 24 h (ADR 0027 §4).
4. **Les trois premiers** (chiffres `@a-mesurer`) :
   - **Singapour** : les camions et les cargos paient 20 % de plein en moins, en crans entiers
     (arrondi au cran supérieur : un trajet d'un cran coûte toujours un cran).
   - **Bakou** : une troupe à l'arrêt, hors de toute ancre, reprend un cran de plein toutes les
     12 h, sans coût de stock. Le gain se calcule à la lecture, depuis l'heure d'arrêt ou du
     dernier gain : aucun job par troupe.
   - **Halifax** : un mouvement maritime à la fois ne prend pas de slot ; le deuxième en prend un.
5. Mondiale seule : la Blitz garde ses règles.

## Conséquences

- Une seule fonction pure par règle, lue par l'écran et le serveur (`fuelStepsOf`, `bakuRefuel`,
  `slotsAskedBy`).
- Les textes des points (`fr.points.rules`) disent le chiffre.
- Le plein repris à Bakou ne débite plus le plateau personnel : `bakuRefuels`, `fuelOnly`,
  `viaBaku`, `isFuelFree` et leurs textes sont retirés.

## Ce qu'on abandonne

- La règle 1 appliquée aux points stratégiques : un point ne change plus la carte mentale, il
  pèse un peu sur une variable.
- « Camions et cargos sans plein », « motorisés ravitaillés partout », « flottes hors slot » : les
  trois règles entières.
