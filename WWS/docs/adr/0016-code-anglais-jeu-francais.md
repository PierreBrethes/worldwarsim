# ADR 0016 — Code en anglais, jeu en français via une table de traduction unique

**Statut :** acceptée

## Contexte

Le dépôt est né entièrement en français : identifiants, types, tables Convex, classes CSS,
chemins de fichiers. `CONVENTIONS.md` §5 l'imposait explicitement (« Nommer en français »), au
nom d'un principe réel — un seul vocabulaire, pas de friction `distanceKm` / `getDistance`.

Deux problèmes ont émergé à l'usage, indépendants l'un de l'autre :

**Le texte affiché n'était pas isolé.** Les libellés français étaient écrits en dur dans les
composants (`'la saison n'est pas lancée'`, `'annuler et rembourser'`, `'pas prêts : …'`), y
compris **côté serveur** : les mutations Convex levaient `throw new Error('phrase en
français')`. Or Convex expurge le message d'une erreur ordinaire en production — seul le
contenu d'une `ConvexError` traverse jusqu'au client. Le serveur ne peut donc pas se permettre
de composer des phrases : il doit parler un langage stable que le client traduit. Une
internationalisation future (même lointaine) demanderait de récrire tout le texte, partout,
sans garantie d'en avoir trouvé chaque occurrence.

**Le code français gênait plus qu'il n'aidait pour tout ce qui touche à des bibliothèques,
API ou conventions anglaises par nature** (three.js, Convex, React) : le mélange
`origineLibelle` / `MeshStandardMaterial` / `useEffect` ne réduisait pas la friction que la
règle voulait éviter, il en ajoutait une deuxième — deux vocabulaires dans le même fichier,
l'un imposé par le domaine, l'autre par l'écosystème.

Un bug concret a cristallisé la décision : `PanneauPaysSelectionne.tsx` et `OngletEnvoi.tsx`
comparaient une nation adverse (`"Allemagne"`, servie en français par `convex/vue.ts`) au nom
de pays de `monde.json` (`"Germany"`, en anglais, Natural Earth). La comparaison ne matchait
jamais ; le panneau affichait « pays neutre » sur toute nation adverse. La table
`PAYS_DE_NATION` qui aurait dû servir de couture existait, mais n'était pas utilisée aux deux
endroits — parce que rien ne structurait ce genre de couture comme frontière unique.

## Décision

**Le code est en anglais** : identifiants, types, fichiers, tables et champs Convex, classes
CSS, commentaires. **Le jeu reste uniquement francophone** pour le joueur — aucune bascule de
langue n'est prévue — mais tout texte qu'il lit passe par une seule table de traduction,
`src/i18n/fr.ts`.

Trois conséquences structurelles :

**Les erreurs serveur sont des codes, jamais des phrases.** `convex/errors.ts` définit
`fail(code: ErrorCode, details?)`, qui lève une `ConvexError({ code, ...details })`. Chaque
mutation ou query qui peut échouer y passe. `fr.errors` (dans `fr.ts`) associe chaque code à
une fonction qui rend la phrase française à partir des détails. Le client décode via
`errorCode()` / `errorMessage()` (`src/data/errors.ts`).

**`src/domain/` (ex-`domaine/`) peut importer `i18n/fr.ts`.** C'est la seule exception à la
règle « TypeScript pur, aucune dépendance » : `fr.ts` est lui-même un module de constantes et
de fonctions pures, sans React ni Convex. Le domaine reste donc testable sans navigateur, et
sans dupliquer les libellés qu'il doit produire (ex. `stackLabel`, `roleLabel`).

**Les ids de jeu (`Nation`, `UnitRole`, `MovementType`, …) vivent dans `src/domain/ids.ts`**,
détachés de leur libellé. `fr.ts` les indexe (`fr.nations.france`, `fr.roles.infantry`) plutôt
que l'inverse — c'est la table de traduction qui connaît le domaine, jamais le contraire.

## Justification

Une table de traduction unique rend la couture nom-de-pays / id-de-nation **structurelle** :
`src/domain/nations.ts` exporte `COUNTRY_BY_NATION` et `NATION_BY_COUNTRY` une seule fois : tout
code qui doit comparer un pays de carte à une nation de joueur passe par l'une des deux, il ne
compare plus deux chaînes à l'œil. Le bug qui a motivé cette ADR devient une erreur de type si
quelqu'un compare directement `country === opponent.nation`, puisque leurs types (`string` de
`monde.json` vs `Nation`) ne s'unifient plus par accident.

Les erreurs en codes rendent les tests indépendants de la langue d'affichage :
`rejects.toThrow('NATION_TAKEN')` reste vrai même si `fr.errors.NATION_TAKEN` change de
formulation. La preuve porte sur le comportement, pas sur une phrase.

## Conséquences

- **`convex/constantes.ts` → `convex/constants.ts`**, `convex/unites.ts` → `convex/units.ts`,
  et tous les modules Convex ont suivi. Les ADR antérieures (0009 à 0015) qui citent les
  anciens noms de fichiers ne sont **pas** réécrites : elles restent un compte-rendu historique
  de la décision au moment où elle a été prise. Se fier à un chemin de fichier cité dans une
  ADR ancienne sans vérifier qu'il existe encore est une erreur classique — ces ADR le
  confirment.
- **`src/domaine/`, `src/donnees/`, `src/coque/`, `src/carte/`, `src/emblemes/`** sont devenus
  `src/domain/`, `src/data/`, `src/shell/`, `src/map/`, `src/emblems/`.
- **Les routes gardent leurs chemins d'URL en français** (`/accueil`, `/salon`, `/plateau`) et
  la fiche 11 du brief UI n'est pas touchée : cette ADR ne change rien à ce que le joueur voit,
  seulement à ce que le code dit en interne.
- **`CONVENTIONS.md` §5 est réécrit** (« Nommer en français » devient « Code en anglais, jeu en
  français ») ; les autres sections qui citaient des exemples français (`§1`, `§3`, `§8`, `§10`)
  sont mises à jour avec les nouveaux noms, sans changement de règle.

## Ce qu'on abandonne

**Un seul vocabulaire dans le code.** Le domaine parle maintenant deux langues à des couches
différentes — anglais dans le code, français dans `fr.ts` — plutôt qu'un seul vocabulaire de
bout en bout. Le risque que ça voulait éviter (deux mots pour la même chose) est neutralisé
autrement : `fr.ts` est la seule source, jamais recopiée, et `stackLabel`/`roleLabel`
centralisent le passage id → libellé.

**La possibilité de lire un message d'erreur serveur brut en développement.** Une erreur
Convex non catégorisée (bug, pas cas prévu) ne rend plus de phrase française : elle sort en
`console.error` et en notification générique (`fr.unexpectedError`). C'est voulu — voir la
discussion sur les erreurs attendues vs imprévues dans `src/data/errors.ts` — mais un
développeur qui débogue doit ouvrir la console, pas lire l'écran.
