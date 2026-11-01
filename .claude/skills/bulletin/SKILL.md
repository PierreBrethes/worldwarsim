---
name: bulletin
description: Compose le bulletin de mise à jour de la semaine (feuille A4 de La Manchette) et l'ouvre en PR. Use when la tâche planifiée du dimanche se lance, ou quand Pierre demande un bulletin, une patchnote, les nouveautés de la semaine.
---

# Bulletin

Tu es le rédacteur du bulletin : une feuille A4 paysage, aux couleurs du journal du jeu, qui dit
au joueur ce qui a changé sur la carte depuis le dernier numéro. Personne ne te relit avant la
PR : chaque étape finit sur un critère que tu vérifies toi-même.

Repères : le bulletin du 1er novembre est le modèle (`scripts/patchnote-exemple/2026-11-01.json`
et `public/patchnotes/2026-11-01.webp`) ; le format du contenu est écrit en tête de
`scripts/patchnote.mjs` ; le vocabulaire est celui de `WWS/CONTEXT.md`.

## 1. Savoir s'il y a un numéro

Lis la date du dernier bulletin dans `public/patchnotes/index.json` sur `origin/main`, puis les PR
fusionnées sur `main` depuis : `gh pr list --state merged --base main --search "merged:>AAAA-MM-JJ"`.
Une PR d'intégration regroupe des lots : remonte aux issues qu'elle ferme (`Closes #N` dans ses
commits). Fini quand tu as la liste des issues fermées depuis le dernier numéro.

Liste vide : arrête-toi, et ton rapport tient en une ligne (« Pas de bulletin : rien de fusionné
depuis le JJ/MM »).

## 2. Travailler à l'écart

Le checkout de Pierre (`/Users/pierre/Documents/Projects/Worldwarsim`) appartient à Pierre et à
ses agents. Tu travailles dans un clone neuf de ton scratchpad :

```bash
git clone --shared /Users/pierre/Documents/Projects/Worldwarsim <scratchpad>/bulletin
cd <scratchpad>/bulletin && git remote set-url origin "$(git -C /Users/pierre/Documents/Projects/Worldwarsim remote get-url origin)"
git fetch origin && git checkout -b bulletin-AAAA-MM-JJ origin/main
ln -s /Users/pierre/Documents/Projects/Worldwarsim/node_modules node_modules
cp /Users/pierre/Documents/Projects/Worldwarsim/.env.local .
```

Le contenu et ses images vivent hors du dépôt, dans `<scratchpad>/contenu/` ; seuls les fichiers
de `public/patchnotes/` entrent dans le commit.

## 3. Choisir ce qu'on raconte

Pour chaque issue, lis son titre, son corps (« Ce que le joueur voit ») et sa PR. Garde ce que le
joueur voit ou fait autrement ; l'outillage, les rétros et la doc restent dehors. Puis range :

- **la une** : le changement le plus visible, avec deux images et trois puces au plus ;
- **deux ou trois dépêches** : les suivants, une image chacune ;
- **« Et aussi »** : quatre lignes au plus, les corrections et petits gestes ;
- **« Sur l'établi »** : une ou deux choses décidées et pas encore livrées (ADR acceptée récente,
  issue ouverte en cours), écrites au futur proche. Rien de ce qui n'est pas fusionné ne s'écrit
  comme livré.

Le texte parle au joueur : ce qu'il voit, ce qu'il fait, au présent, en phrases courtes, sans nom
de fichier ni de fonction. Les numéros d'issue vont dans `refs`. Fini quand chaque issue gardée a
sa place et que le JSON passe la validation du script.

## 4. Prendre les images

Chaque image est une capture du jeu, jamais une maquette. La scène d'une issue se trouve dans
l'en-tête de `scripts/demo-mondiale.mjs`, par son numéro (`--combat` pour #272, `--arrivee` pour
#362…). Prérequis : Convex local qui répond sur `http://127.0.0.1:3210` et `npm run dev` sur
`http://localhost:5173` ; s'ils ne répondent pas, arrête-toi et dis-le, tu ne les lances pas.

```bash
npm run demo:mondiale -- --<scène>
PLAYWRIGHT_DIR="$HOME/.cache/wws-playwright" npm run capture -- '/plateau?season={saison}' <scratchpad>/contenu/img/<nom>.png --heure <ISO> --geste lieu=@<lieu>
```

Le front de :5173 sert la branche que le checkout porte à cet instant, pas forcément `main` :
regarde chaque capture et garde celles qui montrent bien le changement. Recadre sur le sujet
(une colonne de 80 px dans une capture de 1440 ne dit rien). Une issue sans scène qui la montre va
dans « Et aussi », sans image. Fini quand chaque image du JSON montre ce que dit sa légende.

## 5. Rendre et regarder

```bash
PLAYWRIGHT_DIR="$HOME/.cache/wws-playwright" node scripts/generate-patchnote.mjs <scratchpad>/contenu/AAAA-MM-JJ.json --a-blanc <scratchpad>/feuille.webp
```

Le script refuse sans rien écrire (sortie 2 pour un contenu refusé, 1 pour un rendu raté) et le
message nomme le champ ou la cause : corrige le JSON, ou rapporte une panne de réseau (les
polices viennent de Google Fonts, sans elles il ne rend pas).

Regarde la feuille rendue (lis l'image). Elle est juste quand rien ne déborde ni ne se coupe,
que les colonnes finissent avant le filet du pied, que la date et le jour de la semaine sont
exacts, et que chaque image est lisible. Corrige le contenu (textes plus courts, autre cadrage)
et rends de nouveau ; au troisième rendu encore faux, arrête-toi et rends un rapport d'échec avec
la feuille.

Quand elle est juste, rends sans `--a-blanc` : le script écrit l'image, la vignette et la ligne de
l'index dans `public/patchnotes/`.

## 6. Ouvrir la PR

Commite `public/patchnotes/` seul, en anglais au style de `git log`, avec la ligne
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pousse la branche `bulletin-AAAA-MM-JJ`
et ouvre une PR vers `main` (skill `pr`), titre « Bulletin du <jour> <date> », qui liste les issues
racontées. La PR attend la fusion groupée suivante, que Pierre accorde : ta part s'arrête à la PR
ouverte.

## Rapport

Une ligne de résultat (le lien de la PR, ou pourquoi il n'y a pas de numéro), puis ce que tu as
laissé de côté et pourquoi. Règle d'arrêt : après 3 échecs sur la même commande ou la même
vérification, arrête-toi et rends un rapport d'échec.
