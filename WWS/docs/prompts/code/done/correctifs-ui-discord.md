# correctifs-ui-discord — télégraphe à défilement borné, caméra à l'aplomb

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Ne commit pas, ne push pas. Suppose
`portee-servie-entiere` livré. Deux correctifs d'écran, un commit. Rien de règle ici.

Source : `WWS/docs/rapports/2026-09-15-retours-discord.md`, lignes 3 et 4.

## 1. Le télégraphe grandit avec les messages au lieu de défiler

Symptôme (Pierre) : la fenêtre du télégraphe s'agrandit avec le nombre de messages ; il faut une
boîte à défilement de taille stable.

Ce qui existe : `TelegraphThread.tsx:72-73` pose déjà `overflow-auto` et `maxHeight: 420` quand
`height` est un nombre, `min-h-0 flex-1 overflow-auto` quand il vaut `'fill'`
(`TelegraphWindow.tsx:53`, dès que la fenêtre a été redimensionnée). **Reproduis avant de
toucher** : ouvrir le télégraphe sur une partie de plus de 30 messages, avant et après un
redimensionnement, et dire dans quel cas la fenêtre grandit. Pistes, sans préjuger :
`FloatingWindow` sans hauteur bornée en mode `'fill'` (le `flex-1` remplit une fenêtre qui
grandit elle-même) ; le champ de saisie hors du calcul ; le salon (`TelegraphThread` posé à
demeure, autre cadre) qui n'a pas le même symptôme et sert de témoin.

Attendu : la liste défile dans un cadre de hauteur stable, collée au dernier message à l'arrivée
d'un nouveau **sauf si le lecteur a remonté** (le comportement actuel `scrollTop = scrollHeight`
à la ligne 55 ramène brutalement en bas — vérifier qu'il ne le fait que si on y était). Même
style de barre que `confort-libelles-et-scrollbars` (done).

## 2. La caméra accepte l'aplomb

Retour d'Abdul : il veut voir la carte perpendiculairement. `src/map/engine/index.ts:242`,
`minPolarAngle = 0.3` (≈ 17°). Passer à `0.05`. Les billboards sont déjà prévus pour se
coucher sur le plateau quand la caméra passe à la verticale (`billboard.ts`, lacet + tangage
pivoté sur le pied) — **vérifie à l'œil**, capture à l'appui dans le compte rendu : pions,
mâts de bâtiments, étiquettes HTML, fils de mouvement à 0.05 rad, au zoom pays et au zoom
région. Si quelque chose s'écrase ou clignote (z-fighting des accessoires de terrain, étiquettes
qui se recouvrent), le dire plutôt que de bricoler un cas particulier : la borne remonte alors
au plus petit angle propre, et le chiffre est justifié dans le commentaire.

## Cas d'acceptation

1. Télégraphe, 50 messages, fenêtre non redimensionnée : hauteur inchangée entre 10 et 50
   messages, liste défilante, dernier message visible à l'ouverture.
2. Idem après redimensionnement de la fenêtre : la liste remplit la fenêtre, la fenêtre ne
   grandit pas d'elle-même.
3. Lecteur remonté de trois écrans, nouveau message reçu : la position ne bouge pas.
4. Caméra : la molette / l'orbite atteint l'aplomb ; le clic gauche et le clic droit visent
   juste (raycast) à cet angle — un mouvement s'ordonne depuis la vue verticale.
5. Vérifieur vert.
