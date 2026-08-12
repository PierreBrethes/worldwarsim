# Handoff : interface de saison — design system

## Vue d'ensemble

Jeu de stratégie web asynchrone, carte du monde réel, esthétique presse illustrée 1940.
Ce paquet documente le **système visuel** et les **trois surfaces critiques** maquettées en haute
fidélité : le plateau (4.4) avec ses panneaux d'angle, le journal d'événements (4.1) en une de
journal, la liste des mouvements (4.2) et l'envoi d'un mouvement (4.3).

Le brief produit du jeu est [11 — Brief UI](../docs/design/11-brief-ui.md). Il fait autorité sur les règles, le
vocabulaire imposé et les pièges. Ce README fait autorité sur les valeurs visuelles.

## À propos des fichiers de design

`Interface de saison.dc.html` est une **référence de design écrite en HTML** : un prototype qui
montre l'apparence et le comportement voulus, pas du code de production à copier. Le travail
consiste à **recréer ces écrans dans l'environnement du codebase cible** (React, Vue, Svelte…) avec
ses patterns établis. Si aucun environnement n'existe encore, choisir le framework adapté au projet
et y implémenter les écrans.

Le prototype utilise des styles inline et un petit runtime de composant : ne pas reprendre cette
mécanique, seulement les valeurs, la structure et le comportement.

## Fidélité

**Haute fidélité.** Couleurs, typographie, graisses, tailles, filets et espacements sont finaux et
doivent être reproduits au pixel. Les données affichées sont fictives et illustratives.

Le plateau lui-même est un **placeholder encadré** dans la maquette : le prototype de carte existe
déjà côté jeu et n'est pas à recréer depuis ce paquet.

---

## Design tokens

### Couleurs — surfaces

| Token | Hex | Usage |
|---|---|---|
| `desk` | `#171208` | fond, bandeau supérieur, rail |
| `paper` | `#e4d8bd` | toute surface panneau / modale |
| `ink` | `#2a2118` | texte principal, filets forts, boutons pleins |
| `ink-soft` | `#5f5039` | texte secondaire, libellés |
| `ink-quiet` | `#4a4436` | filets sur fond sombre, chapô italique |
| `paper-dim` | `#8d7f6a` | libellés sur fond sombre |
| `paper-dim-2` | `#a9968f` | texte tertiaire sur fond sombre |
| `sea` | `#a9c5cd` | aplat mer du plateau |
| `sea-ink` | `#2c5063` | trame et isobathes |
| `sea-shade` | `#3f6b7c` | ombré côtier, filets pointillés sur mer |
| `land` | `#d5c5a0` | terre neutre |
| `border-world` | `#6b4a24` | bordure du monde |
| `plinth` | `#c7b48e` → `#5f5039` | tranche du socle, bande de 14 px en bas du plateau |

### Couleurs — encres de nation (jamais saturées)

France `#3f5a7d` · Royaume-Uni `#4a4f7a` · États-Unis `#4a7060` · URSS `#9d4638` ·
Allemagne `#6e6a5e` · Japon `#a44a5e` · Italie `#a86c4a` · Chine `#b07434`

### Couleurs — sémantique

| Rôle | Hex | Usage |
|---|---|---|
| critique | `#9d4638` | pastille de gravité, bordure d'avertissement, kicker |
| notable | `#b07434` | pastille de gravité, débits horaires positifs, état d'un pouvoir |
| routine | `#6e6a5e` | pastille de gravité, arcs périmés |
| interaction | `#3f5a7d` | survol des boutons pleins, cap sélectionné, liens |

Aucune ombre portée, aucun dégradé lisse (exception unique : la tranche du socle), aucun néon,
aucun rayon de bordure — **tous les angles sont vifs, `border-radius: 0` partout**.

### Typographie

| Rôle | Famille | Réglages |
|---|---|---|
| Titrage | **Bodoni Moda** (Google Fonts, opsz 6..96, 400/600/800 + italique) | titres de panneau 16–22 px / 800 / letter-spacing .02em ; bloc-titre du journal 54 px / 800 / .06em ; titre de dépêche 38 px / 800 / line-height 1.02 ; chapô italique 16 px |
| Texte courant | **Archivo Narrow** (400/500/600/700 + italique) | corps 13–14 px / line-height 1.35–1.55 ; secondaire 11.5–12.5 px |
| Chiffres et horaires | **IBM Plex Mono** (400/500) | 11–14 px, tous les compteurs, durées, horaires |

`font-variant-numeric: tabular-nums` sur `body`, sans exception : la moitié de l'UI est faite de
compteurs qui défilent.

**Libellés (eyebrow)** — le motif le plus fréquent du système :
`font-size: 9–10px; letter-spacing: .16–.22em; text-transform: uppercase; color: ink-soft`
(sur fond sombre : `paper-dim`).

### Échelle d'espacement

Multiples de 1 px effectifs mais valeurs réellement employées : `4 · 5 · 6 · 7 · 8 · 9 · 10 · 11 ·
12 · 13 · 14 · 16 · 18 · 20 · 22 · 26 · 30`. Padding de panneau `11–14px 12–18px`. Gouttière entre
groupes du bandeau `20–26px`. Panneaux d'angle décollés de `16px` des bords du plateau.

### Filets

| Poids | Valeur | Usage |
|---|---|---|
| fort | `1px solid #2a2118` | contour de panneau, séparation d'en-tête |
| double | `2px solid #2a2118` | filets d'encadrement du bloc-titre et du pied de journal |
| moyen | `1px solid rgba(42,33,24,.3–.35)` | séparation de section dans un panneau, filet de colonne |
| léger | `1px solid rgba(42,33,24,.14–.22)` | séparation de ligne de liste |
| sombre | `1px solid #4a4436` | séparations sur `desk` |

### Traitements imprimés

```css
/* trame de similigravure — toute surface qui doit lire comme du papier */
background-image: repeating-linear-gradient(45deg, rgba(42,33,24,.055) 0 1px, transparent 1px 5px);

/* graticule + trame du plateau */
background-image:
  repeating-linear-gradient(0deg,  rgba(74,68,54,.22) 0 1px, transparent 1px 84px),
  repeating-linear-gradient(90deg, rgba(74,68,54,.22) 0 1px, transparent 1px 84px),
  repeating-linear-gradient(45deg, rgba(44,80,99,.10) 0 1px, transparent 1px 5px);

/* grain d'impression — overlay plein écran, non cliquable */
position: fixed; inset: 0; pointer-events: none;
mix-blend-mode: overlay; opacity: .2;
background-size: 160px 160px;
background-image: url("data:image/svg+xml,<svg …><filter id='n'><feTurbulence
  type='fractalNoise' baseFrequency='0.8' numOctaves='3'/></filter>
  <rect width='160' height='160' filter='url(%23n)'/></svg>");
```

Le vignettage radial (opacité .5) décrit au brief est **volontairement absent de l'UI** : il écrase
les panneaux. Il reste réservé au plateau.

### La règle non négociable

> Le budget de contraste appartient à la couche de jeu.

L'UI est papier désaturé et encre. Les encres de nation, les arcs, les avant-postes et les alertes
sont les seules taches de couleur. Toute nouvelle surface doit se plier à cette règle.

---

## Composants

### Bandeau nation — `height: 58px`, fond `desk`, filet bas `#4a4436`

Rangée flex de groupes séparés par des filets verticaux, chacun `flex: 0 0 auto`,
`white-space: nowrap`, la rangée en `min-width: max-content`. Les compteurs ne doivent **jamais**
être tronqués : sous la largeur intrinsèque, le shell défile horizontalement.

Groupes, dans l'ordre : encre + nom de nation + doctrine · trois ressources avec débit horaire ·
slots de mouvement · *(flex spacer)* · bouton journal avec compte non lu · plage de repos + fin de
saison.

**Ressource** : eyebrow 9 px, valeur 17 px / 600, débit 11 px en `notable`. Les effectifs affichent
`412 / 520 plafond` — le plafond est visible en permanence, ils ne sont pas achetables.

**Slots** : eyebrow sur deux lignes (max-width 52 px) + 5 rectangles `11×22px`, remplis
`#3f5a7d` bordés `paper` quand engagés, contour `#6b6252` sinon, puis lecture `3 / 5` en 15 px / 600.
Les slots sont l'information la plus consultée du jeu : ils apparaissent sur tous les écrans.

### Rail des surfaces — `flex: 0 0 52px`, fond `desk`

Neuf boutons `4.1` → `4.9`, hauteur 38 px, IBM Plex Mono 11 px. Actif : fond `paper`, texte `ink`,
liseré gauche `2px solid #b07434`. Inactif : transparent, texte `paper-dim`. Numéro de saison en
bas, 9 px, `#6b6252`.

### Panneau (motif générique)

Fond `paper` + trame 45°, contour `1px solid ink`, en-tête `padding: 8–9px 12–13px` avec eyebrow à
gauche et repère discret à droite, filet bas fort, corps `padding: 10–12px 12–13px`.
Sur le plateau, positionné en absolu à `16px` des bords ; le panneau bas est à `bottom: 26px` pour
dégager la tranche du socle.

### Bouton

| Variante | Style |
|---|---|
| plein | fond `ink`, texte `paper`, `padding: 9–15px`, 10–12 px, letter-spacing .16–.22em, uppercase ; survol fond `#3f5a7d` |
| contour | fond transparent, contour `1px solid ink`, texte `ink` ; survol inverse (fond `ink`, texte `paper`) |
| pastille de type | contour, alignée à gauche, `padding: 8px 6px`, 11 px, `.1em` ; sélectionnée = pleine |
| cap | contour, `padding: 9px 4px`, 12 px ; sélectionné fond `#3f5a7d` texte `paper` |
| pas / stepper | `24×24px`, contour, 14 px, `–` et `+` |
| rejeu | contour, 9–10 px, `padding: 4px 8–9px` |

Aucun bouton n'a de rayon, d'ombre ni de transition colorée autre que le survol.

### Ligne de liste (mouvements)

`padding: 11px 18px`, filet léger en bas. Rangée 1 : pastille d'encre `9×9px` (opacité selon l'état)
+ eyebrow d'état + filet extensible + horaire mono 12.5 px. Rangée 2 : type 15 px / 600 (opacité
réduite si inconnu) + route 13 px `ink-soft`. Rangée 3 : composition et cap, 12 px `ink-soft`.

### Une de journal (4.1)

Modale `1040px` max, `padding: 26px 30px 20px`, papier + trame.
Structure : ligne d'édition (édition / saison / fermer, 10 px uppercase) → bloc-titre encadré
`border-top: 2px` / `border-bottom: 1px` avec titre 54 px et ligne de crédits séparée par des points
médians `#9d8f78` → tête d'affiche (kicker `critique — 06:12`, titre 38 px, chapô italique 16 px,
corps en `column-count: 2` avec `column-rule: 1px solid rgba(42,33,24,.25)`, bouton rejeu) +
colonne latérale `232px` « au réveil » séparée par un filet moyen → trois colonnes de dépêches
`flex: 1`, `padding: 0 18px`, `border-left` moyen, chaque dépêche : horaire mono 11 px, titre Bodoni
16 px / 600, méta 12 px → pied `border-top: 2px` avec lien historique, note italique, bouton retour.

---

## Écrans

### 4.4 — Plateau *(état de base)*

Ce que le joueur voit en arrivant sur le jeu. Bandeau, rail, plateau plein cadre, quatre panneaux
d'angle, aucun bandeau central ne recouvre la carte.

- haut-gauche `250px` — **ma nation** (raccourci 4.5) : armée présente / en transit, avant-postes,
  file de chantier, puis pouvoir national énoncé comme une règle brisée avec son état
- haut-droite `308px` — **panneau contextuel**, dépend de la cible sélectionnée. Version montrée :
  pays neutre — capacité d'échange restante, relation par joueur (barre `96×6px` à l'encre du
  joueur), avant-postes présents, agents relevés, deux actions
- bas-gauche `250px` — **compteurs** : prochaine arrivée, immunité post-raid, doctrine gelée,
  immobilisés → repos. Toutes en mono
- bas-droite — **légende des états d'arc** : mien, adverse détecté, dernière position connue,
  maîtrise des mers (trait dont les extrémités s'effacent, `linear-gradient` transparent aux bouts)

### 4.1 — Journal d'événements *(modale)*

Répond à « qu'est-ce qui a changé depuis la dernière fois ? », lisible en dix secondes, groupé par
gravité. La dépêche la plus grave prend la tête d'affiche ; l'encadré « au réveil » porte
l'information découverte au réveil : mouvements immobilisés par la plage de repos et **l'heure de
résolution**. Les entrées lues basculent dans l'historique, **rejeu compris**.

### 4.2 — Mouvements en cours *(colonne 430px)*

En-tête `MOUVEMENTS EN COURS` + rappel des slots. Cinq états visuels distincts :

| État | Visible | Encre / opacité |
|---|---|---|
| mien | type, composition, origine, destination, cap, arrivée | encre pleine |
| adverse détecté | arc, cap, horaire estimé — **jamais le type ni la composition** | `#9d4638` à .85, type à .45 |
| dernière position connue | arc figé, horodaté « vu il y a X » | `#6e6a5e` à .45, type à .35 |
| maîtrise des mers (RU) | arc maritime sans origine ni destination | `#4a4f7a` à .7, extrémités effacées |

### 4.3 — Envoi d'un mouvement *(modale 940px)*

En-tête sur fond `ink` : titre + coût en slot + fermer. Trois colonnes : type (224 px) ·
composition et cap (flex) · destination et confirmation (292 px).
La confirmation porte durée estimée, arrivée, traversée de l'antiméridien, coût, un encadré
`1px solid #9d4638` si l'arrivée tombe dans la plage de repos publique de la cible, et le bouton
final libellé **« envoyer — irréversible »**.

---

## Interactions et comportement

- Rail `4.1` ouvre la modale journal · `4.2` déploie la colonne des mouvements · `4.3` ouvre la
  modale d'envoi (et déploie la colonne) · `4.4` revient au plateau nu. Un seul overlay à la fois.
- Bouton journal du bandeau : ouvre 4.1, ferme 4.3.
- Steppers de composition : bornés à `0` et au stock à domicile du rôle ; le reste à domicile se
  recalcule à chaque incrément.
- Sélection du cap : met à jour la note explicative sous les boutons.
- Aucune animation, aucune transition d'entrée. Le seul feedback est le survol (fond `ink` → `#3f5a7d`,
  ou inversion contour → plein).
- Fermeture d'une modale : bouton `fermer`, `annuler`, ou `retour au plateau`. À implémenter en plus :
  `Échap`, et piège de focus dans la modale.
- Responsive : sous la largeur intrinsèque du bandeau, défilement horizontal — jamais de compression
  des compteurs. Le brief demande une déclinaison mobile pour 4.1, 4.2 et 4.3 uniquement, navigable
  **sans passer par la carte** ; elle n'est pas encore maquettée.

## État

```
view          : "carte" | "moves"
journalOpen   : bool
sendOpen      : bool
type          : "attaque" | "raid d'avant-poste" | "fondation d'avant-poste" | "agent" | "leurre"
cap           : "N" | "E" | "S" | "O"
counts        : { inf, bli, esc, cha, car }   // bornés par le stock à domicile
```

Données réelles attendues côté serveur : journal paginé par gravité avec drapeau lu/non lu et
référence de rejeu ; liste des mouvements **déjà filtrée serveur** ; stocks, débits, plafond
d'effectifs, slots ; état de la cible sélectionnée.

## Pièges — à ne pas contourner

1. **Le filtrage du brouillard se fait côté serveur.** Ne jamais envoyer au client ce que le joueur
   n'a pas le droit de voir : un filtrage client se contourne en trois lignes de console.
2. **Jamais le type d'un mouvement adverse.** Le leurre n'a d'intérêt que s'il est indiscernable
   d'un mouvement réel. Afficher « leurre » détruit la mécanique.
3. **Le rejeu de bataille n'a aucun bouton qui agit sur l'issue.** Le combat est résolu avant d'être
   affiché.
4. **Ne pas cacher les compteurs.** Les durées sont le contenu, pas de la plomberie.
5. **Vocabulaire imposé** : mouvement (pas convoi / flotte / envoi), passe de résolution (pas tour
   de combat), avant-poste désactivé ou détruit (jamais pris / capturé), journal d'événements (pas
   feed / rapport), slot de mouvement (pas action / ordre). Bannis : tick, temps réel, micro, base,
   rush.
6. **Aucune couche sociale.** Pas de chat, pas de guilde, pas de classement.

## Assets

Aucune image. Trois polices Google Fonts (Bodoni Moda, Archivo Narrow, IBM Plex Mono) et un grain
`feTurbulence` en data-URI SVG. Les silhouettes d'unités décrites au brief §4.6 (esprit planches de
reconnaissance, encre unique, à plat) restent à produire — elles ne sont pas dans ce paquet.

## Fichiers

| Fichier | Contenu |
|---|---|
| `Interface de saison.dc.html` | la maquette haute fidélité, ouvrable dans un navigateur |
| `Icônes ressources.dc.html` | les trois icônes de ressources, leurs teintes et leurs règles d'emploi — **implémenté** |
| `Drapeaux bandeau.dc.html` | drapeaux CSS repalettés, trois traitements — **implémenté** (cartouche) |
| `Sprite soldat.dc.html` | silhouettes d'unités — pas encore implémenté |
| `tokens.css` | les tokens en propriétés personnalisées CSS |
| `tokens.json` | les mêmes tokens en JSON, pour un thème JS / Tailwind |
| [`../docs/design/11-brief-ui.md`](../docs/design/11-brief-ui.md) | brief produit d'origine : règles, inventaire des écrans, vocabulaire |
| `Wireframes-selection.png` | les wireframes basse fidélité dont dérive la maquette |
| `screenshots/4.4-plateau.png` | interface de base : plateau et panneaux d'angle |
| `screenshots/4.1-journal.png` | journal d'événements en une de journal |
| `screenshots/4.2-mouvements.png` | colonne des mouvements en cours, cinq états d'affichage |
| `screenshots/4.3-envoi.png` | envoi d'un mouvement |

Les captures sont prises à échelle réduite pour montrer la mise en page complète ; les valeurs de
taille font foi sur les captures.
