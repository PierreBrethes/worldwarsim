# Règles communes des contrats de vue

**Statut :** décisions de Pierre, 01/09/2026 — s'imposent à toute maquette. Chaque vue a son
contrat (`01-…` à `05-…`) : une **liste fermée** de données. Ce qui n'y est pas ne s'affiche pas.

## Pourquoi ces contrats existent

Le constat : sans liste fermée, une maquette invente des données (que le serveur ne sert pas,
ou que le brouillard interdit) et noie l'écran de texte. Le contrat inverse la charge : la
maquette part de ce que `convex/view.ts` (`PlayerView`) sert réellement, champ par champ, et
de rien d'autre. **`PlayerView` est LA référence** — un champ absent de la vue est une donnée
que le joueur n'a pas le droit de voir, ou que le jeu ne connaît pas encore. Dans les deux cas
on ne le dessine pas. Les données décidées mais pas codées sont marquées **⚠ pas-codé** dans
les contrats : on peut leur réserver la place, jamais leur inventer un chiffre.

## La règle des trois profondeurs

- **P1 — d'un coup d'œil.** Le sprite (ou la vignette) **en grand**, le nom, le niveau,
  **UN tampon d'état**, **UN chiffre** — rien d'autre. Le chiffre unique de P1 est **le plus
  décisionnel** de l'objet : celui qui change ce que le joueur fait dans la minute. Chaque
  contrat le nomme et le justifie.
- **P2 — au geste** (survol ou clic). Les détails : coûts **avec le stock courant à côté**
  (« 40 / 120 », jamais « 40 » seul), rendement / h, entretien, file. Révélés **en place** —
  un pli qui se déplie — **jamais une nouvelle fenêtre**.
- **P3 — nulle part.** Tout le reste. Chaque contrat liste explicitement ce qui existe côté
  serveur et ne s'affiche pas, avec la raison — pour qu'une maquette ne le « retrouve » pas.

## Les tampons

Un tampon est un **ÉTAT, jamais une action.** « Désactivé », « à sec », « hors ravitaillement »,
« verrouillé » sont des tampons ; « améliorer », « envoyer » n'en seront jamais. Un objet porte
**un** tampon en P1 — s'il a plusieurs états vrais en même temps, le contrat donne l'ordre de
priorité. Les états possibles de chaque objet sont recensés dans son contrat, avec leur source
dans le code : on ne crée pas d'état à la maquette.

## Les surfaces lisent

**Tout ce qui peut se faire sur la carte se fait sur la carte** (décisions 12a, 13a, 30/08).
Une surface (fenêtre, panneau, popin) **lit**. La seule action tolérée dans une surface est
celle **impossible sur la carte** — chaque contrat liste les siennes, fermement. Corollaires
déjà en vigueur dans le code :

- La popin lit, la carte agit (30/08) : le cartouche de troupe ne porte aucun ordre.
- Rien n'est grisé dans la **rose des vents** : une branche existe ou n'existe pas
  (ADR 0015) ; la rose et le serveur lisent **la même fonction**
  (`src/domain/movement-orders.ts`). Exception décidée en 55/54a : la branche « Améliorer »
  de la rose sur bâtiment se grise avec sa raison quand le stock manque (voir
  `04-rose-batiment.md`).
- Un observateur (`me.defeated`) voit ses surfaces **sans leurs boutons** — retirés, pas
  grisés (décision 47a).

## Le brouillard est structurel

Ne jamais dessiner sur un objet adverse une donnée que son type ne porte pas : un arc adverse
n'a ni type ni composition (`ArcView`, union discriminée), un relevé ne nomme jamais la nation
vue, une région jamais observée est **vierge** — inconnue, pas neutre (ADR 0020 §5). Si la
maquette a besoin d'une donnée adverse « pour faire vrai », c'est qu'elle est fausse.

## Vocabulaire (WWS/CONTEXT.md)

Imposé : **mouvement**, **passe de résolution**, avant-poste **désactivé** / **détruit**
(jamais pris), **emplacement**, **posture**, **relevé**, **édition**, **journal d'événements**,
**slot de mouvement**, **caserne** et **filière** (le mot « atelier » est rejeté, 55b).
Bannis : tick, temps réel, micro, base, rush, convoi, leurre.

## Forme

Tout texte affiché sort de `src/i18n/fr.ts` — la maquette réutilise les libellés existants,
elle n'en propose pas. Les heures sont des heures locales déjà formatées (`asLocalTime`),
les durées des comptes à rebours servis en minutes restantes — jamais une barre de
progression inventée à partir d'une durée totale que la vue ne sert pas.

## Le jeu de données d'exemple (leçon de la v1 du journal, 01/09)

Chaque contrat s'accompagne d'une **annexe de données réelles** (`NN-…-donnees.md`) : les
chaînes verbatim de `fr.ts`, les chiffres calculés depuis `constants.ts`, un scénario de
partie plausible. **Cette annexe est la seule source de texte et de chiffres de la
maquette.** Design ne rédige aucune phrase, ne choisit aucune gravité, ne range aucun
tampon : tout arrive servi. S'il manque une donnée pour remplir un cadre, il la demande —
il ne l'écrit pas. Et la maquette se valide sur les **chaînes les plus longues** de
l'annexe, jamais sur des exemples courts qui flattent la grille : la v1 du journal a
inventé des toponymes de villes, une distance qui n'existe pas, et trié les gravités à la
main — précisément parce qu'elle n'avait pas ce fichier.
