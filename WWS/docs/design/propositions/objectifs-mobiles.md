# Objectifs mobiles publics — proposition du 08/09/2026

**Principe demandé par Pierre et retenu le 08/09**, après son retour de partie : les pays
peuvent se battre, mais manquent de raisons de le faire. Il propose des objectifs qui se
déplacent sur terre ou en mer, visibles et interceptables par tous. Exemple donné : un cargo
chargé de ressources, du Cap-Vert vers l'Australie. Certains objectifs demandent de détruire
une garnison PNJ pour récupérer quelque chose.

Cette note complète [les objectifs neutres](objectifs-neutres.md). Le principe est approuvé ;
les règles ci-dessous constituent une proposition de premier lot, pas un barème validé ni
un système déjà implémenté.

## Boucle proposée

1. Une dépêche annonce le départ d'un mouvement neutre chargé. La carte montre son trajet,
   sa position et son arrivée prévue. Le joueur peut préparer son interception sans avoir à
   découvrir cette cible par une troupe de reconnaissance.
2. Plusieurs joueurs peuvent engager une expédition vers cette même récompense. Le lieu de
   rencontre évolue le long du trajet : choisir où rejoindre l'objectif devient une décision.
3. La résolution traite l'éventuelle défense PNJ, puis le chargement récupérable. La récompense
   ne doit pas être attribuée simplement au premier joueur qui clique.
4. Le butin voyage avec les troupes qui l'emportent et ne rejoint le stock national qu'au
   retour prévu par le système de pillage. Les autres joueurs peuvent encore contester ce retour.
5. Le journal explique les pertes, le chargement pris et ce qui a effectivement été rapporté.

## Premier périmètre proposé

- **Maritime d'abord** : un cargo neutre, une route légale calculée au départ, un chargement
  de ressources existantes. Le trajet Cap-Vert–Australie est un exemple, pas une route imposée
  à toutes les compositions de nations.
- **Trajectoire fixée au départ** : pas d'IA de navigation ou de poursuite pour ce premier lot.
  Départ, rencontres et arrivée utilisent les événements planifiés du serveur.
- **Défense optionnelle** : la garnison fixe relève du lot de dépôts neutres existant ; une
  escorte voyageant avec le cargo est une extension à préciser, pas la même mécanique.
- **Peu d'objectifs, des gains disputés** : récompenser une sortie risquée et offrir une
  destination commune. Leur nombre, leur fréquence et leur contenu restent à mesurer.
- **Terrestre ensuite** : réutiliser le même contrat d'objectif avec un trajet terrestre,
  après validation de la boucle maritime.

## Visibilité à distinguer du renseignement sur les joueurs

La demande rend **l'objectif neutre public**. Elle ne rend pas publiques les troupes des
joueurs qui convergent, ni celles qui repartent avec le butin. Leur visibilité conserve les
règles du brouillard. La vue doit donc distinguer structurellement l'objectif public d'un
mouvement adverse ; aucun élargissement général de `PlayerView` ne doit exposer les armées.

Le détail de la défense PNJ reste à décider : la proposition de dépôts neutres annonce la
position mais conserve le renseignement sur la garnison. « Tout le monde le voit » valide
la cible publique, pas automatiquement tous ses effectifs.

## Points à fixer avant un brief de code

| Point | Question à résoudre |
| --- | --- |
| Rencontre | Quel ordre permet de viser une cible qui bouge ? Comment calculer le rendez-vous et refuser une interception impossible ? |
| Combat | Qui engage la passe contre la défense PNJ ? Que devient l'objectif si la défense survit ? |
| Prise maritime | Le butin demande-t-il de l'infanterie embarquée, un cargo survivant ou un autre moyen de récupération ? La règle actuelle réserve la prise à l'infanterie. |
| Concurrence | Comment départager des rencontres simultanées et empêcher d'attribuer deux fois le même chargement ? |
| Chargement restant | Que devient le reste après une prise partielle, un transport détruit ou une expédition sans place ? |
| Placement | Comment offrir une occasion atteignable à plusieurs nations éloignées ? Quel repli si aucune route pertinente n'existe ? |
| Rythme | Quelle durée de trajet laisse préparer une expédition entre deux visites ? La présence à une heure précise ne doit pas devenir le principal avantage. |
| Fin de saison | Comment annuler les événements restants et solder une récompense encore en voyage ? |

## Place dans la file

Les portées passives et le comportement dérivé de l'ordre (ADR 0021), le stockage unique et le pillage préparent cette boucle.
Le premier dépôt neutre permet de valider défense, chargement et retour ; le mouvement neutre
ajoute ensuite le rendez-vous mobile et sa visibilité publique. Le brief `ready/objectifs-neutres.md`
ne couvre pas cette extension : rédiger son propre brief et formaliser les décisions qui
touchent le combat ou le brouillard avant l'implémentation.

Les positions stratégiques qui produisent tant qu'on les tient restent une autre variante
approuvée sur le principe. Les contrats de guerre entre joueurs sont seulement retenus comme
piste à explorer ; ils ne bloquent ni le pillage ni les objectifs neutres.
