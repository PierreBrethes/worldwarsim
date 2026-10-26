# Socle des animations : l'interface (ADR 0036)

Signatures sans corps. Chaque fichier dit où il vit, qui l'appelle, et ce qu'il remplace.
L'état de départ est celui du lot 0 (#286).

## Vue d'ensemble

```
src/map/cues.ts ──── sortiesOf ───► WorldMap.tsx ── engine.cue(cue) ──►  MapEngine (index.ts)
                                                                          │ play(host, id, sequence)
                                         timelines/barracks.ts ──────────►│
                                                                          ▼
                                                              SequenceLayer (sequences.ts)
                                                              │ pieceOf / standIn   │ bakedRig + RIG_PARTS
                                                              ▼                     ▼
                                                    MaquetteLayer (hôte)     baking.ts, emblems/rigs.ts
                                                    StandingLayer (hôte, lot B)
```

L'interface profonde est `SequenceLayer` : quatre membres pour l'appelant (`play`, `step`,
`active`, `motion`), et derrière eux l'horloge, la cuisson à la demande, la substitution, le
rapproché, le champ, le plafond, la fin sur la pose de repos.

## `src/emblems/rigs.ts` (nouveau)

Les noms que la cuisson articulée garde, par fichier. Données, comme les manifestes voisins.

```ts
/** Par fichier de modèle (sa racine, sans extension) : les pièces qu'une séquence fait bouger,
 *  gardées à leur pivot par la cuisson articulée. Le reste se fond. */
export const RIG_PARTS = {
  barracks: ['porte_gauche', 'porte_droite', 'remise_porte_gauche', 'remise_porte_droite'],
  // les autres familles entrent avec la séquence qui les fait bouger (liste : enquête §2)
} as const;

export type RigFamily = keyof typeof RIG_PARTS;
export type RigPart<F extends RigFamily> = (typeof RIG_PARTS)[F][number];
```

## `src/map/engine/baking.ts` (étendu)

```ts
export type Part = { readonly geometry: BufferGeometry; readonly material: Material };

/** Inchangée : la cuisson de repos d'un bâtiment, une géométrie par matériau. */
export function bakedParts(scene: Object3D): Part[];

/** Inchangée. */
export function mergedByMaterial(meshes: ReadonlyArray<Mesh>, fromWorld: Matrix4): Part[];

/**
 * **Une scène cuite autour des nœuds qu'on fait bouger** : chaque nœud que `keeps` retient
 * garde son nom, son pivot et ce qui pend de lui ; les maillages sous lui se fondent par
 * matériau ; tout autre nœud disparaît. Au repos, elle dessine exactement `bakedParts`.
 * (Le corps de `bakedFigurine`, `figurine.ts:161-207`, déplacé et paramétré.)
 */
export function bakedRig(scene: Object3D, keeps: (node: Object3D) => boolean): Group;

/** Ce que les deux cuissons ne dessinent pas : le `drapeau`, jusqu'à #279. Écrit au lot 0 dans
 *  `bakedParts` ; le lot A le rend partagé. */
export function isDrawn(node: Object3D): boolean;
```

## `src/map/engine/sequences.ts` (nouveau)

```ts
type Vec3 = readonly [x: number, y: number, z: number];

/** **L'écart d'une pièce à sa pose de repos.** Absent, le repos. `shift` en mètres du modèle. */
export type PartPose = {
  readonly turn?: Vec3; // radians, appliqués après la rotation de repos
  readonly shift?: Vec3;
  readonly stretch?: Vec3; // multiplie l'échelle de repos (le câble de la grue)
  readonly fade?: number; // 1 plein, 0 effacé ; la pièce et ce qui pend d'elle
};

/** `root` est la copie entière : une troupe qui marche de la porte à sa place (lot B). */
export type Pose<F extends RigFamily> = Partial<Record<RigPart<F> | 'root', PartPose>>;

/**
 * **Une séquence, fonction pure du temps** (les storyboards). `at(t)` pour `0 ≤ t < ms` ;
 * `at(t)` rend `{}` pour `t ≥ ms` — la pose finale est la pose de repos (ADR 0036 §4).
 */
export type Sequence<F extends RigFamily = RigFamily> = {
  readonly family: F;
  readonly ms: number;
  at(t: number): Pose<F>;
};

/** **Une couche qui dessine des pièces au repos**, et en prête une à une séquence. */
export type SequenceHost = {
  /**
   * La pièce `id` telle qu'elle est dessinée : son fichier et sa boîte dans le monde
   * (`null` le temps qu'un lot reconstruit se pose : on ne juge pas cette image-là) ;
   * `null` quand elle n'est pas dessinée ici — partie, fantôme d'un relevé, chantier, épingle,
   * écartée par un rejeu.
   */
  pieceOf(id: string): { readonly url: string; readonly box: Box3 | null } | null;
  /** La copie se tient à la place de la pièce au repos, placée comme elle, jusqu'à `null`. Un
   *  `rebuild` de l'hôte la garde par son id. */
  standIn(id: string, copy: Object3D | null): void;
};

/** **Sous cette taille à l'écran, une séquence ne joue pas.** `@a-mesurer` */
export const PLAY_PX = 150;
/** **Au plus tant de copies à la fois** ; au-delà, la pose finale. `@a-mesurer` */
export const MAX_PLAYING = 4;

export class SequenceLayer {
  /** `full` seul joue ; tout autre réglage finit les séquences en cours à la prochaine image. */
  motion: MapMotion;

  constructor(
    /** Ce que voit l'œil cette image : la boîte coupe le champ, et fait au moins `PLAY_PX`.
     *  Le moteur la refait à chaque image depuis `this.eye`. */
    sees: (box: Box3) => boolean,
  );

  /** Lance `sequence` sur la pièce `id` de `host`, à l'instant `now` (`performance.now()`).
   *  Ne fait rien hors de `full`, hors de vue, au-delà de `MAX_PLAYING`, ou si la pièce joue déjà. */
  play<F extends RigFamily>(host: SequenceHost, id: string, sequence: Sequence<F>, now: number): void;

  /** Pose chaque copie à son `t` ; finit (rend la pièce au repos) ce qui est au bout, parti,
   *  hors de vue ou hors de `full`. La boucle l'appelle à chaque image dessinée. */
  step(now: number): void;

  /** Une séquence joue : la boucle garde ses images (`index.ts:3143-3151`). */
  get active(): boolean;

  dispose(): void;
}

/** **Un signal** : ce que la vue vient d'apprendre et que la carte joue. Grandit par lot. */
export type Cue = { readonly kind: 'sortie'; readonly siteId: string };
```

Privé au fichier (non exporté) : `articulatedOf(url, family): Promise<Group>` (cache par
`url` et famille, `sceneOf` puis `bakedRig(scene, (n) => RIG_PARTS[family].includes(n.name))`),
la copie posée (`rest` par nœud nommé, `pose(p)` qui remet au repos puis applique l'écart),
les matériaux propres du fondu, rendus à la fin.

## `src/map/engine/timelines/` (nouveau, pur, sans three)

```ts
// timelines/curves.ts — celles des storyboards (storyboard-caserne/commun/scene.js:71-86)
export const span: (t: number, from: number, to: number) => number; // 0 → 1 entre les deux
export const ease: {
  readonly out3: (k: number) => number;
  readonly in2: (k: number) => number;
  readonly inOut: (k: number) => number;
  readonly march: (k: number) => number;
  readonly drive: (k: number) => number;
  readonly push: (k: number) => number;
};

// timelines/barracks.ts
/** **Les battants de la caserne laissent passer une recrue** (storyboard-caserne, `T.caserne`) :
 *  ouverts vers l'extérieur en 550 ms, tenus le temps qu'elle passe, refermés en 450 ms, un
 *  rebond de 4° en 80 ms. `@a-mesurer` : le temps tenu, jusqu'à #268. */
export function barracksDoors(): Sequence<'barracks'>;
```

## `src/map/engine/maquettes.ts` (étendu) : premier hôte

```ts
export class MaquetteLayer implements SequenceHost {
  // … inchangé …
  pieceOf(id: string): { url: string; box: Box3 | null } | null;
  standIn(id: string, copy: Object3D | null): void;
}
```

Ce qui change dedans :
- un `Map<id, Object3D>` des copies, dans `this.group`, hors des lots ;
- `orient` (`:686-732`) : pour un item doublé, l'instance reçoit l'échelle nulle à son point et
  la copie la matrice composée (`:706-707`) ; `standIn` remet `item.near = -1` pour forcer
  l'écriture, comme `place` (`:539`) ;
- `under` (`:615-634`) : essaie aussi les copies (récursif), et rend l'id de l'item ;
- `pieceOf` rend `null` pour un lot `washed` ou `atWork`, un item `cleared` ou `near ≤ 0` ;
- `dispose` retire les copies.

## `src/map/engine/standing.ts` (étendu au lot B) : deuxième hôte

```ts
export class StandingLayer implements SequenceHost {
  /** `id` = `${pileId}/${group}` : un groupe de la pile, celui d'une figurine. */
  pieceOf(id: string): { url: string; box: Box3 | null } | null;
  standIn(id: string, copy: Object3D | null): void;
}
```

La copie remplace le clone du groupe sous `model` (`figurine.ts:259`), à la même échelle
(`model.scale`). Les pieds de pile (`footprint`, `standing.ts:183-189`) ne changent pas : `under`
et `pick` non plus. Une pile rhabillée (`dressedGroups`) rend `null` à `pieceOf` : la séquence finit.
`Figurine` gagne le fichier de son groupe (`url`), dont le moteur a besoin pour cuire la copie.

## `src/map/engine/index.ts` (étendu)

```ts
export class MapEngine {
  /** **La carte joue ce que la vue vient d'apprendre** (ADR 0036). */
  cue(cue: Cue): void; // commence par this.invalidate()
}
```

Ce qui change dedans :
- `private readonly sequences = new SequenceLayer((box) => …)` : un `Frustum` refait par image
  depuis `this.eye`, et la taille de la boîte à l'écran sur `REFERENCE_PX_PER_UNIT`
  (`figurine.ts:75`, exporté) ;
- `this.sequences.active ||` après `this.maquettes.settling ||` (`:3146`) ;
- `this.sequences.step(now)` juste avant `this.maquettes.orient(…)` (`:3209`) ;
- `setMapMotion` (`:2499-2509`) : `this.sequences.motion = motion` ;
- `dispose` (`:1810`) : `this.sequences.dispose()` ;
- `cue` : `switch (cue.kind)`, `'sortie'` → `this.sequences.play(this.maquettes, cue.siteId,
  barracksDoors(), performance.now())`.

## `src/map/cues.ts` (nouveau, pur)

```ts
/**
 * **Les casernes dont sort une recrue** : l'id de maquette (`beside`) de chaque pile de caserne
 * qui porte une troupe que `known` ne connaissait pas — une recrue, pas un retour de marche.
 */
export function sortiesOf(
  known: ReadonlySet<string>, // les ids de mes troupes à la vue d'avant
  piles: ReadonlyArray<StandingPile>,
): ReadonlyArray<string>;
```

Appelé dans un effet de `WorldMap.tsx` sur `troops` et `piles`, sur le modèle de
`raisedReaches` (`WorldMap.tsx:1440-1445`) : rien à la première vue.

## Retiré ou remplacé

| Quoi | Où | Devient |
|---|---|---|
| `bakedFigurine` (corps) | `figurine.ts:161-207` | `bakedRig` dans `baking.ts` ; `bakedFigurine = (s) => bakedRig(s, movesOnItsOwn)` reste, une ligne, pour `baked.test.ts` |
| filtre du drapeau du lot 0 | `bakedParts` | `isDrawn`, partagé par les deux cuissons |
| `crate()`, `BOX`, `SLAT`, `WOOD`, `SLATS` | `crates.ts:4-36` | `crate.ts` (la caisse unique, en mètres) ; `CratePile` garde `SPOTS` et sa chute |
| `CRATE` du paquet | `parachute.ts:50`, `:102` | la caisse unique, à l'échelle de la voilure |
| `hingeOf` du POC | `WWS/prototypes/interactions/commun/scene.js:222` | rien : le pivot est dans le GLB |

Rien d'autre ne devient mort : `spin` (`figurine.ts:274-285`) tourne toujours les hélices de la
cuisson de repos ; `stride` et `squadOf` (`infantry.ts`) posent toujours les hommes au repos.
