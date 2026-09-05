# Reste à coder — ce qui est acté ou évoqué, dans l'ordre où ça se donne

Tenu par Cowork, 04/09/2026. Un chantier code à la fois. « Acté » = décision numérotée ou ADR ;
« évoqué » = proposition ou Registre, pas encore tranché. La source reste les ADR et les
propositions ; ce fichier est la file.

## Bloquant pour la partie de contrôle à deux

1. **entrer-en-garnison** (64b · 69a · 70b) — *prêt* — sans lui le cargo japonais ne charge rien.
2. **journal-corps-de-texte** — *prêt* — face de texte distincte de la manchette.
3. **Trois commits à faire** (lots 1-3 dans l'arbre de travail) + `.git/index.lock` à retirer.
4. **Test de restauration SQLite** — jamais fait, le plus vieux point ouvert.
5. Contrôle à l'œil : pictogrammes + popin de la fiche (lot 3), rail réordonné (lot 1).

## Acté, à rédiger (dans l'ordre naturel)

6. **Production reliée** (ADR 0020 §6) — la place est réservée dans l'Économie.
7. **ADR 0021 branchée** — portées de détection, postures, salve d'allonge, réévaluation. Amène
   l'œil « portée » dans la fiche de l'abaque (68a) et les placeholders `@a-mesurer`.
8. **Pillage et butin** (proposition `pillage-et-butin.md`) — butin porté par la colonne, seule
   l'infanterie pille, capture des seuls bâtiments de production.
9. **Bâtiment de stockage unique** — entrepôt + dépôt fusionnés, posé, pillable.
10. **Objectifs neutres** (proposition `objectifs-neutres.md`).
11. **Page de presse** — classement en édition toutes les 2 h (43), barème chiffré à trancher.
12. **Fin de saison au seuil tenu** (ADR 0020).
13. **Titre « mon territoire »** dans `GroundPanel` (trouvaille du 01/09, une clé fr).
14. **Fondateur parti → transfert au plus ancien** (40a) — prompt à retrouver dans `done/` ou à
    réécrire si non livré.

## Acté sur le principe, ADR à écrire avant le code

15. **Recherche** (44a : débloque, ne bonifie jamais) — où vivra le MK2 ; contrainte : le contre
    précède toujours l'arme (invariant du lot 2 à étendre). Variantes : médecin, parachutiste,
    bombardier lourd, porte-avions japonais…
16. **Destruction du QG** (39) — recherche de palier 4+, révise « jamais éliminé ».
17. **Invariants CI restants** (51) — glisser dans chaque prompt qui touche `constants.ts`.

## Évoqué, au Registre — pas tranché

18. Bunker / DCA (63a — seulement si le premier test montre l'attaque trop payante).
19. Frappe terminale (hors périmètre avant la campagne ; nom 1940 à trouver).
20. Notifications push et alarmes (proposition).
21. Espionnage (proposition, formats).
22. Consommation continue — le motorisé qui boit (rend la réserve de pétrole datée).
23. Charbon de la première projection : 122 pour 20 de dotation + 10/h — mesuré par le lot 2,
    à lire dans son rapport avant de toucher quoi que ce soit.

## Questions ouvertes qui bloqueront un prompt

- Barème chiffré de l'édition (11).
- Nom 1940 de la frappe terminale (19).
- Valeurs `@a-mesurer` : portées par rôle, posture discrète, heures de butin, capacité de
  chargement, présence du pillage, entretien d'avant-poste, barème du classement — à regarder à
  la main au premier test, aucune ne se simule.
