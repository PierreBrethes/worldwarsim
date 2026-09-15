# mobile-lecture-seule — lire la partie depuis un téléphone, sans passer par la carte

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/design/11-brief-ui.md` §5
(« Prévoir le mobile pour 4.1, 4.2 et 4.3 ») et le contrat de vue 01 (journal). Ne commit pas,
ne push pas. Suppose `correctifs-ui-discord` livré. Un chantier, un commit.

## Le périmètre — décision 2a du 15/09, et rien au-delà

**Lecture seule.** Sur un écran étroit, le joueur lit : le journal, la presse, le télégraphe (et
y écrit — c'est du texte, pas un ordre), la fenêtre Nation, les réglages. Il **n'ordonne rien** :
pas de rose, pas de panneau de garnison, pas de modale de site, pas de construction. La carte
reste visible et s'oriente au doigt, mais elle est inerte — le brief 11 le dit depuis le début :
« la carte, la production et le rejeu peuvent rester des surfaces de bureau ». Ce que ce lot
vise : qu'un joueur qui ouvre le jeu dans le métro au jour 4 **sache ce qui s'est passé et
revienne**. Le point 9 de la vision V1 (continuité mobile complète) reste hors périmètre.

## Ce qui change

- **Un seuil, une classe.** `< 768px` de largeur (le `md` de Tailwind, déjà la convention du
  dépôt) — pas de détection d'agent utilisateur, pas de « mode mobile » en réglage.
- **Les fenêtres deviennent des feuilles plein écran, une à la fois.** `BoardSearch.windows`
  garde son sens (la dernière entrée est devant) ; sous le seuil, seule la dernière se rend, en
  plein écran, sans `Draggable` ni poignée de redimensionnement. Fermer revient à la carte.
  L'URL reste la même qu'au bureau : un lien partagé s'ouvre des deux côtés.
- **Le rail passe en bas**, fixe, pictogrammes seuls, badges conservés (journal, télégraphe).
  Les entrées qui ouvrent une surface d'ordre (industrie, abaque si elle mène à un ordre) sont
  **retirées, pas grisées** (ADR 0015, même règle qu'au bureau pour un défait).
- **Le bandeau des ressources** tient sur une ligne défilante horizontalement, ou deux lignes
  de quatre — au choix du rendu, mais lisible sans zoom.
- **La carte** : `WorldMap` se monte, orbite et zoom au doigt (OrbitControls gère déjà le
  tactile — vérifier `touches`), survol inexistant donc pas d'infobulle ; le tap sur une troupe
  ou un mât **n'ouvre rien** ; aucune rose. « À faire maintenant » ne se rend pas sous le seuil
  (chaque ligne mène à un ordre).
- **Le salon et l'accueil** : vérifier qu'ils tiennent déjà ; corriger ce qui déborde, sans
  refonte.

## Ce qui ne change pas

Aucune mutation nouvelle, aucun champ, aucune règle. Le serveur ne sait pas qu'un client est
étroit. Pas de service worker, pas de notification (proposition 20, non tranchée).

## Cas d'acceptation

1. iPhone SE (375 px) : connexion → accueil → salon → plateau sans débordement horizontal.
2. Plateau : rail en bas ; tap « journal » ouvre le journal plein écran ; fermer revient à la
   carte ; l'URL porte `windows=journal` comme au bureau.
3. Télégraphe plein écran : lecture, écriture, badge, sans que le clavier virtuel masque le
   champ.
4. Presse et Nation lisibles sans zoom ; les tableaux passent en liste ou défilent
   horizontalement, jamais coupés.
5. Carte : orbite et zoom à deux doigts ; tap sur une pile posée → rien ; aucun long-press ne
   fait apparaître de rose.
6. Au-dessus du seuil, rien n'a bougé : captures avant/après identiques sur les fenêtres du
   bureau.
7. Vérifieur vert.
