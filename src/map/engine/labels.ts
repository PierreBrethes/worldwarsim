import { Vector3, type PerspectiveCamera } from 'three';
import type { LabelAnchor } from '@/domain/labels';
import { clampToEdge } from '@/domain/indicators';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { nearWeight } from './figurines/figurine';

/**
 * Beyond this, a label falls back to the glyph alone. A single named threshold: it is the
 * only level-of-detail setting, and it can be tuned without reading the rest of the file.
 *
 * It governs the **plate as well as the text** — the building's picture hangs inside
 * `.label-block`, which is what the glyph level fades out. Raised from 110 to 220 so a nation
 * reads its own buildings without diving onto them: the plate keeps its 46 px whatever the
 * distance, so what a farther camera buys is more buildings on screen, not smaller ones. The
 * overlap degradation is what keeps the crowd readable, and it folds buildings first — they
 * are the lowest priority, being the only labels that never move.
 */
export const LABEL_EXPANDED_DISTANCE = 220;

const PLATE_FLOOR = 0.4;
const PLATE_SHRINK_DISTANCE = 300;

/**
 * A folded building keeps its plate at any distance, but the buildings of one nation fall within
 * a few pixels of each other at world scale: five plates of 46 px piled into one giant
 * building. Past the expanded threshold the plate shrinks with the camera's distance, so the
 * pile reads as a cluster of small marks.
 */
export function plateScale(distance: number): number {
  const t =
    (distance - LABEL_EXPANDED_DISTANCE) / (PLATE_SHRINK_DISTANCE - LABEL_EXPANDED_DISTANCE);
  return 1 - (1 - PLATE_FLOOR) * Math.min(1, Math.max(0, t));
}

/** The anchor sits on the crust, not above it: the callout must start from the ground it
 *  designates. */
const ANCHOR_ELEVATION = COUNTRY_THICKNESS + 0.01;

export type DetailLevel = 'glyph' | 'expanded';

/**
 * Projections are rewritten in place every frame rather than rebuilt: this loop runs at
 * sixty frames per second and is not allowed to allocate anything.
 */
export type LabelProjection = {
  id: string;
  visible: boolean;
  x: number;
  y: number;
  lod: DetailLevel;
  /**
   * The label lives and dies with the admin-1 layer, so it inherits its fade rather than a
   * threshold of its own. `1` for everything else — a label that does not hang on the regions
   * is never dimmed by them.
   */
  fade: number;
  /**
   * How much figurine stands under the label (ADR 0026 §3): its plate gives way by as much,
   * and the label stays where it is to take the pointer. `0` for anything not dressed.
   */
  dressed: number;
  /** From the eye to the anchor, in world units — what "nearest" means at the edge. */
  distance: number;
  /** `1` up close, shrinking beyond the expanded threshold — see `plateScale`. */
  plateScale: number;
  /**
   * Off-frame: the anchor parks at the screen edge.
   */
  atEdge: boolean;
  edgeX: number;
  edgeY: number;
  /** The anchor's real direction from the screen center, in radians. */
  heading: number;
};

export type NamedAnchor = {
  readonly id: string;
  readonly anchor: LabelAnchor;
  /**
   * The label is part of the zoomed-in layer, not merely anchored on one of its regions: it
   * appears and fades with the admin-1 borders. A building says what a nation *holds* and is
   * worth seeing from orbit; what the ground *contains* is only useful once the eye is close
   * enough to build on it.
   */
  readonly withRegionLayer: boolean;
};

export type EdgeInsets = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

const NO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The engine's anchor registry. It knows neither DOM nor React: it says where each label
 * lands on screen, whether it lands, and at what detail level. The interface does the rest.
 */
export class LabelLayer {
  private readonly fixed = new Map<string, Vector3>();
  private readonly withRegions = new Set<string>();
  private readonly projections: LabelProjection[] = [];
  private readonly normalized = new Vector3();
  private readonly gaze = new Vector3();
  private readonly toward = new Vector3();
  private anchors: ReadonlyArray<NamedAnchor> = [];
  /** What the interface lays over the map's rim, in canvas pixels: an indicator folded under the
   *  rule or the column would point at something nobody can click. */
  edgeInsets: EdgeInsets = NO_INSETS;

  /**
   * A region anchor is resolved, not computed: its interior point comes from the region
   * layer, which is also what plants the building plate there. One point, one source — the
   * label cannot end up designating a spot the sprite does not stand on.
   */
  constructor(
    private readonly frame: WorldFrame,
    private readonly groundOfRegion: (regionId: string) => Vector3 | null,
    /** How much of the admin-1 layer is on screen, `0` when it is not — one source, no twin. */
    private readonly regionShare: () => number,
    /** Whether my figurines stand at this label's point, rather than its plate. */
    private readonly isDressed: (id: string) => boolean,
  ) {}

  setAnchors(anchors: ReadonlyArray<NamedAnchor>): void {
    this.anchors = anchors;
    this.fixed.clear();
    this.withRegions.clear();
    this.projections.length = 0;
    for (const { id, anchor, withRegionLayer } of anchors) {
      if (anchor.kind === 'ground') {
        this.fixed.set(id, this.frame.projectLonLat(anchor.lonLat, ANCHOR_ELEVATION));
      }
      // The 500 KB of regions land after the board: until they do, the anchor has no ground
      // and the label stays unprojected — `rebuild` picks it up when they arrive.
      if (anchor.kind === 'region') {
        const at = this.groundOfRegion(anchor.regionId);
        if (at !== null) this.fixed.set(id, at);
      }
      this.projections.push({
        id,
        visible: false,
        x: 0,
        y: 0,
        lod: 'glyph',
        fade: withRegionLayer ? 0 : 1,
        dressed: 0,
        distance: 0,
        plateScale: 1,
        atEdge: false,
        edgeX: 0,
        edgeY: 0,
        heading: 0,
      });
      if (withRegionLayer) this.withRegions.add(id);
    }
  }

  /** The regions landed under the fixed anchors: re-set them. */
  rebuild(): void {
    this.setAnchors(this.anchors);
  }

  /** Where the anchor stands in the world — the camera journey needs nothing else. */
  position(id: string, mobilePositions: ReadonlyMap<string, Vector3>): Vector3 | undefined {
    return this.fixed.get(id) ?? mobilePositions.get(id);
  }

  project(
    camera: PerspectiveCamera,
    width: number,
    height: number,
    mobilePositions: ReadonlyMap<string, Vector3>,
  ): ReadonlyArray<LabelProjection> {
    camera.getWorldDirection(this.gaze);
    const share = this.regionShare();

    for (const projection of this.projections) {
      projection.fade = this.withRegions.has(projection.id) ? share : 1;
      const position = this.fixed.get(projection.id) ?? mobilePositions.get(projection.id);
      // Faded out is not merely invisible: it does not park at the edge either. An indicator
      // pointing at a layer the eye cannot reach would send the camera to nothing.
      if (position === undefined || projection.fade === 0) {
        projection.visible = false;
        projection.atEdge = false;
        continue;
      }

      const distance = position.distanceTo(camera.position);
      // Behind the camera, the perspective projection returns the symmetric point: without
      // this straightening, an indicator would head to the edge opposite its entity.
      const behind = this.toward.copy(position).sub(camera.position).dot(this.gaze) < 0;
      this.normalized.copy(position).project(camera);
      const inFrame =
        !behind &&
        this.normalized.z < 1 &&
        Math.abs(this.normalized.x) < 1.08 &&
        Math.abs(this.normalized.y) < 1.08;

      const x = (this.normalized.x * 0.5 + 0.5) * width;
      const y = (-this.normalized.y * 0.5 + 0.5) * height;

      projection.visible = inFrame;
      projection.distance = distance;
      projection.x = x;
      projection.y = y;
      projection.lod = distance < LABEL_EXPANDED_DISTANCE ? 'expanded' : 'glyph';
      projection.plateScale = plateScale(distance);
      projection.dressed = this.isDressed(projection.id) ? nearWeight(distance) : 0;

      projection.atEdge = !projection.visible;
      if (projection.atEdge) {
        const { top, right, bottom, left } = this.edgeInsets;
        const edge = clampToEdge(
          (behind ? width - x : x) - left,
          (behind ? height - y : y) - top,
          width - left - right,
          height - top - bottom,
        );
        projection.edgeX = edge.x + left;
        projection.edgeY = edge.y + top;
        projection.heading = edge.heading;
      }
    }
    return this.projections;
  }
}
