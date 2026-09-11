# Feuille de contrôle — la partie à deux

Ce que la partie doit juger, ce qu'on y fait, ce qu'on note. Une partie ne prouve pas un
équilibre ; elle dit si le jeu se comprend et si l'attaque paie. Le rapport se rédige dans
`WWS/docs/rapports/<date>-partie-de-controle.md`, une ligne par observation, datée.

## Préalables (une fois)

1. **Restauration SQLite** — le plus vieux point ouvert : copier le dernier `wws-*.sqlite3` du
   cron (4 h 10) dans un volume vierge, démarrer un backend dessus, ouvrir l'accueil et une
   saison. Dix minutes. Sans ça, une partie qui casse la base est une partie perdue.
2. Prod déployée (CI verte le 11/09) : le pillage, les caisses, la rumeur, la presse toutes les
   3 h, la fenêtre d'inscription de 2 h y sont. La saison du 04/09 y est encore — on en fonde une
   neuve.
3. **Deux nations voisines** — le pillage exige un relevé d'installation adverse, donc une
   portée qui atteint l'autre : France / Allemagne ou Allemagne / URSS, pas Japon / France.
   Deux navigateurs ou deux jetons ; le second joueur entre avant `launchedAt + 2 h` ou dit ce
   que le refus `REGISTRATION_CLOSED` lui a fait.

## Le parcours — dans cet ordre, chacun de son côté

| Jour | Geste | Ce qu'on regarde |
| --- | --- | --- |
| 1 | Fonder, poser la dotation, première projection, une caserne | Première construction et premier mouvement **sans aide orale** ? (question 1 du point-projet) |
| 1 | Avant-poste vers l'autre ; une troupe posée en lisière | La couleur se lit ? Le relevé daté se comprend (« relevé du … ») ? |
| 2 | Raid sur l'avant-poste adverse | « Hors réseau » compris ? Sait-il quand ça reproduit (`disabledUntil`) ? (question 4) |
| 2 | **Pillage** : entrepôt adverse relevé → clic droit → « piller » → présence 2 h → retour → livraison | Chaque dépêche est-elle lue et comprise (prise, retour, livré, perdu) ? Le butin vaut-il l'expédition ? |
| 2-3 | Intercepter le retour chargé ; laisser une caisse | La **rumeur** (10 min, 200 km) : **quelqu'un a-t-il bougé à cause d'elle ?** — le critère gravé dans l'ADR 0005 (84a). Ramasser la caisse : « ramasser » trouvé sans aide ? |
| 3 | Sabotage d'une mine ; lire la presse (3 h) et « nos registres » | L'écart carte / score d'édition est-il lu comme une règle ou comme un bug ? |
| 3+ | Une absence de 12 h, puis revenir | Retrouve-t-il ce qui a changé et une décision à prendre ? (question 2) |

## Ce qu'on compte

- **Attaques volontaires** (raid, pillage, sabotage, interception) par joueur et par jour — le
  chiffre qui dit si l'attaque paie.
- Visites par jour et durée ; ce qui a déclenché chaque visite (une dépêche ? une rumeur ? rien).
- Chaque `@a-mesurer` rencontré, avec le verdict à la main : `PLUNDER_HOURS_PRESENT` 2 h ·
  `PLUNDER_DISABLED_HOURS` 12 h · `LOOT_CRATE_HOURS` 2 h · `LOOT_RUMOR_DELAY_MINUTES` 10 ·
  `LOOT_RUMOR_RADIUS_KM` 200 · `REGISTRATION_WINDOW_HOURS` 2 · `DETECTION_RANGE_KM` par rôle ·
  `OUTPOST_DISABLED_HOURS` 6. Trop long, trop court, indifférent.
- Les bugs, avec le geste exact — et la distinction : règle voulue, règle mal dite, bug.

## Ce que la partie tranche ensuite

La rumeur reste ou part (une constante à zéro) · les deux valeurs de la victoire au seuil tenu
(`DOMINATION_SHARE`, `DOMINATION_HELD_HOURS`) · le moment du wipe, et C3 avec lui · le repli
géographique des objectifs neutres · ce que « à faire maintenant » doit taire (vision V1, point 7).
