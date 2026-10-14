import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type DisplayedRegion, type RegionsData } from '@/domain/world';
import { HELD_OPACITY, lavis, nationShades, PALETTE, PEN_OPACITY, penOn } from './palette';
import { COUNTRY_THICKNESS, onLand, type WorldFrame } from './frame';
import {
  mulberry,
  seed,
  sketchRegion,
  TerrainSketches,
  zoomFade,
  type PenStrands,
} from './terrain';

export const REGIONS_FULL_DISTANCE = 30;
export const REGIONS_GONE_DISTANCE = 65;
/**
 * Well under the country borders' opacity (0.62 at rest, reinforced at zoom), and dotted as on
 * the prototype (`table-etat-major`, P:329): the hierarchy between country and region goes
 * through the ink and the dash, WebGL drawing both one pixel wide.
 */
const FULL_OPACITY = 0.38;
/** The prototype's two inked for one blank, in screen pixels so the rhythm holds at any zoom. */
const DASH_PX = 4;
const GAP_PX = 2;

/** Below this share of the fade, the layer is not on screen — so it is not aimable either. */
const VISIBLE_SHARE = 0.01;

/** Stacking flush with the slab: fill under the strokes, strokes under the hover and the borders. */
const STROKE_LIFT = 0.003;
/** Under everything else the layer draws: possession is the ground the rest is laid on, and a
 *  region that carries a building must still show the denser built ink over its holder's. */
const HELD_LIFT = 0.0005;
/** **La hachure passe sous la couleur pleine** (ADR 0020 §7) : une région disputée revenue au
 *  voisin pendant la désactivation est pleine chez lui et suspendue chez moi, les deux à la fois,
 *  et c'est la possession réelle qui doit se lire par-dessus le souvenir. */
const SUSPENDED_LIFT = 0.00025;
const BUILT_LIFT = 0.001;
/** Just above the built fill: a designated region is an answer to a gesture, and it has to
 *  read over the ink of what already stands there. */
const DESIGNATED_LIFT = 0.002;
const HOVER_LIFT = 0.0035;
const ANCHOR_LIFT = 0.001;
/** Over the fills, under the hover contour that frames them. */
const SKETCH_LIFT = 0.003;

/** Enough to read as a wash over the country's own ink, never enough to hide the ground. */
const DESIGNATED_OPACITY = 0.62;

/**
 * Ce qu'un joueur **connaît** d'un tenant, et de quelle encre — la forme que `control.held` sert
 * une fois datée. `wash` est la franchise de la teinte : 1 pour une région à jour, décroissant
 * avec l'âge du relevé (`surveyWash`). L'ancienneté se voit donc en permanence et pas au survol
 * seul (ADR 0020 §5) — sans ce signal, une décision prise sur un relevé périmé se lit comme un
 * bug.
 */
export type HeldClaim = {
  readonly ink: string;
  readonly regions: ReadonlyArray<{
    readonly id: string;
    readonly wash: number;
    /**
     * Les trois états que sert `control.held`, tels quels. `suspended` est **le souvenir d'une
     * couleur, jamais une couleur** (ADR 0020 §7). La zone d'un avant-poste hors service n'est pas tenue — elle ne compte ni au classement ni à la production — et elle
     * disparaissait pourtant de la carte : son propriétaire n'avait plus rien à lire là où il
     * tenait la veille. Hachurée, elle dit la suspension sans jamais se faire passer pour une
     * possession, ce qu'un aplat pâle aurait fait.
     */
    readonly state: 'current' | 'surveyed' | 'suspended';
  }>;
};

type HeldState = HeldClaim['regions'][number]['state'];

/**
 * **La hachure se mesure en pixels d'écran, pas en kilomètres** (ADR 0020 §1 : « une couleur qui
 * est le score doit se lire à toute distance »). Un motif gravé dans le sol se replie en moiré au
 * dézoom et la zone y redevient un aplat — c'est-à-dire un mensonge, puisqu'elle aurait alors
 * l'air tenue. Posée au fragment, la trame garde le même pas du monde entier à la région.
 *
 * Une injection dans le matériau du lavis plutôt qu'un `ShaderMaterial` à part : la teinte doit
 * rester *la même encre sous la même lumière* que les régions tenues, et un matériau jumeau aurait
 * eu à réapprendre l'éclairage du plateau pour finir par en diverger.
 */
const HATCH_PERIOD = 9;
const HATCH_WIDTH = 3.4;
const HATCH_EDGE = 0.9;

/**
 * Le même procédé pour toutes les trames du sol : `trame` est la position du fragment en pixels
 * CSS, et le corps ne fait que moduler la couleur déjà éclairée. La clef de programme porte le
 * corps — sans elle, three.js reconnaît deux trames au même `onBeforeCompile` et leur sert le
 * premier programme compilé.
 */
export function screenTrame<M extends MeshStandardMaterial>(material: M, body: string): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.trameScale = { value: window.devicePixelRatio || 1 };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float trameScale;\nvoid main() {')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        vec2 trame = gl_FragCoord.xy / trameScale;
        ${body}`,
      );
  };
  material.customProgramCacheKey = () => body;
  return material;
}

const hatch = (material: MeshStandardMaterial): MeshStandardMaterial =>
  screenTrame(
    material,
    `float band = mod(trame.x + trame.y, ${HATCH_PERIOD.toFixed(1)});
    float ink = 1.0 - smoothstep(
      ${(HATCH_WIDTH - HATCH_EDGE).toFixed(2)},
      ${(HATCH_WIDTH + HATCH_EDGE).toFixed(2)},
      band
    );
    if (ink <= 0.004) discard;
    gl_FragColor.a *= ink;`,
  );

/**
 * **Un relevé est gravé, il n'est pas imprimé** (`table-etat-major.md`) : la couleur du tenant vu
 * ce jour-là, en tailles horizontales serrées sur un fond plus pâle de la même encre. Le fond
 * garde la teinte lisible au loin — c'est le score, il doit se lire sans zoom —, les tailles la
 * distinguent de l'encre fraîche d'une région à jour, au même délavage. Horizontales, pour ne
 * jamais se confondre avec la hachure oblique d'une zone suspendue.
 */
const ENGRAVE_PERIOD = 4;
const ENGRAVE_WIDTH = 1.7;
const ENGRAVE_EDGE = 0.6;
const ENGRAVE_GROUND = 0.45;

const engrave = (material: MeshStandardMaterial): MeshStandardMaterial =>
  screenTrame(
    material,
    `float cut = 1.0 - smoothstep(
      ${(ENGRAVE_WIDTH - ENGRAVE_EDGE).toFixed(2)},
      ${(ENGRAVE_WIDTH + ENGRAVE_EDGE).toFixed(2)},
      mod(trame.y, ${ENGRAVE_PERIOD.toFixed(1)})
    );
    gl_FragColor.a *= mix(${ENGRAVE_GROUND.toFixed(2)}, 1.0, cut);`,
  );

/**
 * **Une donnée future ne doit pas pouvoir repeindre le monde.** Natural Earth projette de loin
 * en loin un îlot dégénéré sur tout le cadre, et un `regions.json` cuit avant le filtre du
 * 09/09 a posé ce cadre en troisième anneau du Maryland : dès qu'une encre lui arrivait, la
 * carte remplissait la sphère entière, mer comprise. L'actif est vérifié à la cuisson
 * (`convex/invariants.test.ts`) ; ceci est le cran d'arrêt du dessin.
 *
 * Les deux dimensions à la fois : l'Antarctique couvre légitimement les deux tiers du monde en
 * x, et un dixième en y.
 */
const spansTheFrame = (
  ring: ReadonlyArray<readonly [number, number]>,
  frame: WorldFrame,
): boolean => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return maxX - minX > frame.width / 2 && maxY - minY > frame.height / 2;
};

type Box = readonly [minX: number, minY: number, maxX: number, maxY: number];

export type PreparedRegion = {
  readonly region: DisplayedRegion;
  readonly box: Box;
  /** One box per ring, same order: `contains` skips a ring the point cannot cross. */
  readonly ringBoxes: ReadonlyArray<Box>;
  readonly area: number;
};

const SKETCH_CACHE_SIZE = 32;

/**
 * The admin-1 borders (regions, states, departments) of `regions.json` — inner segments
 * only, coasts and country borders being drawn already. The layer only exists up close: far
 * out it fades before becoming noise. Once visible, it answers hover — point in region,
 * smallest first (an enclave beats its envelope).
 */
export class RegionLayer {
  readonly lines: LineSegments;
  /** **Qui tient quoi** (ADR 0020 §1) — un maillage par encre, jamais un seul teinté au sommet :
   *  huit joueurs au plus, donc huit matériaux, et la couleur d'un joueur reste une valeur qu'on
   *  lit dans un débogueur plutôt qu'un attribut de géométrie. */
  readonly held = new Group();
  readonly built: Mesh;
  /** The regions an armed key accepts — the mobilisation order's answer, laid on the ground. */
  readonly designated: Mesh;
  readonly hoverOutline: LineSegments;
  readonly terrain = new TerrainSketches();
  private readonly lineMaterial: LineDashedMaterial;
  private readonly builtMaterial: MeshStandardMaterial;
  private readonly designatedMaterial: MeshStandardMaterial;
  private readonly hoverMaterial: LineBasicMaterial;
  private prepared: PreparedRegion[] = [];
  private hoveredRegion: DisplayedRegion | null = null;
  private claims: ReadonlyArray<HeldClaim> = [];
  /** Ce que le dernier `showHeld` a effectivement posé. La liste arrive à chaque battement
   *  d'horloge pour que le délavage vieillisse, et refondre huit maillages par seconde pour un
   *  cran qui n'a pas bougé serait le seul coût de tout ce système. */
  private laid = '';
  /** L'encre du tenant, par région : le survol la lit pour teinter le contour d'une région tenue
   *  à sa couleur plutôt qu'à celle de son terrain. */
  private heldByRegion = new Map<
    string,
    { readonly ink: string; readonly wash: number; readonly state: HeldState }
  >();
  /** A big region costs 100+ ms to sketch (the Nunavut), and the pointer crosses it again and
   *  again. Oldest out; emptied when the strands go stale (`rebuild`). */
  private readonly strandsCache = new Map<string, PenStrands>();
  private builtIds: ReadonlySet<string> = new Set();
  private designatedIds: ReadonlySet<string> = new Set();
  private share = 0;

  constructor(
    private readonly frame: WorldFrame,
    /** The countries painted whole on their own sheet, adm0 → ink — see `wholeSheets`. */
    private readonly onSheets: (sheets: ReadonlyMap<string, string>) => void = () => {},
  ) {
    this.lineMaterial = new LineDashedMaterial({
      color: PALETTE.border,
      transparent: true,
      opacity: 0,
    });
    this.lines = new LineSegments(new BufferGeometry(), this.lineMaterial);
    this.lines.visible = false;

    // The same material as the country slab, light included: an unlit fill would read as a
    // sticker rather than as ink laid on that very ground.
    this.builtMaterial = onLand(
      new MeshStandardMaterial({
        color: PALETTE.neutralLand,
        roughness: 0.97,
        metalness: 0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.built = new Mesh(new BufferGeometry(), this.builtMaterial);
    this.built.receiveShadow = true;
    this.built.visible = false;

    /**
     * The rail's amber — the ink of "you are here" (`FOCUS_MARK`) — and never the critical
     * ink: a region that accepts a placement is an invitation, not an alarm.
     */
    this.designatedMaterial = onLand(
      new MeshStandardMaterial({
        color: PALETTE.designated,
        roughness: 0.97,
        metalness: 0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.designated = new Mesh(new BufferGeometry(), this.designatedMaterial);
    this.designated.receiveShadow = true;
    this.designated.visible = false;

    this.hoverMaterial = onLand(
      new LineBasicMaterial({
        color: PALETTE.paper,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.hoverOutline = new LineSegments(new BufferGeometry(), this.hoverMaterial);
    this.hoverOutline.renderOrder = 1;
    this.hoverOutline.visible = false;
  }

  display(data: RegionsData): void {
    const points: number[] = [];
    // Along each line and not per segment: a dash restarting at every vertex would stutter.
    const distances: number[] = [];
    for (const line of data.lines) {
      let along = 0;
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i]!;
        const [bx, by] = line[i + 1]!;
        const next = along + Math.hypot(bx - ax, by - ay);
        distances.push(along, next);
        along = next;
        points.push(
          ax - this.frame.centerX,
          COUNTRY_THICKNESS + STROKE_LIFT,
          ay - this.frame.centerY,
          bx - this.frame.centerX,
          COUNTRY_THICKNESS + STROKE_LIFT,
          by - this.frame.centerY,
        );
      }
    }
    this.lines.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    geometry.setAttribute('lineDistance', new Float32BufferAttribute(distances, 1));
    this.lines.geometry = geometry;

    this.prepared = data.regions.map(prepare);
    this.rebuild();
  }

  /**
   * **Qui tient quelles régions, et de quelle encre.** La liste arrive calculée (`control.held`,
   * règle dans `domain/control.ts`) : la carte dessine ce qu'on lui tend, et une seconde lecture
   * ici colorerait un sol que le serveur ne donne à personne.
   *
   * Elle peut arriver avant les régions elles-mêmes — la couche garde la réclamation et la pose
   * quand les 500 Ko atterrissent, comme pour les bâtiments.
   */
  /** The countries not laid on the bare paper, by `adm0`, with the nation ink their lavis is
   *  made of: the pen reads its ground from there. */
  private grounds: ReadonlyMap<string, string> = new Map();
  private builtNationInk: string | null = null;

  setGrounds(grounds: ReadonlyMap<string, string>): void {
    this.grounds = grounds;
  }

  showHeld(claims: ReadonlyArray<HeldClaim>): void {
    const signature = JSON.stringify(claims);
    if (signature === this.laid) return;
    this.laid = signature;
    this.claims = claims;
    this.heldByRegion = new Map(
      claims.flatMap((claim) =>
        claim.regions.map(({ id, wash, state }) => [id, { ink: claim.ink, wash, state }] as const),
      ),
    );
    this.forgetSketches();
    this.rebuildHeld();
  }

  /**
   * The regions that carry a building, and the ink of the nation that raised them. **Only the
   * player's own ever arrive here**: `PlayerView` holds no opposing building, so no ownership
   * test guards this call — the fog is a property of the served data, not of the rendering
   * (ADR 0005).
   */
  showBuilt(regionIds: ReadonlySet<string>, ink: string): void {
    this.builtMaterial.color.set(nationShades(ink).built);
    this.builtNationInk = ink;
    /** La liste est refaite à chaque battement de la vue : sans ce garde, un pas de colonne
     *  retriangulait le sol bâti **et toute la couleur tenue**, qui n'avait pas bougé. */
    if (sameIds(regionIds, this.builtIds)) return;
    this.builtIds = regionIds;
    this.fill(this.built, this.builtIds, BUILT_LIFT);
  }

  /**
   * The regions a designated key accepts. It is **only ever a set of ids**: the rule that
   * produced them lives in the domain (`placementOf`), and the map draws what it is handed —
   * a second reading here would highlight ground the server refuses.
   */
  showDesignated(regionIds: ReadonlySet<string>): void {
    if (sameIds(regionIds, this.designatedIds)) return;
    this.designatedIds = regionIds;
    this.fill(this.designated, this.designatedIds, DESIGNATED_LIFT);
  }

  /** The fills and the pen's strands follow the data: new regions, everything redone. */
  rebuild(): void {
    this.forgetSketches();
    this.rebuildHeld();
    this.fill(this.built, this.builtIds, BUILT_LIFT);
    this.fill(this.designated, this.designatedIds, DESIGNATED_LIFT);
  }

  /** The pen's ground is the painted one: when it changes, the drawing on screen and the cached
   *  ones are stale, and the next hover redoes it. */
  private forgetSketches(): void {
    this.strandsCache.clear();
    this.terrain.clear();
    this.hoveredRegion = null;
  }

  /** Un maillage par tenant **et par cran de délavage**, refait entier : un diff par région
   *  coûterait plus cher que ces quelques fusions, et les crans sont ce qui garde leur nombre
   *  borné — huit encres, cinq franchises, jamais une teinte par région. */
  private rebuildHeld(): void {
    for (const child of this.held.children) {
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.held.clear();
    const sheets = wholeSheets(
      this.claims,
      this.prepared.map(({ region }) => region),
    );
    this.onSheets(sheets);
    for (const claim of this.claims) {
      /** La clef porte la franchise **et** la trame : deux régions de même encre ne partagent un
       *  maillage que si elles se peignent de la même façon. */
      const byWash = new Map<string, { wash: number; state: HeldState; ids: Set<string> }>();
      for (const region of claim.regions) {
        const key = `${region.wash}/${region.state}`;
        const kept = byWash.get(key) ?? {
          wash: region.wash,
          state: region.state,
          ids: new Set<string>(),
        };
        kept.ids.add(region.id);
        byWash.set(key, kept);
      }
      for (const { wash, state, ids } of byWash.values()) {
        const lift = state === 'suspended' ? SUSPENDED_LIFT : HELD_LIFT;
        const parts = this.prepared
          .filter(({ region }) => ids.has(region.id) && !sheets.has(region.country))
          .map(({ region }) => this.fillOf(region, lift));
        if (parts.length === 0) continue;
        const geometry = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false)!;
        if (parts.length > 1) parts.forEach((part) => part.dispose());
        const material = onLand(
          new MeshStandardMaterial({
            color: claim.ink,
            roughness: 0.97,
            metalness: 0,
            transparent: true,
            opacity: HELD_OPACITY * wash,
            depthWrite: false,
          }),
        );
        const fill = new Mesh(
          geometry,
          state === 'suspended'
            ? hatch(material)
            : state === 'surveyed'
              ? engrave(material)
              : material,
        );
        // L'encre est sur la feuille : l'ombre d'une pièce la couvre comme le papier dessous.
        fill.receiveShadow = true;
        this.held.add(fill);
      }
    }
  }

  private fill(mesh: Mesh, ids: ReadonlySet<string>, lift: number): void {
    mesh.geometry.dispose();
    const parts = this.prepared
      .filter(({ region }) => ids.has(region.id))
      .map(({ region }) => this.fillOf(region, lift));
    if (parts.length === 0) {
      mesh.geometry = new BufferGeometry();
      mesh.visible = false;
      return;
    }
    if (parts.length === 1) {
      mesh.geometry = parts[0]!;
    } else {
      mesh.geometry = mergeGeometries(parts, false)!;
      parts.forEach((part) => part.dispose());
    }
    mesh.visible = this.share > VISIBLE_SHARE;
  }

  /**
   * The layer is legible on screen — the same threshold that fades it in, and therefore the
   * one that decides whether the game aims at a region or at its country. It is named rather
   * than repeated: two literals would drift, and the map would highlight what the right click
   * no longer targets.
   */
  get isActive(): boolean {
    return this.share > VISIBLE_SHARE && this.prepared.length > 0;
  }

  /** The fade the whole zoomed-in layer shares — the buildings hang on this one, not on a twin. */
  get fade(): number {
    return this.share;
  }

  /**
   * Where a building stands on its region. The ring's centroid, unless the shape is hollow
   * enough to push it outside — a bay, a horseshoe valley — in which case an interior point
   * is drawn from the name, so the same building never wanders between two reloads.
   */
  anchorOf(regionId: string): Vector3 | null {
    const prepared = this.prepared.find(({ region }) => region.id === regionId);
    if (prepared === undefined) return null;
    const [x, y] = interiorPoint(prepared);
    return this.frame.toWorld(x, y, COUNTRY_THICKNESS + ANCHOR_LIFT);
  }

  /**
   * **A region's outline, for whoever has to sift points against it.** The box narrows the
   * search, the test settles it — the two travel together because a caller that had only the
   * second would walk the whole world to find its own coast (`MapEngine.setPlacing`).
   *
   * It is the layer that answers and not `regions.json` read a second time: the polygons are
   * already here, prepared and projected, and a second reading would be a second truth.
   */
  outlineOf(regionId: string): {
    readonly box: readonly [number, number, number, number];
    readonly covers: (x: number, y: number) => boolean;
  } | null {
    const prepared = this.prepared.find(({ region }) => region.id === regionId);
    if (prepared === undefined) return null;
    return {
      box: prepared.box,
      covers: (x, y) => contains(prepared, x, y),
    };
  }

  /** The point is in projected coordinates (those of `world.json`), not world coordinates. */
  regionAt(projectedX: number, projectedY: number): DisplayedRegion | null {
    return this.pick(projectedX, projectedY)?.region ?? null;
  }

  hover(projectedX: number, projectedY: number): DisplayedRegion | null {
    const kept = this.pick(projectedX, projectedY);
    this.changeHighlight(kept);
    return kept?.region ?? null;
  }

  /** Point in region, smallest first: an enclave beats the envelope that contains it. */
  private pick(projectedX: number, projectedY: number): PreparedRegion | null {
    let kept: PreparedRegion | null = null;
    for (const candidate of this.prepared) {
      const [minX, minY, maxX, maxY] = candidate.box;
      if (projectedX < minX || projectedX > maxX || projectedY < minY || projectedY > maxY)
        continue;
      if (kept !== null && candidate.area >= kept.area) continue;
      if (contains(candidate, projectedX, projectedY)) kept = candidate;
    }
    return kept;
  }

  clearHover(): void {
    this.changeHighlight(null);
  }

  /** Fade driven by camera→target distance; invisible, the layer costs nothing. */
  animate(cameraDistance: number, now: number, unitsPerPixel: number): void {
    this.share = Math.min(
      1,
      Math.max(
        0,
        (REGIONS_GONE_DISTANCE - cameraDistance) / (REGIONS_GONE_DISTANCE - REGIONS_FULL_DISTANCE),
      ),
    );
    this.lineMaterial.opacity = this.share * FULL_OPACITY;
    this.lineMaterial.dashSize = DASH_PX * unitsPerPixel;
    this.lineMaterial.gapSize = GAP_PX * unitsPerPixel;
    this.lines.visible = this.share > 0.01;
    this.builtMaterial.opacity = this.share;
    this.built.visible = this.share > VISIBLE_SHARE && this.builtIds.size > 0;
    this.designatedMaterial.opacity = this.share * DESIGNATED_OPACITY;
    this.designated.visible = this.share > VISIBLE_SHARE && this.designatedIds.size > 0;
    this.hoverMaterial.opacity = zoomFade(this.share) * PEN_OPACITY;
    if (!this.isActive) this.changeHighlight(null);
    else this.hoverOutline.visible = this.hoveredRegion !== null;
    this.terrain.animate(now, this.share);
  }

  dispose(): void {
    for (const child of this.held.children) {
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.held.clear();
    this.held.removeFromParent();
    this.lines.geometry.dispose();
    this.built.geometry.dispose();
    this.designated.geometry.dispose();
    this.hoverOutline.geometry.dispose();
    this.lineMaterial.dispose();
    this.builtMaterial.dispose();
    this.designatedMaterial.dispose();
    this.hoverMaterial.dispose();
    this.terrain.dispose();
    this.lines.removeFromParent();
    this.built.removeFromParent();
    this.designated.removeFromParent();
    this.hoverOutline.removeFromParent();
  }

  /**
   * **The hover takes the outline, never the fill.** The three signals of the zoomed-in map
   * each hold their own channel: the nation fills with its ink, a region that carries a
   * building fills with that same ink laid heavier, and the hover draws a contour on top. A
   * hover that filled would erase the "built" reading at the exact moment the player points
   * at it.
   */
  private changeHighlight(prepared: PreparedRegion | null): void {
    const region = prepared?.region ?? null;
    if (region === this.hoveredRegion) return;
    this.hoveredRegion = region;
    this.hoverOutline.geometry.dispose();
    const held = region === null ? undefined : this.heldByRegion.get(region.id);
    /** A suspended zone is only a hatch: the ground under the pen is the sheet. */
    const painted = held === undefined || held.state === 'suspended' ? null : held;
    const underInk = (region && this.grounds.get(region.country)) ?? null;
    const under = underInk === null ? PALETTE.neutralLand : lavis(underInk);
    const built = region !== null && this.builtIds.has(region.id) ? this.builtNationInk : null;
    const [ground, groundInk] =
      built !== null
        ? [nationShades(built).built, built]
        : painted !== null
          ? [lavis(painted.ink, HELD_OPACITY * painted.wash, under), painted.ink]
          : [under, underInk];
    const pen = penOn(ground, groundInk);
    this.terrain.show(
      region?.id ?? null,
      () => (prepared ? this.penStrandsOf(prepared) : []),
      performance.now(),
      pen,
    );
    if (prepared === null || region === null) {
      this.hoverOutline.geometry = new BufferGeometry();
      this.hoverOutline.visible = false;
      return;
    }

    /** **The hover keeps the holder's family** (palette des nations): the contour is the pen of
     *  the ground it frames, and the terrain is told by the drawing, never by a tint. */
    this.hoverMaterial.color.set(pen);

    const points: number[] = [];
    for (const ring of region.rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i]!;
        const [bx, by] = ring[(i + 1) % ring.length]!;
        points.push(
          ...this.frame.toWorld(ax, ay, COUNTRY_THICKNESS + HOVER_LIFT).toArray(),
          ...this.frame.toWorld(bx, by, COUNTRY_THICKNESS + HOVER_LIFT).toArray(),
        );
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));

    this.hoverOutline.geometry = geometry;
    this.hoverOutline.visible = true;
  }

  private penStrandsOf(prepared: PreparedRegion): PenStrands {
    const { region, box, area } = prepared;
    const cached = this.strandsCache.get(region.id);
    if (cached !== undefined) return cached;
    const strands = sketchRegion({
      type: region.type,
      seed: seed(region.id),
      box,
      area,
      center: interiorPoint(prepared),
      covers: (x, y) => contains(prepared, x, y),
    }).map(({ delay, strokes }) => ({
      delay,
      strands: strokes.map((stroke) =>
        stroke.map(([x, y]) => this.frame.toWorld(x, y, COUNTRY_THICKNESS + SKETCH_LIFT)),
      ),
    }));
    if (this.strandsCache.size >= SKETCH_CACHE_SIZE)
      this.strandsCache.delete(this.strandsCache.keys().next().value!);
    this.strandsCache.set(region.id, strands);
    return strands;
  }

  /** The region's rings as a flat fill, laid on the sheet like the highlight was. */
  private fillOf(region: DisplayedRegion, lift: number): BufferGeometry {
    const geometries = region.rings
      .filter((ring) => {
        if (!spansTheFrame(ring, this.frame)) return true;
        console.warn(`${region.id} (${region.name}) : anneau à l’échelle du cadre, non rempli`);
        return false;
      })
      .map((ring) => {
        const shape = new Shape();
        ring.forEach(([x, y], index) => {
          const px = x - this.frame.centerX;
          const py = -(y - this.frame.centerY);
          if (index === 0) shape.moveTo(px, py);
          else shape.lineTo(px, py);
        });
        return new ShapeGeometry(shape);
      });
    const geometry =
      geometries.length === 0
        ? new ShapeGeometry(new Shape())
        : geometries.length > 1
          ? mergeGeometries(geometries, false)!
          : geometries[0]!;
    if (geometries.length > 1) geometries.forEach((part) => part.dispose());
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, COUNTRY_THICKNESS + lift, 0);
    return geometry;
  }
}

/**
 * **Un pays tenu tout entier se peint sur sa propre feuille** : les régions sont du 10m
 * simplifié, les pays du 50m, et leurs contours ne coïncident pas — à quelques kilomètres près,
 * qui font au rapproché un liseré d'aplat sur la mer et une frange d'encre nationale sur la côte.
 * Le pays dont chaque région est à jour sous une même encre (son propre sol, toujours) n'a donc
 * pas d'aplat : c'est la feuille qui prend la couleur, au trait exact de la côte. Ce qui est tenu
 * en partie, relevé ou suspendu reste aux régions.
 */
export function wholeSheets(
  claims: ReadonlyArray<HeldClaim>,
  regions: ReadonlyArray<DisplayedRegion>,
): ReadonlyMap<string, string> {
  // A hatch drawn on the region too would land over the sheet, when it goes under the full colour.
  const inkOf = new Map<string, string | null>();
  for (const claim of claims)
    for (const { id, state } of claim.regions)
      inkOf.set(id, state === 'current' && !inkOf.has(id) ? claim.ink : null);
  const sheets = new Map<string, string | null>();
  for (const { id, country } of regions) {
    const ink = inkOf.get(id) ?? null;
    const sheet = sheets.get(country);
    sheets.set(country, sheet === undefined || sheet === ink ? ink : null);
  }
  return new Map([...sheets].filter((entry): entry is [string, string] => entry[1] !== null));
}

export function prepare(region: DisplayedRegion): PreparedRegion {
  let area = 0;
  const ringBoxes = region.rings.map((ring): Box => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = ring[i]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const [nextX, nextY] = ring[(i + 1) % ring.length]!;
      area += x * nextY - nextX * y;
    }
    return [minX, minY, maxX, maxY];
  });
  const box: Box = [
    Math.min(...ringBoxes.map(([minX]) => minX)),
    Math.min(...ringBoxes.map(([, minY]) => minY)),
    Math.max(...ringBoxes.map(([, , maxX]) => maxX)),
    Math.max(...ringBoxes.map(([, , , maxY]) => maxY)),
  ];
  return { region, box, ringBoxes, area: Math.abs(area / 2) };
}

function interiorPoint(prepared: PreparedRegion): readonly [number, number] {
  const ring = prepared.region.rings.reduce((widest, candidate) =>
    candidate.length > widest.length ? candidate : widest,
  );
  const sum = ring.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0] as [number, number]);
  const centroid = [sum[0] / ring.length, sum[1] / ring.length] as const;
  if (contains(prepared, centroid[0], centroid[1])) return centroid;

  const [minX, minY, maxX, maxY] = prepared.box;
  const random = mulberry(seed(prepared.region.name));
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = minX + random() * (maxX - minX);
    const y = minY + random() * (maxY - minY);
    if (contains(prepared, x, y)) return [x, y];
  }
  return centroid;
}

/** A ring whose box misses the point crosses the ray an even number of times, or not at all:
 *  skipping it is exact, and it is what keeps an archipelago from costing every ring. */
export function contains({ region, ringBoxes }: PreparedRegion, x: number, y: number): boolean {
  let inside = false;
  for (const [index, ring] of region.rings.entries()) {
    const [minX, minY, maxX, maxY] = ringBoxes[index]!;
    if (y < minY || y > maxY || x < minX || x > maxX) continue;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}
