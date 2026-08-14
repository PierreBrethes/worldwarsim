import { Vector3, type PerspectiveCamera } from 'three';
import type { LabelAnchor } from '@/domain/labels';
import { clampToEdge } from '@/domain/indicators';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';

/**
 * Beyond this, a label falls back to the glyph alone. A single named threshold: it is the
 * only level-of-detail setting, and it can be tuned without reading the rest of the file.
 */
export const LABEL_EXPANDED_DISTANCE = 110;

/**
 * The anchor sits on the crust, not above it: the callout must start from the ground it
 * designates. The remaining hair keeps the horizon test from occluding itself flush with
 * the curvature.
 */
const ANCHOR_ELEVATION = COUNTRY_THICKNESS + 0.01;

/**
 * The curvature does not hide much of the board, but it hides some: six points suffice to
 * know whether the eye → anchor segment passes under the crust, and the test evaporates
 * when the board is flat, which is the default setting.
 */
const HORIZON_SAMPLES = 6;

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
   * Off-frame but in front of the horizon: the anchor parks at the screen edge. An anchor
   * gone behind the curvature has no right to it — we do not point at what cannot be seen.
   */
  atEdge: boolean;
  edgeX: number;
  edgeY: number;
  /** The anchor's real direction from the screen center, in radians. */
  heading: number;
};

export type NamedAnchor = { readonly id: string; readonly anchor: LabelAnchor };

/**
 * The engine's anchor registry. It knows neither DOM nor React: it says where each label
 * lands on screen, whether it lands, and at what detail level. The interface does the rest.
 */
export class LabelLayer {
  private readonly fixed = new Map<string, Vector3>();
  private readonly projections: LabelProjection[] = [];
  private readonly point = new Vector3();
  private readonly normalized = new Vector3();
  private readonly gaze = new Vector3();
  private readonly toward = new Vector3();
  private anchors: ReadonlyArray<NamedAnchor> = [];

  constructor(private readonly frame: WorldFrame) {}

  setAnchors(anchors: ReadonlyArray<NamedAnchor>): void {
    this.anchors = anchors;
    this.fixed.clear();
    this.projections.length = 0;
    for (const { id, anchor } of anchors) {
      if (anchor.kind === 'ground') {
        this.fixed.set(id, this.frame.projectLonLat(anchor.lonLat, ANCHOR_ELEVATION));
      }
      this.projections.push({
        id,
        visible: false,
        x: 0,
        y: 0,
        lod: 'glyph',
        atEdge: false,
        edgeX: 0,
        edgeY: 0,
        heading: 0,
      });
    }
  }

  /** The curvature changed: the ground moved under the fixed anchors, they must be re-set. */
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

    for (const projection of this.projections) {
      const position = this.fixed.get(projection.id) ?? mobilePositions.get(projection.id);
      if (position === undefined) {
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

      const occluded = this.occluded(position, camera.position);
      const x = (this.normalized.x * 0.5 + 0.5) * width;
      const y = (-this.normalized.y * 0.5 + 0.5) * height;

      projection.visible = inFrame && !occluded;
      projection.x = x;
      projection.y = y;
      projection.lod = distance < LABEL_EXPANDED_DISTANCE ? 'expanded' : 'glyph';

      projection.atEdge = !occluded && !projection.visible;
      if (projection.atEdge) {
        const edge = clampToEdge(
          behind ? width - x : x,
          behind ? height - y : y,
          width,
          height,
        );
        projection.edgeX = edge.x;
        projection.edgeY = edge.y;
        projection.heading = edge.heading;
      }
    }
    return this.projections;
  }

  /** The board bulges: an anchor gone behind the horizon does not fold to the edge. */
  private occluded(position: Vector3, eye: Vector3): boolean {
    if (this.frame.curvature === 0) return false;
    for (let step = 1; step < HORIZON_SAMPLES; step++) {
      const share = step / HORIZON_SAMPLES;
      this.point.copy(eye).lerp(position, share);
      if (this.frame.drop(this.point.x, this.point.z) + COUNTRY_THICKNESS > this.point.y) return true;
    }
    return false;
  }
}
