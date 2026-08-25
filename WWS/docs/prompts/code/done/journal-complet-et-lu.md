# Prompt Claude Code — un journal qui dit ce qui s'est passé

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/design/11-brief-ui.md` (§4.1, le
journal), `WWS/docs/design/04-information.md`, puis `src/domain/journal.ts`,
`src/-plateau/JournalWindow.tsx`, `NationBanner.tsx`, `convex/validators.ts` (`NOTICE_KIND`),
`convex/schema.ts` (`notices`, `players`) et les mutations qui terminent quelque chose
(`constructions.finish`, `troops.deliver`, `movements.arrive`, désactivation d'avant-poste,
`combat.resolveContact`). Ne commit pas, ne push pas. **Suppose `gardes-de-saison-et-slots`
passé** (il touche `movements.ts` ; celui-ci touche `validators.ts` et les mêmes jobs).

## Pourquoi

Le journal est « qu'est-ce qui a changé depuis ma dernière visite » (CONTEXT.md). Aujourd'hui il
ne sait dire que : un combat, une réduction, une entrée en guerre, un chantier annulé. **Rien**
pour un chantier terminé, un lot livré, une colonne arrivée, un avant-poste fondé ou désactivé,
un mouvement adverse relevé, un camp qui a tiré à sec. Un joueur qui revient après huit heures sans
combat lit « rien à signaler » alors que trois choses ont changé — c'est la boucle de retour d'un
jeu asynchrone, et elle est cassée. Et il n'y a pas de lu/non-lu : le bandeau compte toutes les
dépêches, pour toujours.

## Ce que tu codes

1. **Les notices manquantes.** Étends `NOTICE_KIND` et la table `notices` (les champs optionnels
   que chaque sorte demande : `movementId`, `outpostId`, `troopIds`, `regionId`…). Une notice est
   écrite par le job qui fait l'événement, jamais dérivée côté client :
   `constructionFinished`, `recruitmentDelivered`, `columnArrived` (marche, retour, déroute
   rentrée), `outpostFounded`, `outpostDisabled` (pour le propriétaire), `movementSighted`
   (une par relevé, pour l'observateur — au moment où `fileSightings` l'écrit, pas à la lecture),
   `firedDry` (le camp qui a tiré à sec ×0,60 dans une passe — c'est le trou d'UI noté depuis le
   25/08). Chaque notice porte `at`. Ne duplique pas les rapports de combat : les engagements
   restent la source des dépêches de combat, `journalDispatches` fusionne les deux flux par date.
2. **Lu / non lu.** `players.journalReadAt` (optionnel, absent = rien lu). Mutation
   `journal.markRead` appelée à la **fermeture** de la fenêtre journal (pas à l'ouverture : on
   compte lu ce qu'on a eu le temps de voir). Le bandeau compte les dépêches postérieures à
   `journalReadAt` ; la fenêtre grise ce qui est lu et ouvre sur la première non lue. La
   colonne « au réveil » (`resolutionAt`) se nourrit désormais des notices, elle cesse d'être vide.
3. **Ouverture automatique du journal seulement s'il y a du non-lu** — aujourd'hui elle est
   inconditionnelle (`plateau.tsx`, autour de l.546).
4. **Retirer les promesses grises** : les trois entrées « à venir » du rail (`SurfaceRail.tsx`,
   Rejeu / Doctrine / Espionnage) et le bouton « rejeu » `disabled` de `JournalWindow.tsx`. Ils
   reviendront avec leur fonction. Pas de trace « bientôt » : un invité ne doit voir que ce qui marche.

Libellés en français dans `fr.ts`, une phrase entière par sorte, à la manière presse (« La caserne
de Lyon a livré deux compagnies. », « Une colonne inconnue a été relevée au large de Brest, cap
nord-est. »). Le relevé ne nomme jamais la nation ni le type (fiche 04).

## Critères d'acceptation

- Test Convex par sorte : le job écrit exactement une notice pour le bon joueur (et aucune pour
  l'adversaire — un relevé n'est visible que de l'observateur).
- Test domaine : `journalDispatches` fusionne notices et engagements par date, et le compte de
  non-lu ne dépend que de `journalReadAt`.
- Scénario à la main sur le dev : lancer un chantier, attendre, revenir → la dépêche est là, le
  bandeau dit « 1 », fermer la fenêtre → « 0 ».
- `destroy` purge les nouvelles colonnes (le test qui itère sur `schema.tables` doit rester vert).
- Aucun terme banni (« passe de résolution », jamais « tour »). `npm run build`, `npm run test`.

## Ce que tu ne fais pas

Pas de notification hors écran (mail, push). Pas de rejeu. Pas de « à faire maintenant » (prompt
à part). Tu ne touches pas à la mise en page presse de la fenêtre — seulement à son contenu et à
son état lu/non-lu.
