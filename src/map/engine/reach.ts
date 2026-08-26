import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineLoop } from 'three';
import type { LonLat } from '@/domain/geo';
import type { Reach } from '@/domain/labels';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { PALETTE } from './palette';

/**
 * Fine enough that four hundred kilometres read as a circle rather than as a polygon, coarse
 * enough that rebuilding it on every hover and on every curvature step costs nothing.
 */
const SEGMENTS = 96;

/** Just above the country slabs, so the ring is not swallowed by the ground it lies on. */
const LIFT = 0.04;

const KM_PER_DEGREE = 111.32;

/**
 * **The ground a station hears, or an outpost reaches, drawn only while the pointer asks for
 * it** (fiche 03, fiche 04). It is the one number that decides where a player plants either
 * thing, and it was nowhere on the board: the choice of a specialisation was made on two words
 * and no geometry.
 *
 * **It appears on hover and never stays.** A permanent ring around every listening post would
 * turn the map into a Venn diagram of the player's own paperwork; the question it answers —
 * "does this cover the road I am worried about" — is asked about one detector at a time.
 *
 * The circle is walked in lon/lat and projected point by point, never drawn as a disc in screen
 * space: the projection tightens toward the poles, so a reach that is round in Romania is an
 * ellipse in Norway, and the map has to say the true shape or it promises coverage that the
 * kilometres do not.
 */
export class ReachRing {
  readonly object: LineLoop;
  private readonly geometry = new BufferGeometry();
  private readonly material: LineBasicMaterial;
  private shown: Reach | null = null;

  constructor(private readonly frame: WorldFrame) {
    this.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3),
    );
    this.material = new LineBasicMaterial({
      color: PALETTE.paper,
      transparent: true,
      opacity: 0.34,
      depthTest: false,
    });
    this.object = new LineLoop(this.geometry, this.material);
    this.object.renderOrder = 3;
    this.object.visible = false;
    this.object.frustumCulled = false;
  }

  show(reach: Reach | null): void {
    this.shown = reach;
    this.object.visible = reach !== null;
    if (reach !== null) this.write(reach);
  }

  /** The curvature moved every vertex of the board under a ring that did not: same reach, new
   *  drop. Rewritten rather than rebuilt — the vertex count never changes. */
  rebuild(): void {
    if (this.shown !== null) this.write(this.shown);
  }

  dispose(): void {
    this.object.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  private write({ lonLat, km }: Reach): void {
    const [lon, lat] = lonLat;
    const perDegreeEast = KM_PER_DEGREE * Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    const positions = this.geometry.attributes.position!;

    for (let step = 0; step <= SEGMENTS; step += 1) {
      const angle = (step / SEGMENTS) * Math.PI * 2;
      const around: LonLat = [
        lon + (km / perDegreeEast) * Math.sin(angle),
        Math.max(-89, Math.min(89, lat + (km / KM_PER_DEGREE) * Math.cos(angle))),
      ];
      const vertex = this.frame.projectLonLat(around, COUNTRY_THICKNESS + LIFT);
      positions.setXYZ(step, vertex.x, vertex.y, vertex.z);
    }
    positions.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}
