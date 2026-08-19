# Flux de mouvement en carte — brief de maquette

> ⚠️ **En retard sur l'ADR 0019 (18/08)** — ce brief reste la référence du *flux* (widget →
> garnison → visée → rose → aperçu → envoi), mais quatre de ses règles sont annulées ou périmées :
> la **décision 12a** (« aucune troupe posée librement sur la carte ») est annulée — la marche
> pose une colonne où le joueur veut ; le **regroupement par bâtiment** du widget n'existe plus —
> une troupe s'adresse par `TroopStation` (bâtiment / avant-poste / point / à domicile) ; le
> **« retour »** de la rose n'existe plus (l'ordre de rappel est supprimé, la fondation est une
> action sur place) ; la rose vise un **point ou un avant-poste**, jamais une région. La visée
> gagne le marqueur « sol non reconnu » (fiche 04).

**Statut : proposition validée dans ses grandes lignes (décisions 12a et 13a du 18/08), un point
en attente (§ Renseignement).** Ce brief remplace la §4.5 périmée de la fiche 11. Il sert
d'abord à Claude design pour la maquette, puis de source au prompt Code. Vocabulaire imposé :
*mouvement*, jamais convoi ; un mouvement est **irréversible** une fois envoyé.

## L'intention

La modale d'envoi actuelle (maquette 4.3) pose un formulaire *par-dessus* la carte : composition
en compteurs, destination réduite à un mot — « MAROC ». Dans un jeu dont la thèse est « projeter
de la force quand la distance est le coût », **la distance est invisible au moment où l'on
décide**. Tout ce brief découle d'une phrase : *la carte est la surface d'action, les listes ne
sont que des points d'entrée.*

## Ce qui meurt

- **La modale « Envoi d'un mouvement »** — remplacée par la visée en carte.
- **La fenêtre Troupes** — remplacée par le widget ci-dessous (précédent : « Nation cède la
  liste », 16/08). L'interface tombe à trois fenêtres (Industrie, Production, Nation) + Journal
  + les widgets de carte.
- **Le widget des trajets en bas d'écran** — ses mouvements *à moi* migrent dans le widget de
  troupes ; ses relevés *adverses* posent une question, voir § Renseignement.

## Le widget de troupes

Même famille visuelle que le bandeau de ressources : repliable, toujours accessible, léger.
Replié, il garde **deux lignes** : les mouvements en vol avec la prochaine arrivée, et le compte
de stationnaires — jamais plus.
Le plafond de troupes est 24 — le widget ne déborde jamais, aucune pagination, regroupement par
bâtiment. Il porte le compte de slots de mouvement (ADR 0006) comme Production porte le plafond
de troupes.

Deux sections, **aux pouvoirs délibérément différents** — et l'écran doit rendre cette
différence évidente :

### « Stationnaires » — sélectionnables et dirigeables

Une carte par groupe de troupes, regroupées par bâtiment (leur adresse réelle : `stationedAt`).
Clic → la caméra vole au bâtiment, le panneau de garnison s'ouvre, la troupe est pré-cochée.
C'est la **deuxième entrée** du même flux que le clic sur le jalon — un seul état de sélection,
deux portes, jamais deux flux.

### « En mouvement » — observables, jamais dirigeables

Une carte par mouvement, façon **tableau des départs de gare** — l'esthétique presse 1940 la
demande d'elle-même :

```
┌──────────────────────────────────────────────────┐
│ ⚔  Marseille ▸▸▸▸▸▸▸▸▸░░░░░░░ Tunis              │
│    04:12 restant · arrivée demain 06:24          │
└──────────────────────────────────────────────────┘
```

- **départ** : le nom du lieu de départ (le bâtiment de projection, ADR 0013) ;
- **la barre de trajet** qui se remplit, avec temps restant et heure d'arrivée ;
- **arrivée** : le nom de la destination ;
- **la planche de la troupe représentative** (`representativeRole` existe dans le domaine pour
  exactement ça) — le mouvement a un visage, pas seulement un trait ;
- **un pictogramme de type** : attaque, raid, fondation d'avant-poste, agent, leurre — au trait,
  style pictos existants. Le leurre est visible *pour son propriétaire* (l'adversaire, lui, voit
  un arc ordinaire — fiche 04).
- si l'arrivée tombe dans la **fenêtre de repos de la cible**, la carte le dit (petit marqueur
  et heure de libération) — l'information existait dans la modale, elle ne doit pas se perdre.

Clic → la caméra suit l'arc. **Aucun clic droit, aucune redirection** : l'irréversibilité est la
thèse du jeu, pas une limitation d'interface. Rien sur cette carte ne doit *ressembler* à une
commande.

## Le panneau de garnison

S'ouvre au clic sur le jalon d'un bâtiment de projection, ou depuis une carte « stationnaire ».
Il montre la garnison — planches d'unités, effectifs, munitions embarquées — et permet de
**composer la pile** du mouvement (cocher les troupes qui partent). Un bouton : « préparer un
mouvement ». Pas de compteurs +/− : on coche des troupes discrètes, elles sont 24 au plus.

## La visée

« Préparer un mouvement » bascule la carte en visée (même mécanique que la rose des vents de
construction, déjà codée) :

1. le curseur devient la visée ; les destinations légales répondent au survol ;
2. **clic droit sur la destination → rose des vents de mouvement** : attaque / raid / fondation
   d'avant-poste / retour — seuls les types légaux pour cette cible s'affichent (contextuel,
   jamais grisé, ADR 0015) ;
3. **l'aperçu d'arc se dessine immédiatement**, avec les traits d'arc existants du prototype
   (`carte-3d.html`) — jamais un style nouveau. Le tracé est **la route réelle de la grille**
   (ADR 0012), multimodale quand le trajet l'est : la table `movements` stocke déjà `points`,
   l'aperçu montre ce que le serveur calculera, pas une approximation. Durée, heure d'arrivée,
   fenêtre de repos de la cible si elle mord ;
4. confirmation sur place, au bout de l'arc : « Envoyer — irréversible », coût en slot affiché.

La distance cesse d'être un chiffre découvert après coup : **on voit le trajet avant de payer.**

## Renseignement — le point en attente

L'ancien panneau des mouvements mêlait deux choses : mes mouvements, et les **relevés adverses**
(arcs détectés par l'écoute, dernières positions connues). Le widget de troupes ne liste que les
miens — les relevés adverses doivent trouver une maison, et ce n'est pas le Journal (ils sont
*vivants*, un arc en vol se périme).

Recommandation en attente de validation : un **bloc « Renseignement » distinct** dans le même
widget, visuellement séparé (l'encre adverse, jamais mêlée à la mienne), cartes en lecture seule
avec la même anatomie — départ estimé, progression si le cap est connu, type si identifié,
« type inconnu » sinon. Clic → caméra sur la dernière position connue.

## Interdits

- Aucune troupe posée librement sur la carte à domicile — l'adresse d'une troupe est son
  bâtiment (décision 12a ; ADR 0013 et 0014).
- Aucune redirection d'un mouvement en vol.
- Aucun état d'interface qui révèle une doctrine (le picto « leurre » n'apparaît que chez son
  propriétaire).
- Bannis : tick, temps réel, micro, base, rush.

## Critères de la maquette

- Le flux complet se joue **sans jamais quitter la carte** : widget → garnison → visée → rose
  des vents → aperçu → envoi.
- La carte « en mouvement » se lit en une seconde : départ, barre, arrivée, type — rien d'autre.
- Repliés, les widgets laissent la carte nue.
- La différence sélectionnable / observable se voit sans lire de texte.
