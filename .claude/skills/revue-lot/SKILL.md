---
name: revue-lot
description: Revue en lecture seule d'un lot de La Manchette, sur une plage de commits, avec la grille propre au jeu. Use when on relit un lot, une branche ou une issue codée avant correction ou PR.
---

# Revue de lot

Tu relis, tu ne modifies rien : ni fichier, ni commit, ni GitHub. Ta sortie est une liste de
findings **vérifiés**, que l'agent de correction appliquera sans te relire.

## 1. Cadrer

- La plage : `<base>..<tête>`, donnée par la consigne ; à défaut, `git merge-base main HEAD`..HEAD.
- La spec : l'issue (`gh issue view N --comments`, ou `Closes #N` dans les messages de la plage).
  Les commentaires « Décisions » l'emportent sur le corps.
- `CLAUDE.md` (invariants) et `CONVENTIONS.md`.

Fini quand tu as la plage, l'issue et la liste des fichiers touchés (`git diff --stat`).

## 2. Lancer `code-review`

Sur un lot de plus de dix fichiers, passe les axes de `code-review` sur la plage : Standards
(`CONVENTIONS.md`) et Spec (l'issue). Tu n'as pas d'outil pour lancer ses deux sous-agents :
passe ces axes toi-même, puis garde leurs findings pour l'étape 4. Sur un lot plus petit, la
grille suffit.

## 3. Passer la grille du jeu

Chaque point se passe sur tout le diff, et sur les appelants des fonctions qu'il change.
Ce sont les défauts que les revues ont réellement trouvés.

- **Brouillard** : rien ne sort du serveur hors du `PlayerView` ; une force relevée, un arc
  adverse, une région non vue ne fuient ni par un champ, ni par un compte, ni par un code
  d'erreur qui distingue ce que le joueur ne voit pas.
- **Une règle, une fonction** : le refus que l'écran affiche et celui que le serveur rend sortent
  du même `*RefusalOf` de `src/domain/`. Un `if` recopié côté écran ou côté serveur est un défaut.
- **Refus dit avant le geste** : le joueur lit le refus au survol ou sur la fiche, avant de
  cliquer ; rien n'est grisé sans raison écrite.
- **Échéance** : un état long (chantier, tournée, recherche, livraison, largage) relit sa règle
  au moment où il aboutit, pas seulement à l'ordre.
- **Géographie** : le serveur recoupe sur sa grille toute région, tout point, toute cible venus
  du client.
- **Conservation** : aucune ressource ni troupe ne naît ni ne disparaît hors de la règle ; un
  annulé rend ce qu'il a pris, un double clic ne paie pas deux fois, les stocks se règlent avant
  un changement de couleur (`settleBeforeChange`).
- **Jobs planifiés** : un job par événement, sans doublon quand l'ordre est rejoué, modifié ou
  annulé ; l'ancien job est annulé ou se sait périmé.
- **Blitz intacte** : ce qui est propre à la Mondiale passe par `modeOf` ; les tests Blitz
  n'ont pas changé de sens.
- **Carte à la demande** : `invalidate()` en tête des méthodes publiques de `MapEngine` qui
  changent l'image ; toute animation neuve suit le réglage actives / réduites / coupées.
- **Code mort** : constantes, refus, textes de `src/i18n/fr.ts`, tests et docs que le lot rend
  inutiles sont retirés.
- **Doublons** : la même logique, la même table ou le même texte dans deux fichiers.
- **Décisions de Pierre** : le lot suit les « Décisions » de l'issue, l'ADR et la maquette
  choisie. Compare les captures du lot à celles de la maquette, au même cadrage ; un écart pris
  seul par l'agent (une valeur, un réglage, une couche retirée) est un finding.
- **Ce qui s'affiche fait foi** : un état lu sur l'URL ou sur un compteur, alors que le composant
  ne se monte pas (feuille d'un bâtiment tombé), laisse l'écran mentir.
- **Rendu GPU** : regarde de loin comme de près. Un trait mangé par la feuille vient d'un
  conflit de profondeur ; une épaisseur qui fond vient d'unités du monde au lieu de pixels
  d'écran ; une donnée cuite peut mal se décoder (antialiasing d'un canvas lu comme un type).
- **Coût** : si le lot touche la carte, `npm run banc:client` ; rien ne redessine en continu
  au repos, et le téléphone ne régresse pas.

## 4. Vérifier et classer

Un finding n'entre dans le rapport que si tu l'as **vérifié** : relu dans le code à la tête de
la plage, avec un scénario d'échec concret (quel joueur, quel geste, quel état). Un soupçon non
vérifié part en dernière ligne, marqué « à vérifier ». Fusionne les findings de `code-review` et
de la grille, sans doublon.

Fini quand chaque point de la grille est passé et que chaque finding a ses quatre champs.

## 5. Rapport

Du plus grave au moins grave (fuite de brouillard, perte de ressources et serveur qui croit le
client d'abord ; style en dernier) :

```
1. convex/fichier.ts:42 — défaut, en une phrase.
   Échec : le joueur B fait …, il obtient …
   Correction : …
```

Termine par une ligne : points de la grille passés sans finding. Rien d'autre.

**Règle d'arrêt** : si la même vérification échoue 3 fois, arrête-toi et rends ce que tu as.
