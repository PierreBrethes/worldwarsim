# Contrat de vue — 06 · Abaque de tir & catalogue

**Rôle en une phrase :** la seule surface de lecture des unités — qui existe, qui bat qui,
à quel prix, et ce qu'il faut bâtir pour l'avoir — accessible **sans rien posséder**.

**Statut : 60b décidé le 01/09, ⚠ extension pas-codée.** L'abaque existe
(`GunneryWindow`, `src/domain/gunnery.ts`) ; le volet catalogue (coût, formation, bâtiment
requis) est à y ajouter. C'est ce qui remplace les sections « bloqué : aucun … » de
l'ancienne fenêtre Production (59a) et maintient l'ADR 0015 (rév. 24/08) : *rien de caché
ne se débloque* — tout le matériel du jeu se lit ici, avec sa condition.

## Ce que le serveur sert (source de chaque champ)

| Donnée | Source |
|---|---|
| La grille de tir : part détruite par passe, bandes | `gunneryRows(DAMAGE_TABLE)` (`src/domain/gunnery.ts` — la table arrive de `constants.ts`, jamais recopiée) |
| Garantie et modificateurs (initiative ; riposte d'une garnison ×1,15, à sec ×0,6 — révision du 14/10) | `fr.gunnery.guarantee`, `.before` (`GARRISON_BONUS`, `DRY_AMMUNITION_FACTOR`) |
| Par rôle : coût alliage + minutes (MK1/MK2), effectif, bâtiment qui forme, QG requis | `workshop.grid[]` (`unit`, `unitTier2`, `producedBy`, `unlockedAtHqLevel`) — servi même sans aucun bâtiment |
| En service par rôle et par marque — toutes adresses confondues, file exclue | `workshop.roster[]` (`{role, tier, count}`) |
| MK2 ouvert / seuil | `workshop.tier2Unlocked`, `requiredHqLevel` |
| Équipement national, sprites | plaques (`equipmentLabel`) |
| Fort / faible contre (résumé éditorial) | `fr.unitSheets` |

## P1 — d'un coup d'œil (liste fermée)

- **La grille d'encre** : une ligne par profil qui tire, une colonne par cible ; la densité
  d'encre dit la bande (fort contre / échange / faible contre / hors de portée), la valeur
  reste imprimée dans la case. *Déjà validée (v1 du 31/08) — ne pas la refaire.*
- **La garantie**, imprimée : « Aucune arme ne bat tout, aucune n'est battue par tout. »
- *Pas de chiffre unique global : l'abaque est une table, son P1 est le motif.*

## P2 — au geste (liste fermée + geste)

- **Au survol d'une case** : la phrase de lecture (`fr.gunnery.shot` / `.noShot`).
- **Au pli sur une ligne (nouveau — le catalogue, 60b)** : sprite, équipement national,
  coût alliage (MK1/MK2), durée de formation, effectif nominal, **« en service » par marque**
  (`workshop.roster` — toutes adresses confondues, la file non ; ajout du 01/09),
  fort / faible contre, et
  **la condition** : « se forme dans une caserne de niveau n » / « … un aérodrome … » /
  « … un port … » (`workshop.unlockedAtSiteLevel`, 67b du 04/09 ; + « quartier général
  niveau n requis » quand le rôle l'exige). Le bâtiment absent est la condition dite, jamais
  un grisé.
- **Pictogrammes de fiche (68a, 04/09)** : un pictogramme muet devant chaque donnée servie de
  la fiche — alliage (lingot), formation (horloge), effectif (cœur : l'effectif *est* la vie,
  la part de la table se prend sur lui), portée de détection (œil). **Le libellé ne s'imprime pas** (retour de Pierre sur
  la planche 68a) : le pictogramme porte la valeur seul, et **au survol du pictogramme une
  popin** dit le nom de la donnée et son explication (même mécanique que la popin du bandeau
  des ressources). La ligne « en service », sans pictogramme, garde son libellé imprimé. **Pas d'œil de
  portée** : l'œil porte la portée du rôle et sa popin explique que la pile prend le maximum.
  Pas d'« explosion » de dégâts : les dégâts sont
  la case, pas une stat de la pièce.
- La ligne du transport aérien garde sa phrase (« ne tire sur rien — il porte, il ne
  combat pas ») ; les transports restent des colonnes (« victimes par conception »).
- Le rappel des modificateurs (`fr.gunnery.before`).

## P3 — ne s'affiche pas

- Le stock d'alliage (aucun « x / y » ici : on ne forme pas depuis l'abaque, un coût nu
  suffit) · les files, la garnison, le plafond — affaires des modales de site.

## Tampons possibles

Aucun tampon d'état : l'abaque est un document, pas un plateau. La seule marque est la
condition en clair sur une ligne (QG requis, bâtiment qui forme).

## Actions tolérées

**Aucune.** Lecture pure — c'est la règle qui la rend accessible partout (modales de site,
cartouche de troupe, et — nouveau — une entrée propre puisque l'onglet prod est mort ;
l'emplacement de cette entrée est au choix de design : rail ou autre).

## Manque côté serveur / client

- **Serveur : rien** — `workshop.grid` sert le catalogue complet sans condition de
  bâtiment.
- **Client** (même prompt `modale-de-site`) : le pli catalogue sur les lignes de l'abaque,
  et une porte d'accès hors modale (l'onglet prod mort emportait l'accès actuel).

## À coller à Claude design — Abaque & catalogue

> Étends l'abaque de tir validé (grille d'encre inchangée) en catalogue : au pli sur une
> ligne — sprite national, équipement, coût alliage MK1/MK2, durée de formation, effectif
> nominal, fort / faible contre, et la condition en toutes lettres (« se forme dans une
> caserne », « quartier général niveau 2 requis »). Aucun grisé : une condition se dit.
> Aucun stock, aucune action — lecture pure. Les chiffres et chaînes viennent de l'annexe
> `03-caserne-donnees.md` (les neuf rôles y sont) ; n'écris rien, demande ce qui manque.
> Prévois l'entrée : l'onglet prod disparaît, l'abaque doit rester accessible depuis le
> plateau (propose l'emplacement).
