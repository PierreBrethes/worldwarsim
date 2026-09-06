# Contrat de vue — 07 · Page de presse (classement)

**Rôle en une phrase :** répondre à « où en est chacun, à l'heure de la dernière édition » —
jamais « où en est chacun maintenant ». Une édition paraît **toutes les 3 heures** (décision 80,
06/09 — révise 43) et l'écran ne bouge pas entre deux ; l'heure du relevé s'imprime.

**Statut : ⚠ pas-codé, entièrement.** Le serveur ne sert rien de ceci aujourd'hui ; le prompt
`classement-et-page-de-presse` (prêt) servira exactement les champs listés ici, selon la spec
`propositions/classement-bareme.md` (79a). La maquette précède le code (décision Pierre, 06/09).

## Ce que le serveur servira (source de chaque champ)

| Donnée | Source à venir |
|---|---|
| Heure du relevé (= l'édition), heure de la prochaine, tampon « édition finale » | `view.ts:press.at`, `press.next`, `press.final` |
| **Moi** : territoire %, industrie, puissance militaire, faits d'armes, général — exacts ; delta de chacun depuis l'édition précédente | `press.mine` |
| **Les autres**, un par joueur : rang, pseudo, nation, territoire % (exact), général (**exact**, décision 80), faits d'armes (exact), défait ou non | `press.others[]` |
| Pas d'édition encore (moins de 2 h de saison) | `press === null` |

Le classement est **ordonné par territoire** (79a), le premier en haut ; moi dans la liste à mon
rang, comme les autres. Ce qui me distingue : le bloc « nos registres » (industrie, militaire,
deltas) — les autres n'ont que le général.

## P1 — d'un coup d'œil (liste fermée)

- **La liste ordonnée** : `rang · drapeau · nation · pseudo · territoire %`. C'est la vue —
  huit lignes au plus.
- **LE chiffre : mon rang.** *Justification : c'est le seul nombre qui change ce que je fais
  dans la minute — attaquer celui qui est au-dessus, ou tenir. Le territoire est le but, le rang
  en est la lecture.*
- **Le tampon d'en-tête**, un seul : « édition finale » quand `press.final` — sinon aucun.
  (« Saison close » vit au journal, pas ici.)

## P2 — au geste (liste fermée + geste)

- **Sur chaque ligne, en second corps** : général exact et faits d'armes. Lu **en place**, pas de
  pli — la ligne est assez large.
- **Manchette** : « scores relevés à 14:00:00 » et la prochaine édition (petit corps,
  `asLocalTime`).
- **Le bloc « nos registres »** (ma ligne dépliée, ou l'encart latéral — design choisit) : mes
  quatre chiffres exacts + le général, chacun avec son **delta depuis l'édition précédente**
  (« +85 », « −12 », « = »). C'est le seul endroit du jeu où le détail existe.
- **Un joueur défait** : tampon « défaite » (`fr.stamps`), ligne estompée, reste à son rang.
- Aucune mention « estimations » (les chiffres sont exacts) — la manchette « scores relevés à »
  est la seule source citée.

## P3 — existe côté serveur, ne s'affiche pas (et pourquoi)

- **Industrie et militaire des autres** — jamais servis, jamais dessinés, même en survol :
  le général se lit, il ne se décompose pas (garde-fou de la proposition du 29/08).
- **La composition** du général (quels bâtiments, quelles troupes) — c'est du renseignement,
  il s'achète sur la carte (relevés), pas ici.
- **L'historique des éditions** (courbes, « il y a 6 h ») — la table les garde, la vue ne sert
  que la dernière et le delta. Pas de graphique, pas de frise.
- **Le nombre de régions** derrière le % — le pourcentage suffit ; le compte dirait la taille du
  théâtre tenu, que la carte ne révèle pas (ADR 0020 §4-5).
- **Qui a gagné** — la page finale liste, elle ne couronne pas : le vainqueur est celui de la
  victoire territoriale, servi ailleurs (`season.reduction` aujourd'hui).

## Tampons possibles

- **Par ligne, un seul : « défaite »** (`me.defeated` de ce joueur) — sinon aucun. Pas de
  tampon « en tête », « en hausse » : le rang et le delta le disent.
- **En-tête : « édition finale »** (`press.final`).
- **Rien d'autre.** Aucun tampon d'état sur un score : un score n'a pas d'état.

## Actions tolérées (impossibles sur la carte)

- **Fermer.** Rien d'autre — aucun ordre ne part de la presse, aucune ligne ne recentre la
  carte (on ne sait pas *où* est un joueur, seulement *combien*).

## Manque côté serveur (ne rien inventer)

- Tout — voir le statut. Le prompt code servira `press` tel que listé ; s'il manque un champ à
  la maquette, on l'ajoute au prompt, pas à l'écran.

## À coller à Claude design — Presse

> Maquette la page de PRESSE de worldwarsim (presse illustrée 1940, même famille que le journal
> et l'économie). Une seule question : « où en est chacun à l'heure du dernier relevé ».
> P1 : la liste ordonnée par territoire — rang · drapeau · nation · pseudo · territoire % —
> huit lignes au plus, et un seul chiffre en vedette : mon rang. Manchette : « scores relevés à
> HH:MM:SS », prochaine édition ; tampon « édition finale » seulement sur la planche finale. P2,
> sur chaque ligne : le score général EXACT et les faits d'armes ; sur ma ligne un bloc « nos
> registres » (territoire, industrie, puissance militaire, faits d'armes, général — chacun avec
> son delta depuis l'édition précédente, mention « selon nos propres registres »). Un joueur
> défait : tampon « défaite », ligne estompée, à son rang. Aucune action sauf fermer.
> Interdits : l'industrie ou le militaire d'un autre joueur, une mention « estimations », toute
> courbe ou historique, le nombre de régions, un « vainqueur », un tampon sur un score, un
> bouton qui recentre la carte, toute donnée hors de cette liste. L'annexe 07-presse-donnees.md
> est la SEULE source de texte et de chiffres — n'écris rien, ne calcule rien, demande ce qui
> manque ; valide sur les chaînes les plus longues.
