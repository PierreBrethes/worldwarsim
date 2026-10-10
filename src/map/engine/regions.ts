import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { regionType, type DisplayedRegion, type RegionsData } from '@/domain/world';
import type { RegionType } from '@/domain/ids';
import type { Curvature } from './curvature';
import { builtInk, PALETTE } from './palette';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { createProp, disposeTerrain, TYPE_TINTS } from './terrain';

export const REGIONS_FULL_DISTANCE = 30;
export const REGIONS_GONE_DISTANCE = 65;
/**
 * Well under the country borders' opacity (0.62 at rest, reinforced at zoom): WebGL draws
 * everything one pixel wide, so the hierarchy between country and region goes through the
 * ink, not the thickness.
 */
const FULL_OPACITY = 0.3;

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
const PROP_LIFT = 0.001;

/** Thin enough that the contour reads as a pen stroke and not as a second border. */
const HOVER_OPACITY = 0.85;

/** Enough to read as a wash over the country's own ink, never enough to hide the ground. */
const DESIGNATED_OPACITY = 0.62;

/**
 * **La couleur de possession ne suit pas le fondu du rapproché** (décision de Pierre, 31/08) :
 * au-delà du seuil les traits de région disparaissent, la teinte reste. On voit qui tient quoi
 * sans voir le découpage — et c'est l'apparition des frontières intérieures, elle seule, qui
 * annonce au joueur qu'une région devient survolable.
 *
 * L'opacité est donc constante : c'est un lavis posé sur l'encre du pays, jamais un aplat qui
 * remplacerait le sol.
 *
 * **Elle est montée d'un cran le 31/08** (contrôle visuel de Pierre) : à 0,5 sur le terrain clair,
 * un bleu de siège se lisait gris — un joueur doit reconnaître sa couleur sans y penser. Le
 * plancher du délavage (`FADED_WASH`) ne bouge pas : il multiplie cette opacité, donc l'écart
 * franc/délavé — qui est une information (ADR 0020 §5) — reste le même rapport.
 */
const HELD_OPACITY = 0.72;

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
     * **Le souvenir d'une couleur, jamais une couleur** (ADR 0020 §7). La zone d'un avant-poste
     * hors service n'est pas tenue — elle ne compte ni au classement ni à la production — et elle
     * disparaissait pourtant de la carte : son propriétaire n'avait plus rien à lire là où il
     * tenait la veille. Hachurée, elle dit la suspension sans jamais se faire passer pour une
     * possession, ce qu'un aplat pâle aurait fait.
     */
    readonly suspended: boolean;
  }>;
};

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

function hatch(material: MeshStandardMaterial): MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hatchScale = { value: window.devicePixelRatio || 1 };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float hatchScale;\nvoid main() {')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float band = mod((gl_FragCoord.x + gl_FragCoord.y) / hatchScale, ${HATCH_PERIOD.toFixed(1)});
        float ink = 1.0 - smoothstep(
          ${(HATCH_WIDTH - HATCH_EDGE).toFixed(2)},
          ${(HATCH_WIDTH + HATCH_EDGE).toFixed(2)},
          band
        );
        if (ink <= 0.004) discard;
        gl_FragColor.a *= ink;`,
      );
  };
  return material;
}

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

type PreparedRegion = {
  readonly region: DisplayedRegion;
  readonly box: readonly [minX: number, minY: number, maxX: number, maxY: number];
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
  /** **Qui tient quoi** (ADR 0020 §1) — un maillage par encre, jamais un seul teinté au sommet :
   *  huit joueurs au plus, donc huit matériaux, et la couleur d'un joueur reste une valeur qu'on
   *  lit dans un débogueur plutôt qu'un attribut de géométrie. */
  readonly held = new Group();
  readonly built: Mesh;
  /** The regions an armed key accepts — the mobilisation order's answer, laid on the ground. */
  readonly designated: Mesh;
  readonly hoverOutline: LineSegments;
  readonly props = new Group();
  private readonly lineMaterial: LineBasicMaterial;
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
  private inkByRegion = new Map<string, string>();
  private builtIds: ReadonlySet<string> = new Set();
  private designatedIds: ReadonlySet<string> = new Set();
  private birth = 0;
  private share = 0;

  constructor(
    private readonly frame: WorldFrame,
    private readonly curvature: Curvature,
  ) {
    this.lineMaterial = new LineBasicMaterial({
      color: PALETTE.border,
      transparent: true,
      opacity: 0,
    });
    this.lines = new LineSegments(new BufferGeometry(), this.lineMaterial);
    this.lines.visible = false;

    // The same material as the country slab, light included: an unlit fill would read as a
    // sticker rather than as ink laid on that very ground.
    this.builtMaterial = new MeshStandardMaterial({
      color: PALETTE.neutralLand,
      roughness: 0.97,
      metalness: 0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.built = new Mesh(new BufferGeometry(), this.builtMaterial);
    this.built.visible = false;

    /**
     * The rail's amber — the ink of "you are here" (`FOCUS_MARK`) — and never the critical
     * ink: a region that accepts a placement is an invitation, not an alarm.
     */
    this.designatedMaterial = new MeshStandardMaterial({
      color: PALETTE.designated,
      roughness: 0.97,
      metalness: 0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.designated = new Mesh(new BufferGeometry(), this.designatedMaterial);
    this.designated.visible = false;

    this.hoverMaterial = new LineBasicMaterial({
      color: PALETTE.paper,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.hoverOutline = new LineSegments(new BufferGeometry(), this.hoverMaterial);
    this.hoverOutline.visible = false;
  }

  display(data: RegionsData): void {
    const points: number[] = [];
    for (const line of data.lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i]!;
        const [bx, by] = line[i + 1]!;
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
    this.lines.geometry = this.curvature.register(geometry);

    this.prepared = data.regions.map((region) => {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let area = 0;
      for (const ring of region.rings) {
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = ring[i]!;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          const [nextX, nextY] = ring[(i + 1) % ring.length]!;
          area += x * nextY - nextX * y;
        }
      }
      return { region, box: [minX, minY, maxX, maxY], area: Math.abs(area / 2) };
    });
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
  showHeld(claims: ReadonlyArray<HeldClaim>): void {
    const signature = JSON.stringify(claims);
    if (signature === this.laid) return;
    this.laid = signature;
    this.claims = claims;
    this.inkByRegion = new Map(
      claims.flatMap((claim) => claim.regions.map((region) => [region.id, claim.ink] as const)),
    );
    this.rebuildHeld();
  }

  /**
   * The regions that carry a building, and the ink of the nation that raised them. **Only the
   * player's own ever arrive here**: `PlayerView` holds no opposing building, so no ownership
   * test guards this call — the fog is a property of the served data, not of the rendering
   * (ADR 0005).
   */
  showBuilt(regionIds: ReadonlySet<string>, ink: string): void {
    this.builtMaterial.color.set(builtInk(ink));
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

  /** The fill is placed by hand on the curved slab, so a curvature change has to redo it. */
  rebuild(): void {
    this.rebuildHeld();
    this.fill(this.built, this.builtIds, BUILT_LIFT);
    this.fill(this.designated, this.designatedIds, DESIGNATED_LIFT);
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
    for (const claim of this.claims) {
      /** La clef porte la franchise **et** la trame : deux régions de même encre ne partagent un
       *  maillage que si elles se peignent de la même façon. */
      const byWash = new Map<string, { wash: number; suspended: boolean; ids: Set<string> }>();
      for (const region of claim.regions) {
        const key = `${region.wash}/${region.suspended}`;
        const kept = byWash.get(key) ?? {
          wash: region.wash,
          suspended: region.suspended,
          ids: new Set<string>(),
        };
        kept.ids.add(region.id);
        byWash.set(key, kept);
      }
      for (const { wash, suspended, ids } of byWash.values()) {
        const lift = suspended ? SUSPENDED_LIFT : HELD_LIFT;
        const parts = this.prepared
          .filter(({ region }) => ids.has(region.id))
          .map(({ region }) => this.fillOf(region, lift));
        if (parts.length === 0) continue;
        const geometry = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false)!;
        if (parts.length > 1) parts.forEach((part) => part.dispose());
        const material = new MeshStandardMaterial({
          color: claim.ink,
          roughness: 0.97,
          metalness: 0,
          transparent: true,
          opacity: HELD_OPACITY * wash,
          depthWrite: false,
        });
        this.held.add(new Mesh(geometry, suspended ? hatch(material) : material));
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
    return this.frame.toWorld(x, y, COUNTRY_THICKNESS + PROP_LIFT);
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
      covers: (x, y) => contains(prepared.region, x, y),
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
      if (contains(candidate.region, projectedX, projectedY)) kept = candidate;
    }
    return kept;
  }

  clearHover(): void {
    this.changeHighlight(null);
  }

  /** Fade driven by camera→target distance; invisible, the layer costs nothing. */
  animate(cameraDistance: number): void {
    this.share = Math.min(
      1,
      Math.max(
        0,
        (REGIONS_GONE_DISTANCE - cameraDistance) / (REGIONS_GONE_DISTANCE - REGIONS_FULL_DISTANCE),
      ),
    );
    this.lineMaterial.opacity = this.share * FULL_OPACITY;
    this.lines.visible = this.share > 0.01;
    this.builtMaterial.opacity = this.share;
    this.built.visible = this.share > VISIBLE_SHARE && this.builtIds.size > 0;
    this.designatedMaterial.opacity = this.share * DESIGNATED_OPACITY;
    this.designated.visible = this.share > VISIBLE_SHARE && this.designatedIds.size > 0;
    this.hoverMaterial.opacity = this.share * HOVER_OPACITY;
    if (!this.isActive) this.changeHighlight(null);
    else this.hoverOutline.visible = this.hoveredRegion !== null;
    this.growProps();
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
    // The props share the terrain module's geometries and materials: `disposeTerrain` frees
    // them once, and detaching here keeps the engine's final sweep from meeting them again.
    this.props.clear();
    this.lines.removeFromParent();
    this.built.removeFromParent();
    this.designated.removeFromParent();
    this.hoverOutline.removeFromParent();
    this.props.removeFromParent();
    disposeTerrain();
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
    this.props.clear();
    if (prepared === null || region === null) {
      this.hoverOutline.geometry = new BufferGeometry();
      this.hoverOutline.visible = false;
      return;
    }

    /** **La teinte de possession remplace celle du terrain, elle ne s'y ajoute pas** (ADR 0020) :
     *  sur une région tenue, la question que le survol répond est « à qui », pas « quel sol ». Les
     *  accessoires 3D poussent quand même — ils disent le terrain, et le terrain n'a pas changé. */
    const type = regionType(region.name);
    this.hoverMaterial.color.set(this.inkByRegion.get(region.id) ?? TYPE_TINTS[type]);
    this.sowProps(prepared, type);

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

  /** The region's rings as a flat fill, laid on the curved slab like the highlight was. */
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

    const positions = geometry.attributes.position!;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(
        i,
        COUNTRY_THICKNESS + lift + this.frame.drop(positions.getX(i), positions.getZ(i)),
      );
    }
    positions.needsUpdate = true;
    return geometry;
  }

  /**
   * Sows the type's 3D props — interior points by rejection in the box, seed drawn from the
   * name so the same clearing shows on every hover. Size and count follow the area: an Oise
   * reads up close, an Amazon from afar.
   */
  private sowProps(prepared: PreparedRegion, type: RegionType): void {
    const [minX, minY, maxX, maxY] = prepared.box;
    const random = mulberry(seed(prepared.region.name));
    const count = Math.min(24, Math.max(8, Math.round(Math.sqrt(prepared.area) * 8)));
    const size = Math.min(0.9, Math.max(0.28, 0.18 + Math.sqrt(prepared.area) * 0.06));
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 80) {
      attempts++;
      const x = minX + random() * (maxX - minX);
      const y = minY + random() * (maxY - minY);
      if (!contains(prepared.region, x, y)) continue;
      const prop = createProp(type);
      prop.position.copy(this.frame.toWorld(x, y, COUNTRY_THICKNESS + PROP_LIFT));
      prop.rotation.y = random() * Math.PI * 2;
      prop.scale.setScalar(0.0001);
      prop.userData.size = size * (0.7 + random() * 0.6);
      prop.userData.delay = placed * 35 + random() * 50;
      this.props.add(prop);
      placed++;
    }
    this.birth = performance.now();
  }

  instantGrowth = false;

  /** The growth: scale 0 → size with a slight overshoot, staggered prop by prop. */
  private growProps(): void {
    if (this.props.children.length === 0) return;
    const age = this.instantGrowth ? Infinity : performance.now() - this.birth;
    for (const child of this.props.children) {
      const t = Math.min(1, Math.max(0, (age - (child.userData.delay as number)) / 320));
      const overshoot = 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
      child.scale.setScalar(Math.max(0.0001, (child.userData.size as number) * overshoot));
    }
  }
}

function interiorPoint(prepared: PreparedRegion): readonly [number, number] {
  const ring = prepared.region.rings.reduce((widest, candidate) =>
    candidate.length > widest.length ? candidate : widest,
  );
  const sum = ring.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0] as [number, number]);
  const centroid = [sum[0] / ring.length, sum[1] / ring.length] as const;
  if (contains(prepared.region, centroid[0], centroid[1])) return centroid;

  const [minX, minY, maxX, maxY] = prepared.box;
  const random = mulberry(seed(prepared.region.name));
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = minX + random() * (maxX - minX);
    const y = minY + random() * (maxY - minY);
    if (contains(prepared.region, x, y)) return [x, y];
  }
  return centroid;
}

function seed(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash;
}

function mulberry(seedValue: number): () => number {
  let state = seedValue >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function contains(region: DisplayedRegion, x: number, y: number): boolean {
  let inside = false;
  for (const ring of region.rings) {
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
