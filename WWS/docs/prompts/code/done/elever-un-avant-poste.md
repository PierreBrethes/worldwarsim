# elever-un-avant-poste — le niveau d'un avant-poste se monte, comme l'ADR 0020 §10 le promet

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0020 §1, §6-7 et §10, la précision
du 04/09, `convex/production.ts` (en-tête : les trois événements qui font bouger la couleur) et
`WWS/docs/prompts/code/done/file-de-chantier-prepayee.md`. Ne commit pas, ne push pas.
Suppose `portes-sans-poche` livré. Un chantier, un commit.

> **Décisions du 15/09 (rapport Discord, ligne 10) : 1a, 2a, 3a acquises** — panneau de
> garnison, file de chantier prépayée, refus sous désactivation (un chantier en file attend).
> Le prix se lit dans `buildCost('outpost', level)` ; la clé `outpost` est posée ici et
> réutilisée par `fondation-en-chantier` pour le niveau 1.

## Le constat (Pierre, partie en cours, 15/09)

La fiche d'un avant-poste plein dit « améliorez l'avant-poste pour en ouvrir un de plus »
(`fr.ts:392`, `:1644`, `:2030`). **Rien ne le permet.** `outposts.level` existe au schéma, la
portée (`outpostReachKm`), les emplacements (`convex/sites.ts`), l'entretien (`upkeep.ts`) et la
détection (`surveys.ts`) le lisent — mais aucune mutation ne l'écrit : le seul `patch` d'un
avant-poste est sa spécialisation (`movements.ts:226`). L'ADR 0020 §10 en a fait un choix du
joueur (« ce qui est joli s'achète ») ; le choix n'a jamais été codé. Le texte promet, le jeu
ne tient pas — c'est le pire des deux.

## La règle (aucune révision — une précision de l'ADR 0020 §10, à graver sous « Précision du 15/09 »)

Un avant-poste se **monte** de 1 à 3, par son propriétaire, **comme un bâtiment** : un ordre
dans la file de chantier prépayée, un coût en alliage, une durée, annulable avec remboursement
selon les règles de la file. À la fin : niveau + 1, donc **un emplacement de plus, le rayon
suivant (180 puis 240 km), l'entretien du niveau, la détection du niveau** — tout ce qui lit
déjà `level`. Rien de neuf ne s'ajoute au niveau ; on branche ce qui attend.

Décisions :

1. **Où** : dans le panneau de garnison de l'avant-poste (`GarrisonPanel.tsx`, dont l'en-tête
   porte déjà région et niveau), par le même `UpgradeControl` que la modale de site. Aussi une
   ligne dans « à faire maintenant » quand l'avant-poste est plein et le stock suffisant, et le
   texte de refus (`fr.ts:392/1644/2030`) devient un lien vers cette porte.
2. **Prix et durée** : `buildCost('outpost', level)` / `buildMinutes('outpost', level)` avec une
   entrée `outpost` dans les tables de `constants.ts`, `@a-mesurer`, calée sur un bâtiment de
   projection du même niveau. La fondation reste ce qu'elle est (la colonne qui marche) ; seule
   l'élévation se paie ici.
3. **Condition** : aucune garnison exigée, aucun palier de QG. Un avant-poste **désactivé** ne
   se monte pas (`OUTPOST_DISABLED`) — on ne rénove pas sous le feu ; la file, si elle était
   déjà lancée, attend la fin de la désactivation.

## Ce qu'il faut

- **File de chantier** : la table `constructions` porte `building: BUILDING_KEY` et `regionId`.
  Ne tords pas une clé de bâtiment : ajoute une cible optionnelle `outpostId?: v.id('outposts')`
  et une clé de coût `outpost` séparée de `BuildingKey` — `v.optional` sans migration (leçon du
  27/08). Une seule file, un seul `rank`, un seul `finishesAt` : l'élévation d'un avant-poste
  prend sa place dans la file du joueur comme n'importe quel chantier.
- **La fin du chantier est un quatrième événement de couleur.** Aujourd'hui la couleur ne bouge
  qu'à la fondation, la désactivation et sa fin, et à chacun le serveur **règle les stocks à
  l'ancienne couleur avant d'écrire la nouvelle** (`settleBeforeChange` / `reportChange`,
  `production.ts`). Un rayon qui passe de 120 à 180 km relie des bâtiments qui ne l'étaient pas
  (§6) : même séquence, obligatoirement — régler, patcher `level`, rapporter. Test explicite.
- **Relevé du sol** : les nouvelles régions du cercle entrent dans le relevé du propriétaire
  (`fileSurvey`, même déclencheur que la fondation) ; la vue les sert (`carrying`, livré par
  `portee-servie-entiere`, lit déjà `level`).
- **Domaine** : la règle « peut-on monter » est une fonction pure lue par les deux bouts
  (bouton et mutation, ADR 0015 : rien de grisé, la phrase qui dit pourquoi) —
  `outpostRaiseRefusalOf` dans `src/domain/construction.ts` ou à côté de
  `movement-orders.ts`, au choix du voisinage : niveau 3 (`OUTPOST_MAX_LEVEL`), désactivé, déjà
  en file, stock insuffisant (même lecture `availabilityOf`).
- **Dépêche** à la fin : `outpostRaised` chez le propriétaire, encre normale, région et niveau.
  Pas de dépêche adverse — un avant-poste qui grandit se relève, il ne s'annonce pas
  (ADR 0005).
- **Classement** (`standings.ts`) : l'alliage payé pour l'élévation compte en territoire ou en
  industrie ? Suis la règle existante des bâtiments (somme des niveaux gravis) et dis dans quel
  poste il tombe.
- **Textes** : `fr.ts` — bouton, refus, dépêche, ligne « à faire maintenant ». Les trois
  phrases « améliorez-le » restent, elles disent enfin vrai.
- **Fiche `?` et aide-mémoire** : une ligne.
- **Miroir** (`WWS/simulation/`) : si le simulateur modélise le niveau d'avant-poste, brancher ;
  sinon le dire, ne pas l'inventer.

## Cas d'acceptation

1. Avant-poste niveau 1, 1/1 emplacement, stock suffisant : le panneau de garnison offre
   « monter au niveau 2 », prix et durée affichés ; l'ordre entre dans la file, débité.
2. À la fin : `level = 2`, 2 emplacements, rayon 180 km, entretien du niveau 2, une région à
   150 km du point devient tenue et colorée pour le propriétaire, un bâtiment qui s'y trouvait
   passe de « hors réseau » à relié — **et les heures d'avant sont réglées à l'ancienne
   couleur** (test sur les stocks).
3. Niveau 3 atteint : plus d'offre, la phrase dit « niveau maximal ».
4. Avant-poste désactivé : refus `OUTPOST_DISABLED`, phrase ; un chantier déjà en file attend.
5. Annulation en file : remboursement selon la règle de la file, niveau inchangé.
6. Une seconde élévation ne peut pas être mise en file tant que la première n'est pas finie.
7. Le refus « avant-poste plein » mène à la porte d'élévation (lien ou bouton), pas à un mur.
8. Vérifieur vert ; tests `sites`, `production`, `construction` étendus.

## Hors périmètre

Le coût de la fondation, la destruction après plusieurs raids, le niveau 4+, une élévation par
la garnison (des bras qui construisent) — évoqué, pas tranché.
