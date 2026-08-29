import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { LonLat } from '@/domain/geo';
import type { Reach } from '@/domain/labels';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { ARC_COLORS } from './palette';

/**
 * Fine enough that four hundred kilometres read as a circle rather than as a polygon, coarse
 * enough that rebuilding it on every hover and on every curvature step costs nothing.
 */
const SEGMENTS = 96;

/** Just above the country slabs, so the ring is not swallowed by the ground it lies on. */
const LIFT = 0.04;

/**
 * **The ring is a fat line, like a thread, and for the same reason**: a `LineBasicMaterial`
 * ignores `linewidth` in WebGL, so the ring was one hairline pixel whatever was asked of it —
 * a détection circle nobody could see on the board it was drawn over. In pixels, a notch above
 * a movement's 2.5: it is read once, at a glance, against a map full of lines.
 */
const THICKNESS = 3;

/**
 * **The board's amber, never a nation's ink.** It carried the owner's colour and that was the
 * whole of the invisibility: France's blue and the USSR's red are the inks of *ground*, laid on
 * the very ground the circle is drawn over. The ring is a measure, not a claim — it takes the
 * same amber the player's own threads do, which is the map's one ink for "this is yours and it
 * is live".
 */
const INK = ARC_COLORS.mine.progress;

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
  readonly object: Line2;
  private readonly geometry = new LineGeometry();
  private readonly material: LineMaterial;
  private shown: Reach | null = null;

  constructor(private readonly frame: WorldFrame) {
    this.material = new LineMaterial({
      color: INK,
      linewidth: THICKNESS,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    this.object = new Line2(this.geometry, this.material);
    this.object.renderOrder = 3;
    this.object.visible = false;
    this.object.frustumCulled = false;
  }

  show(reach: Reach | null): void {
    this.shown = reach;
    this.object.visible = reach !== null;
    if (reach === null) return;
    this.write(reach);
  }

  /** A fat line thickens in pixels: without the canvas size it is born at the wrong scale,
   *  exactly as a thread would be (`ArcLayer.resize`). */
  resize(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  /** The curvature moved every vertex of the board under a ring that did not: same reach, new
   *  drop. */
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
    const positions: number[] = [];

    for (let step = 0; step <= SEGMENTS; step += 1) {
      const angle = (step / SEGMENTS) * Math.PI * 2;
      const around: LonLat = [
        lon + (km / perDegreeEast) * Math.sin(angle),
        Math.max(-89, Math.min(89, lat + (km / KM_PER_DEGREE) * Math.cos(angle))),
      ];
      const vertex = this.frame.projectLonLat(around, COUNTRY_THICKNESS + LIFT);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
    // The loop is closed by hand: a fat line has no `LineLoop` form, and an open ring shows
    // its gap at the very radius the player is measuring.
    positions.push(positions[0]!, positions[1]!, positions[2]!);
    this.geometry.setPositions(positions);
    this.geometry.computeBoundingSphere();
  }
}
