# ADR 0030 — Le QG bâtit, la recherche transmet

**Statut :** acceptée (19/10/2026, grilling des retours de la pré-prod, Q10, Q15, Q16) —
**révise l'[ADR 0028](0028-l-economie-de-la-mondiale.md) §5** (« le QG N porte 1 + N slots ») et la
**décision 44a** (« la recherche débloque, elle ne modifie jamais un chiffre »). Le régulateur de
l'[ADR 0006](0006-slots-de-mouvement.md) reste ; c'est sa source qui change. Codé par #124 et #136.

## Contexte

Le bandeau affichait « 0 / 2 », les slots de mouvement, et Pierre les croyait retirés avec les
plafonds. On les garde : c'est le frein de l'asynchrone, et Halifax et la tournée s'appuient
dessus. Mais élever le QG pour gagner un slot coûtait cher pour peu. Une fois la recherche partie au
Centre de recherche (#123), le QG ne portait plus guère que sa propre chute.

## Décision

1. **Les slots viennent de la recherche.** Deux au départ, et trois cartes Transmissions I, II et
   III, chacune +1 slot, chacune après la précédente (à la manière de l'Ordinateur d'Ogame). La
   décision 44a devient : *une recherche débloque une unité, une tuile, une ligne d'usine, ou un
   slot*. Un slot est une capacité entière, jamais un pourcentage.
2. **Le QG bâtit.** Son niveau N fait avancer N chantiers à la fois (`buildLanes`), le reste attend
   en file. C'est le « plafond de chantier » de la décision R10 du 14/10. Élever le QG accélère
   toute l'économie, sans pourcentage.
3. **Le QG reste le cœur.** Sa chute élimine, il ancre le sol national, et il forme l'infanterie.

## Conséquences

- `movementSlots(researched)` vaut 2 + le nombre de cartes Transmissions acquises. Le refus d'un
  mouvement ne parle plus du QG.
- La bande du plateau personnel montre les N chantiers actifs, et ce qu'un niveau de QG de plus
  ajouterait.
- L'arbre de recherche passe à environ 232 h pour une saison de 168 h : on ne le finit toujours
  pas.
- Encore ouvert au 19/10 : un niveau donne-t-il de la capacité ou un pourcentage de vitesse (Q14) ?
  La réponse fixera ce que rend un niveau du Centre de recherche (#123), et l'équilibrage suivra.

## Ce qu'on abandonne

- Les slots portés par le niveau du QG.
- La recherche qui ne touche à aucun chiffre : elle peut désormais ajouter un slot.
