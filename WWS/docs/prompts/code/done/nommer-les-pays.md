# Prompt Claude Code — le jeu affiche « SAU »

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md` et l'**ADR 0016** (code en anglais, jeu en
français via une table de traduction unique). Ensuite `src/domain/compass-rose.ts:141`
(`countryName`), `src/domain/journal.ts:95` (`countryLabel`), `scripts/generate-region-index.mjs`,
`scripts/generate-world.mjs` et `src/i18n/fr.ts`.
Ne commit pas, ne push pas. **Petit prompt, un seul sujet.**

## Le défaut

Deux fonctions nomment un pays, chacune sur un vocabulaire différent, et **toutes les deux
replient sur la clé brute** dès que le pays n'est pas l'une des huit nations jouables :

- `countryName(country)` prend le nom monde de `world.json` et rend `nationLabel(nation)` si le
  pays est joué, **sinon la chaîne telle quelle** — donc `Saudi Arabia` ;
- `countryLabel(adm0)` prend un code ADM0 et rend `fr.nations[nation]` si le pays est joué,
  **sinon le code** — donc `SAU`.

Il y a 163 pays et huit sont jouables. Le cas ordinaire est donc l'affichage d'une clé technique
dans une interface française : « garnison — SAU », « avant-poste en Saudi Arabia ». C'est la
troisième fois que ce trou remonte pendant le chantier de l'ADR 0019 ; il est temps de le fermer.

L'ADR 0016 veut **une** table de traduction. Il y en a deux, et aucune ne couvre le monde.

## Ce que tu codes

Une table `ADM0 → nom français`, **générée**, jamais tenue à la main — 163 lignes maintenues à la
main dériveraient au premier changement de source.

Deux moitiés à trouver, et tu instruis chacune avant de choisir :

1. **Le pont vers le code.** `world.json` ne porte aujourd'hui que `n` (le nom), parce que
   `world-atlas` expose un identifiant ISO **numérique**, pas l'alpha-3 que le reste du jeu
   emploie. `region-index.json`, lui, porte l'ADM0 alpha-3 de chaque région et sa source admin-1
   connaît le pays. Dis d'où tu tires le pont, et fais-le produire par le script de génération qui
   l'a déjà sous la main plutôt que par un troisième.
2. **Le nom français.** Piste nommée, à vérifier avant d'y engager quoi que ce soit :
   `i18n-iso-countries` donne un nom français par code alpha-3 et s'utilise **au moment de la
   génération**, donc sans dépendance à l'exécution. Si elle ne convient pas, dis pourquoi et
   propose autre chose — mais pas une liste écrite à la main.

Ensuite : `countryName` et `countryLabel` **fusionnent en une seule fonction**, sur un seul
vocabulaire — l'ADM0, puisque c'est celui du serveur, des régions et des avant-postes. Les
appelants qui tiennent un nom monde passent par le pont plutôt que d'entretenir la seconde
famille.

## Le repli doit rester, et il doit se voir

Un code sans nom ne doit pas faire disparaître un libellé. Garde un repli — mais **échoue à la
génération**, pas à l'exécution : si un ADM0 présent dans `region-index.json` n'a pas de nom, le
script sort en erreur. Un pays sans nom est un défaut de données qu'on répare une fois, pas un
libellé dégradé qu'on découvre en partie.

## Critères d'acceptation

- Un test : `SAU` rend « Arabie saoudite », `ROU` rend « Roumanie », `FRA` rend « France » —
  et pour les huit nations jouables, exactement ce que `fr.nations` rend déjà, sans divergence.
- Une seule fonction de nommage de pays subsiste dans `src/`.
- Le script de génération échoue si un ADM0 de `region-index.json` n'a pas de nom.
- Aucun texte affiché hors de `src/i18n/fr.ts` ou de l'actif généré qu'il sert (ADR 0016) — dis
  laquelle des deux portes tu choisis et pourquoi.
- Aucun terme banni. `npm run build` et `npm run test` passent.

## Ce que tu ne fais pas

Tu ne traduis pas les noms de régions — Natural Earth les donne dans leur langue locale et c'est
très bien ainsi. Tu ne touches ni à `NATION_BY_COUNTRY`, ni à `ADM0_BY_NATION`, ni à `fr.nations` :
les huit nations gardent leurs libellés écrits à la main, ce sont les seuls qui le méritent.
