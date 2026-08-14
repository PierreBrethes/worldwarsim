# ADR 0014 — Troupes discrètes et combat séquentiel à l'initiative de l'attaquant

**Statut :** acceptée

## Contexte

L'ADR 0011 avait gravé des unités **sans position ni identité** — un effectif national,
des piles agrégées dans les mouvements. C'était assumé comme provisoire, et l'interface
construite depuis l'a contredit pièce par pièce : sprites de troupes sur la carte, jalon
qui montre le véhicule du segment, vision d'espion « sur les unités rattachées à un
bâtiment », rose des vents sur « une force ». Tout présupposait des troupes visibles,
identifiables, quelque part. Restait ouverte la question « les unités doivent-elles être
quelque part ? » (QUESTIONS.md), et une résolution de combat simultanée à quatre passes,
correcte en simulation mais difficile à lire et à mettre en scène dans le rejeu.

## Décision

Le modèle Advance Wars, adapté à l'asynchrone.

**Des troupes discrètes.** Une nation aligne un nombre borné de troupes uniques
(ordre de grandeur 10–30, à calibrer). Une troupe ne fusionne jamais avec une autre.
Ses points de vie sont son **effectif nominal, lisible** : 50 soldats, 10 chars légers,
5 chars lourds. Les dégâts se lisent en hommes et en machines perdus.

**Les transports sont des troupes.** Un transport a une capacité d'emport typée
(exemple : porte-avions — 5 infanteries / 3 véhicules / 2 avions). C'est la seule forme
de regroupement. En mer, on voit le navire, pas la cargaison — le leurre y gagne :
un transport vide est indiscernable d'un plein.

**Résolution séquentielle, initiative à l'attaquant.** L'attaquant frappe d'abord ;
le défenseur riposte avec ses seuls survivants, et seulement s'il **peut** toucher
l'attaquant (un canon antichar ne riposte pas à un bombardier). Le
pierre-feuille-ciseaux demeure : des tables de dégâts par couple de rôles remplacent
la matrice simultanée. L'issue d'un engagement est **prédictible avant de le lancer** —
c'est la qualité stratégique recherchée.

**Les blessures se soignent.** Une troupe entamée se reconstitue en consommant des
**bandages**, en se repliant vers une **pharmacie** — amélioration d'avant-poste — ou
chez soi. Le soin crée des mouvements de retour : la carte vit dans les deux sens.

**Les spécialisations sont exclusives.** Par la recherche (au QG), une troupe peut se
spécialiser — pour l'infanterie mk1 : **médecin OU parachutiste**, jamais les deux.
Les autres rôles recevront les leurs.

## Justification

**La lisibilité prédictive.** « 50 soldats contre 50 soldats : j'en perds 7, il en perd
25 » se comprend sans manuel. Le rejeu de bataille (fiche 4.7) devient une évidence à
mettre en scène.

**L'interface existait déjà.** Le design rejoint ce que l'UI-sonde avait construit —
c'est le sens même de la méthode du projet.

**La question des piles se ferme d'elle-même.** Des troupes uniques sont localisées.

**Les bandages gagnent leur consommation**, et l'économie v2 son débouché militaire.

## Conséquences

**L'ADR 0011 est révisée.** Les tables `unites` (une ligne par couple rôle/palier) et
`recrutements` sont à refondre : une ligne par **troupe**, avec identité, effectif
courant, position ou rattachement. La datation paresseuse de la file reste valable.

**L'ADR 0008 est précisée, pas contredite.** Le combat reste automatique, résolu sans
le joueur, avec interception et rejeu. Seule la formule interne change : séquentielle
au lieu de simultanée.

**L'initiative à l'attaquant renforce l'attaque — trois contre-pouvoirs obligatoires
dès le premier jet :** l'interception en route (le défenseur peut frapper avant
l'arrivée), le bonus du défenseur (curseur explicite, 1.15 aujourd'hui), le terrain des
régions (défendre en montagne doit compter). Sans eux, la première saison sera un
festival d'agression — l'aversion mesurée du jeu pour l'attaque bon marché l'exige.

**Le budget de décisions se densifie, et c'est assumé.** Ordonner 10–30 troupes fait
monter le rythme mesuré (1,2 décision/heure). Les slots de mouvement (ADR 0006) restent
le régulateur : on ne déplace jamais tout à la fois.

**À refondre :** le simulateur (résolution et politiques), les fiches 08 et 09, le
schéma de jeu. Les taux (tables de dégâts, effectifs nominaux, coûts de soin) sont à
chiffrer puis à mesurer.

## Ce qu'on abandonne

- L'effectif national sans position (ADR 0011 première forme).
- Les piles fusionnables et leur composition libre.
- La résolution simultanée à quatre passes et la matrice 9×9 telle quelle.
- La question ouverte « pile nationale ou piles localisées » — tranchée de fait.
