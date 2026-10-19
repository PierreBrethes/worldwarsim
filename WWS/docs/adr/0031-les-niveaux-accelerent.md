# ADR 0031 — Les niveaux accélèrent, la recherche ouvre des files

> §3 révisé le 19/10 (#165) : les cartes de file sont retirées ; le Centre a une file de 3 cartes.

**Statut :** acceptée (19/10/2026, Q14 et Q17 du grilling des retours de la pré-prod) —
**précise la règle 1** de `WWS/CLAUDE.md` (elle vaut pour les bonus : atouts, points stratégiques,
recherche ; un niveau de bâtiment n'en est pas un) ; **révise l'[ADR 0028](0028-l-economie-de-la-mondiale.md)
§5** (« un niveau rend » en capacité, et l'abandon de `chainSpeed`) et **l'[ADR 0030](0030-le-qg-batit-la-recherche-transmet.md)
§2** (le QG N fait N chantiers à la fois).

## Contexte

Élever un bâtiment devait rendre quelque chose. Deux voies ont été pesées. La **capacité** : des
files qui travaillent en parallèle, en paliers. Elle se voit sur la table, se teste facilement et
tient la règle 1. Le **pourcentage** : chaque niveau raccourcit les durées. La progression est
lisse, et c'est la sensation des jeux de gestion (Ogame). Pierre a choisi le pourcentage : c'est ce
que les joueurs connaissent, et chaque niveau donne quelque chose. La capacité reste, mais comme un
déblocage de recherche, cher et tardif.

## Décision

1. **Un niveau accélère ce que fait le bâtiment.** Chaque niveau au-delà du premier raccourcit les
   durées d'un pourcentage. Les pourcentages se multiplient, et un plancher les borne (valeurs
   `@a-mesurer`, fixées par l'équilibrage) :
   - le **QG** accélère les chantiers ;
   - la **caserne**, le **port** et l'**aérodrome** accélèrent la formation de leurs troupes ;
   - le **Centre de recherche** accélère la recherche.

   Une exploitation garde « N fois la base » : sa production est un débit, pas une durée.
2. **Une seule file par défaut** : un chantier à la fois, une troupe formée à la fois par site, une
   carte cherchée à la fois. Les files parallèles de #136 et de la 4.9 cèdent la place au
   pourcentage.
3. **La recherche ouvre des files** : des cartes chères et tardives débloquent une seconde file de
   chantier et une seconde file de formation. Ce sont des capacités entières, comme les cartes
   Transmissions pour les slots (ADR 0030).
4. **La règle 1 reste pour les bonus** : un atout, un point stratégique ou une recherche casse une
   règle, et ne donne jamais un pourcentage.

## Conséquences

- On revient sur #136 (N chantiers selon le niveau du QG) et sur « N troupes à la fois » de la 4.9.
- `chainSpeed` revient sous une forme générale : un facteur de durée par niveau, lu par la
  formation, les chantiers et la recherche, depuis une seule fonction pure.
- Le joueur lit le gain sur la fiche (« niveau 3 : −28 % ») et sur l'aperçu d'élévation
  (« niveau 4 : −39 % »).
- L'équilibrage chiffre le pourcentage par niveau, le plancher, et le prix des cartes de file.

## Ce qu'on abandonne

- Les files parallèles portées par le niveau du QG et des casernes.
- La règle 1 appliquée aux niveaux des bâtiments.
