# 06 — Nations

**Statut : à équilibrer.** Réécrite le 15/08/2026 : les pouvoirs sont devenus des **atouts
structurels**, chaque nation reçoit une **troupe signature**, et la **géographie** entre dans son
identité depuis l'[ADR 0015](../adr/0015-economie-v2-ressources-localisees.md). Aucun de ces
éléments n'a été simulé.

## La règle d'écriture

Un bon pouvoir asymétrique **brise une règle**, il ne modifie pas un nombre. La leçon vient de
Cosmic Encounter, la référence du genre.

- ❌ « +15 % de dégâts blindés » — ne change aucune décision, invisible en jeu, pénible à équilibrer.
- ✅ « je peux réorienter mes troupes en vol » — change ta carte mentale et se raconte après la partie.

Toutes les nations partagent **la même économie de base**. Ce qui les distingue tient en trois
lignes : l'atout, la troupe, la géographie.

## Les huit

| Nation | Atout structurel | Règle brisée | Troupe signature | Forme |
|---|---|---|---|---|
| **France** | *Le rayon impérial* — l'avant-poste ouvre un rayon de construction plus large, sans contrainte d'adjacence | le rayon fixe de l'avant-poste | **Tirailleurs** — fondent un avant-poste seuls et plus vite, insensibles à l'éloignement | dixième rôle |
| **Royaume-Uni** | *Maîtrise des mers* — la station d'écoute révèle tous les mouvements maritimes, sans origine ni destination ni identification | le brouillard, partiellement | **Commandos** — débarquent sans port, désactivent un bâtiment, repartent sans rien occuper | dixième rôle |
| **États-Unis** | *Prêt-bail* — livre ressources et matériel à un autre joueur, en mouvement interceptable | l'étanchéité des stocks | **Seabees** — bâtissent un port ou un aérodrome de campagne hors territoire, sans avant-poste | dixième rôle |
| **URSS** | *Évacuation industrielle* — démonte un bâtiment et le reconstruit ailleurs, à coût réduit | l'immobilité des bâtiments | **Partisans** — ne se produisent pas : apparaissent sur toute région soviétique occupée | mécanique propre |
| **Allemagne** | *Guerre éclair* — enchaîne deux mouvements offensifs sans cooldown de slot | la rareté des slots | **Tiger I** — seul matériel du jeu à dépasser le plafond MK2 | MK3 hors plafond |
| **Japon** | *Doctrine du porte-avions* — réoriente un mouvement en vol, avant mi-parcours, contre un slot | l'irréversibilité de l'engagement | **Rikusentai** — débarquent depuis un porte-avions ou un cargo sur toute côte, sans port ni avant-poste | dixième rôle |
| **Italie** | *Mare Nostrum* — un mouvement maritime peut partir d'un avant-poste côtier, sans port | le départ maritime par un port (ADR 0013) | **Decima Flottiglia MAS** — désactive un port ou un dépôt depuis la mer, sans être détectée en approche | dixième rôle |
| **Chine** | *Masse* — aucun plafond d'hommes ; l'entretien en nourriture croît sans limite | le plafond d'hommes | **Divisions entraînées par les Allemands** — spécialisation réservée, plafonnée à quelques troupes | spécialisation réservée |

> **Liste arrêtée sur 1940** ([ADR 0007](../adr/0007-epoque-1940.md)). L'Inde de 1940 est une colonie
> britannique et sort donc de la liste ; l'Italie entre. La Chine reste : la République de Chine
> combat le Japon depuis 1937.

Le matériel réel de chaque rôle et de chaque nation vit dans la maquette
`WWS/maquettes/Unités et atouts par nation.html` et, côté code, dans
`src/emblems/units/equipment.ts`. Il n'appartient pas à la règle du jeu : le jour où une nation
change de char, l'asset et la table bougent, `UnitRole` ne bouge pas.

## La géographie fait partie de l'identité

Depuis l'ADR 0015, une nation n'est plus définie seulement par ce qu'elle *peut faire* mais par ce
qu'elle *a sous les pieds*. Chaque nation déclare un excédent et un manque, tous deux sourcés.

| Nation | Excédent | Manque |
|---|---|---|
| **France** | minerais — le bassin de fer lorrain | pétrole |
| **Royaume-Uni** | charbon — Galles, Midlands, Yorkshire | **nourriture** — l'île qui importe son pain |
| **États-Unis** | pétrole | **aucun** — exception déclarée, voir plus bas |
| **URSS** | nourriture et minerais — terres noires, Oural | tissus |
| **Allemagne** | charbon — Ruhr, Silésie, Sarre | minerais — d'où le fer suédois |
| **Japon** | tissus — la soie | **pétrole *et* minerais** — seconde exception déclarée |
| **Italie** | minerais — Sardaigne, Elbe | charbon — d'où la dépendance allemande |
| **Chine** | nourriture | minerais et charbon |

**Le manque doit porter sur ce qui définit une nation**, pas sur un peu de tout. Le Royaume-Uni
sans nourriture, c'est l'île, les convois et la Maîtrise des mers qui disent la même chose. Le
Japon sans fer ni pétrole, c'est la nation qui entre en guerre *parce qu'elle n'a rien*, et dont le
porte-avions n'existe que pour aller chercher ce qui lui manque.

**Le bénéfice n'est pas cosmétique, il est social.** Une Italie sans charbon doit acheter celui de
l'Allemagne ; un Japon sans fer doit aller le prendre. Ça donne à deux joueurs une raison de se
parler et à un troisième une raison de couper la route — c'est la
[fiche 07](07-friction-sociale.md) qui devient jouable au lieu d'être un vœu.

**Les deux exceptions sont déclarées, jamais subies**, et imprimées à chaque exécution de
l'audit : les États-Unis n'ont aucun manque parce que rien dans nos cinq ressources ne manquait
aux États-Unis de 1940 ; le Japon en a deux parce que son atout répond exactement à l'un d'eux.

## Ce qui a changé le 15/08, et pourquoi

**États-Unis.** *Arsenal* convertissait ravitaillement → acier ; l'économie v2 a supprimé les deux.
Remplacé par le **Prêt-bail**, délibérément *social* et non économique : le 🔴 dit que les
États-Unis sur-performent par inatteignabilité, donc leur donner de la production aurait aggravé
le problème ouvert. Là, leur pouvoir les force à sortir et en fait un faiseur de rois.

**France.** Le coût d'avant-poste croissant avec la distance est supprimé. Il avait sur-corrigé le
combo n°1 au point de faire de France × Hégémonie le couple le plus faible du jeu (1,8 % de
victoires pour 4,2 % attendus).

**URSS.** *Profondeur stratégique* devient l'**évacuation industrielle** : même idée mesurée, mais
elle a enfin un support concret depuis que les bâtiments sont posés sur des régions.

**Italie.** *Reconnaissance aérienne* n'a plus d'objet — l'ADR 0014 a supprimé les piles, donc il
n'y a plus de composition à révéler. Devient **Mare Nostrum**.

**Chine.** L'entretien croissant passe du ravitaillement à la **nourriture**. La règle brisée est
inchangée.

**Royaume-Uni, Allemagne, Japon** sont intacts.

## Historique des corrections

Gardé pour ne pas les réintroduire par inadvertance.

**France × Hégémonie était le combo n°1.** Extractions posées là où l'adjacence interdit aux autres
d'aller, sur des points qui ne changeaient jamais de main : aucun contre-jeu.

**Royaume-Uni × Influence** offrait une suprématie de renseignement gratuite et permanente sur toute
la moitié maritime, surtout à 7-8 joueurs. L'information partielle — on voit qu'un mouvement
existe, pas d'où il vient ni ce qu'il porte — garde la saveur sans donner la victoire.

**Chine** dépendait, pour son contrepoids, d'un système de combat explicitement non spécifié. Un
pouvoir non équilibrable est aussi un pouvoir non simulable.

**Russie** cassait une arête du triangle : occuper sa capitale ne rapportait rien et coûtait de
l'attrition, donc Domination ne battait plus Russie × Hégémonie. Le butin rétablit l'intérêt
d'attaquer.

**Inde** était immunisée au garde-fou anti-farm PNJ, sur la doctrine qui *est* un farm PNJ.
Auto-victoire. La nation a ensuite été retirée pour raison d'époque.

## Sous surveillance

**Le Japon reste le plus fort du lot** : son atout annule le levier de drame n°1, l'irréversibilité
de l'engagement. C'est assumé — c'est aussi le plus amusant — mais c'est le premier candidat au
nerf après la première saison test.

**L'URSS est devenue la nation la mieux dotée du plateau** (17 gisements à domicile contre 9 pour
le Japon), et son atout la rend difficile à faire saigner. C'est structurellement plus sain que le
cas américain — riche et atteignable, c'est une cible ; riche et inatteignable, c'est une boule de
neige — mais c'est la deuxième chose à regarder quand le simulateur tournera.

**Le contrepoids de la Chine est neutralisé par sa propre géographie.** Son pouvoir dit « pas de
plafond d'hommes, mais entretien croissant en nourriture », et elle sort avec l'un des deux plus
gros excédents de nourriture. Le frein et le carburant sont la même ressource. Ça se défend — sa
nourriture n'est pas un revenu, c'est ce qui paie sa masse, et elle est de fait pauvre sur tout le
reste — mais il faut que ce soit un choix, pas une coïncidence.

**Huit nations, c'est peut-être deux de trop** pour un dev solo sur une première saison. Six
suffiraient à couvrir les trois doctrines avec de la variété.

**Entorse assumée à QUESTIONS.md.** La fiche disait de réserver les unités spéciales à quatre ou
cinq nations, et après la première saison test. On en a écrit huit, le 14/08, en connaissance de
cause. Si l'équilibrage devient ingérable, c'est la première chose à réduire : garder les huit sur
le papier et n'en coder que celles des nations réellement jouées.

## Les Seabees répondent à une question ouverte

L'[ADR 0013](../adr/0013-batiments-de-projection-sur-regions.md) laissait ouverte la soupape
anti-élimination : si perdre ses ports ferme un domaine entier, un joueur peut se retrouver enfermé
chez lui. Une troupe qui bâtit un port de campagne est exactement la piste « port de fortune » que
l'ADR listait sans trancher. Elle n'est aujourd'hui donnée qu'aux États-Unis — la question reste
ouverte pour les sept autres.
