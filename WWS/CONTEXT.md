# Vocabulaire du domaine

Ces termes ont un sens précis dans le projet. Les utiliser tels quels dans le code, les docs et les
conversations — y compris avec une IA, qui navigue beaucoup mieux dans un domaine nommé.

## Entités

| Terme | Définition |
|---|---|
| **Saison** | Une partie complète, de la création au wipe. |
| **Horloge** | La durée d'une saison : 48 h, 7 jours, ou **sans horloge**. Une saison sans horloge se clôt à la main par son fondateur, et aucun écran n'y affiche de compte à rebours. *(révision du 27/08 de l'ADR 0017)* |
| **Graine de saison** | Aléa fixé à la création. Détermine la richesse des pays. Deux saisons ne se ressemblent pas. |
| **Nation** | Le pays d'origine d'un joueur. Ne change jamais. Ne peut pas être annexé. |
| **Pays neutre** | Un pays non joué. Support d'avant-postes, partenaire commercial, source de mercenaires. |
| **Avant-poste** | Point posé sur un pays neutre. Ouvre un rayon (`outpostReachKm`, 120 à 240 km suivant son niveau) où l'on bâtit et où les troupes posées s'entretiennent au tarif domestique. Une spécialisation (relais ou écoute), choisie à la construction. Se désactive ou se détruit, ne se capture jamais. *(révisé 25/08 — l'Extraction a disparu le 18/08, fiche 03)* |
| **Mouvement** | Un envoi de troupes d'un point A à un point B. Irréversible. Représenté par un arc. |
| **Slot de mouvement** | La ressource la plus rare du jeu. Limite le nombre de mouvements simultanés. |
| **À flot** | Une pile dont le point de départ est en haute mer — aucun pays ne l'héberge. La porte navale ne se lit pas sur elle : le port a été payé à l'embarquement, au premier départ. Se calcule au départ, jamais stocké. *(ADR 0019 §2, révision 27/08)* |
| **Arc** | La représentation visuelle d'un mouvement. Visible seulement si détecté. |
| **Relié** | Un bâtiment dont la région porte la couleur de son propriétaire. **Seul un bâtiment relié produit** (ADR 0020 §6) : le sol national l'est toujours, une région d'avant-poste l'est tant que le point la tient, et un point désactivé décolore donc **coupe** (§7). Ce qui n'est pas relié est **hors réseau** — un état, jamais une panne : rien ne se répare sur le site, la région se reprend sur la carte. Ne concerne que ce qui produit, les quatre extracteurs et les trois chaînes. |
| **Journal d'événements** | L'écran « qu'est-ce qui a changé depuis ma dernière visite ». |
| **Télégraphe** | Le chat de la partie : **un seul canal général**, ouvert dès le salon, fermé à la conclusion. Le mot est imposé — ni « chat » ni « dépêches », qui appartiennent au journal. *(décision du 29/08)* |

## Ressources

| Terme | Définition |
|---|---|
| **Entrepôt** | Stockage national unique livré depuis S2-S3 (09/09/2026) : chaque niveau relève les huit plafonds. C'est la seule entrée de l'interface et du simulateur ; `depot` est une clé historique rendue comme un entrepôt, jamais une nouvelle pose, dont prix et chantiers anciens sont conservés. |
| **Ressources** | Huit (ADR 0015) : nourriture, textile, charbon, pétrole, minerai, alliage, munitions, bandages — les quatre premières sortent de gisements localisés, les quatre autres se transforment (`convex/validators.ts`, `RESOURCE_KEY`). Les trois anciennes (ravitaillement, acier, effectifs) sont mortes depuis le 15/08 ; le plafond de troupes (`TROOP_CAP_TARGET`) a remplacé les effectifs comme pivot. *(révisé 25/08)* |

## Actions

| Terme | Définition |
|---|---|
| **Raid** | Désactive temporairement un avant-poste. Ne le capture jamais. |
| **Pillage** | Expédition dirigée contre un entrepôt adverse déjà relevé : elle combat la défense, tient une présence, prélève le surplus disponible au-dessus de la réserve de base, désactive temporairement le site et doit ramener sa charge. S5b livre seulement le cycle serveur interne jusqu'au retour chargé ; ordre public, sabotage et livraison restent fermés. |
| **Sonde** | Révèle les mouvements sortants d'un joueur pendant une durée. |
| **Agent dormant** | Posé dans un pays neutre. Révèle les arcs proches et peut saboter. |
| **Embargo** | Outil d'Hégémonie. Plafonne la production militaire d'une cible. |
| **Exposition** | Outil d'Influence. Révèle la doctrine d'une cible et gèle sa progression. |
| **Interception** | Combat déclenché quand un mouvement traverse le rayon d'une force adverse. |
| **Cap d'arrivée** | Direction depuis laquelle une force atteint sa cible. Modificateur de combat. |
| **Rejeu** | Vue rapprochée d'un combat déjà résolu. Spectacle, jamais interaction. |
| **Occupation** | État d'une nation vaincue. Production réduite de moitié. Jamais définitif. |
| **Revanchisme** | Compensation d'un joueur très en retard. Dépensable en offensive uniquement. |
| **Plage de repos** | 7 h par 24 h, déclarées et publiques. Aucun mouvement ne peut y arriver. |

> **Retiré du vocabulaire le 29/08/2026 : le leurre.** Il était « un mouvement à zéro unité, un
> slot, indiscernable d'un vrai ». Conçu par la fiche 04, codé, puis retiré sans avoir jamais été
> éprouvé en partie — un outil de plus que personne n'avait demandé. Le mot ne s'emploie plus, ni
> dans le code, ni à l'écran ; la note de révision en tête de
> [fiche 04](docs/design/04-information.md) dit ce que le retrait emporte et ce qu'il laisse en
> trou. Un manifeste vide n'est plus un ordre : c'est un refus.

## Termes bannis

À ne jamais employer, parce qu'ils ramènent des attentes de genre qu'on ne tient pas :
**tick**, **temps réel**, **micro**, **unité sélectionnée**, **base**, **rush** (au sens RTS),
**tour de combat** (il n'y a pas de tours : il y a des *passes* de résolution),
**convoi** (dire **mouvement**, le terme couvre aussi les agents et les avant-postes).
