# Prompt Claude Code — le QG posé au lancement, et les huit icônes de ressources

Lis la révision du 15/08 de l'[ADR 0015](../../adr/0015-economie-v2-ressources-localisees.md),
section « deux règles que l'implémentation a mises au jour », et la fiche
[02 — Économie](../../design/02-economie.md). Ne commit pas, ne push pas.

Petite passe de suite au back : deux trous que ton compte rendu a signalés, plus une dette
d'assets qui traîne depuis hier.

## 1. Le quartier général existe au lancement

Tu as trouvé la règle émergente : `cappedByHq(key, 0, 0)` bloque tout sauf le QG, donc le premier
chantier d'une saison est forcément le QG, sans qu'aucune règle ne le dise — et le kit de départ
ne le payait pas. L'ADR est corrigée : **le QG est posé au niveau 1 au lancement**, sur la région
de la capitale nationale. Une nation a une capitale, elle ne la construit pas.

C'est la **seule** exception au principe « un bâtiment se construit ou n'existe pas ». Elle doit
être explicite dans le code, pas reconstituée par un défaut de `levelOf`.

Il faut une table de huit entrées, capitale de 1940 → `adm1_code`, chacune commentée :

| nation | capitale de 1940 |
|---|---|
| `france` | Paris |
| `uk` | Londres |
| `usa` | Washington |
| `ussr` | Moscou |
| `germany` | Berlin |
| `japan` | Tokyo |
| `italy` | Rome |
| `china` | **Chongqing** — Nankin est tombée en 1937, la capitale de la République est repliée |

Vérifie chaque `adm1_code` contre `region-index.json` et **échoue bruyamment** si l'un ne
correspond à rien : une capitale introuvable donnerait un joueur sans QG, donc sans slots, donc
sans partie — et le symptôme apparaîtrait très loin de la cause.

Retire du kit de départ ce qui n'a plus lieu d'être, et vérifie qu'un joueur fraîchement lancé
peut effectivement bâtir sa première ferme.

## 2. Un chantier à la fois, écrit comme une décision

Le comportement actuel est le bon — tu l'as implémenté et j'ai tranché : **jamais un chantier par
région**. Tes chiffres l'ont condamné (9 régions pour la Bolivie, 232 pour le Royaume-Uni : un
multiplicateur qui varie d'un ordre de grandeur selon la nation, offert par le découpage de
Natural Earth et non par le design).

Il n'y a rien à changer au code. **Écris juste le *pourquoi* à l'endroit du `.unique()`** — un
commentaire qui explique la décision, pas le code, avec le régulateur prévu le jour où ce plafond
serrera : un plafond global indexé sur le QG, comme les slots. Sans ça, le prochain qui passe le
prendra pour une limitation paresseuse et la « corrigera ».

## 3. Les huit icônes de ressources existent, elles ne sont pas branchées

`ResourceIcon.tsx` fait pointer les huit ressources vers trois dessins, marqué placeholder. Les
huit vrais existent depuis hier, en SVG, dans **`WWS/maquettes/Icônes ressources v2.dc.html`** :
une silhouette pleine par ressource — sac, rouleau, tas, goutte, cristaux, lingots, obus, croix —
dessinées pour tenir à 12 px.

Extrais les huit chemins SVG de cette maquette vers `src/emblems/`, dans la forme qui convient au
composant existant, et branche-les. **Les couleurs sont dans la maquette**, une par ressource ;
reprends-les plutôt que d'en inventer. Suis le modèle des drapeaux et des sprites : le filtre encre
est une passe d'affichage, jamais cuite dans l'asset.

Ne redessine rien. Si un chemin ne s'extrait pas proprement, dis-le et laisse ce placeholder-là.

## Critères d'acceptation

- Une saison lancée donne à chaque joueur un QG de niveau 1, sur la région de sa capitale, et
  aucun autre bâtiment.
- Un `adm1_code` de capitale erroné fait échouer bruyamment — teste-le une fois.
- Un joueur fraîchement lancé peut bâtir une ferme sans avoir à construire le QG d'abord.
- Le `.unique()` des chantiers porte un commentaire qui explique la décision et son régulateur
  futur.
- Les huit ressources ont chacune leur propre icône ; plus aucun mapping marqué placeholder.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Tu ne touches pas au choix de la région du QG par le joueur — c'est la surface hors-saison, pas
celle-ci. Tu ne touches ni aux troupes, ni à la rose des vents, ni au bandeau : la hiérarchie des
huit compteurs reste la question ouverte de la surface 4.5.
