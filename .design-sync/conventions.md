# La Manchette — conventions pour construire avec ces composants

Jeu de stratégie web, carte du monde, esthétique de **presse illustrée de 1940** : papier crème,
encre brune, un seul rouge d'alerte. Tout texte affiché est **en français**.

## Mise en place

Aucun provider : les composants se montent tels quels. Tout vient de `styles.css`, qui charge
`_ds_bundle.css` — jetons CSS et polices Google (Bodoni Moda, Source Serif 4, Archivo Narrow,
IBM Plex Mono). **Sans cette feuille, tout est sans style.** Les composants lisent des variables
CSS posées sur `:root` : ils ne portent pas leur fond, c'est le support que vous dessinez.

```tsx
const paper = { background: 'var(--paper)', color: 'var(--ink)', padding: 16 };
const desk = { background: 'var(--map-desk)', color: 'var(--paper)', padding: 16 };
```

Deux supports, deux encres : **papier** (`--paper`, texte `--ink`) et **bureau sombre**
(`--map-desk`, texte `--paper`). `onPaper` / `onDark` des composants disent sur lequel
on pose. `Stamp` prend l'encre du bureau si un ancêtre pose `--stamp-ink`.

## Idiome de style

Pas de classes utilitaires à inventer : **jetons `var(--*)` + styles en ligne** pour votre propre
mise en page. Noms réels : `--paper`, `--paper-dim`, `--ink`, `--ink-soft`, `--ink-quiet`,
`--ink-note`, `--map-desk`, `--critical` (**le rouge, réservé à ce qui exige l'attention** : une
attaque subie, un manque), `--routine`. Polices : `var(--font-display)` (Bodoni, titres et
manchette), `var(--font-text)` (Source Serif, corps de dépêche), `var(--font-body)` (Archivo
Narrow, interface), `var(--font-mono)` (chiffres, dates). Bordures d'un pixel à l'encre, pas
d'ombre portée ni de coins arrondis.

## Où lire la vérité

`styles.css` et `_ds_bundle.css` (jetons complets) ; par composant, `<Nom>.d.ts` (props) et
`<Nom>.prompt.md`. Les planches (`BuildingPlate`, `ResourcePlate`, `UnitSprite`, `ObjectivePlate`)
prennent des **clés fermées** — listées dans leur `.d.ts` : 8 nations (`france uk usa ussr germany
japan italy china`), 8 ressources, 9 rôles d'unité, 15 bâtiments. Une clé sans planche affiche
un cadre pointillé : c'est voulu, pas une erreur.

## Un exemple qui rend

```tsx
<div style={{ background: 'var(--paper)', color: 'var(--ink)', padding: 16, width: 360 }}>
  <Masthead date="Lundi 4 octobre 1943" />
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
    <Flag nation="uk" onPaper />
    <ResourcePlate resource="coal" height={28} />
    <div style={{ flex: 1 }}><Gauge filled={0.9} inflow={4} height={8} /></div>
    <Stamp label="Hors réseau" tone="critical" size="small" />
  </div>
</div>
```
