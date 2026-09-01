# Contrat de vue — 02 · Économie

**Rôle en une phrase :** dire **pourquoi** ça produit ou pas, et ce qu'on élève ensuite —
jamais **combien** on possède (les stocks vivent au bandeau des ressources, pas ici).

## Ce que le serveur sert (source de chaque champ)

| Donnée | Source |
|---|---|
| Chantier en tête : quoi, où, minutes restantes | `view.ts:me.construction` |
| File prépayée : rang, quoi, où, niveau — **jamais datée** | `view.ts:me.constructionQueue` |
| Chaînes : état, débit **réel** / h, débit nominal, niveau, intrant manquant, commandée, lot, lot max | `view.ts:me.chains` |
| Extractions site par site : bâtiment, région, niveau, gisement, débit | `view.ts:me.extraction` |
| Bâtiments : instance, clé, région, niveau, coût + durée du niveau suivant, plafonné par QG | `view.ts:me.buildings` |
| Catalogue niveau 1 : coût, durée, niveau de QG requis | `view.ts:buildCatalog` |
| Emplacements par site : pris / total, sol national puis avant-postes | `view.ts:me.siteSlots` |
| Ce que le QG suivant porterait au sol national | `view.ts:me.homeSlotRelief` |
| Fondation encore due (clés, dans l'ordre) | `view.ts:me.foundation` |
| Entretien : troupes, hors-ravitaillement, vivres / h, avant-postes, vivres+charbon / h | `view.ts:me.upkeep` |
| Armée affamée | `view.ts:me.starving` |
| Stocks (pour les « 40 / 120 » et le solde) | `view.ts:me.resources` |
| Niveau de QG, seuil MK2 | `view.ts:me.hqLevel`, `me.tier2HqLevel` |

## P1 — d'un coup d'œil (liste fermée)

- **Le chantier en tête** : vignette du bâtiment, nom, région, et **LE chiffre : les minutes
  restantes** (compte à rebours). *Justification : c'est la seule chose datée de toute la
  construction, et la seule qui se débloque en attendant — tout le reste attend derrière.*
  S'il n'y a pas de chantier : la ligne « aucun chantier en cours », qui est le tampon
  inverse (un site de construction libre est une attente, `next-actions.ts:idleSite`).
- **Par filière** (une colonne par ressource) : le nom de la ressource de sortie, **UN
  tampon = l'état de la chaîne** (voir tampons) et **UN chiffre = le débit réel / h**
  (`chains[].perHour`, jamais le nominal seul). *Justification : le débit réel est ce qui
  contredit le mensonge « je produis » quand la chaîne est à sec — c'est la raison d'être de
  la surface.*
- **Le budget d'emplacements du sol national** : pris / total en barre. *Justification :
  l'arbitrage le plus structurant de la saison (ADR 0020 §10).*

## P2 — au geste (liste fermée + geste)

Révélé **en place** (pli sur la colonne de filière ou la ligne de bâtiment), jamais une
nouvelle fenêtre :

- **Coût du niveau suivant avec stock à côté** (« alliage 40 / 120 ») + durée
  (`buildings[].nextLevelCost`, `nextLevelMinutes`, stock via `me.resources` +
  `currentStock`). Quand la matière manque : le manque, **puis quand** il cessera
  (`availabilityOf` : dans X min / jamais — aucune mine) — déjà codé, `UpgradeControl.tsx`.
- **Débit nominal à côté du réel** (`nominalPerHour`), niveau sommé de la chaîne, intrants
  (quantités par unité produite).
- **La condition d'ouverture d'un maillon absent** (`placementOf` — la phrase du refus
  serveur : QG requis, gisement requis, côtier, fondation offerte). Jamais un texte propre à
  la maquette.
- **La file prépayée** : rang, bâtiment, région, niveau — **sans compte à rebours** (rien
  derrière la tête n'est daté, c'est structurel).
- **Le lot d'une chaîne commandée** (arsenal) : commandé / produit, durée au débit tenu,
  heure de fin, « couvre la nuit » — `chains[].order`, `maxOrder`.
- **L'entretien déplié** : deux lignes aux remèdes opposés — l'armée (n troupes, vivres / h,
  dont x hors ravitaillement à ×2) et l'empire (n avant-postes, vivres+charbon / h) — puis le
  solde vivres (`resources.food.ratePerHour`, déjà net).
- **Les emplacements par avant-poste** : une barre par point, pris / total (= son niveau).
- **Ce que le QG porte** : slots de mouvement, emplacements du sol, vitesse de chaîne,
  MK2 ouvert / verrouillé jusqu'au QG n.

## P3 — existe côté serveur, ne s'affiche pas (et pourquoi)

- **Les stocks en chiffres au fil des lignes** — le bandeau des ressources les porte déjà ;
  ici un stock n'apparaît **que** collé à un coût (« 40 / 120 »). Règle d'or de la surface.
- `chains[].commanded` en tant que mot — il se voit par la présence du lot, pas par un badge.
- `extraction[].regionId` brut, ids d'instances, `buildCatalog` complet en tableau — le
  catalogue ne sert qu'à chiffrer les lignes existantes.
- `me.regions[].point`, `coastal` — données de carte, pas d'économie.
- La durée totale d'un chantier — la vue sert le restant, une barre de progression serait
  inventée.

## Tampons possibles

- **Chaîne** (`chains[].state`, servi par le règlement lui-même, `ChainState`) : `off`
  (rien de bâti), `idle` (attend un lot — encre discrète, ce n'est pas une panne),
  `running`, `starved` + la matière manquante (« à sec — alliage », `missing`),
  `overflowing` (déborde — magasin plein). Un seul tampon, l'état est exclusif.
- **Bâtiment** (dérivés déjà codés, `EconomyWindow.tsx:LinkState`) : `bâti` (niveau),
  `en chantier` (restant), `en file` (payé, sans date), `absent` (avec sa condition). Plus
  **« plafonné par QG »** (`buildings[].cappedByHq`) sur une instance au taquet.
- **Site plein** : emplacements 0 libre (barre rouge) + le remède servi
  (`homeSlotRelief` : « un QG niveau n les porte à m » / « au plafond »).
- **Armée affamée** (`me.starving`) : une ligne critique sur le bloc entretien.

## Actions tolérées (impossibles sur la carte)

- **Élever un niveau** (`constructions.start` sur une instance existante) — la pose neuve se
  fait sur la carte (panneau de construction). Avec la rose sur bâtiment (54a), l'élévation
  vit aux deux endroits : **doublon assumé (57a, 01/09)** — le geste le plus fréquent après
  le recrutement, et la fenêtre est là où on lit la raison d'élever. Même fonction, un seul
  appelant de `constructions.start`.
- **Annuler une entrée de file non commencée** (`constructions.cancel`) — remboursée ; la
  tête ne s'annule jamais.
- **Commander / annuler un lot** d'une chaîne commandée (`industry.order`, `cancelOrder`).
- Observateur (`me.defeated`) : ces trois retraits — la fenêtre reste lisible entière.

## Manque côté serveur (futurs prompts code, ne rien inventer)

- **Production reliée** (ADR 0020 §6, ⚠ pas-codé) : « un bâtiment ne produit que si sa région
  porte ma couleur ». Aucun champ ne dit aujourd'hui qu'un site est relié ou coupé. La
  maquette peut réserver un tampon « coupé » sur l'extraction, sans le chiffrer.
- **Entretien d'un avant-poste, ligne à ligne** : `upkeep.outposts` est un total ; pas de
  détail par point (niveau × taux). Suffisant tant que la ligne reste agrégée.
- **Revenus / pillage / occupation** : rien n'existe (dernier point bloquant du design).

## À coller à Claude design — Économie

> Maquette la fenêtre Économie. Elle répond « pourquoi ça produit ou pas, et qu'est-ce que
> j'élève ensuite » — jamais « combien j'ai » : aucun stock nu, un stock n'apparaît que collé
> à un coût (« 40 / 120 »). P1 : le chantier en tête (vignette, nom, région, minutes
> restantes — le seul compte à rebours ; « aucun chantier » sinon) ; une colonne par filière
> avec un tampon d'état (off / attend un lot / tourne / à sec — matière / déborde) et un seul
> chiffre, le débit réel par heure ; la barre d'emplacements du sol national (pris / total).
> P2, au pli sur une ligne : coût du niveau suivant avec stock à côté et durée, « quand »
> si la matière manque, débit nominal, intrants, condition d'ouverture d'un maillon absent
> (phrase servie), file prépayée sans compte à rebours (rang seulement), lot de l'arsenal
> (commandé / produit, couvre la nuit), entretien en deux lignes (armée / empire) + solde
> vivres, une barre par avant-poste. Tampons additionnels : « plafonné par QG », site plein
> avec son remède, « armée affamée ». Actions : élever un niveau, annuler une entrée de file
> (jamais la tête), commander / annuler un lot — retirées pour un observateur. Interdits :
> barre de progression de chantier, date sur la file, stocks en tableau, badge « commandée »,
> tampon de production reliée chiffré (réserver la place, ADR 0020 §6 pas codé), toute donnée
> hors de cette liste.
