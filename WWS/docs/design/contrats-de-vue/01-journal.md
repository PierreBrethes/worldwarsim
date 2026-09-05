# Contrat de vue — 01 · Journal d'événements

**Rôle en une phrase :** répondre à « qu'est-ce qui a changé depuis ma dernière visite » —
jamais « qu'est-ce qui est vrai maintenant ».

## Ce que le serveur sert (source de chaque champ)

Le journal est **construit sur le client** (`src/domain/journal.ts`, `journalDispatches`) à
partir de quatre flux servis par `convex/view.ts` :

| Donnée | Source |
|---|---|
| Comptes rendus d'engagement (côté, gagné, cause, pays, pertes des deux camps, réduction) | `view.ts:reports` |
| Dépêches d'événements (16 sortes, union fermée) | `view.ts:notices` (`convex/validators.ts:NOTICE`) |
| Entrées en guerre (pseudo, nation, heure) | `view.ts:warEntries` |
| Tableau de la victoire de test (cible, tenants réduits, vainqueur) | `view.ts:season.reduction` |
| Heure de dernière fermeture (décide `unread`) | `view.ts:journalReadAt` |
| Jour de saison (élapsé / total, total `null` sans horloge) | `view.ts:season.elapsedHours`, `durationHours` |
| Slots engagés | `view.ts:me.slots` |

Chaque dépêche finie porte : `at`, `t` (heure formatée), `severity`
(critique / notable / routine), `kind` (la sorte, 16 valeurs — `player-view.ts:DispatchKind`),
`text` (une phrase, `fr.journal`), `unread`, `resolutionAt` (seul `movementStalled` en a une).

## P1 — d'un coup d'œil (liste fermée)

- **La manchette** : la première dépêche **non lue** (critique d'abord), texte en vedette
  avec son tampon de sorte et son heure. *Justification : c'est la réponse à la question de
  la vue — ce qui a changé — et le code la choisit déjà ainsi (`JournalWindow.tsx:lead`).*
- **LE chiffre : le compte de non-lues** (`unread.length`). *Justification : c'est le seul
  nombre qui dit « combien il te reste à lire avant de décider » ; le badge du rail compte
  déjà la même chose.*
- **Le tampon d'en-tête**, un seul et rare : « saison close » quand
  `season.reduction.concludedAt !== null`.

## P2 — au geste (liste fermée + geste)

- **Le fil des dépêches par gravité** (trois colonnes critique / notable / routine), chaque
  ligne : heure, tampon de sorte, phrase. Lu **en défilant** — le geste est le scroll, pas un
  clic. Une dépêche lue s'estompe, elle ne disparaît pas.
- **« Au réveil »** : la dépêche `movementStalled` et sa `resolutionAt` — la seule heure
  future du journal. Révélée dans l'encart dédié, pas mêlée au fil.
- **Le tableau de la victoire de test** (`season.reduction.standings` : nation, réduit x/y,
  tampon réduit / debout) — en pied, au défilement. ⚠ échafaudage : disparaît entier avec la
  part de carte (ADR 0020), ne pas le raffiner.
- **Slots engagés** (`me.slots.used / total`) dans l'encart latéral.
- Jour de saison et compte de dépêches, dans l'en-tête (petit corps).

## P3 — existe côté serveur, ne s'affiche pas (et pourquoi)

- `notices[].playerId`, ids d'engagements, ids de mouvements — plomberie, aucun sens joueur.
- `headingDegrees` brut d'un relevé — la phrase le convertit en cap cardinal
  (`cardinalLabel`) ; le degré n'apparaît jamais.
- `hostCountry` brut (`adm0_a3`) — toujours traduit par `countryLabel`.
- Le détail des pertes par troupe d'un engagement — le compte rendu sert des totaux
  (`mine`/`theirs`) ; la décomposition attend le rejeu (surface 4.7), pas le journal.
- `remaining` / « embargo » — champ mort : l'embargo n'existe plus (doctrines abandonnées,
  ADR 0020 §9). Ne pas dessiner l'encart « embargo restant ».

## Tampons possibles

- **Par dépêche, un seul : sa sorte** (`DispatchKind`, libellés `fr.stamps.dispatches`) —
  16 valeurs : saison close, réduction, entrée en guerre, assaut mené, assaut subi, chantier,
  livraison, colonne, immobilisé, avant-poste fondé, avant-poste désactivé, relevé, tir à sec,
  sol vide, capitulation, commandement.
- **L'encre du tampon** : rouge pour les quatre alarmes — assaut subi, avant-poste désactivé,
  tir à sec, relevé (`journal.ts:ALARMS`) — encre normale sinon. La gravité colore la colonne,
  jamais le tampon : ce sont deux axes distincts et servis tels quels.
- **En-tête : « saison close »** (`reduction.concludedAt`).

## Actions tolérées (impossibles sur la carte)

- **Marquer lu** — implicite, à la **fermeture** de la fenêtre (`journal.markRead`), jamais un
  bouton par dépêche. C'est l'acte de lecture lui-même : aucune carte ne peut le porter.
- Fermer / retour au plateau. Rien d'autre — aucun ordre ne part du journal.

## Manque côté serveur (futurs prompts code, ne rien inventer)

- ~~**Aucune borne sur les dépêches**~~ — **fait le 05/09** : `view.ts` sert les
  `NOTICES_SERVED` dernières (200, `src/domain/player-view.ts`), et les comptes rendus les
  `REPORTS_SERVED` derniers (50), au lieu de la saison entière. Le détail frappe par frappe a
  quitté le document de l'engagement pour la table `strikes` — il attend le rejeu (4.7), et le
  journal n'en a jamais rien lu. Budget tenu par `convex/view-budget.test.ts`. **Le fil ne
  remonte pas plus loin que sa fenêtre** : pas de pagination, rien à dessiner pour « charger
  plus ».
- **Recentrer la carte depuis une dépêche** (une colonne arrivée, un relevé) : la notice ne
  porte pas de point, seulement un pays. Si design le veut, il faut servir le point.

## À coller à Claude design — Journal

> Maquette la fenêtre Journal. Une seule question : « qu'est-ce qui a changé depuis ma
> dernière visite ». P1 : la manchette (première dépêche non lue, critique d'abord — texte en
> vedette, heure, un tampon de sorte) et un seul chiffre, le compte de non-lues. En-tête :
> jour de saison, nation, tampon « saison close » si la saison l'est. P2, au défilement :
> trois colonnes par gravité (critique / notable / routine), chaque ligne = heure + tampon de
> sorte + une phrase servie telle quelle ; les lues s'estompent sans disparaître ; un encart
> « au réveil » pour la seule dépêche à heure future (mouvement immobilisé, résolution à H) ;
> slots engagés x/y ; en pied le tableau de la victoire de test (échafaudage, sobre). Les
> tampons sont des états, 16 sortes fournies, encre rouge sur les quatre alarmes seulement.
> Aucune action sauf fermer (qui marque lu). Interdits : bouton « marquer lu » par ligne,
> barre de progression, encart embargo, degré de cap en chiffres, nation ou composition d'une
> colonne relevée, toute donnée hors de cette liste.
