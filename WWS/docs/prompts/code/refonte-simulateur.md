# Prompt Claude Code — refonte du simulateur (ADR 0013, 0014, 0015)

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, les ADR `0013`, `0014`,
`0015`, puis `WWS/docs/design/propositions/chiffrage-combat.md` — qui porte tous les nombres
de ce travail. Ne commit pas, ne push pas.

Ce prompt est **indépendant du code du jeu** : il ne touche qu'à `WWS/simulation/`. Il peut
tourner avant, pendant ou après les prompts `gisements-par-region.md` et
`schema-economie-et-troupes.md`.

## Contexte

`WWS/simulation/` est un instrument de mesure, pas un prototype : des joueurs virtuels suivent
des politiques fixes, on fait tourner 48 h, on compte. Il a produit le rapport qui a fermé trois
questions et ouvert le dernier 🔴 (l'avantage d'isolement américain, 20,8 % pour 12,5 % attendus,
visible seulement après 900 saisons).

Trois ADR l'ont invalidé depuis. Il modélise une économie à trois ressources non localisées, des
piles fusionnables, une matrice de combat simultanée à quatre passes, et des mouvements qui
partent de n'importe où. Plus rien de tout cela n'est vrai. **Le rapport de simulation actuel ne
vaut plus une seule ligne** — c'est le point de départ, pas une régression à éviter.

**Repère d'abord l'existant** et liste-le-moi avant d'écrire : `sim.mjs` (moteur), `run.mjs`
(balayage, calibration, rapport), `world.json`, `etat-reference.mjs`. Dis-moi précisément quelles
fonctions de `sim.mjs` survivent telles quelles.

## Ce qui ne change pas

Ces choix ont été payés cher, ne les redécouvre pas :

- **La méthode de calibration** — 48 h sans seuil, puis seuil au 90ᵉ centile. Calibrer sur la
  médiane faisait terminer les saisons en 9 h.
- **Les mesures produites** : taux de victoire par doctrine, écart maximal à 33 %, part de la
  saison où le vainqueur prend la tête, décisions par joueur et par heure, répartition par couple
  nation × doctrine.
- **Aucune dépendance npm.** Node nu, `node run.mjs`.
- **Le déterminisme par graine.** Deux exécutions à graine égale donnent le même résultat.
- Les limites assumées documentées dans `simulation/README.md` (pas de brouillard, politiques
  fixes) restent assumées.

## Ce qu'il faut refondre

1. **L'économie** → huit ressources (ADR 0015). Exploitation par gisement de région,
   transformation continue, entretien en nourriture, munitions consommées au combat, pétrole pour
   les motorisés, stocks plafonnés. Tant que `public/gisements.json` n'existe pas, génère une
   distribution de substitution **dans le simulateur**, marquée comme telle, et bascule sur le
   fichier réel dès qu'il est là.

2. **Les troupes** → discrètes (ADR 0014). Une troupe = une entité avec un rôle, un palier, un
   effectif nominal et courant, un rattachement. Plus de piles fusionnables. Plafond de troupes
   par nation et plafond d'hommes par les casernements.

3. **Le combat** → séquentiel, **une seule passe**, initiative à l'attaquant, riposte des
   survivants seulement si le rôle du défenseur peut atteindre celui de l'attaquant. Table de
   dégâts, modificateurs et seuil de déroute : reprends-les *littéralement* de
   `chiffrage-combat.md`. Ne les réinvente pas, ne les « améliore » pas — leur but est d'être
   mesurés tels quels.

4. **La projection** → un mouvement part d'un bâtiment de projection de son domaine (ADR 0013).
   C'est le changement qui pèse le plus sur les temps de trajet, donc sur l'équilibre : le trajet
   est le levier central (14 min / 1000 km, mesuré).

5. **Les politiques des joueurs virtuels** → à réécrire pour l'économie v2 : où poser un avant-poste,
   quel gisement exploiter, quand transformer, quand construire un port. Une politique par
   doctrine, fixe, lisible.

6. **Un module de vérification** : porte `verif-chiffrage.mjs` (fourni) dans `WWS/simulation/`,
   fais-le rejouer les 75 couples atteignables, et **fais échouer `run.mjs`** si un contre absolu
   ou une riposte nulle non voulue apparaît. L'équilibrage doit se casser bruyamment.

## Ce que le simulateur doit mesurer en plus

Le 🔴 et les nouvelles ADR appellent quatre indicateurs qui n'existaient pas :

- **La supériorité aérienne.** Part des saisons gagnées par le joueur qui a le plus de chasseurs
  et de bombardiers. C'est le risque n°1 identifié dans le chiffrage : si ce chiffre dépasse
  nettement 1/n, la table de dégâts est fausse.
- **La dépendance aux gisements.** Part des saisons où le vainqueur possède le plus de puits de
  pétrole. C'est le nouveau visage du 🔴 isolement.
- **Le taux de déroute** contre le taux de destruction. Si les troupes meurent au lieu de rompre,
  la promesse anti-élimination ne tient pas.
- **La distance médiane des engagements** au territoire d'origine. L'ADR 0013 devait forcer les
  nations isolées à sortir de chez elles : soit ça se voit ici, soit ça n'a pas marché.

## Critères d'acceptation

- `node run.mjs` tourne sans dépendance et produit un rapport lisible dans `derniere-sortie.txt`
  et `resultats.json`.
- Deux exécutions à graine égale sont identiques au caractère près.
- La vérification du chiffrage passe, et échoue si tu modifies une valeur de la table pour créer
  un contre absolu — teste-le une fois pour prouver que le garde-fou mord.
- Les quatre nouveaux indicateurs figurent dans la sortie.
- `etat-reference.mjs` produit toujours un instantané exploitable par les maquettes, mis à jour
  pour les huit ressources et les troupes discrètes.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`) dans le code ni les commentaires.

## Ce que tu ne fais pas

Tu ne touches à **rien** hors de `WWS/simulation/` — ni `convex/`, ni `src/`, ni les fiches de
design. Tu ne modélises pas le brouillard, l'espionnage, ni l'interception en route (elle reste
une limite assumée du simulateur, à documenter dans le README). Tu ne modifies aucune valeur du
chiffrage : si l'une te paraît fausse, **signale-la et arrête-toi** — c'est une décision de
design, pas de code.

## Après ce prompt

Une campagne complète, puis réécriture de `WWS/docs/technique/rapport-simulation.md`. C'est
seulement là qu'on saura si le 🔴 isolement a bougé.
