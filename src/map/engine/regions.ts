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
import { mulberry } from '@/domain/mulberry';
import { type DisplayedRegion, type RegionsData } from '@/domain/world';
import { PALETTE, PEN_OPACITY, penOf } from './palette';
import { ContourLayer } from './contours';
import { COUNTRY_THICKNESS, onLand, type WorldFrame } from './frame';

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

/**
 * The admin-1 borders (regions, states, departments) of `regions.json` — inner segments
 * only, coasts and country borders being drawn already. The layer only exists up close: far
 * out it fades before becoming noise. Once visible, it answers hover — point in region,
 * smallest first (an enclave beats its envelope).
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
  private prepared: PreparedRegion[] = [];
  private hoveredRegion: DisplayedRegion | null = null;
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
  ) {
    this.contours = new ContourLayer(frame, touch);
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
   * ici tracerait un sol que le serveur ne donne à personne.
   *
   * Elle peut arriver avant les régions elles-mêmes — la couche garde la réclamation et la pose
   * quand les 500 Ko atterrissent.
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
    this.rebuildHeld();
  }

  /** The hatches and contours follow the data: new regions, everything redone. */
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
    const regions = this.prepared.map(({ region }) => region);
    this.contours.show(
      regions,
      this.claims.flatMap(({ ink, mine, regions: held }) =>
        (['current', 'surveyed'] as const).map((state) => ({
          ink,
          mine,
          surveyed: state === 'surveyed',
          regionIds: new Set(held.filter((region) => region.state === state).map(({ id }) => id)),
        })),
      ),
    );
    for (const claim of this.claims) {
      const suspended = new Set(
        claim.regions.filter(({ state }) => state === 'suspended').map(({ id }) => id),
      );
      const parts = regions
        .filter(({ id }) => suspended.has(id))
        .map((region) => this.fillOf(region, SUSPENDED_LIFT));
      if (parts.length === 0) continue;
      const geometry = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false)!;
      if (parts.length > 1) parts.forEach((part) => part.dispose());
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
    this.lines.geometry.dispose();
    this.hoverOutline.geometry.dispose();
    this.lineMaterial.dispose();
    this.hoverMaterial.dispose();
    this.lines.removeFromParent();
    this.hoverOutline.removeFromParent();
  }

  /** **The hover takes the outline, never the fill**: the paper stays the paper under the pen. */
  private changeHighlight(prepared: PreparedRegion | null): void {
    const region = prepared?.region ?? null;
    if (region === this.hoveredRegion) return;
    this.hoveredRegion = region;
    this.hoverOutline.geometry.dispose();
    const held = region === null ? undefined : this.heldByRegion.get(region.id);
    const pen = penOf(held?.ink ?? null);
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

/** A stable number from a name, so an interior point never wanders between two reloads. */
function seed(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash;
}

/** Share of the layer's fade over which the hover's stroke reaches full opacity: a translucent
 *  stroke takes the ground's colour, so the fade is a hair. */
const ZOOM_FADE_BAND = 0.08;

function zoomFade(layerFade: number): number {
  return Math.min(1, Math.max(0, layerFade / ZOOM_FADE_BAND));
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
