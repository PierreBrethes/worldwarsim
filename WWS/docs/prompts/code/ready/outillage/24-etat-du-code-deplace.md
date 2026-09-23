# 24-etat-du-code-deplace — le récit de ce qui est livré quitte CLAUDE.md pour `WWS/docs/ETAT-DU-CODE.md`, à l'identique et dans le même ordre

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 21, 22.

**À lire :** `CLAUDE.md` (entier), `src/routes/-plateau/GarrisonPanel.tsx` (~141), les bandeaux de
`WWS/docs/adr/0015-economie-v2-ressources-localisees.md` (~4-9) et `WWS/docs/adr/0017-format-de-saison-et-socle-place.md`
(~5-10), les renvois au « CLAUDE.md racine » que 22 a posés dans `WWS/CLAUDE.md` et `WWS/README.md`.

## Pourquoi

À 7bc3a69 (18/09), `CLAUDE.md` fait 49 557 caractères (`wc -m`), ≈ 14 000 tokens chargés à chaque
session et par chaque sous-agent ; ×4,1 en 30 jours (12 456 octets le 19/08, 43173ac), et 51 des
180 commits depuis le 01/08 le touchent. 91 % en est du récit (à 7bc3a69 : l.18-272, 21 500
caractères ; l.303-339, 3 100 ; l.377-608, 20 100). Ce récit est la mémoire qui évite de relitiger :
on le déplace sans le supprimer. **Rangement pur**, prouvé par un script.

## Ce qui change

1. Trois blocs quittent `CLAUDE.md`, bornés par six ancres (`grep -F`, une occurrence chacune ; 21
   a décalé les numéros), la ligne de fin exclue : **A**, le corps de `## Ce qui existe`, de
   `Les surfaces 4.1 à 4.4 : le plateau` à `## Architecture` ; **B**, les trois paragraphes livrés
   d'`## Architecture` (stockage unifié, pillage, « L'ordre part de la carte »), de
   `**Stockage unifié livré` à `## Schéma Convex` ; **C**, dans `## Ce qui reste`, de
   `**Et un bâtiment ne produit que relié**` à `**Ni terrain, ni tenaille, ni soin.**`. Le reste
   demeure, dont le premier paragraphe de `## Ce qui reste`, « Ni terrain… » et « Avant de coder… ».
2. `WWS/docs/ETAT-DU-CODE.md` (à créer) : `# État du code`, un en-tête de trois lignes au plus (le
   récit du livré, déplacé tel quel de `CLAUDE.md`, chemins lus depuis la racine ; lu à la demande,
   au paragraphe du système qu'on touche ; un chantier y écrit son récit, ou dans l'ADR), puis
   `## Ce qui existe` (A), `## Livré, rangé sous « Architecture »` (B), `## Livré, rangé sous « Ce qui reste »` (C).
3. **Tel quel**, erreurs connues comprises (« cinq nations », `generer-monde.mjs`, « trois
   événements » puis « cinquième ») : c'est le 26. **Écart assumé à la convention 3** : copie et
   retrait par extraction de lignes (`sed -n`, `awk`) — recopier 45 000 caractères par Write
   risquerait l'altération que le cas 1 interdit —, en erreur si une ancre manque ou revient deux
   fois ; `CLAUDE.md` part d'un état commité, git en est le retour arrière. Le reste, par Edit.
4. Le corps de `## Ce qui existe` devient un paragraphe de renvoi, trois lignes au plus : le récit
   est dans `WWS/docs/ETAT-DU-CODE.md`, à lire au paragraphe du système avant d'y toucher.
5. Les pointeurs vers un passage déplacé nomment `WWS/docs/ETAT-DU-CODE.md`, seul le renvoi change :
   `GarrisonPanel.tsx` ~141 (bloc C) ; les bandeaux des ADR 0015 ~6 et 0017 ~8, où « § « Ce qui
   existe » » devient « paragraphe « Stockage unifié livré » » (bloc B) ; dans `WWS/CLAUDE.md` et
   `WWS/README.md`, les seuls renvois de 22 qui visent **l'état du code** (lien `docs/ETAT-DU-CODE.md`).
   Restent : `convex/view.ts` ~330 (**écart au cahier** : son « ce qui reste » demeure ici, 25 le
   redirige), `convex/constants.ts` ~595 (l'interdit de `RegionType`, que « Ni terrain » garde et
   que 25 écrit en invariant), et les cinq qui visent `## Architecture` (`compass-rose.ts` ~506,
   `standings.ts` ~13, `EdgeIndicators.tsx`, `MapLabels.tsx`, `WorldMap.tsx` ~3).

## Ce que ce prompt ne fait pas

- Ni réécriture de la racine (25), ni correction du récit (26), ni `CLAUDE.md` imbriqué, ni rien
  de `WWS/CLAUDE.md` hors de ses renvois (22), ni budget (31 à 33), ni rapports datés, ni prompts.
  L'ADR 0011 ~52 est une conséquence datée, elle reste ; les fiches qui citent `CLAUDE.md` pour
  l'interdit de `RegionType` (`08-combat.md` ~123 et deux propositions) aussi.

## Cas d'acceptation (tests d'abord)

1. Ce script (`.mjs`), écrit **avant** le déplacement dans le scratchpad et lancé depuis la racine, sort en 1
   sur l'arbre de départ, puis en 0 : chaque ligne non vide retirée de `CLAUDE.md` est dans
   `ETAT-DU-CODE.md`, à l'identique et dans le même ordre (simulé à la rédaction : 489 lignes).

   ```js
   import { execSync } from 'node:child_process';
   import { existsSync, readFileSync } from 'node:fs';
   const target = 'WWS/docs/ETAT-DU-CODE.md';
   const removed = execSync('git diff -U0 HEAD -- CLAUDE.md', { encoding: 'utf8' }).split('\n')
     .filter((l) => l.startsWith('-') && !/^--- (a\/|\/dev\/null)/.test(l))
     .map((l) => l.slice(1)).filter((l) => l.trim() !== '');
   const lines = existsSync(target) ? readFileSync(target, 'utf8').split('\n') : [];
   const used = new Set(), missing = []; let at = 0;
   for (const line of removed) { const i = lines.indexOf(line, at); if (i < 0) missing.push(line); else { used.add(i); at = i + 1; } }
   console.log(`${removed.length} retirées, ${missing.length} absentes ou hors d'ordre`, missing);
   console.log('Lignes propres :', lines.filter((l, i) => l.trim() !== '' && !used.has(i)));
   process.exit(removed.length > 0 && missing.length === 0 ? 0 : 1);
   ```
2. Ses « lignes propres » : titre, en-tête et trois intertitres, sept au plus.
3. `git diff -U0 HEAD -- CLAUDE.md | grep '^+[^+]'` ne rend que le paragraphe de renvoi.
4. `git grep -n "CLAUDE.md" -- src convex scripts` rend les sept lignes restées (point 5) ;
   `grep -c "n'importe pas React\|TS pur\|^## Ce qui reste" CLAUDE.md` ≥ 3 ;
   `git grep -n "CLAUDE.md" -- WWS/docs/adr` ne rend plus que l'ADR 0011 ;
   `grep -c "ETAT-DU-CODE" WWS/CLAUDE.md WWS/README.md` : au moins 1 chacun.
5. `wc -m < CLAUDE.md` : environ 7 000, sous 9 000 (simulé sur 7bc3a69 sans 21 : 4 894).

## Vérifications

- Les cas 1 à 5, avec la sortie du script. `npm run verifier` : vert (un commentaire touché).

## Rapport attendu

Format commun (README de la série), plus : les numéros des trois blocs au départ ; `wc -m` avant et
après ; le script d'extraction et la sortie du cas 1 ; pour 26, les affirmations périmées croisées
sans les corriger, dont `GarrisonPanel.tsx` ~139-141 (« la destruction attend le pillage »).
