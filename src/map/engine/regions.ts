import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { Atlas, Detail } from '@/domain/atlas';
import type { LonLat } from '@/domain/geo';
import type { RegionType } from '@/domain/ids';
import type { HoveredRegion, RegionIdentity } from '@/domain/world';
import { fillGeometry, lineGeometry } from './atlas-geometry';
import { PALETTE, PEN_OPACITY, penOf } from './palette';
import { ContourLayer } from './contours';
import type { NightUniforms } from './night-here';
import { COUNTRY_THICKNESS, onLand, type WorldFrame } from './frame';

type Sheet = Pick<WorldFrame, 'centerX' | 'centerY'>;

export const REGIONS_FULL_DISTANCE = 30;
export const REGIONS_GONE_DISTANCE = 65;
/**
 * Well under the country borders' opacity (0.5 at rest, reinforced at zoom), and dotted as on
 * the prototype (`table-etat-major`, P:329): the hierarchy between country and region goes
 * through the ink and the dash, WebGL drawing both one pixel wide.
 */
/** @a-mesurer */
export const FULL_OPACITY = 0.22;
/** The prototype's two inked for one blank, in screen pixels so the rhythm holds at any zoom. */
const DASH_PX = 4;
const GAP_PX = 2;

/** Below this share of the fade, the layer is not on screen — so it is not aimable either. */
const VISIBLE_SHARE = 0.01;

/** Stacking flush with the slab: hatch under the strokes, strokes under the hover and the borders. */
const STROKE_LIFT = 0.003;
/** **La hachure passe sous le contour** (ADR 0020 §7) : une région disputée revenue au voisin
 *  pendant la désactivation est à lui et suspendue chez moi, les deux à la fois, et c'est la
 *  possession réelle qui doit se lire par-dessus le souvenir. */
const SUSPENDED_LIFT = 0.00025;
/** The maquette's hatch (#194). @a-mesurer */
const SUSPENDED_OPACITY = 0.5;
const HOVER_LIFT = 0.0035;
const ANCHOR_LIFT = 0.001;

/**
 * Ce qu'un joueur **connaît** d'un tenant, et de quelle encre — la forme que `control.held` sert.
 * Un relevé se lit en permanence, à son contour pâle et immobile (ADR 0033 §3) : sans ce signal,
 * une décision prise sur un relevé périmé se lit comme un bug.
 */
export type HeldClaim = {
  readonly ink: string;
  /** The player's own: his contour is the thicker. */
  readonly mine: boolean;
  readonly regions: ReadonlyArray<{
    readonly id: string;
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
/**
 * **Les pixels du tampon par pixel CSS, tels que la carte les rend** (#189) : au doigt 1,5, et non
 * le `devicePixelRatio` de l'écran, sans quoi les trames se resserrent au téléphone. Un seul
 * uniforme, partagé par toutes les trames ; le moteur le règle avec son pixel ratio.
 */
export const TRAME_SCALE = { value: 1 };

export function screenTrame<M extends MeshStandardMaterial>(material: M, body: string): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.trameScale = TRAME_SCALE;
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

export const hatch = (material: MeshStandardMaterial): MeshStandardMaterial =>
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

/** The arcs between two regions of one country, each with its distance along its line: a dash
 *  restarting at every vertex would stutter. */
export function regionLines(atlas: Atlas, detail: Detail, frame: Sheet): BufferGeometry {
  const lines = atlas.borders(
    (a, b) => a !== null && b !== null && a.country === b.country && a.id !== b.id,
    detail,
  );
  const distances: number[] = [];
  for (const { points } of lines) {
    let along = 0;
    for (let i = 2; i < points.length; i += 2) {
      const next = along + Math.hypot(points[i]! - points[i - 2]!, points[i + 1]! - points[i - 1]!);
      distances.push(along, next);
      along = next;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(lineGeometry(lines, frame, COUNTRY_THICKNESS + STROKE_LIFT), 3),
  );
  geometry.setAttribute('lineDistance', new Float32BufferAttribute(distances, 1));
  return geometry;
}

/**
 * The admin-1 borders (regions, states, departments), read off the atlas (ADR 0034): the arcs
 * between two regions of one country, coasts and country borders being drawn already. The layer
 * only exists up close: far out it fades before becoming noise. Once visible, it answers hover by
 * `regionAt` on the same arcs, so the outline it draws is the one the coast and the ink follow.
 */
export class RegionLayer {
  readonly lines: LineSegments;
  /** **Les zones suspendues** (ADR 0020 §7), hachurées : un maillage par encre. */
  readonly held = new Group();
  /** **Qui tient quoi, au contour** (ADR 0033). */
  readonly contours: ContourLayer;
  readonly hoverOutline: LineSegments;
  private readonly lineMaterial: LineDashedMaterial;
  private readonly hoverMaterial: LineBasicMaterial;
  /** The level the hover, the hatches and `regionAt` read: far at first, near once it has landed
   *  (`showAtlas`). The lines follow the sheet's level instead (`showLines`). */
  private detail: Detail = 'far';
  private readonly lineLevels: Partial<Record<Detail, BufferGeometry>> = {};
  private linesShown: Detail = 'far';
  /** `null` until the regions' facts land (`display`): no hover, no anchor before. */
  private types: ReadonlyMap<string, RegionType> | null = null;
  private points: ReadonlyMap<string, LonLat> = new Map();
  private hoveredRegion: RegionIdentity | null = null;
  private claims: ReadonlyArray<HeldClaim> = [];
  /** Ce que le dernier `showHeld` a effectivement posé : la vue renvoie la même liste à chaque
   *  battement, et refaire les rubans pour rien serait le seul coût de tout ce système. */
  private laid = '';
  /** L'encre du tenant, par région : le survol la lit pour teinter le contour d'une région tenue
   *  à sa couleur plutôt qu'à celle de son terrain. */
  private heldByRegion = new Map<string, { readonly ink: string; readonly state: HeldState }>();
  private share = 0;

  constructor(
    private readonly frame: WorldFrame,
    /** At the finger: the dashes step only with the frames the map draws anyway. */
    touch: boolean,
    night: NightUniforms,
    private atlas: Atlas,
  ) {
    this.contours = new ContourLayer(frame, touch, night);
    this.lineMaterial = new LineDashedMaterial({
      color: PALETTE.border,
      transparent: true,
      opacity: 0,
    });
    this.lines = new LineSegments(new BufferGeometry(), this.lineMaterial);
    this.lines.visible = false;

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

  /** The regions' terrain and the point each one is anchored at (`region-index.json`). */
  display(types: ReadonlyMap<string, RegionType>, points: ReadonlyMap<string, LonLat>): void {
    this.types = types;
    this.points = points;
    this.showLines(this.linesShown);
    this.rebuild();
  }

  /** The near level landed: the hatches and the hover follow its arcs, and the lines of both
   *  levels, built with it off the main thread, wait for `showLines`. */
  showAtlas(atlas: Atlas, lines: Record<Detail, BufferGeometry>): void {
    this.atlas = atlas;
    this.detail = 'near';
    for (const geometry of Object.values(this.lineLevels)) geometry.dispose();
    Object.assign(this.lineLevels, lines);
    if (this.types !== null) this.rebuild();
    this.contours.addLevel(atlas, 'near');
    this.showLines(this.linesShown);
  }

  /** The lines and the contours at the sheet's level, as soon as that level has them. */
  showLines(detail: Detail): void {
    this.linesShown = detail;
    const geometry = this.lineLevels[detail];
    if (geometry !== undefined && this.types !== null) this.lines.geometry = geometry;
    this.contours.level(detail);
  }

  /**
   * **Qui tient quelles régions, et de quelle encre.** La liste arrive calculée (`control.held`,
   * règle dans `domain/control.ts`) : la carte dessine ce qu'on lui tend, et une seconde lecture
   * ici tracerait un sol que le serveur ne donne à personne.
   *
   * Elle peut arriver avant les régions elles-mêmes — la couche garde la réclamation et la pose
   * quand les régions atterrissent.
   */
  showHeld(claims: ReadonlyArray<HeldClaim>): void {
    const signature = JSON.stringify(claims);
    if (signature === this.laid) return;
    this.laid = signature;
    this.claims = claims;
    this.heldByRegion = new Map(
      claims.flatMap((claim) =>
        claim.regions.map(({ id, state }) => [id, { ink: claim.ink, state }] as const),
      ),
    );
    this.hoveredRegion = null;
    this.contours.show(
      claims.flatMap(({ ink, mine, regions: held }) =>
        (['current', 'surveyed'] as const).map((state) => ({
          ink,
          mine,
          surveyed: state === 'surveyed',
          regionIds: new Set(held.filter((region) => region.state === state).map(({ id }) => id)),
        })),
      ),
      this.atlas,
      this.detail === 'near' ? ['far', 'near'] : ['far'],
    );
    this.rebuildHeld();
  }

  /** The hatches follow the data: new regions, everything redone. The contours need only the
   *  atlas: built at both levels (`showHeld`, `showAtlas`), they switch with `showLines`. */
  rebuild(): void {
    this.hoveredRegion = null;
    this.rebuildHeld();
  }

  /** Refait entier : un diff par région coûterait plus cher que ces quelques fusions. */
  private rebuildHeld(): void {
    for (const child of this.held.children) {
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.held.clear();
    for (const claim of this.claims) {
      const suspended = new Set(
        claim.regions.filter(({ state }) => state === 'suspended').map(({ id }) => id),
      );
      if (suspended.size === 0 || this.types === null) continue;
      const shapes = this.atlas.shapes(() => 'suspended', this.detail, suspended).get('suspended');
      if (shapes === undefined) continue;
      const geometry = fillGeometry(shapes, this.frame, COUNTRY_THICKNESS + SUSPENDED_LIFT);
      const material = onLand(
        new MeshStandardMaterial({
          color: claim.ink,
          roughness: 0.97,
          metalness: 0,
          transparent: true,
          opacity: SUSPENDED_OPACITY,
          depthWrite: false,
        }),
      );
      const fill = new Mesh(geometry, hatch(material));
      // L'encre est sur la feuille : l'ombre d'une pièce la couvre comme le papier dessous.
      fill.receiveShadow = true;
      this.held.add(fill);
    }
  }

  /**
   * The layer is legible on screen — the same threshold that fades it in, and therefore the
   * one that decides whether the game aims at a region or at its country. It is named rather
   * than repeated: two literals would drift, and the map would highlight what the right click
   * no longer targets.
   */
  /** The regions' facts have landed: `regionAt` answers. */
  get ready(): boolean {
    return this.types !== null;
  }

  get isActive(): boolean {
    return this.share > VISIBLE_SHARE && this.types !== null;
  }

  /** The fade the whole zoomed-in layer shares — the buildings hang on this one, not on a twin. */
  get fade(): number {
    return this.share;
  }

  /** Where a building stands on its region: the point the server places it at
   *  (`region-index.json`), never one of the map's own. */
  anchorOf(regionId: string): Vector3 | null {
    const point = this.points.get(regionId);
    return point === undefined
      ? null
      : this.frame.projectLonLat(point, COUNTRY_THICKNESS + ANCHOR_LIFT);
  }

  /** The point is in projected coordinates (those of the atlas), not world coordinates. */
  regionAt(projectedX: number, projectedY: number): RegionIdentity | null {
    if (this.types === null) return null;
    return this.atlas.regionAt([projectedX, projectedY], this.detail);
  }

  identityOf(regionId: string): RegionIdentity | null {
    if (this.types === null) return null;
    return this.atlas.regions.find((region) => region.id === regionId) ?? null;
  }

  hover(projectedX: number, projectedY: number): HoveredRegion | null {
    const region = this.regionAt(projectedX, projectedY);
    this.changeHighlight(region);
    return region && { ...region, type: this.types?.get(region.id) ?? 'plain' };
  }

  clearHover(): void {
    this.changeHighlight(null);
  }

  /** Fade driven by camera→target distance; invisible, the layer costs nothing. */
  animate(cameraDistance: number, unitsPerPixel: number): void {
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
    this.contours.animate(unitsPerPixel);
    this.hoverMaterial.opacity = zoomFade(this.share) * PEN_OPACITY;
    if (!this.isActive) this.changeHighlight(null);
    else this.hoverOutline.visible = this.hoveredRegion !== null;
  }

  dispose(): void {
    for (const child of this.held.children) {
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.held.clear();
    this.held.removeFromParent();
    this.contours.dispose();
    for (const geometry of Object.values(this.lineLevels)) geometry.dispose();
    this.hoverOutline.geometry.dispose();
    this.lineMaterial.dispose();
    this.hoverMaterial.dispose();
    this.lines.removeFromParent();
    this.hoverOutline.removeFromParent();
  }

  /** **The hover takes the outline, never the fill**: the paper stays the paper under the pen. */
  private changeHighlight(region: RegionIdentity | null): void {
    if (region?.id === this.hoveredRegion?.id) return;
    this.hoveredRegion = region;
    this.hoverOutline.geometry.dispose();
    if (region === null) {
      this.hoverOutline.geometry = new BufferGeometry();
      this.hoverOutline.visible = false;
      return;
    }

    /** **The hover keeps the holder's family** (palette des nations): the contour is the pen of
     *  the ground it frames, and the terrain is told by the drawing, never by a tint. */
    this.hoverMaterial.color.set(penOf(this.heldByRegion.get(region.id)?.ink ?? null));

    const outline = this.atlas.outline(region.id, this.detail);
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        lineGeometry(outline, this.frame, COUNTRY_THICKNESS + HOVER_LIFT),
        3,
      ),
    );
    this.hoverOutline.geometry = geometry;
    this.hoverOutline.visible = true;
  }
}

/** Share of the layer's fade over which the hover's stroke reaches full opacity: a translucent
 *  stroke takes the ground's colour, so the fade is a hair. */
const ZOOM_FADE_BAND = 0.08;

function zoomFade(layerFade: number): number {
  return Math.min(1, Math.max(0, layerFade / ZOOM_FADE_BAND));
}
