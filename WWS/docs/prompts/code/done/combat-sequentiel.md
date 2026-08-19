# Prompt Claude Code — le combat séquentiel (étape 3 du plan de progression)

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, les ADR `0008` (combat par
interception) et `0014` (troupes discrètes et combat séquentiel), la fiche `08-combat.md`,
**`WWS/docs/design/propositions/chiffrage-combat.md` — qui porte tous les nombres de ce
travail** — et `WWS/simulation/verif-chiffrage.mjs`. Ne commit pas, ne push pas.

Prérequis : `garnison-adresse.md` est passé (la garnison d'avant-poste existe comme adresse).

## Le contrat central

**Tu ne modifies aucune valeur du chiffrage.** Effectifs nominaux, table de dégâts,
modificateurs, seuil de déroute, consommation de munitions : tout se recopie *littéralement* de
`chiffrage-combat.md` vers `constants.ts`. Si une valeur te paraît fausse ou intenable,
**signale-la et arrête-toi** — c'est une décision de design. Le but de ces nombres est d'être
mesurés tels quels, pas améliorés en route.

## L'anatomie de la passe (décisions 16a et 17a du 18/08 — c'est leur première écriture)

Un engagement = **une passe de résolution**, déterministe, sans aléa.

1. **Initiative au camp attaquant.** L'intercepteur devient l'attaquant (ADR 0008).
2. **Ordre de frappe : le `ROLE_ORDER` du domaine** — une seule source de vérité, il existe
   déjà. Égalité entre deux troupes du même rôle : la plus anciennement créée d'abord.
3. **Ciblage au moment de frapper** : chaque troupe frappe le défenseur *vivant et non dérouté*
   sur lequel la table lui donne la plus grande part d'effectif détruite ; égalité → ordre
   canonique côté défenseur. Une troupe qui ne peut atteindre personne ne frappe pas.
   **Il n'y a pas d'écran** : personne ne « tanke » pour protéger autrui — c'est un choix
   (le fodder est une économie de la nuée, que le plafond de troupes refuse), écris-le en
   commentaire à l'endroit du ciblage.
4. **Dégâts sur la troupe frappée seulement, excès perdu.** Jamais de débordement vers une
   autre troupe — c'est ce qui borne mécaniquement l'empilement.
5. **Déroute immédiate** sous 25 % de l'effectif nominal : la troupe sort de l'engagement, ne
   riposte pas, n'est plus ciblable. Elle n'est pas détruite (règle 3 du projet). Elle **rentre
   à son rattachement** par un mouvement de retour créé automatiquement, hors slots — ce n'est
   pas un ordre du joueur.
6. **Les ripostes viennent après toutes les frappes** : chaque défenseur survivant non dérouté
   riposte une fois — contre la troupe qui l'a frappé s'il peut l'atteindre, sinon contre le
   meilleur attaquant atteignable, sinon rien.
7. **Munitions** : consommées par troupe engagée selon la règle du chiffrage (§5). À sec, le
   malus du chiffrage s'applique — on se bat mal, on ne cesse pas de se battre.

Modificateurs V1 : **bonus du défenseur** et **munitions à sec**, du chiffrage, rien d'autre.
**Pas de terrain** — `CLAUDE.md` interdit qu'une règle lise `RegionType` sans son ADR. **Pas de
tenaille** pour l'instant : elle demande une définition de la convergence de deux mouvements —
signale-la comme suite, ne l'improvise pas.

## Ce qui déclenche un combat

- **Nouveaux types de mouvement : `attack` et `raid`**, depuis la caserne comme `outpost`
  (ADR 0013). Cible d'une attaque : une région adverse ou un avant-poste adverse. Cible d'un
  raid : un avant-poste adverse.
- **À l'arrivée d'une attaque** : la pile engage les troupes adverses stationnées là (garnison
  d'avant-poste, ou troupes stationnées aux bâtiments de la région). Personne pour défendre →
  l'attaque arrive, ne trouve rien, **et rentre** : les bâtiments ne se pillent pas encore
  (étape 4), un combat sans adversaire n'est pas un combat.
- **Le raid** : s'il gagne l'engagement contre la garnison (ou qu'il n'y en a pas), l'avant-poste
  est **désactivé** pour `OUTPOST_DISABLED_HOURS`, avec la fenêtre d'immunité de la fiche 03
  ensuite. Jamais « pris ». La destruction après plusieurs raids attend le pillage.
- **L'interception en route** (ADR 0008) : toute force — en mouvement ou en garnison — porte un
  rayon. Un mouvement adverse qui le traverse déclenche le contact au point d'intersection,
  calculé **à la création du mouvement** comme la fiche 08 le décrit (mêmes maths que les
  fenêtres de révélation). L'intercepteur a l'initiative. `INTERCEPTION_RADIUS_KM` entre dans
  `constants.ts` en **placeholder assumé** avec le commentaire que la fiche 08 §11 exige : ce
  rayon est le trou le plus béant du modèle, il conditionne tout, et il n'est pas simulé.
  « Peut-on refuser le combat ? » reste ouverte — signale-la, ne l'invente pas.

## Ce que le combat écrit

Chaque engagement produit un **compte rendu** persistant : qui, où, quand, la passe frappe par
frappe (attaquant, cible, pertes en hommes et machines), déroutes et retours. Le Journal le
sert en entrées lisibles — « 50 soldats contre 50, j'en perds 16, il en perd 22 » est la qualité
recherchée (ADR 0014). Pas de rejeu visuel dans ce prompt : le compte rendu est sa matière
première, il doit suffire à le construire plus tard sans re-résoudre.

## Garde-fous

- **Porte `verif-chiffrage.mjs` sur le vrai code** : il rejoue les 75 couples atteignables
  contre la résolution réelle et **fait échouer la suite de tests** sur tout contre absolu ou
  riposte nulle non voulue (hors les trois transports, victimes par design). Prouve une fois
  que le garde-fou mord : change une valeur, montre l'échec, remets-la.
- Tests de la passe : 6 contre 1 — victoire mais frappes surnuméraires perdues (l'excès ne
  déborde jamais) ; le transport concentré en premier quand la table le désigne ; la déroute
  qui sort une troupe et crée son retour ; l'interception qui inverse l'initiative ; munitions
  décomptées et malus à sec.
- `tsc` propre, tests existants verts, `node WWS/simulation/opening/verify.mjs` sort en 0,
  garde-fou de `run.mjs` tenu.
- Aucun terme banni. Une troupe *déroute*, un avant-poste est *désactivé* — jamais « pris ».

## Ce que tu ne fais pas

Pas de pillage ni d'effet sur les bâtiments (étape 4). Pas de soins ni de bandages — une troupe
entamée reste entamée, signale que la boucle de soin attend la pharmacie et
`consommation-continue.md`. Pas de mouvement naval ni aérien, pas d'`agent` ni de `decoy`, pas
de rejeu visuel, pas de terrain, pas de lignes nationales (fiche 08 §8 — elles attendent que la
table nue soit mesurée). Si un de ces murs te bloque, **arrête-toi et dis-le**.
