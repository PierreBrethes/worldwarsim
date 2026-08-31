# Prompt Claude Code — le bandeau des ressources (couche permanente 1/3)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Maquette validée :
`WWS/docs/prompts/design/maquette-couche-permanente-2.md` planche 2a (canvas « Interface de
saison »). Ne commit pas, ne push pas.

## La décision (Pierre, 30/08)

**Une information, une fois, au bon endroit.** Ce qui est rare et borne l'action — les
ressources — vit dans une ligne permanente sous le bandeau nation, façon cours de bourse.
Le panneau Réserves haut-droit disparaît : le bandeau le remplace.

## Ce qui change

**`src/shell/ResourceBand.tsx`**, monté dans `Shell.tsx` entre `NationBanner` et le corps.
- Une ligne : pour chaque ressource, `ResourceIcon` à 16 px puis le **stock seul** en chiffres
  mono (`view.me.resources[key].stock`, arrondi). **Ni nom, ni plafond, ni débit** sur le bandeau.
  Ordre et groupes : entrepôt (nourriture, tissus, charbon, minerais, alliage, bandages) puis
  dépôt (pétrole, munitions), séparés d'un filet double — lis `STORED_BY` plutôt que de
  recopier la liste.
- **Deux marques d'encre, jamais d'icône**, à gauche de la ressource, taille d'un caractère :
  *plein* (pavé plein, encre critique sur nom et chiffres) quand le stock touche le plafond ;
  *insuffisant* (pavé creux, encre notable) quand le stock ne couvre pas le coût de la **tête de
  file** du chantier. Rien d'autre ne marque.
- **Survol d'une ressource** : infobulle papier « alliage · 84 / 120 · +12 / h · fonderie MK1 »
  — le seul endroit où le nom, le plafond, le débit et la source apparaissent. La source est la
  chaîne de `view.me.chains` dont `output` est la ressource, avec son niveau ; une ressource
  sans chaîne (extraite, ou reçue) n'a pas de source. **Survol d'une marque** : le diagnostic —
  « la fonderie tourne pour rien — agrandir l'entrepôt » / « il manque 15 de pétrole pour le
  port en file » (`fr.reserves` a déjà `saturated` et le voisinage : réutilise les tournures,
  français de presse, vocabulaire imposé).
- **Repliable** (chevron à droite, état gardé en `localStorage`). Replié : une ligne de la
  hauteur d'un filet qui ne montre **que les ressources marquées** ; quand rien n'est marqué,
  le filet et le chevron. Replier ne cache jamais une marque.
- `ReservesPanel.tsx` supprimé, avec `plateau.tsx:880` et les clés `fr.reserves` que plus
  personne ne lit. `src/domain/resource-strip.ts` reste s'il sert encore à Production ; sinon
  il part aussi.

**Domaine pur** : `src/domain/resource-band.ts` — `marksOf(view)` retourne, par ressource,
`'full' | 'short' | null` et le diagnostic ; `sourceOf(view, key)` la chaîne. Aucune règle dans
le composant. Tests : plein à `stock === cap` et pas en dessous ; court seulement contre la tête
de file (rien en file → jamais court) ; une ressource sans chaîne → source nulle ; l'ordre
suit `STORED_BY`.

## Ce qui ne change pas

Économie, Production, l'organigramme, les prix affichés. Le bandeau nation (slots, journal,
horloge) reste au-dessus, inchangé.

## Vérifications

`npm run verifier`. À la main : bandeau sous la manchette ; survol → infobulle ; un entrepôt
plein → marque + diagnostic ; un port en file sans pétrole → marque creuse ; replié avec une
marque → la marque reste ; replié sans marque → un filet ; recharger → l'état plié tient.
