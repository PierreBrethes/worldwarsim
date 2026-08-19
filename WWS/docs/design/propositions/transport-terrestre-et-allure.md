# Le transport terrestre et l'allure de colonne

**Statut : validée le 19/08 — mécanique acceptée telle quelle, geste de composition ajouté (voir § À bord).**
Déclenchée par le premier regard porté sur l'écran de garnison : une pile « infanterie +
transport terrestre » part aujourd'hui exactement à la vitesse de l'infanterie seule. Le
transport terrestre est une troupe qui coûte du recrutement et n'a **aucun effet** — la fiche 09
lui promet « projeter de l'infanterie plus loin », rien ne le code.

## La fonction : l'allure, et rien d'autre

**Une colonne terrestre dont l'infanterie tient dans ses transports va plus vite.** C'est tout.

- `LIFT_CAPACITY.landTransport = 2` — deux places, comme les autres capacités en places
  (`LIFT_COST` : infanterie 1, blindé 2). Point de départ assumé, `@a-mesurer` : à 2, motoriser
  une armée de huit infanteries coûte quatre camions, un vrai investissement ; à 4, la
  motorisation serait presque gratuite et l'allure à pied disparaîtrait du jeu.
- L'allure est **celle de la colonne entière, réglée sur son élément le plus lent** — comme la
  route est celle de la pile entière. Une infanterie qui ne tient pas dans les places met toute
  la colonne au pas. Pas d'allure individuelle, pas de colonne coupée en deux.
- Le blindé et le transport lui-même sont **motorisés par nature**. Une colonne de chars sans
  camion roule ; c'est l'infanterie seule qui marche — et c'est exactement « projeter
  l'infanterie plus loin ».
- Chiffrage proposé, `@a-mesurer` : le coût terrestre passe de ×1,6 (à pied) à **×1,15
  (motorisé)** — plus vite que la marche, un peu plus lent que la mer (×1,0), pour que
  l'autoroute maritime reste l'autoroute. Une seule constante nouvelle : `COST_BY_MEDIUM` gagne
  une entrée `landMotorized`, et `routeModeOf` (ou son voisin) décide laquelle des deux la
  colonne paie.

## Ce que le transport ne fait pas, et pourquoi

Chaque objet du jeu a un effet, jamais deux — c'est ce qui garde huit nations équilibrables par
un seul développeur. Les trois pistes évoquées, écartées avec leur raison :

- **« Réduction d'attrition »** — il n'existe pas d'attrition à réduire : D3 de
  `consommation-continue.md`, rien ne meurt hors combat, c'est la règle n°3 du projet.
- **Rabais d'entretien à bord** — D1 : l'entretien est un forfait, une constante, jamais une
  table de cas. Le camion qui « porte les vivres » était l'option b du 19/08, écartée parce
  qu'elle affaiblissait le rôle de ravitaillement de l'avant-poste, gravé la veille.
- **Protection au combat** — l'ADR 0018 interdit déjà au transport de faire bouclier
  (`combat.ts` : un défenseur ne met pas un camion devant ses chars). Protéger son contenu
  rouvrirait la même porte dans l'autre sens.

## « À bord » : un état calculé, jamais une manipulation

L'envie d'un glisser-déposer de l'infanterie dans le camion est comprise — mais elle est
**challengée**, et voilà l'argument : il n'y a **aucune décision derrière le geste**. Les places
sont interchangeables, les infanteries d'un même rôle aussi, et l'allure étant celle de la
colonne entière, embarquer *telle* infanterie plutôt que telle autre ne change rien. Un
glisser-déposer sans choix est de la friction déguisée en contrôle — et il divergerait du modèle
que la mer vient de coder : personne ne glisse une infanterie dans un cargo, on compose la pile
et le jeu calcule (fiche 09, « les transports sont des troupes »).

Arbitrage de Pierre (19/08) : la mécanique calculée est acceptée, **et le geste est retenu comme
sucre de composition**. Glisser une troupe sur un transport la coche et l'affiche indentée sous
lui ; glisser sur un transport plein est refusé visuellement (les places sont pleines, le geste le
dit). Le geste est **purement client** : il produit le même état que la coche — aucune relation
stockée, rien ne part au serveur, et la coche reste l'autre porte du même état (le principe du
flux : un seul état, deux portes). L'indentation respecte le placement du geste quand il y en a
eu un, l'affectation gloutonne sinon. Le compteur « places : x/y » dit la même chose en chiffres.

La ligne rouge ne bouge pas : le jour où un placement *par troupe* aura un effet de jeu, il faudra
une relation stockée, et c'est un ADR — pas une extension du geste.

Si un jour embarquer devient un choix — parce qu'être à bord aura un effet par troupe — le
glisser-déposer redeviendra la bonne réponse. Ce jour-là, il faudra une relation stockée
(« à bord de ») dans le schéma, et c'est un ADR.

## Séquence

1. Le prompt d'affichage (`la-pile-dit-ses-places.md`) — places, milieu du trajet, indentation
   calculée. Ne dépend pas de l'allure : la mer a déjà ses capacités.
2. Le prompt de l'allure — `landMotorized`, la capacité du transport terrestre, le simulateur
   miroité. Après validation de cette note, parce qu'il touche au levier central mesuré
   (14 min / 1 000 km).
