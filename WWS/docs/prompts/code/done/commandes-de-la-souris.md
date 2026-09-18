# commandes-de-la-souris — trois gestes, trois boutons, chacun les range comme il joue

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/docs/prompts/code/done/controles-camera.md` (le mappage
actuel et ses raisons : gauche = orienter, milieu ou espace + gauche = déplacer, droit = agir ; la
discrimination clic net / glisser ; le bandeau de première fois), `src/map/engine/index.ts` (les
gestionnaires de pointeur), `src/map/WorldMap.tsx`, `src/map/ControlsCard.tsx` (`?`),
`src/data/settings.ts` (les réglages en `localStorage`), `src/routes/-plateau/SettingsWindow.tsx`,
`src/routes/-plateau/BriefingSheet.tsx` (l'aide-mémoire, colonne « la carte et la souris »),
`src/i18n/fr.ts` (`fr.mapUi.gestures`, `fr.settings`). Ne commit pas, ne push pas. Client pur, un
chantier, un commit. Supprime `ready/raccourcis-clavier.md` (remplacé par ce brief).

## Pourquoi

Retour de la partie du 11/09 : deux joueurs, deux habitudes. L'un joue comme aujourd'hui ; l'autre
veut **la rose au clic molette et le déplacement au clic droit**. La grammaire de la carte ne
change pas — *un bouton agit, un bouton oriente, un bouton déplace, le clic net gauche lit* — mais
**quel bouton fait quoi est une préférence de joueur**, pas une règle du jeu. La décision du 30/08
(« la carte au clic droit agit ») reste le défaut.

## La règle

Trois **rôles** — `orienter`, `déplacer`, `agir` — sur trois **boutons** — gauche, milieu, droit —,
chaque rôle sur exactement un bouton (une permutation, six possibles). Invariants qui ne se
règlent pas :

- le **clic net gauche** sélectionne et lit, quel que soit le rôle du glisser gauche — la
  discrimination clic net / glisser de controles-camera reste ;
- **espace + glisser gauche = déplacer**, toujours (l'alias trackpad, qui n'a pas de milieu) ;
- `agir` est un **clic net** (la rose s'ouvre au clic, jamais au glisser) ; `orienter` et
  `déplacer` sont des **glissers** ;
- le menu contextuel du navigateur est supprimé sur le canvas quel que soit le bouton qui agit ;
- `N` (nord) et `?` ne bougent pas.

## Ce qui change

1. **Un réglage `mouseMapping`** dans `src/data/settings.ts` : `{ left, middle, right }` →
   rôle, défaut `{ left: 'orient', middle: 'pan', right: 'act' }`, validé (permutation, sinon
   défaut). Le moteur lit le mappage par une seule fonction (`roleOf(button)`), jamais un numéro
   de bouton en dur ailleurs — un test le vérifie par grep sur `event.button ===`.
2. **Dans Réglages**, un bloc « la souris » : deux presets nommés en tête — **« classique »**
   (le défaut) et **« molette agit »** (`{ left: 'orient', middle: 'act', right: 'pan' }`, le
   retour de la partie) — puis trois sélecteurs, un par bouton, qui refusent un rôle déjà pris
   (choisir un rôle l'échange avec le bouton qui l'avait, il n'y a jamais d'état invalide).
   Vocabulaire en français, presse : « orienter », « déplacer », « agir (la rose) ».
3. **La fiche `?` et l'aide-mémoire lisent le mappage** : plus de « clic droit : la rose » en
   dur — `fr.mapUi.gestures` devient une fonction du mappage. Le bandeau de première fois aussi.
4. Effet immédiat, sans rechargement ; un glisser en cours garde son rôle jusqu'au relâchement
   (la règle de controles-camera : ne pas basculer au milieu d'un geste).

## Ce que ce prompt ne fait pas

Pas de clavier (retiré, faute de demande). Pas de boutons latéraux (4/5 : le navigateur y met
précédent / suivant). Pas de réglage par partie ni côté serveur : c'est le navigateur du joueur.

## Cas d'acceptation

1. Défaut inchangé : les tests de controles-camera (clic net, glisser, alignement au nord,
   espace) passent sans modification.
2. Preset « molette agit » : clic molette net sur une troupe → la rose ; glisser droit → la
   carte se déplace ; glisser gauche → orientation ; clic net gauche → sélection ; aucun menu
   contextuel.
3. Choisir « agir » sur le bouton gauche échange les rôles avec le bouton qui l'avait ; les
   trois sélecteurs montrent toujours une permutation.
4. La fiche `?` et l'aide-mémoire décrivent le mappage courant (test statique sur la fonction,
   deux mappages, deux textes).
5. `localStorage` vidé → défaut ; valeur corrompue → défaut.
6. `npm run verifier` vert.

Un commit, message en français qui décrit le chantier.
