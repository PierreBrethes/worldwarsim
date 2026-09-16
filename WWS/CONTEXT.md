# Vocabulaire du domaine

Ces termes ont un sens précis dans le projet. Les utiliser tels quels dans le code, les docs et les
conversations — y compris avec une IA, qui navigue beaucoup mieux dans un domaine nommé.

## Entités

| Terme | Définition |
|---|---|
| **Saison** | Une partie complète, de la création au wipe. |
| **Compte** | Identité durable : pseudo unique et mot de passe, sans e-mail, conservée après la suppression des saisons. **Un compte possède ses places** — au plus une par saison — et l'accueil liste les siennes. *(ADR 0022)* |
| **Place** | Le siège d'un compte dans une saison. Elle porte le pseudo copié à l'entrée et figé pour la saison, la nation, la plage de repos. On la quitte d'un écran, jamais du serveur : seule la destruction de la saison l'efface. |
| **Session** | Accès à un compte par un jeton de 32 octets aléatoires. Plusieurs sessions indépendantes, sans expiration — un second appareil ouvre les mêmes places ; on déconnecte une session, ou on les révoque toutes lors d'une récupération admin. Le jeton de partie n'existe plus : chaque ordre voyage en `{ session, saison }`. |
| **Horloge** | La durée d'une saison : 48 h, 7 jours, ou **sans horloge**. Une saison sans horloge se clôt à la main par son fondateur, et aucun écran n'y affiche de compte à rebours. *(révision du 27/08 de l'ADR 0017)* |
| **Graine de saison** | Aléa fixé à la création. Détermine la richesse des pays. Deux saisons ne se ressemblent pas. |
| **Nation** | Le pays d'origine d'un joueur. Ne change jamais. Ne peut pas être annexé. |
| **Pays neutre** | Un pays non joué. Support d'avant-postes, partenaire commercial, source de mercenaires. |
| **Avant-poste** | Point posé sur un pays neutre. Ouvre un rayon (`outpostReachKm`, 120 à 240 km suivant son niveau) où l'on bâtit et où les troupes posées s'entretiennent au tarif domestique. Une spécialisation (relais ou écoute), choisie à la construction. Se désactive ou se détruit — ou se démantèle par son propriétaire, au clic droit —, ne se capture jamais. *(révisé 16/09 — démantèlement ; l'Extraction a disparu le 18/08, fiche 03)* |
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
| **Entrepôt** | Le seul stockage national : chaque niveau relève les huit plafonds, et c'est la seule entrée de l'interface et du simulateur. `depot` est une clé **historique** — rendue comme un entrepôt, jamais posée à neuf, prix et chantiers anciens conservés. *(unifié le 09/09/2026)* |
| **Ressources** | Huit (ADR 0015) : nourriture, textile, charbon, pétrole, minerai, alliage, munitions, bandages — les quatre premières sortent de gisements localisés, les quatre autres se transforment (`convex/validators.ts`, `RESOURCE_KEY`). Les trois anciennes (ravitaillement, acier, effectifs) sont mortes depuis le 15/08 ; le plafond de troupes (`TROOP_CAP_TARGET`) a remplacé les effectifs comme pivot. *(révisé 25/08)* |

## Actions

| Terme | Définition |
|---|---|
| **Raid** | Désactive temporairement un avant-poste. Ne le capture jamais. |
| **Pillage** | Expédition dirigée contre une installation adverse **déjà relevée** : elle combat la défense, tient une présence, prélève le surplus disponible au-dessus de la réserve de base, désactive temporairement le site, puis rentre. Sur un entrepôt elle rapporte ; sur un producteur c'est un **sabotage**, le même ordre sans butin. La charge se crédite au premier franchissement d'une région tenue ; ce qui tombe en route devient une **caisse**, ramassable par qui l'a relevée. |
| **Interception** | Combat déclenché en route par un mouvement **offensif** — `attack` ou `raid` — qui rencontre un mouvement adverse dans le même milieu. Une force **posée** voit sans intercepter : détecter et engager sont deux choses depuis la révision de l'ADR 0021 (08/09/2026). |
| **Cap d'arrivée** | Direction depuis laquelle une force atteint sa cible. Modificateur de combat. |
| **Rejeu** | Vue rapprochée d'un combat déjà résolu. Spectacle, jamais interaction. |
| **Plage de repos** | 7 h par 24 h, déclarées et publiques. Aucun mouvement ne peut y arriver. |

## Retiré du vocabulaire

> **Le 10/09/2026 : la sonde, l'agent dormant, l'embargo, l'exposition, l'occupation, le
> revanchisme.** Six mots qui nommaient des outils jamais codés, et que le jeu ne prépare plus.
> L'embargo et l'exposition appartenaient aux doctrines, mode unique depuis l'ADR 0020 §9 ;
> l'occupation et le revanchisme attendaient une part de carte qui ne sera pas celle-là. La sonde
> et l'agent dormant nommaient une seconde façon de voir : la détection suit désormais le rôle des
> troupes et rien d'autre (ADR 0021). Ils ne s'emploient plus, et **un terme du glossaire qui ne
> désigne rien coûte plus qu'il ne rapporte** — c'est ce qu'on a appris avec le leurre.

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
