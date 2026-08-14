# Prompt Claude Code — contrôles caméra et bindings souris

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, puis `WWS/CONTEXT.md` pour le
vocabulaire imposé, avant d'écrire quoi que ce soit. Ne commit pas, ne push pas.

## Contexte

La carte est une scène Three.js avec des contrôles orbitaux. Le schéma d'entrées
actuel est en conflit : le clic droit sert au déplacement de carte alors que la
rose d'action (menu radial) doit s'ouvrir dessus. On refait le mappage complet.

**Repère d'abord l'existant** et liste-le-moi avant de coder :

- le module qui instancie les contrôles caméra (`minDistance` est à 8) ;
- le système de curseurs contextuels (5 curseurs déjà en place) ;
- la rose d'action / menu radial, **en cours d'intégration — ne la réécris pas**,
  tu ne fais que lui brancher son déclencheur.

Il n'y a **pas de boussole** : la forme des continents suffit comme repère.
N'en ajoute pas et n'en propose pas.

## Schéma d'entrées cible

| geste | action |
|---|---|
| clic gauche glisser | orientation et inclinaison de la caméra |
| clic gauche clic net (< 6 px de déplacement) | sélection de l'entité sous le curseur |
| clic molette maintenu + glisser | déplacement de la carte |
| **espace maintenu + clic gauche glisser** | déplacement de la carte (chemin équivalent) |
| clic droit | ouverture de la rose d'action |
| molette | zoom |

Les deux chemins de déplacement sont **permanents et équivalents**, actifs pour
tout le monde. Pas de détection de matériel, pas d'option, pas de mode à activer :
le clic molette n'existe pas sur beaucoup de trackpads, l'alias espace est le
chemin de secours et il doit toujours être là.

## Implémentation

1. **Remappage des boutons.** Gauche = rotation, milieu = déplacement, droit =
   neutralisé côté contrôles (il appartient à la rose). Coupe aussi le menu
   contextuel natif du navigateur sur le canvas.

2. **Alias espace.** Au maintien de la barre d'espace, le bouton gauche bascule
   de rotation vers déplacement ; au relâchement, il revient à rotation. Deux
   garde-fous :
   - `preventDefault` sur le keydown, sinon la page défile ;
   - ne rien faire si le focus est dans un champ de saisie (chat, nom
     d'avant-poste) — l'espace doit y taper un espace ;
   - ne pas basculer le mappage au milieu d'un glisser en cours, sinon le geste
     change de nature sous les doigts du joueur.

3. **Discrimination clic net / glisser.** Sur le canvas, mémorise la position au
   `pointerdown` ; au `pointerup`, si le déplacement cumulé est resté sous 6 px,
   c'est une sélection — lance le raycast. Au-delà, c'était une rotation, ne
   sélectionne rien. Le seuil doit être une constante nommée, pas un littéral
   dispersé.

4. **Orientation.** L'orientation reste persistante entre les sessions de la
   même partie. Borne l'inclinaison pour que la caméra ne passe jamais sous
   l'horizon ni à la verticale exacte.

5. **Retour au nord, sans bouton.** Deux mécanismes, aucun élément d'interface :
   - **aimantation** : quand l'orientation repasse à moins de 5° du nord au
     relâchement, elle s'aligne exactement sur 0° avec une courte animation.
     Le joueur ne peut pas rester coincé à 3° de travers ;
   - une touche de remise au nord (`N`), animée, soumise au même garde-fou de
     focus que l'espace.

6. **Curseurs.** Ajoute au jeu existant : main ouverte quand l'espace est
   maintenu, main fermée pendant le glisser de déplacement. Sans ce retour
   visuel le mode est invisible.

7. **Carte des commandes.** Un panneau **en lecture seule** listant les six
   gestes, ouvert par `?` et par un bouton discret. Ce n'est pas un écran de
   réglages : rien n'y est modifiable, rien n'est persisté.

8. **Bandeau de première fois.** Au tout premier glisser au clic gauche d'un
   joueur, affiche une fois — et une seule, persistée localement — le rappel :
   « clic gauche : orienter · molette ou espace : déplacer ». C'est le moment où
   le joueur découvre que le glisser ne déplace pas la carte ; c'est là qu'il
   faut lui répondre, pas dans un panneau qu'il n'ouvrira jamais.

## Critères d'acceptation

- La carte se déplace sans clic molette, uniquement à l'espace : vérifie-le sur
  un pavé tactile, pas seulement à la souris.
- Un clic net sur une entité la sélectionne ; un glisser qui démarre sur cette
  même entité fait tourner la caméra et ne sélectionne rien.
- Le clic droit n'ouvre jamais le menu contextuel du navigateur.
- L'espace tapé dans un champ de saisie insère un espace et ne déplace pas la
  carte.
- Une rotation relâchée à moins de 5° du nord s'aligne exactement sur 0°.
- La touche `N` ramène au nord, et ne fait rien si le focus est dans une saisie.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`) dans le code
  ni dans les commentaires.

## Ce que tu ne fais pas

Tu ne touches pas au rendu de la carte, aux étiquettes à paliers de zoom, aux
indicateurs de bord d'écran ni aux fils de mouvement. Si le remappage casse l'un
d'eux, signale-le et arrête-toi plutôt que de le corriger au passage.
