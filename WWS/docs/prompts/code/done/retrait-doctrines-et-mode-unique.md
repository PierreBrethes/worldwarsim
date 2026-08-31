# Prompt Claude Code — la domination devient le mode unique, les doctrines partent

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`,
`WWS/docs/adr/0020-domination-par-couleur.md`, `WWS/docs/adr/0004-avant-postes-plutot-que-conquete.md`.
Ne commit pas, ne push pas. Un seul commit à la fin, préparé mais pas créé.

## Pourquoi

Décision de Pierre (31/08, gravée en ADR 0020 §9) : **il n'y a plus de choix de condition de
victoire**. La domination n'est plus une option parmi trois, c'est la règle du jeu. Les trois
doctrines de la fiche 05 (`domination`, `hegemony`, `influence`) sont abandonnées — elles étaient
écrites, jamais jouées, et le mode unique leur retire toute place.

Ce prompt **retire**. Il ne code ni la couleur, ni le score de part de carte : c'est le ménage qui
doit précéder, pour que la surface suivante n'ait pas à composer avec un choix mort.

⚠️ C'est plus lourd que « un champ de schéma sans lecteur » : `doctrine` est lue par le lobby, par
`PlayerView`, par le bandeau, par le cartouche, par la fenêtre Nation, par le journal, par le
panneau de sol, et elle est posée par une quinzaine de fichiers de test. Fais l'inventaire avant
de toucher quoi que ce soit.

## Ce qui change

**Inventaire d'abord.** Liste tous les points d'usage avant modification (`grep -rn "octrine"` sur
`convex/` et `src/`, tests inclus) et vérifie la liste ci-dessous plutôt que de lui faire
confiance.

**Backend.**
- `convex/players.ts` : supprime la mutation `chooseDoctrine`. Dans `declareReady`, la condition
  ne porte plus que sur `player.nation` ; l'erreur `NATION_AND_DOCTRINE_REQUIRED` devient
  `NATION_REQUIRED` (`convex/errors.ts`, `src/i18n/fr.ts`).
- `convex/validators.ts` : supprime le validateur `DOCTRINE` et ses trois littéraux.
- `convex/schema.ts:78` : supprime le champ `doctrine` de `players`. **Suis la règle du dépôt** —
  un champ retiré d'une table déjà écrite se retire proprement ou pas du tout ; si la validation
  du schéma refuse la poussée sur des documents existants, préfère `v.optional` non lu et note-le
  dans le commit plutôt que de casser la production (vu le 27/08 sur `buildings.seasonId`).
- `convex/view.ts:206` : `doctrine: player.doctrine ?? 'domination'` disparaît.

**Domaine.**
- `src/domain/ids.ts` : supprime `DOCTRINES` et le type `Doctrine`.
- `src/domain/player-view.ts` : retire `doctrine` de `me`, de la barre publique de victoire
  (`{ state: 'attributed'; progress; doctrine }` et le champ jumeau de l'adversaire) et du
  ré-export de type. **La barre reste** : c'est la Domination simplifiée, désormais la seule
  condition — elle n'a plus à se nommer.
- `src/domain/victory.ts`, `src/domain/journal.ts` : les commentaires qui annoncent « en attendant
  les trois doctrines de la fiche 05 » deviennent faux. Réécris-les : la condition n'attend plus
  rien, elle attend d'être remplacée par la part de carte (ADR 0020).
- **Ne touche pas** à `src/domain/nations.ts` : « Doctrine du porte-avions » est le libellé du
  pouvoir japonais, pas une doctrine de victoire.

**Front.**
- `src/routes/salon.tsx` : supprime le bloc de choix (`DOCTRINES.map`, `chooseDoctrine`,
  `doctrineHeader`, `doctrineNote`) et l'entrée `checkDoctrine` de la liste des conditions. Le
  salon ne demande plus qu'une nation.
- `src/routes/accueil.tsx:325` : la ligne d'un siège n'affiche plus la doctrine.
- `src/shell/NationCartouche.tsx` : le cartouche perd son surtitre. ⚠️ le commentaire en place dit
  que le bandeau « était une ligne trop mince » sans lui — vérifie visuellement le rendu du
  bandeau après retrait et ajuste plutôt que de laisser un vide.
- `src/shell/NationBanner.tsx`, `src/routes/-plateau/NationWindow.tsx`,
  `src/routes/-plateau/JournalWindow.tsx`, `src/routes/-plateau/GroundPanel.tsx` : retire l'affichage
  de la doctrine (soi et adversaire).
- `src/i18n/fr.ts` : supprime `doctrines`, `doctrineLabel`, `lobby.doctrineHeader`,
  `lobby.doctrineNote`, `lobby.checkDoctrine`, `banner.doctrine`, `nationSheet.doctrineHeader`,
  `selectedCountry.doctrine`, et corrige les phrases qui nomment la doctrine
  (`lobby` ~509, la fenêtre de plage de repos ~483, `victory.scaffold` ~690, `nationLine` ~745).
  Aucun libellé mort ne reste.

**Tests.** Retire `chooseDoctrine` de tous les montages (`detection`, `economy`, `messages`,
`movements`, `notices`, `off-season`, `season-partition`, `troops`, `upkeep`, `victory`,
`player-view`…). Les cas d'`off-season.test.ts` qui portent sur la doctrine —
« never reveals the others' doctrine in the lobby », « requires nation and doctrine to be ready »,
le scellement à l'entrée en guerre — sont à **réécrire sur la seule nation**, pas à supprimer :
le secret du lobby et le scellement restent des règles.

## Docs

- Note de révision datée (31/08) en tête de `WWS/docs/design/05-doctrines.md` : fiche abandonnée,
  renvoi à l'ADR 0020. Ne supprime pas la fiche.
- `WWS/docs/QUESTIONS.md` : la victoire par seuil **tenu** devient le seul terminateur de partie
  (plus d'horloge depuis le 27/08, plus de mode alternatif depuis le 31/08), et le trou
  « fondateur parti = saison non clôturable » passe de gênant à bloquant.
- `WWS/CONTEXT.md` : retire *doctrine* du glossaire si elle y figure.
- `WWS/docs/adr/README.md` : la ligne 0020 existe déjà ; vérifie que le statut de la fiche 05 est
  cohérent.

## Ce que ce prompt ne fait pas

La couleur, le score de part de carte, la production reliée, les portées de détection, les
postures, le pillage. Rien de tout cela n'est dans ce commit.

## Vérifications

`npm run verifier`. À la main : créer une partie → le salon ne demande qu'une nation → être prêt
sans avoir rien choisi d'autre → lancer → le bandeau et le cartouche s'affichent sans trou → la
fenêtre Nation et le journal ne mentionnent nulle part une doctrine → la barre de victoire reste
lisible et nominative.
