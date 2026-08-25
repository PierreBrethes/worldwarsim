# Prompt Claude Code — munitions de départ, fondation hors plafond, le plafond dit son remède

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0017 (avec sa révision du 25/08).
Ne commit pas, ne push pas. Trois correctifs issus de la simulation d'ouverture du 25/08,
décisions de Pierre du même jour.

## 1 — Les munitions de départ (un chiffre de format)

Constat mesuré : l'arsenal n'étant plus offert par le socle, le skirmish meurt militairement à
H+15 — deux recrutements, munitions à zéro, plus rien. Décision : le kit de départ gagne des
munitions — sinon l'infanterie offerte ne sert à rien.

`SEASON_FORMATS` gagne `startingAmmunition`, **un chiffre par format et rien d'autre** (le
même principe que `startingAlloy`/`startingOil` : jamais par nation). Dimensionne-le pour
couvrir **environ la première journée d'un joueur assidu** — dérive le chiffre des coûts
réels (`army.mjs` connaît le prix en munitions d'une troupe et le débit d'un arsenal) et
**écris le raisonnement en commentaire à côté de la valeur**, comme la maison le fait pour
les nombres arbitraires : arbitraire assumé, jamais simulé, remplacé par l'équilibrage un
jour. Respecte le plafond de stockage : un kit au-dessus du plafond est un état déjà connu
(`startingAlloy`), pas un bug.

## 2 — Une clé due n'est jamais refusée par le plafond

Constat : en campaign (QG 1, plafond 5), la cinquième clé due des USA/URSS est refusée
`BUILDING_CAP_REACHED` — une dette du format bloquée par une règle du format. Décision : la
**pose de fondation due échappe au plafond de bâtiments**. Une fois debout, le bâtiment
compte normalement dans le plafond (il peut donc le dépasser transitoirement — c'est voulu :
la dette du format prime, l'ambition du joueur attend le QG).

Dans `refusalFor` (`convex/constructions.ts`) : le contrôle de plafond ne mord que le chemin
payant, comme le verrou de chantier depuis `fondation-hors-chantier.md` — même geste, même
raison. Un test le grave sur le cas mesuré : USA en campaign, QG 1, les cinq clés se posent.
Ajoute la ligne correspondante à l'encadré « retard connu » du README du simulateur si son
moteur modélise encore l'ancien refus (la mise à jour du simulateur est explicitement
reportée — décision 3b du 25/08, n'y touche pas).

## 3 — Le plafond dit son remède

Demande de Pierre : après l'ordre de mobilisation (les poses offertes), le joueur doit savoir
**quand monter le QG**. Pas de nouveau système — la règle du grisé existante (ADR 0015,
révision du 24/08 : « rien d'affiché sans sa condition ») appliquée au plafond :

- quand un chantier payant est refusé pour plafond, la ligne dit la phrase entière avec les
  chiffres réels : « plafond de bâtiments atteint (5) — un quartier général niveau 2 le
  porte à 8 » ;
- le budget d'emplacements de la fenêtre Économie affiche la même annonce en une ligne
  discrète quand le plafond est atteint ou entamé par la file : le compte actuel, et ce que
  le prochain niveau de QG apporte.

Les chiffres viennent de `buildingCap` — jamais recopiés en dur dans `fr.ts`.

## Vérifications

Tests : kit de munitions présent aux deux dotations (lancement et entrée en guerre) ; les
cinq clés des USA se posent au QG 1 en campaign ; libellé du plafond composé depuis
`buildingCap`. `npm run verifier` complet, `verify.mjs` exit 0 (le miroir apprend
`startingAmmunition`).
