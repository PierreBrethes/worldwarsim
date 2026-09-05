# journal-corps-de-texte — le corps des dépêches n'est pas la manchette

Lis `CLAUDE.md` et `CONVENTIONS.md`. Ne commit pas, ne push pas. Petit chantier, client pur,
après `entrer-en-garnison`.

## Le constat

Retour de Pierre (04/09) : « l'écriture des dépêches est redevenue l'écriture du titre ». Ce
n'est pas un retour en arrière — `git log` sur `JournalWindow.tsx` s'arrête à `4f3bb52`
(journal-restylage) — c'est le restylage lui-même : les corps de dépêche (`Dispatch`, ~l. 326),
le chapeau de la manchette et les lignes « au réveil » sont en `--font-display` (Bodoni Moda),
la même face que les titres. La maquette de design distinguait titre (didone) et texte (serif de
labeur) ; le dépôt n'a que trois faces (`index.css` : display, body, mono) — la face de texte
n'a jamais été ramenée.

## Ce qui change

1. `src/styles/index.css` : une quatrième face, `--font-text: 'Source Serif 4', Georgia,
   serif` — chargée dans `index.html` avec les autres (poids 400 et 600, italique 400 ;
   `display=swap`). `WWS/maquettes/tokens.css` suit (même nom, même valeur), le dépôt et les
   maquettes disent la même chose.
2. `JournalWindow.tsx` : passent en `--font-text` — le corps des dépêches, le chapeau de la
   manchette, les lignes « au réveil », les notes en italique (« rien à signaler », etc.).
   **Restent en `--font-display`** : la manchette, le chiffre des non-lues, les titres h3 de
   colonne, le titre gras de chaque dépêche (`Dispatch`, l. 326 — c'est « le titre » que Pierre
   veut garder). Les kickers en capitales espacées restent en `--font-body`, les heures en
   mono.
3. Nulle part ailleurs : la face est un jeton, les autres fenêtres la prendront le jour où
   leur contrat le demande.

## Cas d'acceptation

1. Dans le journal, le titre d'une dépêche et son corps sont dans deux faces différentes,
   lisibles comme titre / texte ; la manchette n'a pas bougé.
2. La police est chargée (onglet réseau : une requête `Source+Serif+4`), pas de flash de
   Georgia après le premier chargement.
3. `grep -c "font-text" src` ne touche que `index.css` et `JournalWindow.tsx`.

`npm run verifier` vert. Un commit.
