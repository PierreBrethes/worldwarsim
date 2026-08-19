# 09 — Unités

**Statut : roster stable, taux non simulés.** Réécrite le 15/08/2026 depuis l'[ADR 0014](../adr/0014-troupes-discretes-et-combat-sequentiel.md).
**Époque retenue : 1940** ([ADR 0007](../adr/0007-epoque-1940.md)).

## La règle : une unité doit créer une décision, pas une ligne de stats

Advance Wars a beaucoup d'unités **parce que c'est un jeu tactique sur grille** : le terrain, la
portée de déplacement et le placement au tour par tour font que chaque unité crée une situation
différente.

Ici il n'y a ni grille ni contrôle pendant le combat. Du coup « char léger » et « char lourd » se
réduiraient à *l'un est moins cher* — un nombre, pas une décision. **Les paliers sont donc des
niveaux de matériel, pas des unités distinctes.** On garde toute la variété visuelle sans
multiplier la surface à équilibrer.

## Les onze rôles

| Domaine | Rôle | MK1 → MK2 | Ce qu'il décide |
|---|---|---|---|
| Terre | **Infanterie** | fantassin → équipe antichar | tenir, prendre et garnir les avant-postes ; **fonder les avant-postes** |
| Terre | **Blindé** | char léger → char lourd | percer une garnison |
| Terre | **Transport terrestre** | — | projeter de l'infanterie plus loin |
| Air | **Chasseur** | — | intercepter ce qui vole, couvrir un mouvement |
| Air | **Bombardier** | — | frapper sans occuper |
| Air | **Transport aérien** | — | vitesse maximale, capacité minimale |
| Mer | **Escorte** | — | protéger et couler les convois |
| Mer | **Cargo** | — | porter les troupes terrestres au-delà des mers ; commerce avec les neutres |
| Mer | **Porte-avions** | groupe aérien réduit → étendu | **déplacer le point de lancement aérien** |

Neuf rôles, onze visuels — l'infanterie et le blindé ont deux paliers dessinés, et le porte-avions
en attend un second. La table de référence est `TIERS_BY_ROLE` dans `src/domain/troops.ts`.

**L'infanterie a un rôle hors combat**, et c'est nouveau : seule l'infanterie MK1 ou MK2 peut
fonder un avant-poste. Toute l'expansion de l'économie v2 passe par elle.

## Les effectifs nominaux

Les points de vie d'une troupe **sont** son effectif, en unités qui se racontent : 50 soldats, 12
chars légers, 6 chars lourds, une escadrille, une division. Une troupe neuve part à son nominal.
Les valeurs exactes vivent dans
[propositions/chiffrage-combat.md](propositions/chiffrage-combat.md), pas ici.

**Le porte-avions se compte en appareils embarqués**, pas en coques — voir
[08 — Combat](08-combat.md) §1.

## Les transports sont des troupes

**Ceci renverse la décision précédente de cette fiche**, qui retenait le modèle Ogame : la capacité
de transport comme propriété de la pile envoyée. L'ADR 0014 ayant supprimé les piles au profit de
troupes discrètes, il n'y a plus de pile dont la capacité pourrait être une propriété.

Un transport est donc une **troupe**, avec une capacité d'emport **typée** — tant d'infanteries,
tant de véhicules, tant d'avions. C'est la seule forme de regroupement qui subsiste.

**Codé depuis le 18/08** (ADR 0019 §2, prompt `traverser-demande-un-navire.md`) : une troupe
terrestre ne traverse la mer qu'à bord d'un cargo parti d'un port, et n'emprunte le ciel qu'à
bord d'un transport aérien parti d'un aérodrome. Cinq nombres, assumés et non mesurés :
`LIFT_CAPACITY` (cargo 6, transport aérien 2) et `LIFT_COST` (infanterie 1, blindé 2, transport
terrestre 1) ; le refus est `NOT_ENOUGH_LIFT`, avec les deux comptes. Le mouvement terrestre, lui,
part de n'importe où sans rien demander — les bâtiments de projection ne conditionnent plus le
départ, seulement le **changement de milieu**. Franchir la mer est un investissement : une flotte
qu'on construit, qu'on protège, et qu'on peut perdre.

Le régulateur central n'est pas perdu pour autant : « un mouvement = un slot »
([ADR 0006](../adr/0006-slots-de-mouvement.md)) tient toujours, il porte simplement sur le
mouvement et non plus sur une pile.

## Le porte-avions n'est pas une unité de combat

C'est de **l'infrastructure mobile** : un avant-poste qui bouge. Il déplace l'endroit depuis lequel
on peut lancer de l'aviation, donc il agit directement sur le cœur du jeu — la projection de force
— au lieu d'ajouter une ligne de statistiques. C'est probablement l'unité autour de laquelle
construire toute la couche navale.

**Quatre nations n'ont jamais eu de porte-avions achevé** : l'URSS et la Chine n'en ont jamais eu,
l'Allemagne (*Graf Zeppelin*) et l'Italie (*Aquila*, 90 % achevé, sabordé) n'en ont jamais terminé.
Elles reçoivent un porte-avions générique **dégradé** : le trou n'interdit pas le rôle, il le rend
médiocre.

## Les spécialisations sont exclusives

Par la recherche, portée par le QG, une troupe peut se spécialiser — pour l'infanterie MK1 :
**médecin OU parachutiste**, jamais les deux. Les autres rôles recevront les leurs.

*La piste la plus avancée reste les parachutistes* : une infanterie qui se pose **sans rien avoir
sur place**, ce qui casse la règle que l'ADR 0013 vient de poser — un domaine s'ouvre par un
bâtiment. L'exception porte sur ce qu'il faut à l'arrivée, jamais sur le voyage : le largage reste
un mouvement, avec son fil aérien visible, parti d'un aérodrome. Sinon il perce le brouillard et
l'interception d'un coup, et toute la couche d'information s'effondre. Le réalisme fait
l'équilibrage — rayon limité depuis l'aérodrome, infanterie légère seule, effectif modeste, aucun
retour possible. Un coup de main, pas une flotte.

## La troupe signature par nation

Décidée le 14/08 : **les huit nations en ont une**, sous des formes délibérément différentes —
dixième rôle, MK3 hors plafond, spécialisation réservée, ou mécanique propre. Le détail est dans
[06 — Nations](06-nations.md).

C'est une **entorse assumée** à la prudence que cette fiche recommandait — « à réserver à quatre ou
cinq nations, et après la première saison test ». Si l'équilibrage devient ingérable, c'est la
première chose à réduire : garder les huit sur le papier, n'en coder que celles des nations
réellement jouées.

## Le matériel réel

Chaque nation a son matériel pour chaque rôle — Matilda II, Spitfire, Dewoitine D.520, corvette
Flower, A6M Zero. Il est **affiché** mais n'appartient pas à la règle du jeu : il vit dans
`src/emblems/units/equipment.ts`, une table par nation, jamais dans `UnitRole` ni dans le nom d'un
fichier de sprite. Le jour où une nation change de char, l'asset et la table bougent ensemble et le
domaine ne bouge pas.

La planche complète — onze rôles, huit nations, matériel sourcé, écarts d'époque signalés — est
dans `WWS/maquettes/Unités et atouts par nation.html`. Le pipeline des sprites est décrit dans
`WWS/sprites/README.md` ; la France et le Royaume-Uni sont dessinés, les six autres tombent sur le
repli en cadre pointillé.

## Combat

Volontairement absent d'ici. Cf. [08 — Combat](08-combat.md).
