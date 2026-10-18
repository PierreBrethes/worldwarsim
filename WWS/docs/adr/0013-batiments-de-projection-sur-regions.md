# ADR 0013 — Bâtiments de projection posés sur des régions

**Statut :** acceptée

> **Révisée le 18/10/2026 par l'[ADR 0029](0029-placement-libre-et-gisements-ponctuels.md)** : un
> bâtiment se pose à une position exacte, et sa région se déduit de ce point.

## Contexte

Jusqu'ici, un mouvement pouvait naître n'importe où sur le territoire d'une nation, dans
n'importe quel domaine. La géographie décidait de la **durée** d'un trajet, jamais de sa
**possibilité**. La carte contraignait donc peu : elle facturait la distance et c'est tout.

Trois manques en découlaient. Le multimodal (ADR 0012) découpait des trajets terre/mer/terre
sans qu'aucun lieu ne justifie l'embarquement. Le découpage admin-1, ajouté au rendu comme
sonde d'interface, ne portait aucun enjeu. Et l'avantage d'isolement — le 🔴 ouvert — restait
entier : une nation lointaine projetait ses forces au même prix qu'une nation exposée, sans
jamais rien avoir à bâtir ni à défendre pour cela.

## Décision

Deux familles de bâtiments, à deux échelles distinctes.

**L'économie reste au niveau de la nation** — QG, complexe industriel, centre logistique,
conscription, station d'écoute. Inchangés, non localisés.

**La projection descend sur les régions** — trois bâtiments, un par domaine, chacun
autorisant le départ d'un mouvement dans son domaine :

| Bâtiment | Domaine ouvert | Contrainte d'emplacement |
|---|---|---|
| **Port** | maritime | région côtière |
| **Aérodrome** | aérien | aucune contrainte de relief |
| **Caserne** | terrestre | aucune contrainte de relief |

Un mouvement part **depuis** un bâtiment de projection de son domaine, et un trajet
multimodal transborde **dans** un port. Sans port, pas de départ maritime.

## Justification

**La géographie devient une contrainte, pas un décor.** Une côte, un détroit, une façade
maritime cessent d'être du dessin : ils décident de ce qu'une nation peut faire. C'est le
gain que le rendu de la carte promettait sans jamais le tenir.

**Les régions gagnent enfin un enjeu.** Le découpage admin-1 existait dans le rendu sans
rien porter. Il porte désormais le choix d'emplacement — donc de la stratégie, donc des
cibles.

**Cela mord sur le 🔴 isolement.** Une nation hors de portée doit malgré tout bâtir et
défendre des ports pour exister ailleurs que chez elle, et ces ports sont atteignables.
L'isolement cesse d'être un avantage gratuit sans qu'aucun malus artificiel soit inventé.

**Trois bâtiments, trois idées.** Port, aérodrome, caserne : aucune explication n'est
nécessaire, y compris pour un joueur qui découvre le jeu. C'est la lisibilité que
recherche toute la direction du projet.

## Conséquences

**L'ADR 0004 est révisée dans sa portée, pas dans son principe.** La nation reste fixe et
jamais annexée, les avant-postes restent ponctuels. Mais le refus du découpage admin-1 ne
tient plus : les régions sont chargées, rendues, et portent désormais des bâtiments. Le
coût que 0004 redoutait — filtrage, nettoyage, adjacence — est déjà payé côté rendu ; ce
qui s'ajoute est un emplacement par bâtiment, pas un graphe de contiguïté.

**Tout l'équilibrage mesuré est à repasser.** Le temps de trajet est le levier central du
jeu (14 min / 1000 km, mesuré sur 2000 saisons). Obliger un départ maritime à passer par un
port allonge et détourne les trajets : les taux de victoire par doctrine et par nation du
rapport de simulation ne valent plus tels quels.

**Choix assumé : on découvre en jouant avant de re-simuler.** La première saison test sert
à faire émerger les stratégies fortes ; la simulation reprend la main sur ce qu'une saison
entre six joueurs ne peut pas révéler — les anomalies statistiques, comme l'avantage
américain qu'il a fallu 900 saisons pour voir.

**Une soupape anti-élimination reste à trouver.** Si perdre ses ports ferme un domaine
entier, un joueur peut être enfermé chez lui — ce qui heurte la promesse qu'aucun joueur
n'est éliminé. Pistes non tranchées : port de fortune coûteux et temporaire, embarquement
autorisé depuis un avant-poste allié, ou domaine dégradé plutôt que fermé.
→ question ouverte dans [QUESTIONS.md](../../QUESTIONS.md).

**Les cinq bâtiments d'économie sont à réexaminer.** Le centre logistique et le complexe
industriel recouvrent en partie ce que les bâtiments de projection expriment mieux. Aucune
fusion n'est décidée ici.

## Ce qu'on abandonne

- Le départ d'un mouvement depuis n'importe quel point du territoire.
- La granularité strictement nationale posée par l'ADR 0004.
- La validité immédiate des équilibres mesurés dans le rapport de simulation.

## Révision du 04/09 — le port a un point, les autres bâtiments un centroïde

> ⚠️ **Révision (04/09/2026, décisions 71b et 73a).** Un bâtiment de projection reste posé sur
> une région, une bâtisse par région (ADR 0015). Mais **le port porte un point de côte choisi
> par le joueur** au moment de la pose (mode de pose depuis la rose de la région, fantôme
> aimanté sur la côte de cette région) — parce qu'un navire part de l'eau, et qu'une grande
> région a plusieurs côtes. Les autres bâtiments restent au centroïde tant qu'aucune portée ne
> lit leur position ; le jour où l'ADR 0021 est branchée, la question se rouvre pour la station
> d'écoute et l'aérodrome, pas avant. Une seule lecture, `pointOfBuilding`, sert tout le monde.

