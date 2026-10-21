# Contrat de vue — 05 · Sélection sur la carte

**Rôle en une phrase :** dire ce que le clic gauche a touché — un sol, un avant-poste, une
troupe — avec **ce que le joueur en sait**, jamais la vérité (ADR 0020 §5).

Trois lectures, une par sorte de cible. Le clic gauche sélectionne et **arme** (une troupe) ;
le clic droit agit (rose) et reste inerte partout ailleurs — pays et avant-postes compris
(décisions 30/08 et 31/08). Ce contrat couvre les lectures ; la rose a les siens (04 et le
brief flux-mouvement).

## Ce que le serveur sert (source de chaque champ)

| Donnée | Source |
|---|---|
| Tenant connu d'une région : à jour / relevé daté / vierge (absente) | `convex/control.ts:held` (query à part) — `{id, state: 'current'}` ou `{id, state: 'surveyed', seenAt}`, encre et nation du siège |
| Ma région : nom, gisement, côtière | `view.ts:me.regions[]` |
| Avant-poste (le mien seul) : pays hôte, spécialisation, niveau, garnison, désactivé (minutes), métier scellé | `view.ts:me.outposts[]` |
| Adversaire : nation, encre, plage de repos | `view.ts:opponents[]` |
| Troupe : rôle, marque, effectif / nominal, adresse, ravitaillée | `view.ts:me.troops[]` |
| Pile en marche (pour exclure de la composition) | `view.ts:movements[].troopIds` |
| Capacité d'emport / allure d'une pile cochée | domaine : `liftOf`, `motorized` (`movement-orders.ts`) |

## A · Sol (pays / région) — le panneau de terre (`GroundPanel`)

### P1 (liste fermée)

- **Le nom** : le pays en vedette ; la région dessous quand le zoom la donne. *Pas de
  chiffre ici — la seule donnée décisionnelle d'un sol est son tenant.*
- **UN tampon : la qualification** — nation adverse / pays neutre (et, sur la région,
  l'état du relevé — voir tampons).

### P2 (au survol — le panneau suit le pointeur)

- **« tenue par »** : le tenant **tel que relevé** — nom franc si à jour, « X — relevé du
  12 août » si daté (`heldBySurveyed`). Une région vierge n'a pas de ligne : inconnue n'est
  pas neutre.
- **« avant-poste »** : ce que *ce pays* porte — le mien (nation + spécialisation +
  garnison) ou « adverse — … » ; « aucun » sinon. Deux questions, deux lignes (correctif du
  31/08) : le pays et la région ne se répondent pas l'un pour l'autre.
- **Gisement et côte** : publics depuis la décision 65a (01/09) — la géologie est un fait
  de la carte, pas un secret de joueur ; la ligne se lit sur toute région survolée
  (l'asset `deposits.json` est client). ⚠ pas-codé : aujourd'hui seul `me.regions` les
  porte — prompt `gisements-publics`.
- **Nation adverse** : plage de repos (`opponents[].restWindow`).

### P3

- `opponents[].lastIntel` — **retiré** du serveur et de `PlayerView` (14/10/2026) ; ne plus le
  chercher. Ancienne note : servi « — » (placeholder, surface 4.9), ne pas dessiner la ligne.
- « progression » d'un adversaire — **n'est pas servie** (`bar.progress` est un échafaudage
  client à 0). La ligne actuelle du panneau est à retirer de la maquette.
- Le type de terrain (`regionType`) — factice assumé, décoratif : l'infobulle de survol
  carte le donne déjà, le panneau ne le répète pas.
- Tout ce que le brouillard cache : avant-postes adverses (pas servis), composition d'une
  garnison adverse, la « vérité » d'une couleur.

## B · Avant-poste (le mien) — panneau du point

### P1 (liste fermée)

- Nom / pays hôte, **niveau** (c'est lui qui dit le rayon et les emplacements), **UN
  tampon** : debout / **désactivé** (voir tampons), et **LE chiffre : la garnison**
  (`outposts[].garrison`). *Justification : la garnison est ce qu'une attaque trouve debout —
  c'est le chiffre qui dit si le point tient.*

### P2 (au geste)

- Spécialisation (relais / écoute) et son effet (`fr.specializationEffects`) ; **métier
  scellé ou modifiable** (`specializationLocked`).
- Rayon du niveau (`outpostReachKm` — constante, affichable en clair), emplacements pris /
  total du site (`me.siteSlots`).
- Compte à rebours de réactivation (`disabledMinutesLeft`) quand désactivé.

### P3

- L'entretien du point ligne à ligne — agrégé dans Économie, pas de détail servi.
- Un avant-poste **adverse** n'a pas de panneau : rien n'est servi (le pion sur la carte et
  la ligne « avant-poste : adverse » du sol sont tout ce qui existe).

## C · Troupe / pile — le cartouche (`TroopBadge`) et la garnison (`GarrisonPanel`)

### P1 — le cartouche (liste fermée, déjà codé — le contrat le fige)

- **Sprite en grand**, nom (rôle + marque, ou la pile résumée), **LE chiffre : l'effectif**
  « 32 / 50 soldats » (`strength` / `nominalStrength` — c'est toute la barre de vie), **UN
  tampon : le ravitaillement** (ravitaillée / « hors ravitaillement — entretien ×2 »).
  *Justification : l'effectif est la donnée de combat ; une seule troupe hors ravitaillement
  suffit à tamponner la pile.*

### P2

- Le nombre de troupes de la pile, la portée de détection de la pile en une phrase (maximum de
  ses rôles), l'état de
  visée (destination à nommer / touche qui défait) — le pied du cartouche.
- **Composer la pile** (fenêtre de garnison, sur un mât ou une pile multiple) : lignes de
  troupes cochables (sprite, rôle, marque, effectif, ravitaillée), places d'emport
  offert / requis (`liftOf`), allure (motorisé / à pied), le refus lisible **avant** la visée.
- **L'abaque de tir** : le renvoi lecture seule (l'autre porte, avec la caserne).

### P3

- L'id, l'adresse brute (`stationedAt` sert à la carte, pas au texte au-delà de « en
  campagne · pays »), le détail de la table de dégâts (abaque).
- Toute troupe adverse : **rien n'est servi**, il n'y a rien à maquetter.

## Tampons possibles (récapitulatif, avec source)

- **Région** : *à jour* (contour en tirets qui tournent) / *relevée* (pointillé pâle et immobile
  + « relevé du … » au survol) / *vierge* (aucun contour) — `control.held`, ADR 0020 §5 et
  ADR 0033. La carte dit qu'un relevé en est un ; son âge se lit au survol.
- **Avant-poste** : *debout* / *désactivé* (+ minutes restantes) — `disabledMinutesLeft` ;
  *métier scellé* — `specializationLocked`. (*Détruit* : ⚠ pas-codé — attend le pillage ;
  l'ancre morte n'est pas servie.)
- **Troupe** : *ravitaillée* / *hors ravitaillement* (`supplied`) ; *entamée* se lit sur le
  chiffre (32 / 50), pas en tampon ; *en marche* : la troupe est dans un mouvement
  (`movements[].troopIds`) — elle ne se compose plus.
- **Sol / pays** : *nation adverse* / *pays neutre* (+ *tenu par moi* via un avant-poste).

## Actions tolérées

- **Aucune dans les lectures** — la popin lit, la carte agit. Les seules interactions : la
  case à cocher de la garnison (composer la pile — c'est la préparation d'un ordre carte,
  impossible ailleurs), le renvoi vers l'abaque, et changer la spécialisation d'un point
  **tant qu'elle n'est pas scellée** (`movements.respecialize` — pas de geste carte pour un
  choix de mot).
- Observateur : cartouche muet en pied (plus d'ailleurs à viser), garnison sans envoi.

## Manque côté serveur (futurs prompts code, ne rien inventer)

- **Panneau d'avant-poste dédié** : les données P1/P2 ci-dessus existent toutes dans
  `me.outposts[]` + `siteSlots`, mais la surface actuelle les éparpille (GroundPanel,
  Économie). Prompt client, rien à servir.
- **`lastIntel` (retiré) et la progression adverse** : surfaces 4.8 / 4.9 — rien de servi, retirer
  des maquettes jusque-là.
- **Aucune posture** (ADR 0021 révisée le 08/09) : le comportement vient de l'ordre, sans champ
  ni sélecteur. `attack` et `raid` engagent ; `march` et `return` observent.
- **Portées lisibles sur la carte** : la troupe ou pile sélectionnée et le mouvement à soi
  survolé dessinent leur portée maximale. Aucun cercle adverse n'est servi.

## À coller à Claude design — Sélection sur la carte

> **Toutes les chaînes et tous les chiffres viennent de l'annexe
> `05-carte-selection-donnees.md`, jointe — n'écris rien, ne calcule rien, ne crée aucun
> état ; s'il te manque une donnée, demande-la. Valide sur les chaînes les plus longues de
> l'annexe.**
> Maquette les trois lectures du clic gauche ; aucune ne porte d'ordre (la carte agit, la
> popin lit). 1) Sol : le pays en vedette, la région au survol ; un tampon de qualification
> (nation adverse / pays neutre) ; lignes : « tenue par » — le tenant tel que relevé (nom
> franc si à jour, « X — relevé du 12 août » sinon, **rien** si la région n'a jamais été
> observée : inconnue n'est pas neutre) ; « avant-poste » pour ce pays (le mien : nation,
> spécialisation, garnison ; sinon « adverse — … » ou « aucun ») ; sur mon sol : gisement,
> côtière ; sur une nation adverse : sa plage de repos. Interdits : « dernier
> renseignement », « progression » (rien n'est servi), terrain, toute donnée adverse au-delà
> de ces lignes. 2) Mon avant-poste : nom / pays hôte, niveau, tampon debout / désactivé
> (avec minutes restantes), le chiffre = la garnison ; au pli : spécialisation et son effet,
> métier scellé ou non, rayon du niveau, emplacements pris / total. Un avant-poste adverse
> n'a pas de panneau. 3) Troupe / pile : sprite en grand, rôle + marque, le chiffre =
> effectif « 32 / 50 », le tampon = ravitaillement (×2 si hors) ; au pli : taille de pile,
> portée maximale de la pile en une phrase, état de visée en pied ; la composition (cases à cocher,
> places d'emport offert / requis, allure motorisé / à pied, refus dit avant la visée) vit
> dans la fenêtre de garnison ; renvoi abaque de tir. Toute troupe adverse : rien — rien
> n'est servi.
