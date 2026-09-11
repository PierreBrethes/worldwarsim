# retours-prod-lot-1 — le bâtiment adverse qu'on ne voit pas, la colonne bredouille, les modales sous le bandeau

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/docs/rapports/2026-09-11-partie-de-controle.md` (les
retours, lignes 4, 5, 6), `convex/surveys.ts` (`fileSurvey`, `surveyFromPoint`, la garde
`SURVEY_REFRESH_HOURS`), `convex/movement/arrival.ts` (le couloir relevé à l'arrivée),
`src/domain/player-view.ts` (`surveyedInstallations`), `src/routes/plateau.tsx` (les marqueurs
`installation`, ligne ~957, et leur seuil), `src/domain/journal.ts` + `fr.journal`
(`columnFoundNothing`), `src/shell/ResourceBand.tsx`, `src/routes/-plateau/Window.tsx`,
`SiteModal.tsx`, `src/styles/tokens.css` (les `z-index`). Ne commit pas, ne push pas. Un chantier,
un commit — trois correctifs de la même partie.

## Ce qui s'est passé en prod

Un joueur envoie une colonne « attaquer » sur une région adverse qui porte une mine de charbon.
Il ne voit **aucun bâtiment** sur cette région, avant ni après l'arrivée. Sa colonne arrive,
personne ne la combat, il a « l'impression qu'il ne s'est rien passé ». Il voulait saboter la mine ;
la seule porte pour ça est le marqueur d'installation relevée (S8), qu'il n'a jamais eu.

## Ce qui change

1. **Le bâtiment relevé se voit.** D'abord le serveur, en test : une colonne qui arrive dans une
   région adverse (sol national de l'autre nation, pas un avant-poste) contenant une mine → après
   l'arrivée, `viewOf(attaquant).surveyedInstallations` contient la mine. Si ce test passe du
   premier coup, le trou est client : le marqueur `installation` de `plateau.tsx` — vérifie son
   seuil d'apparition (il doit suivre celui des bâtiments à soi, et être visible au zoom où l'on
   vise une région), et que le picking du clic droit le trouve. Si le test échoue : regarde ce que
   `seen` contient à l'arrivée (le couloir couvre-t-il la région de destination elle-même, ou
   seulement les cellules traversées ?) et la garde `SURVEY_REFRESH_HOURS` (elle ne doit jamais
   empêcher un inventaire d'installations nouveau — c'est déjà comparé, vérifie que la comparaison
   voit un bâtiment posé après le dernier relevé). Rapport : lequel des deux.
2. **La colonne bredouille dit ce qu'elle a trouvé.** Quand une colonne « attaquer » arrive sur un
   point sans force adverse mais dans une région qui porte une installation adverse **relevée**,
   la dépêche `columnFoundNothing` gagne une phrase : « un(e) <bâtiment> est ici — un ordre
   « saboter » / « piller » depuis son marqueur l'atteint » (clé `fr.journal`, texte à toi, même
   ton que le reste du journal). Rien de nouveau n'est servi : l'installation était déjà dans
   `surveyedInstallations`. Sans installation relevée, la dépêche ne change pas.
3. **Les modales au-dessus du bandeau.** Le bandeau des ressources passe sous les fenêtres et
   modales : un jeton `--z-band` sous `--z-window` dans `tokens.css`, appliqué là où les
   `z-index` sont écrits en dur. Vérifie aussi la rose et les cartouches (`TroopBadge`,
   `LootCrateCard`) : l'ordre attendu, du fond vers l'avant — carte, marqueurs, bandeau et rail,
   fenêtres et modales, rose, popins.

## Ce que ce prompt ne fait pas

Pas de sprite sur un arc adverse (règle voulue, ADR 0005). Pas de détection des troupes posées
(question 90, chantier à part). Pas de choix d'emplacement du QG (question 89).

## Cas d'acceptation

1. Test serveur : arrivée sur une région adverse avec une mine → `surveyedInstallations` la
   contient ; une mine posée **après** un relevé de la même région est relevée à l'arrivée
   suivante malgré la garde de fraîcheur.
2. À l'œil (Pierre) : après l'arrivée, le marqueur de la mine est visible au zoom où l'on vise, et
   le clic droit dessus ouvre « saboter ».
3. Colonne bredouille sur une région à installation relevée → la dépêche nomme le bâtiment et
   l'ordre ; sans installation relevée → dépêche inchangée (test de domaine sur `journal.ts`).
4. Toute fenêtre et toute modale recouvrent le bandeau (test statique sur l'ordre des jetons, et
   à l'œil).
5. `npm run verifier` vert.

Un commit, message en français qui décrit les trois correctifs.
