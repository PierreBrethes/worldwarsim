# ADR 0019 — L'avant-poste ouvre le terrain, il ne projette pas

**Statut :** proposée — à valider par Pierre. Grave la « question 21 du 18/08 », citée trois fois
par `src/domain/movement-orders.ts` et introuvable dans `WWS/`.

## Contexte

La décision du 18/08 a fait de la colonne fondatrice la **garnison** de l'avant-poste qu'elle
fonde (`WWS/docs/prompts/code/garnison-adresse.md`). Elle a ouvert une question que le prompt
n'avait pas à trancher : que peut demander une colonne qui se tient sur un avant-poste ?

La réponse a été codée — `Column.origin` vaut `'building'` ou `'outpost'`, et une origine
`'outpost'` n'ouvre que le repli vers une caserne — puis citée comme « question 21, 18/08 » dans
trois commentaires. Cette question n'a jamais atteint `QUESTIONS.md`, ni un ADR, ni la fiche 03.
Une règle qui ferme trois ordres sur quatre reposait sur une référence introuvable.

Le symptôme l'a fait remonter : en partie, une garnison sélectionnée ne répond à aucun clic
droit, sans un mot à l'écran. Le joueur lit une panne là où il y a une règle.

Trois modèles étaient en présence :

1. l'avant-poste projette la force — attaque et raid partent de lui ;
2. l'avant-poste ne projette rien, et la garnison ne peut que se replier (ce qui est codé) ;
3. l'avant-poste ne projette rien, mais le **rayon qu'il ouvre** accueille une caserne, et c'est
   la caserne qui projette.

## Décision

**Le modèle 3, qui est le modèle 2 correctement lu.**

Un avant-poste n'est pas un bâtiment de projection : aucune colonne n'en part vers un adversaire.
La garnison qui l'occupe ne peut demander qu'un ordre — rejoindre une région portant une des
casernes de son propriétaire.

Mais le rayon que l'avant-poste ouvre (`OUTPOST_REACH_KM = 400`) accueille **n'importe quelle
bâtisse**, caserne comprise : `convex/constructions.ts` ne restreint pas la clé, et
l'ADR 0015 pose que ce qui exploite à l'étranger sont les vrais bâtiments de l'économie. Une
caserne bâtie dans ce rayon entre dans les destinations légales du repli, et une colonne qui en
part retrouve l'intégralité des ordres.

**Le chemin de projection lointaine est donc en deux temps, et il est déjà praticable :**
fonder l'avant-poste, bâtir une caserne dans son rayon, y rallier la garnison, repartir. Aucune
exception à l'ADR 0013 : un domaine s'ouvre par un bâtiment de projection, ici comme ailleurs.

Ce que cet ADR ajoute au code existant est donc **une trace écrite et rien d'autre** — plus les
correctifs de lisibilité que son absence a laissés passer (voir Conséquences).

## Justification

**Contre le modèle 1.** Il supprime le seul coût qui rend la projection lointaine chère. Une
caserne avancée prend un emplacement du plafond porté par le quartier général, coûte 40
d'alliage et 30 de nourriture, met quarante minutes, et se pille le jour où le pillage existe.
Un avant-poste qui lancerait des colonnes offrirait la même capacité pour le prix d'un point sur
la carte. Il faudrait en plus interdire la fondation en chaîne, donc écrire une exception pour
réparer une exception.

**Contre une lecture du modèle 2 qui ferait de l'avant-poste un cul-de-sac.** Elle est fausse, et
c'est précisément ce que l'absence de trace écrite a laissé croire pendant deux jours : la
caserne avancée existe, la règle du repli l'accepte déjà, personne ne l'avait écrit.

**Ce que le modèle 3 préserve.** La fiche 03 dit que l'avant-poste *ouvre le terrain et ne produit
rien*. Le modèle 3 est la seule lecture qui tienne cette phrase mot pour mot tout en rendant le
jeu lointain possible.

## Conséquences

- **La règle du repli ne change pas.** `origin: 'outpost'` n'ouvre que lui, et sa seule cible est
  une région portant une caserne du joueur. Aucun code de refus n'est ajouté.
- **Le silence devient un défaut nommé.** `compassOf` renvoie `null` quand aucun type n'est
  légal : la rose des vents doit s'ouvrir sur une cible refusée et donner le motif, qu'elle lit
  dans `refusalOf`. L'ADR 0015 interdit d'offrir un choix mort, pas d'expliquer une absence.
- **L'ordre de repli est mal nommé.** « Rappel » raconte un retour au pays ; la règle dit
  « rejoindre une de mes casernes, où qu'elle soit ». Le libellé doit changer, et le glossaire de
  `WWS/CONTEXT.md` accueillir le mot retenu.
- **En escarmouche, le chemin est théorique.** `buildingCap = 3 + 2 × hqLevel` : au quartier
  général 3, plafond du format, neuf emplacements pour un socle de six plus le quartier général.
  Deux libres, dont un pour la caserne domestique que le socle ne donne pas. La caserne avancée
  prendrait le dernier de la saison. **Cette conséquence est acceptée** : quarante-huit heures ne
  suffisent pas à s'installer ailleurs, et c'est une des choses qui distinguent les deux formats.
  Si une mesure du simulateur refondu la contredit, c'est un amendement à cet ADR, pas un oubli.
- **Le raid vise une économie avant de viser une menace.** Tant qu'aucune caserne n'est posée dans
  un rayon, un avant-poste ne menace personne : on le désactive pour couper une exploitation. Le
  jour où une caserne s'y ajoute, il devient aussi une menace, et le raid retrouve les deux sens.
- **Le rendement décroissant par pays hôte** (fiche 03) porte sur les bâtiments à l'étranger. Une
  caserne avancée y compte-t-elle ? Non tranché, sans objet tant que personne n'en pose deux.

## Ce qu'on abandonne

L'image de l'avant-poste comme tête de pont immédiate, d'où l'on frappe le lendemain de sa
fondation. Ce qu'on garde à la place est plus lent et se paie : une caserne, un emplacement, un
prix, une vulnérabilité.

Réversible. Le jour où le simulateur refondu montrerait que le coût de la distance interdit
d'agir loin de chez soi — ce qui est l'un des trois leviers listés contre l'avantage d'isolement
géographique (`QUESTIONS.md`, 🔴) — ouvrir `attack` et `raid` depuis une origine `'outpost'` est
une modification de quelques lignes dans `refusalOf`, et cet ADR dit exactement ce qu'elle
coûterait.
