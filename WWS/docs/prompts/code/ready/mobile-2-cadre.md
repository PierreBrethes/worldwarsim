---
type: prompt
statut: validé
maj: 2026-10-04
code: [src/shell/SurfaceRail.tsx, src/shell/ResourceBand.tsx, src/routes/-plateau/NextActions.tsx, src/routes/-plateau/Window.tsx, src/routes/-plateau/Panel.tsx, src/routes/plateau.tsx, src/i18n/fr.ts]
decisions: [mobile-1c-2026-10-03, mobile-piste-a-2026-10-03]
voir: [../done/mobile-1-socle-tactile.md, ../../design/plateau-sur-telephone-2.md, ../../../rapports/2026-10-03-releve-mobile.md]
---
# mobile-2-cadre — la barre de pied, le bandeau, les feuilles

**En bref.** Deuxième lot de la refonte mobile, après `mobile-1-socle-tactile`. Il pose le cadre
de la piste A « le pied de page » (passe 2, retenue le 03-04/10/2026) sous 768 px : barre de pied,
étage « plus », calques, bandeau repliable, feuilles basses, fenêtres. Rose, fiche, garnison, visée
et arrivée depuis une notification viennent au lot 3 ; la carte lisible au lot 4. **Au-dessus de
768 px, rien ne change.**

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/design/11-brief-ui.md` §5, le
rapport `WWS/docs/rapports/2026-10-03-releve-mobile.md`, et **regarde les maquettes** :
`Claude outputs/marque/plateau-mobile/passe-2-a-barre-et-bandeau.png` (A1 à A5, la référence de ce
lot) et `piste-a-2-entrees-presse-telegraphe-attaque.png` (A5 presse et A5 bis télégraphe ; ignore
A4 « autres entrées » et A6 attaque, remplacés). Ne commit pas, ne push pas. Un chantier, un commit.

## 1. La barre de pied (remplace le rail sous 768 px)

- Cinq entrées, dans cet ordre : **à faire** (compte, en encre pleine quand il y a quelque chose),
  **journal** (compte), **télégraphe** (compte), **presse** (rang), **plus**. Libellés en capitales,
  cibles d'au moins 44 px, `env(safe-area-inset-bottom)` respecté.
- **« Plus » ajoute un étage** au-dessus de la barre : nation, économie, abaque de tir, réglages,
  calques. Toucher « plus » à nouveau le replie ; ouvrir une autre entrée aussi.
- **« Calques »** ouvre une feuille basse « Calques de la carte » avec les huit bascules du rail
  actuel en cases de 44 px, deux colonnes. L'étage reste ouvert dessous.
- Les comptes et états viennent des mêmes sources que les badges du rail d'aujourd'hui : rien de
  recalculé.

## 2. Le bandeau des ressources

- Huit colonnes : abréviation de trois lettres, stock, tendance (▲ ▼ –). Au-dessus, la ligne nation
  + « mouvements n / total » (`movementSlots`, déjà servi).
- **Repliable** par une poignée de 44 px sous le bandeau : replié, il ne reste que la ligne nation
  et mouvements. Un toucher sur cette ligne ou la poignée le rouvre. L'état se garde dans le
  réglage existant du bandeau s'il y en a un, sinon dans `localStorage` (try/catch).
- Le détail d'une ressource s'ouvre au toucher (jamais au survol, M1).

## 3. Les feuilles basses

Un seul composant de feuille sous 768 px, qui remplace `Panel` en feuille et sert aussi à « à
faire », aux calques et (au lot 3) à la fiche :
- trois hauteurs : aperçu, moitié, plein écran ; poignée visible ; glisser vers le bas descend
  d'un cran puis ferme ; bouton « fermer » toujours là ;
- **une seule surface ouverte à la fois** (feuille ou fenêtre) : en ouvrir une ferme l'autre ;
- quand une feuille couvre un point qu'elle concerne (garnison, au lot 3), la carte se recale pour
  le garder visible au-dessus.

## 4. « À faire » en feuille

La carte « à faire maintenant » quitte la carte : elle devient la feuille ouverte par l'entrée « à
faire » (A5). Chaque ligne mène à la carte ou à la surface concernée, comme aujourd'hui. Quand rien
n'attend, l'entrée reste mais sans compte.

## 5. Les fenêtres

Les huit fenêtres restent en plein écran (lot du 15/09), mais **sous le bandeau et au-dessus de
la barre**, avec la poignée et « fermer » de la maquette. La presse et le télégraphe suivent A5 et
A5 bis : au télégraphe, le champ et « envoyer » montent au-dessus du clavier, les canaux restent en
tête, texte saisi en 17 px.

## 6. Accueil et salon, et `hud-fit`

- **`hud-fit` ne marche plus** (constat du lot de la une, 04/10) : il suppose que `zoom` multiplie
  les pourcentages, ce que Chromium 153 et WebKit 26 ne font plus ; une feuille d'iPhone 13
  faisait 298 px sur 358. Sous 768 px, plus aucune surface ne passe par `hud-fit` : la feuille de
  la une (`EntrySheet`, `fit="container"`) sert de modèle.
- **Accueil et salon** (débordements mesurés au relevé, cause C3) prennent ces mesures sous
  768 px : enseigne, code et boutons « copier » dans le cadre, cibles de 44 px, champ de l'heure de
  repos à 16 px.
- Au-dessus de 768 px, `hud-fit` ne change pas dans ce lot : voir le lot suivant.

## 7. Hors périmètre

Rose des vents, fiche, panneau de garnison, visée, panneaux construction et sol, arrivée depuis une
notification (lot 3) ; taille des troupes, drapeau d'arrivée, cartouches (lot 4).

## 8. Vérification

- Tests des composants : barre (cinq entrées, étage plus), bandeau (replié/déplié), feuille (trois
  hauteurs, une seule surface ouverte).
- Relance le relevé (`Claude outputs/releve-mobile/releve.mjs`) sur les trois appareils : plus
  aucun bouton coupé par le bord, aucune cible sous 44 px dans la barre, le bandeau et les feuilles,
  la carte à au moins 70 % de la hauteur au repos. Captures à côté des maquettes dans le compte
  rendu.
- Au-dessus de 768 px : captures avant/après identiques.
- `npm run verifier` complet.
