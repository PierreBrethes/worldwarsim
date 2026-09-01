# Contrat de vue — 03 · Modale de site de production

**Rôle en une phrase :** au **clic gauche** sur une caserne, un aérodrome ou un port de la
carte, une modale qui dit ce que **ce bâtiment-là** forme et tient — rien des autres sites,
rien des autres domaines.

**Décisions (01/09)** : 59a — la modale par bâtiment remplace l'onglet « prod. » général,
qui **disparaît du rail**. 60b — le catalogue des unités dont le bâtiment n'existe pas
déménage dans l'**abaque de tir** (contrat 06) : plus de section « bloqué : aucun
aérodrome » ici, cette surface n'existe que si le bâtiment existe. 61a — la modale
**absorbe la garnison** : composer une pile s'y fait, le clic sur le mât n'a plus qu'une
destination. Le mot « atelier » reste rejeté (55b).

## Ce que le serveur sert (source de chaque champ)

`convex/troops.ts:workshop` sert déjà tout par bâtiment — **aucun changement serveur**.

| Donnée | Source |
|---|---|
| Le site : domaine, région, niveau, file datée | `workshop.facilities[]` (filtré sur le bâtiment cliqué) |
| File du site : rôle, marque, effectif, commencé, minutes restantes | `facilities[].queue[]` |
| Cartes du domaine : coût alliage + minutes + effectif (MK1/MK2), QG requis du rôle | `workshop.grid[]` (filtré au domaine du site) |
| Plafond global, en service, en file | `workshop.troopCap`, `troopsInService`, `troopsQueued` |
| MK2 ouvert / seuil | `workshop.tier2Unlocked`, `requiredHqLevel` |
| Effectif possédé par rôle | `workshop.roster` |
| Stock d'alliage (les « x / y ») | `workshop.alloy` |
| Élévation de CE bâtiment | `view.ts:me.buildings[]` (`UpgradeControl`) |
| Garnison du site (61) : troupes stationnées ici, cochables | `view.ts:me.troops[]` (`stationedAt`), moins celles en mouvement (`movements[].troopIds`) |
| Places d'emport / allure d'une pile cochée | domaine : `liftOf`, `motorized` |

## P1 — d'un coup d'œil (liste fermée)

- **En-tête** : le bâtiment (« Caserne »), sa région, son **niveau**. C'est le kicker de la
  modale — elle parle d'un lieu, pas d'un système.
- **Les cartes du seul domaine du site** (3 pour la terre, 3 pour l'air, 3 pour la mer) :
  sprite national en grand, nom du rôle + équipement, **UN tampon** (« verrouillé — QG n »
  seulement), **LE chiffre : le coût en alliage**. *Identique à la v1 — les cartes
  survivent telles quelles.*
- **La rangée de cases du plafond** (en service / en file / libres, « plafond n troupes ») —
  global, répété dans chaque modale : un seul nombre, il borne tout choix de formation.

## P2 — au geste (liste fermée + geste)

- **Au pli sur une carte** : durée, effectif nominal, coût avec stock (« 18 / 320 »), fort
  contre / faible contre, sélecteur MK1/MK2 avec son seuil. *Identique à la v1.*
- **La file de CE site** : lots (sprite, rôle, marque, « en chaîne » / « en attente »,
  minutes restantes), borne x / 12. Jamais la file d'un autre site.
- **L'élévation de CE bâtiment** sur sa ligne d'en-tête (coût / stock / durée,
  `UpgradeControl`).
- **La garnison (61)** : les troupes stationnées ici — sprite, rôle + marque, effectif
  « 32 / 50 », ravitaillée — cochables pour composer une pile ; places d'emport
  offert / requis, allure motorisé / à pied, le refus dit **avant** la visée. Une troupe en
  mouvement n'apparaît pas.
- **Renvoi abaque** : « abaque de tir — qui bat qui » (lecture seule, contrat 06).

## P3 — ne s'affiche pas (et pourquoi)

- **Les autres sites et leurs files** — chacun a sa porte sur la carte ; le sélecteur de
  site est mort avec l'onglet.
- **Les domaines sans bâtiment et leur catalogue** — déménagés dans l'abaque (60b). Aucune
  section « bloqué », aucun grisé : la surface n'existe pas sans le bâtiment.
- Munitions (facturées à la passe, jamais au recrutement) · stock d'alliage isolé ·
  chiffres de la table de dégâts · `workshop.speed` — inchangés du contrat v1.

## Tampons possibles

- Carte de rôle : **« verrouillé — QG n »** (`grid[].unlockedAtHqLevel`) — le seul.
- Lot : **« en chaîne »** / **« en attente »** (`queue[].started`).
- Troupe de garnison : **ravitaillée / hors ravitaillement** (`troops[].supplied`).
- Plafond : cases pleines = au plafond (le refus serveur donne le remède chiffré :
  « bâtissez ou montez des baraquements »).

## Actions tolérées (impossibles sur la carte)

Former (`troops.recruit`) · annuler un lot en attente (`troops.cancel`) · choisir la marque
· élever CE bâtiment (`constructions.start`, doublon assumé 57a) · composer / armer la pile
de garnison (61 — la préparation d'un ordre carte) · ouvrir l'abaque. Observateur : tout
retiré, pas grisé ; la garnison se lit sans cocher.

## Manque côté serveur / client (futurs prompts code)

- **Serveur : rien.** `workshop` sert déjà par bâtiment.
- **Client** (prompt `modale-de-site`, après mockup validé) : ouvrir la modale au clic
  gauche sur un bâtiment de projection (`openBuilding` route aujourd'hui vers la garnison) ;
  retirer l'onglet « prod. » du rail ; « à faire maintenant » : `idleBarracks` cible la
  carte (recentrer + ouvrir la modale) au lieu de la surface ; la fenêtre Production
  actuelle meurt.

## À coller à Claude design — Modale de site

> Maquette la MODALE DE SITE de production, ouverte au clic gauche sur une caserne de la
> carte (worldwarsim, presse illustrée 1940). Elle remplace la fenêtre Production générale :
> elle ne parle que de CE bâtiment. Réutilise la v1 validée — les cartes de rôle, la file et
> les cases du plafond survivent telles quelles ; meurent : le grand en-tête « Production »,
> les sections de domaine, le sélecteur de site, les bandeaux « bloqué : aucun … ».
> Structure : en-tête = Caserne · Normandie · niveau 1 + son élévation ; la rangée de cases
> du plafond ; les TROIS cartes terre uniquement (infanterie, blindé, transport terrestre) ;
> la file de ce site ; une section garnison — les troupes stationnées ici (sprite, rôle,
> « 32 / 50 », ravitaillement), cochables pour composer une pile, avec places d'emport
> offert / requis et allure ; le renvoi « abaque de tir — qui bat qui ». Toutes les chaînes
> et tous les chiffres viennent de l'annexe `03-caserne-donnees.md` — n'écris rien, ne
> calcule rien, demande ce qui manque ; valide sur les chaînes les plus longues. Variantes :
> file vide ; garnison vide ; observateur (aucun bouton, lecture entière).
