# Prompt Claude Code — construire sur une région depuis la rose des vents

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, l'[ADR 0013](../../adr/0013-batiments-de-projection-sur-regions.md),
l'[ADR 0015](../../adr/0015-economie-v2-ressources-localisees.md) et la fiche
[02 — Économie](../../design/02-economie.md). Ne commit pas, ne push pas.

**Prérequis : `back-ressources-et-batiments.md` est passé.** Les quinze bâtiments localisés et
les huit ressources existent côté serveur, avec leurs contraintes de pose. Ce prompt ne fait que
les rendre atteignables à la souris. Sans le back, arrête-toi.

**Lis `WWS/docs/design/11-brief-ui.md` avant de dessiner quoi que ce soit.** Cette surface n'y est
probablement pas spécifiée — c'est la première fois qu'on construit sur une région. Si elle est
absente, **dis-le-moi** et propose plutôt que d'inventer en silence.

## Le principe, avant tout le reste

**On ne pose pas un bâtiment depuis une liste, parce qu'une liste n'a pas de géographie.**
Construire, c'est choisir un endroit ; ça se fait donc sur la carte, et nulle part ailleurs.

D'où le partage, une seule fois pour toutes :

| Surface | Verbe | Question à laquelle elle répond |
|---|---|---|
| **La carte**, au clic droit | **poser** | *où ?* |
| **La fenêtre Nation** | **améliorer** et **retrouver** | *qu'est-ce que j'ai ?* |

Un verbe par surface. Si les deux font les deux, il y a deux chemins pour tout et le joueur ne
sait jamais où aller.

**Conséquence immédiate dans ce prompt** : l'écran de construction minimal ajouté à
`NationWindow` par la passe précédente — la liste de toutes les régions utilisables et ses
boutons « bâtir » — **disparaît ici**. Il était un dépannage explicite, il a fait son travail. Ne
laisse pas la fenêtre sans rien : ce qu'elle affiche des bâtiments possédés reste, seule la
capacité de construire s'en va. Sa refonte complète fait l'objet d'un prompt séparé.

## Étape 0 — le client ne peut pas encore savoir ce qu'il a le droit de bâtir

`placementRefusal` porte maintenant deux règles nouvelles : une bâtisse par région, et un plafond
global de bâtiments. La première est vérifiable côté client, la seconde **non** — `PlayerView` ne
sert ni le nombre de bâtiments debout ni le plafond, et `NationWindow` passe donc `cap: Infinity`,
avec un commentaire honnête : un plafond inconnu ne refuse rien, le serveur le tient.

C'est un trou dans le contrat de ce prompt. Un panneau qui ne connaît pas le plafond **proposera un
bâtiment que le serveur refusera**, et « rien de grisé, jamais » devient « rien de grisé, mais des
refus après le clic », ce qui est pire.

Commence donc par **servir le plafond dans `PlayerView`** : le nombre de bâtiments debout et le
plafond courant, tous deux dérivés du niveau du QG. Ce n'est pas une fuite — c'est la donnée du
joueur lui-même. Puis supprime le `cap: Infinity` de `NationWindow`, qui n'a plus de raison
d'être. Cette étape est courte, et rien de ce qui suit n'est correct sans elle.

## Contexte

La rose des vents est en place et bien faite. `CompassTarget` est une union discriminée
`country | outpost | force`, `compassOf(target, view)` rend les actions, et le plateau les câble
par `compassOf` / `onCompassAction`. Un pictogramme **`'crane'` est déjà déclaré et inutilisé**,
avec en commentaire : *« la grue attend l'économie v2 »*. Elle est arrivée.

Deux manques bloquent :

- **le clic droit vise un pays, jamais une région.** Or un bâtiment se pose sur une région ;
- **le survol de région ne remonte qu'un nom** (`onRegionHover: (name) => void`). Les gisements et
  les bâtiments sont indexés par l'`id` de `regions.json` (`adm1_code`), pas par le nom — et les
  noms admin-1 se répètent d'un pays à l'autre.

## Implémentation

1. **Le survol de région remonte une identité, pas une étiquette.** `onRegionHover` passe l'`id`,
   le nom et le pays. `RegionTooltip` continue d'afficher le nom ; le reste sert au ciblage. C'est
   la correction qui débloque tout le reste — sans `id`, rien ne peut se rattacher à une région.

2. **Une quatrième variante de cible** : `{ kind: 'region', id, name, country }`. Le clic droit
   vise **la région au zoom rapproché** — là où les régions apparaissent déjà en fondu, avec
   survol et infobulle — et **le pays au-delà**. Le seuil est celui qui existe déjà pour le fondu
   des régions : ne l'invente pas, réutilise-le, et nomme-le s'il est encore un littéral.

3. **Une troisième variante d'action** : `build`, pictogramme `'crane'`, qui porte l'`id` de la
   région. Elle n'apparaît que si le joueur peut réellement bâtir là — chez lui, ou dans le rayon
   d'un avant-poste à lui. **Rien de grisé, jamais** : sur une région adverse ou hors de portée, la
   grue n'est simplement pas dans l'éventail. C'est aussi la règle du brouillard : ce que le joueur
   ne peut pas faire ne lui apprend rien.

4. **Le panneau de construction**, ancré au point du clic. Il liste les bâtiments **réellement
   constructibles sur cette région**, calculés par la même règle que le serveur — surtout pas une
   seconde copie de la règle. Chaque ligne porte le nom, le coût en matières, la durée, et **la
   raison pour laquelle le bâtiment est proposé** quand elle existe : « gisement de charbon »,
   « région côtière ». C'est cette raison qui fait comprendre la carte au joueur.

   Le panneau affiche aussi ce qui est **déjà là** — un bâtiment posé et son niveau — parce que
   c'est la première question qu'on se pose en cliquant sur une région. **En lecture seule** :
   améliorer se fait depuis la fenêtre Nation, pas ici. Un bâtiment déjà posé ne réapparaît pas
   dans la liste des constructibles.

### « Rien de grisé, jamais » se précise ici

La règle protège contre un menu rempli d'options qu'on ne pourra **jamais** prendre — un mur de
gris à balayer pour trouver la seule ligne vivante. Elle ne dit rien d'un blocage **passager**,
qui est au contraire une information utile : reviens dans vingt minutes.

> **On cache ce qui est impossible par nature ; on montre et on explique ce qui est bloqué par
> circonstance.**

- **Impossible par nature** — un port à l'intérieur des terres, une mine sans gisement, un second
  QG : la ligne n'existe pas. Si *rien* n'est possible sur cette région, la grue n'est pas dans
  l'éventail.
- **Bloqué par circonstance** — un chantier déjà en cours, le plafond de bâtiments atteint, des
  matières insuffisantes : les lignes restent, **non cliquables**, et **la raison s'écrit une
  seule fois en tête du panneau**, jamais en quinze pastilles grises. Pour un chantier en cours,
  la raison porte son échéance ; pour le plafond, elle nomme le remède — le QG.

Le plafond atteint est le cas qui décide de la règle : la grue était là il y a cinq minutes. Si
elle disparaît en silence, le joueur croit à un bug. C'est aussi le seul endroit où il apprendra
que le QG est l'étranglement de tout.

   Réutilise `Window.tsx` ou `Panel.tsx` selon ce qui convient, et `ProductionWindow.tsx` comme
   modèle de mise en page — c'est la surface la plus proche. N'introduis pas un troisième modèle
   de fenêtre.

5. **Le clic sur une ligne lance le chantier** par la mutation existante, et le panneau se ferme.
   L'erreur typée du serveur s'affiche telle quelle : le client ne redit pas la règle, il montre ce
   que le serveur a répondu.

6. **Le calcul de constructibilité vit dans `src/domain/`**, en TypeScript pur, et il est **testé**.
   C'est exactement le genre de règle qui devra tourner à l'identique des deux côtés : le client
   pour n'afficher que le possible, le serveur pour refuser le reste. Une seule fonction, deux
   appelants.

7. **Optionnel, si le reste est propre** : quand le panneau est ouvert, la carte prend le curseur
   truelle — `public/cursors/curseur-construire.png`, **point actif `29 3`** (la pointe est en haut
   à *droite*, un `0 0` mettrait le point de clic à vingt-neuf pixels de la truelle). Un mot-clé de
   repli est obligatoire dans la déclaration CSS, sinon elle est invalide et silencieusement
   ignorée. Si ça déborde, laisse tomber et dis-le.

## Critères d'acceptation

- Clic droit sur une région à soi, au zoom rapproché : la grue est dans l'éventail ; au zoom
  éloigné, c'est le pays qui est visé, comme avant.
- Clic droit sur une région adverse : pas de grue, et l'éventail existant est inchangé.
- Le panneau ne propose une `mine` que sur une région à gisement, un `port` que sur une côte, et
  jamais un second `hq`.
- Une construction lancée depuis le panneau apparaît côté serveur et le panneau se ferme.
- Une règle refusée par le serveur affiche son erreur, sans que le client l'ait dupliquée.
- La fonction de constructibilité est dans `src/domain/`, sans import React ni Convex, et testée.
- `npm run build` et `npm run test` passent.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts` ; aucun terme banni.

## Ce que tu ne fais pas

Tu n'affiches pas les gisements sur la carte — ni pastilles, ni teinte, ni étiquettes : c'est une
surface à part, et elle mérite son propre brief. Tu ne touches pas au schéma serveur, aux
constantes d'équilibrage, aux troupes, ni au reste de la rose des vents : tu lui ajoutes une
branche, tu ne la réécris pas. Tu n'ajoutes aucun pictogramme — `'crane'` existe déjà, les onze
autres bâtiments n'en ont pas et ce panneau est en toutes lettres, pas en icônes.
