# ADR 0011 — Première tranche du schéma de jeu écrite avant la fermeture du 🔴

**Statut :** acceptée — **révisée par l'[ADR 0014](0014-troupes-discretes-et-combat-sequentiel.md)**

> ⚠️ Révision (14/08/2026) : le principe « ni position, ni identité » ne tient plus —
> les troupes deviennent discrètes et localisées. Les tables `unites` et `recrutements`
> sont à refondre (une ligne par troupe). La datation paresseuse de la file reste valable.

## Contexte

`WWS/CLAUDE.md` pose une règle : le schéma de **jeu** — mouvements, combat, occupation, revenus —
ne s'écrit qu'après la correction du dernier 🔴 de `QUESTIONS.md`, l'avantage d'isolement
géographique. La règle n'est pas de la prudence gratuite : trois fois au cours du projet, écrire le
schéma tôt a produit du travail à jeter.

La surface 4.6, Production, est arrivée avant cette échéance. Elle a besoin de persister deux
choses qu'aucune table existante ne porte : ce que le joueur possède, et ce qu'il est en train de
fabriquer. Les tables `saisons`, `joueurs`, `ressources`, `batiments` et `chantiers` couvrent le
hors-saison et l'état de nation (ADR 0009, 0010), pas l'armée.

Trois issues : reporter 4.6 jusqu'à la fermeture du 🔴, la bâtir sur un état client jetable, ou
écrire la tranche de schéma qu'elle exige et rien de plus.

## Décision

Écrire **la tranche minimale** : les tables `unites` et `recrutements`, structurées pour ne
préempter aucune décision de combat.

`unites` est un effectif à domicile, une ligne par couple rôle/palier. **Ni position, ni
identité** : une unité n'existe individuellement nulle part.

`recrutements` est une file ordonnée par `rang`. **Seul le lot de tête porte un `finitLe`** ; les
suivants n'ont pas commencé et ne sont datés nulle part. Leur échéance se déduit à la lecture, en
cumulant les durées qui les précèdent.

## Justification

**Le 🔴 ouvert ne porte pas sur ces tables.** L'avantage d'isolement géographique décide de la
portée des mouvements et du coût de la distance. Il ne décide pas du nombre d'unités qu'un joueur
garde chez lui. Une table sans position ni identité ne peut pas contredire un arbitrage sur la
géographie — c'est précisément pourquoi elle est écrite sous cette forme et pas une autre.

**La datation paresseuse est ce qui rend la file annulable.** Si chaque lot portait sa date, toute
annulation obligerait à redater la file entière. En ne datant que la tête, un lot en attente est
une ligne sans conséquence : la supprimer ne dérange rien.

**Reporter la surface coûtait plus que la migration à venir.** Le 🔴 n'a pas d'échéance ; 4.6 est
spécifiée au §4.6 du brief UI et prête à construire.

## Conséquences

- **L'entorse à la règle est réelle et assumée.** Elle est signalée dans `CLAUDE.md` à la racine et
  dans `WWS/CLAUDE.md`. Cette ADR est ce qui la sort du statut d'oubli.
- **Les coûts et durées de `convex/constantes.ts` sont arbitraires**, jamais passés au simulateur.
  Ils viennent du `catalogueProduction` de `WWS/simulation/etat-reference.json` pour les ordres de
  grandeur et de la maquette 4.6 pour les durées. C'est le seul endroit à corriger le jour où
  l'équilibrage tourne.
- **En saison réelle, la file de production reste vide.** L'acier démarre à 0 et rien ne le produit :
  il ne vient que des avant-postes d'extraction, qui n'existent pas encore. Or toute unité s'achète
  en acier. `convex/unites.test.ts` grave le constat plutôt que de le contourner.
- **Une migration est probable** quand le combat s'écrira : les unités devront acquérir une
  position, peut-être une identité, et `unites` deviendra le cas particulier « à domicile » d'une
  table plus large. La forme actuelle rend cette migration additive.

## Ce qu'on abandonne

**La production parallèle.** Une file unique et séquentielle : un seul lot avance à la fois, comme
les chantiers. Plusieurs chaînes simultanées feraient du complexe industriel un multiplicateur au
lieu d'un arbitrage, et rendraient la production illisible en un coup d'œil sur la surface 4.6.

**Le remboursement d'un lot commencé.** On ne rembourse que ce qui n'a pas démarré. Annuler à
mi-parcours ouvrirait un aller-retour gratuit entre acier et temps : mettre en file pour réserver,
annuler dès qu'un besoin plus urgent apparaît, sans jamais rien payer.

**Des chiffres tenus pour justes.** Les valeurs actuelles ne sont pas un équilibrage, ce sont des
placeholders lisibles. Les traiter comme provisoires est la contrepartie d'avoir écrit la tranche
tôt.
