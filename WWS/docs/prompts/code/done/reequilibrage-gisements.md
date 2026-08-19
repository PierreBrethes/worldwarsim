# Prompt Claude Code — rééquilibrage des gisements + sort de `public/cursors/`

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, puis
`WWS/docs/adr/0015-economie-v2-ressources-localisees.md`. Ne commit pas, ne push pas.

Suite directe de `gisements-par-region.md`, déjà exécuté. Tu ne touches qu'à
`scripts/generate-deposits.mjs` et à sa sortie, plus une question à trancher sur
`public/cursors/`.

## Ce que la première passe a révélé

L'audit passe, et il passe à côté du problème. Totaux de gisements **à domicile** :

| usa | ussr | japan | china | france | uk | germany | italy |
|---|---|---|---|---|---|---|---|
| 16 | 12 | 9 | 8 | 7 | 6 | 5 | 5 |

3,2× d'écart. Le critère de l'ADR 0015 — « au moins un gisement de quatre ressources sur
cinq » — mesure une **présence**, jamais une **quantité** : il valide un départ où une
nation a trois fois l'économie d'une autre.

Ce n'est pas un détail d'équilibrage. Une nation n'est **jamais annexée** (ADR 0004), donc
un gisement à domicile est définitivement acquis : il peut être raidé, jamais pris. Et
l'écart profite aux États-Unis, la nation que le rapport de simulation mesure à 20,8 % de
victoires pour 12,5 % attendus, précisément parce qu'on ne peut pas l'atteindre. La
distribution censée mordre sur ce déséquilibre vient de le nourrir.

L'avantage de résilience vaut à lui seul le correctif : raider une mine allemande lui coûte
20 % de son charbon, une mine américaine 8 %.

## Ce que tu ne changes pas

**Les six nations qui manquent de pétrole restent six.** C'est le meilleur résultat de la
première passe : le pétrole devient le motif universel de sortir de chez soi, et chaque
nation a sa façon d'aller le chercher — le porte-avions japonais, la Guerre éclair
allemande, le rayon impérial français, Mare Nostrum italien. N'ajoute de pétrole à aucune
des six, et ne cherche pas à « varier les manques » : ça casserait la colonne vertébrale du
système pour de la variété cosmétique.

Tu ne touches pas non plus au déterminisme, ni aux tables curatées de charbon, pétrole et
minerais dans leur contenu historique.

## Travail

1. **Un second garde-fou dans l'audit.** Ajoute une colonne `total` et fais **échouer** le
   script (code de sortie non nul) si `max > 2 × min` sur les huit nations jouables. Les
   deux chemins d'échec existants restent ; celui-ci s'y ajoute.

2. **Rééquilibrer en montant le plancher, pas en cassant le plafond.** Avec un minimum à 8,
   la bande de 2× tolère les 16 américains sans toucher à une seule ligne d'histoire
   américaine. C'est la correction la moins destructrice — préfère-la à un dégraissage des
   États-Unis. Cibles : l'Allemagne et l'Italie, de 5 vers 8.

   Pistes historiquement défendables, à vérifier plutôt qu'à recopier : pour l'Allemagne, la
   Saxe et la Thuringe (industrie, minerais), la Bavière et le Bade-Wurtemberg (agriculture) ;
   pour l'Italie, la Sardaigne et l'île d'Elbe (fer), la Sicile, la Vénétie et l'Émilie
   (agriculture).

3. **Le cas de la plaine du Pô.** La règle « les tissus passent avant la nourriture » lui a
   pris son gisement au profit de la soie lombarde. C'est le grenier de l'Italie qui saute
   pour un métier qu'on peut poser cinquante kilomètres plus loin. Regarde s'il ne faut pas
   soit exempter les très grandes plaines de cette priorité, soit déplacer le point textile
   italien vers Côme ou Biella. Tranche et dis-moi ce que tu as choisi.

4. **Chaque correction porte son *pourquoi*, et il est honnête.** La table `CORRECTIONS` est
   le levier d'équilibrage assumé de l'ADR 0015 : un commentaire a le droit de dire
   « plancher de la bande », il n'a pas le droit d'inventer une justification historique
   qui n'existe pas. Si une correction n'est ni historique ni avouée comme équilibrage,
   elle ne doit pas être là.

5. **Réimprime l'audit complet** avec la nouvelle colonne, et donne-le-moi tel quel.

## Si la bande est inatteignable

Si tu ne peux pas amener l'Allemagne et l'Italie à 8 sans inventer des gisements qui
n'existaient pas, **arrête-toi et dis-le** avec le meilleur écart que tu aies obtenu. Le
seuil de 2× est une hypothèse de ma part, pas une vérité : il vaut mieux le rediscuter que
le forcer.

## Question annexe — `public/cursors/`

Tu as signalé que les cinq PNG n'étaient référencés nulle part et tu les as renommés. Du
code mort renommé reste du code mort.

**Cherche avant de conclure** : `cursor:` dans `src/styles/`, `url(` sur ces fichiers, un
`data:` inline qui aurait remplacé les PNG, une classe de curseur contextuel dans le moteur
de carte, ou une trace dans `WWS/docs/` d'une surface qui les attend. Le prompt
`WWS/docs/prompts/code/controles-camera.md` parle de « cinq curseurs déjà en place ».

Puis tranche et explique :

- **vraiment morts et non prévus** → supprime-les, dans le commit de rangement ;
- **attendus par une surface non implémentée** → garde-les, et écris une ligne dans
  `WWS/docs/` disant qui les attend, pour qu'on ne se repose pas la question dans trois
  semaines ;
- **encore utilisés par un chemin que le renommage a cassé** → c'est un bug, répare-le et
  signale-le en premier.

Ne devine pas : je ne peux pas vérifier à l'écran, les données factices ont été retirées.

## Critères d'acceptation

- Deux exécutions consécutives : md5 identique sur `public/deposits.json`.
- L'audit affiche la colonne `total` ; `max ≤ 2 × min` ; le script échoue si on force
  l'inverse — teste-le une fois pour prouver que le garde-fou mord.
- Aucune des six nations sans pétrole n'en a gagné.
- Chaque entrée de `CORRECTIONS` porte un *pourquoi* vérifiable ou explicitement étiqueté
  équilibrage.
- Le sort de `public/cursors/` est tranché et argumenté.
- Aucun terme banni dans le code ni les commentaires.
