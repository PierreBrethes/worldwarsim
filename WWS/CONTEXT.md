# Vocabulaire du domaine

Ces termes ont un sens précis dans le projet. Les utiliser tels quels dans le code, les docs et les
conversations — y compris avec une IA, qui navigue beaucoup mieux dans un domaine nommé.

## Entités

| Terme | Définition |
|---|---|
| **Saison** | Une partie complète, de la création au wipe. 48 h ou 7 jours. |
| **Graine de saison** | Aléa fixé à la création. Détermine la richesse des pays. Deux saisons ne se ressemblent pas. |
| **Nation** | Le pays d'origine d'un joueur. Ne change jamais. Ne peut pas être annexé. |
| **Pays neutre** | Un pays non joué. Support d'avant-postes, partenaire commercial, source de mercenaires. |
| **Avant-poste** | Point posé sur un pays neutre. Ouvre un rayon (`OUTPOST_REACH_KM`) où l'on bâtit et où les troupes posées s'entretiennent au tarif domestique. Une spécialisation (relais ou écoute), choisie à la construction. Se désactive ou se détruit, ne se capture jamais. *(révisé 25/08 — l'Extraction a disparu le 18/08, fiche 03)* |
| **Mouvement** | Un envoi de troupes d'un point A à un point B. Irréversible. Représenté par un arc. |
| **Slot de mouvement** | La ressource la plus rare du jeu. Limite le nombre de mouvements simultanés. |
| **À flot** | Une pile dont le point de départ est en haute mer — aucun pays ne l'héberge. La porte navale ne se lit pas sur elle : le port a été payé à l'embarquement, au premier départ. Se calcule au départ, jamais stocké. *(ADR 0019 §2, révision 27/08)* |
| **Doctrine** | La condition de victoire choisie par un joueur. Secrète jusqu'à 25 % de progression. |
| **Arc** | La représentation visuelle d'un mouvement. Visible seulement si détecté. |
| **Journal d'événements** | L'écran « qu'est-ce qui a changé depuis ma dernière visite ». |

## Ressources

| Terme | Définition |
|---|---|
| **Ressources** | Huit (ADR 0015) : nourriture, textile, charbon, pétrole, minerai, alliage, munitions, bandages — les quatre premières sortent de gisements localisés, les quatre autres se transforment (`convex/validators.ts`, `RESOURCE_KEY`). Les trois anciennes (ravitaillement, acier, effectifs) sont mortes depuis le 15/08 ; le plafond de troupes (`TROOP_CAP_TARGET`) a remplacé les effectifs comme pivot. *(révisé 25/08)* |

## Actions

| Terme | Définition |
|---|---|
| **Raid** | Désactive temporairement un avant-poste. Ne le capture jamais. |
| **Sonde** | Révèle les mouvements sortants d'un joueur pendant une durée. |
| **Agent dormant** | Posé dans un pays neutre. Révèle les arcs proches et peut saboter. |
| **Leurre** | Mouvement à zéro unité. Coûte un slot. Indiscernable d'un vrai. |
| **Embargo** | Outil d'Hégémonie. Plafonne la production militaire d'une cible. |
| **Exposition** | Outil d'Influence. Révèle la doctrine d'une cible et gèle sa progression. |
| **Interception** | Combat déclenché quand un mouvement traverse le rayon d'une force adverse. |
| **Cap d'arrivée** | Direction depuis laquelle une force atteint sa cible. Modificateur de combat. |
| **Rejeu** | Vue rapprochée d'un combat déjà résolu. Spectacle, jamais interaction. |
| **Occupation** | État d'une nation vaincue. Production réduite de moitié. Jamais définitif. |
| **Revanchisme** | Compensation d'un joueur très en retard. Dépensable en offensive uniquement. |
| **Plage de repos** | 7 h par 24 h, déclarées et publiques. Aucun mouvement ne peut y arriver. |

## Termes bannis

À ne jamais employer, parce qu'ils ramènent des attentes de genre qu'on ne tient pas :
**tick**, **temps réel**, **micro**, **unité sélectionnée**, **base**, **rush** (au sens RTS),
**tour de combat** (il n'y a pas de tours : il y a des *passes* de résolution),
**convoi** (dire **mouvement**, le terme couvre aussi les agents et les avant-postes).
