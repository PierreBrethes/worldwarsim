# ADR 0043 — Un point stratégique neutre est gardé par une garnison locale

**Statut :** acceptée (23/11/2026). Recommandation de l'audit gameplay du 23/11 (point 2), acceptée
par Pierre. **Mondiale seule** (les sept n'existent qu'en Mondiale). **Amende** ADR 0027 §4 (la
victoire aux Sept) ; réutilise ADR 0019 §3 (garnison locale) et ADR 0024 §1 (force posée, relevée).

## Contexte

Les sept points naissaient neutres et sans troupe : une infanterie seule en prenait un en six
heures, et quatre points tenus 24 h gagnent. La saison pouvait se jouer avant toute recherche.

## Décision

1. **Les sept sont gardés** par `POINT_GARRISON` : trois infanteries de palier 1, la même pour
   tous, `@a-mesurer` (l'archétype moyen des objectifs). Ce sont des troupes ordinaires du siège
   irrégulier, posées sur le point : le moteur de combat existant les fait défendre, et elles
   rechargent leurs coups sur la dotation de `endowIrregular`.
2. **La garnison naît dans le travail planifié des objectifs** (`objectives.commit`), pas dans
   `layPoint` : les scènes de démo et les suites de règles posent un point nu par `layPoint` et
   le gardent nu. La pose passe hors des gardes « aucun objectif à poser » et « objectifs déjà
   posés ».
3. **Une seule fois**, à la naissance du siège irrégulier : un travail repris ne regarnit pas des
   garnisons réduites entre-temps. Une saison déjà lancée n'en reçoit pas (pas de rattrapage).
4. **Prise** : la colonne combat la garnison ; la capture ne commence que si elle gagne et garde
   une infanterie debout (`arriveForCapture`), sinon elle rentre. Un point pris n'a plus de
   garnison : son teneur le garde sans garnison, comme avant.
5. **Brouillard.** Aucun booléen « gardé » n'est servi (il lirait `troops` hors relevé). La fiche
   d'un point neutre dit une règle vraie en tout temps — « Gardé au lancement par une garnison
   locale. » — et la force ne se lit que par relevé, comme tout camp ; la pile seulement sous un
   Guet (`readsComposition`). La dépêche `pointsDrawn` ne nomme jamais la garnison.

## Ce qu'on abandonne

- Le nombre de troupes sur la fiche : c'est un relevé, pas un fait public.
- Une garnison qui se renforce ou se regarnit : elle reste celle du lancement.
