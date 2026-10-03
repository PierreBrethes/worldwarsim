---
type: prompt
statut: validé
maj: 2026-10-03
code: [src/routes/index.tsx, src/routes/connexion.tsx, src/routes/rejoindre.$code.tsx, src/shell/Newspaper.tsx, src/shell/Masthead.tsx, src/shell/FilmTrailer.tsx, src/i18n/fr.ts]
decisions: [accueil-2a-2026-10-03, marque-1c-2026-10-02]
voir: [../../design/page-d-accueil.md, ../../../marque/marque-et-site.md, ../done/film-sur-les-pages-d-entree.md, ../../../rapports/2026-10-03-releve-mobile.md]
---
# page-d-accueil-la-une — `/` sans session devient la une du journal

**En bref.** La maquette **2a « la une sur le bureau »** (Claude design, retenue le 03/10/2026)
devient la page `/` d'un visiteur sans session. Version entre amis (marque-1c) : pas d'inscription
publique, pas de référencement. Connexion et invitation reprennent la même feuille, ce qui règle
leurs débordements sur téléphone (cause C3 du relevé mobile).

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0016, le README de la charte
(`Claude outputs/marque/charte-claude-design/la-manchette-charte.md`), le prompt de design
`WWS/docs/prompts/design/page-d-accueil.md`, et regarde la maquette
`Claude outputs/marque/accueil/maquette-2a-la-une-sur-le-bureau.png` (téléphone 390 × 844 à
gauche, bureau 1440 × 900 à droite). Ne commit pas, ne push pas. Un chantier, un commit.

## 1. La route

- `/` **avec** session : comme aujourd'hui (vers `/accueil`).
- `/` **sans** session : la une. Elle se charge sans three.js (la séparation des routes existe
  déjà : vérifie qu'elle tient).

## 2. La une, d'après la maquette

Sur le bureau sombre (la boucle en fond flouté, ou `board-backdrop.jpg` comme aujourd'hui), une
feuille de journal posée, une pile dessous (`shadow-pile`) :

1. Manchette (`Wordmark` / `Masthead`), filets, ligne de date : « le monde en jeu — édition de
   guerre » et **la date du jour** (« samedi 3 octobre 2026 » ; sur téléphone « sam. 3 oct. »).
2. La boucle (`/media/la-manchette-boucle-8s.mp4`, poster `/media/la-manchette-boucle-poster.jpg`)
   en photo de une : `autoplay muted loop playsinline`, poster seul sous
   `prefers-reduced-motion`. Légende en italique : « Le plateau, à l'encre : des forces se
   déplacent sur la carte du monde. » Le bouton « voir le film (30 s) » posé dans son coin ouvre
   le film comme le fait déjà la page de connexion (`FilmTrailer`).
3. Le titre « Sept jours pour refaire le monde », puis le chapeau « Stratégie entre amis sur une
   carte du monde réel : 2 à 8 joueurs, une saison de sept jours. »
4. L'encadré **« Sur invitation »** (tampon en tête) :
   - « J'ai un code d'invitation » : **un seul champ** de six caractères, dessiné comme six cases
     (police mono, interlettrage, fond en cases). Pas six champs : coller, la saisie automatique
     et la correction doivent marcher comme dans n'importe quel champ. `maxlength=6`,
     `autocapitalize="characters"`, `autocomplete="off"`, `spellcheck="false"`, police ≥ 16 px.
     Entrée ou « ouvrir » mène à `/rejoindre/<CODE>` ; c'est cette page qui refuse un mauvais code.
     « ouvrir » reste grisé tant qu'il n'y a pas six caractères.
   - « Déjà un compte ? » et « se connecter » → `/connexion`, avec la page qui tourne autour du
     pli gauche (`page-turn-out` / `page-turn-in`), jamais un fondu.
5. Trois brèves en colonnes (empilées sur téléphone), sur-titres « la saison », « la nation »,
   « les ordres », textes de la maquette.

**Sur téléphone** : l'ordre de lecture est celui de la maquette ; une **barre collée en bas**
porte « j'ai un code » (fait défiler jusqu'à l'encadré et met le focus dans le champ) et « se
connecter ». Elle se retire quand l'encadré est à l'écran (`IntersectionObserver`) et respecte
`env(safe-area-inset-bottom)`.

Tous les textes dans `fr.ts`. Typographie française (espaces insécables, « »).

## 3. La même feuille pour connexion et invitation

Extrais la feuille (largeur au conteneur, marges, pile, ombre) en un composant partagé. Connexion
et invitation gardent leur contenu et leur boucle derrière, mais prennent ses mesures : sous
768 px, plus de marge fixe de 30 px, l'enseigne et les boutons tiennent dans le cadre (relevé :
enseigne rognée de 97 à 109 px, boutons sortis de ~40 px). Accueil et salon ne changent pas dans
ce lot : ils seront redessinés avec le reste du mobile.

## 4. Ce qu'on ne fait pas

Pas d'inscription sans code, pas de `robots`/sitemap/balises de référencement nouvelles, pas de
mentions légales (marque-1c). Pas de capture de l'interface de jeu.

## 5. Vérification

- Tests de la route : sans session → la une ; avec → `/accueil` ; code de six caractères → bonne
  adresse ; moins de six → « ouvrir » inactif.
- Captures Playwright (même outil que le relevé : `Claude outputs/releve-mobile/`) de `/`,
  `/connexion` et `/rejoindre/<code>` sur iPhone 13, iPhone SE, Pixel 7 et bureau 1440 × 900 :
  aucun débordement, aucune cible sous 44 px, champ à 16 px. Mets-les côte à côte avec la
  maquette dans ton compte rendu.
- `npm run verifier` complet.
