# ADR 0021 — Portées passives et comportement dérivé de l’ordre

**Statut :** acceptée (31/08/2026), **révisée le 08/09/2026**, **§2 et §3 révisés le 13/09/2026 par l'[ADR 0024](0024-engagement-intentionnel-et-forces-posees-visibles.md)** (plus de rencontre en route ni de riposte au rayon d'arrivée sans ordre ; une force posée se voit dans la portée) — révise l’[ADR 0008](0008-combat-par-interception.md), les §3 et §5 de l’[ADR 0018](0018-anatomie-de-la-passe-de-resolution.md) et la conséquence du §5 de l’ADR 0019 selon laquelle un détecteur arrivé après un départ ne voit jamais ce mouvement. Le calcul de la passe (ADR 0014, ADR 0018 §1-2-4) reste fermé.

## Contexte

Le contact reposait sur `INTERCEPTION_RADIUS_KM = 200`, placeholder sans mesure, tandis que les troupes posées relevaient à `SCOUT_RADIUS_KM = 60` et les stations à 120 km. Un mouvement nouvellement créé était déjà comparé aux mouvements existants : une rencontre tardive entre deux routes était donc possible, mais seulement parce que la seconde colonne provoquait ce calcul. Les détecteurs, compositions et rendez-vous changés ensuite ne réévaluaient rien.

La première version de cette ADR ajoutait trois postures choisies, une discrétion chiffrée et une salve d’allonge. Ces mécanismes ajoutaient un geste à l’ordre, des coefficients non mesurés et confondaient encore portée de détection et portée de combat.

## Décision

### 1. Une troupe porte une portée de détection

Chaque rôle possède une portée `P`. Une pile utilise la meilleure portée de ses troupes, sans addition. Cette portée suit la troupe en stationnement comme en mouvement. Une station d’écoute possède sa propre portée ; un bâtiment ordinaire, la durée d’occupation et la simple présence d’un avant-poste n’ajoutent aucun bonus générique.

Les premières valeurs reprennent les points de départ déjà documentés et restent toutes `@a-mesurer`. Elles ne sont pas présentées comme équilibrées.

### 2. Détecter n’est pas combattre

> ⚠️ **Révision (13/09/2026, ADR 0024).** « Une force voit une force adverse lorsqu'elle entre dans
> sa portée » vaut désormais **aussi pour une force posée**. La rencontre en route décrite plus bas
> **n'existe plus** : seule la cible d'un ordre d'attaque engage, à `ARRIVAL_RADIUS_KM` du point
> visé, à l'arrivée. Une force posée voit, et se bat seulement si on l'attaque.


Une force voit une force adverse lorsqu’elle entre dans **sa** portée. Les portées ne s’additionnent pas. Elles ne deviennent ni une portée de tir ni un modificateur de la passe de résolution.

Une rencontre en route exige en plus :

- deux forces mobiles présentes au même instant dans le même milieu réel du trajet ;
- au moins une colonne dont l’ordre exprime l’intention de combattre ;
- cette colonne voit l’autre avec la portée de la pile qu’elle porte alors.

Les garnisons et les troupes posées voient, mais n’interceptent pas à distance. Elles défendent leur position lorsqu’une colonne y arrive, par les règles existantes de `defenceOf` et `standAt`.

### 3. Le comportement vient de l’ordre, sans choix supplémentaire

Il n’existe aucun sélecteur de posture et aucune posture stockée.

| Ordre | En route |
|---|---|
| marche, rappel legacy, retour | voit mais n’engage pas |
| attaque, raid | engage une force mobile adverse détectée |
| force immobile | voit et riposte si elle est attaquée à sa position, n’engage pas à distance |

> **Révision du 13/09/2026 ([ADR 0024](0024-engagement-intentionnel-et-forces-posees-visibles.md) §3).** La ligne « attaque, raid » ne vaut plus : **aucun ordre n’engage en route.** Les trois lignes se lisent désormais toutes comme la première — en route, on voit et on n’engage pas — et la seule chose qui ouvre une passe est un ordre d’attaque arrivé à destination. La riposte d’une force immobile, elle, est inchangée : attaquée, elle se bat.

Une force attaquée riposte par la passe normale. Aucun ordre de poursuite ni nouvel ordre d’interception n’est introduit par ce lot.

### 4. Les prévisions sont événementielles et remplaçables

Il n’y a pas de boucle globale. À chaque événement qui change un trajet ou un détecteur pertinent — départ, arrivée, pose, recrutement, construction d’une station, changement de spécialisation, désactivation ou restauration, combat et composition survivante — le serveur :

1. annule les rendez-vous de rencontre devenus périmés ;
2. recalcule les premières rencontres engageantes des mouvements encore en vol ;
3. remplace les fenêtres de visibilité futures concernées ;
4. conserve ce qui a déjà été vu comme dernière position connue ;
5. vérifie à nouveau les conditions lorsque le rendez-vous se déclenche.

Un détecteur posé après le départ peut donc voir un mouvement encore en vol. À l’inverse, un détecteur parti avant l’ouverture d’une fenêtre ne révèle rien. Une ligne future n’est jamais servie avant son heure.

Un seul rendez-vous est retenu par mouvement. Quand deux prévisions partagent une colonne, la plus proche est seule programmée ; après la passe, la composition restante provoque une nouvelle évaluation. Cela empêche deux jobs de résoudre le même croisement avec un manifeste devenu faux.

### 5. Les segments réels gouvernent le contact

La position d’une colonne suit le coût temporel de ses jambes et des transferts, pas une interpolation uniforme sur la longueur totale. Une route combinée attend donc au quai et n’est comparée qu’à une force présente dans le même milieu au même instant. La compatibilité de milieu empêche une portée de transformer une colonne terrestre en tir contre un avion ou un navire au large.

### 6. La portée est lisible, chez soi seulement

La carte dessine la portée de la pile sélectionnée et d’un mouvement à soi désigné. L’abaque-catalogue imprime la portée de chaque rôle. La vue adverse ne sert toujours ni composition, ni portée, ni intention d’ordre, ni trajectoire future avant l’ouverture d’une fenêtre de relevé.

## Conséquences

- `INTERCEPTION_RADIUS_KM` et `SCOUT_RADIUS_KM` disparaissent au profit de la table par rôle ; la station conserve son propre point de départ à 120 km.
- Un nouveau détecteur peut relever une colonne déjà partie sans que `PlayerView` ne balaie la table des mouvements : les fenêtres restent dénormalisées par observateur.
- L’ancien calcul n’était pas incapable de rencontrer deux mouvements : il traitait le nouveau venu. La correction porte précisément sur les réévaluations ultérieures, les jobs périmés et les doubles passes.
- Le coût est borné par les joueurs et les slots de mouvement. À 2 joueurs et QG 5, 12 mouvements
  donnent 66 couples de contact et 132 lectures mobiles orientées ; à 4 joueurs, 24 mouvements
  donnent 276 couples et 552 lectures orientées. Chaque lecture marche au plus 241 échantillons ;
  les détecteurs posés ajoutent `mouvements × détecteurs × 241`. Une réévaluation lit une saison
  et écrit seulement les lignes des observateurs concernés ; `PlayerView` continue de lire l’index
  du joueur. Ce coût d’écriture doit être profilé avec des piles et sites maximaux avant d’élargir
  le nombre de joueurs.
- Les valeurs de portée et le coût de cette réévaluation doivent être mesurés en saison réelle.

## Ce qu’on abandonne

- le rayon fixe d’interception de 200 km ;
- la conséquence « une troupe posée après le départ ne verra jamais ce mouvement » ;
- les postures choisies et stockées ;
- la discrétion automatique, ses coefficients et ses malus ;
- la salve d’allonge ;
- toute interception à distance déclenchée par une garnison ou une force posée.

## Questions ouvertes

- Les neuf valeurs de portée sont des points de départ, pas un équilibrage.
- Un futur ordre explicite d’interception ou de poursuite demanderait sa propre décision et son propre geste ; ce lot n’en prépare aucune surface.
