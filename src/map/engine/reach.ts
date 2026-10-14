import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { LonLat } from '@/domain/geo';
import type { Reach } from '@/domain/labels';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { ARC_COLORS } from './palette';
import { hatch } from './regions';

/**
 * Fine enough that four hundred kilometres read as a circle rather than as a polygon, coarse
 * enough that rebuilding it on every hover costs nothing.
 */
const SEGMENTS = 96;

/** Just above the land, so the ring is not swallowed by the ground it lies on. */
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
 *
 * **Les deux cercles la partagent** (décisions 4a et 3a du 16/09) : ils mesurent la même chose
 * depuis le même point, et deux encres en feraient deux sujets. Ce qui les sépare est le trait.
 */
const INK = ARC_COLORS.mine.progress;

/**
 * **Le tireté se compte, il ne se mesure pas.** Une longueur fixe en unités de plateau ferait du
 * cercle de contact un trait plein et de celui d'un chasseur quelques traits épars : ce qu'il faut
 * tenir est le *rythme*, le même à soixante kilomètres qu'à quatre cents.
 */
const DASHES = 56;

/**
 * **Sous ce rayon à l'écran, vingt-cinq kilomètres sont un point** — et un point posé sur le mât
 * se lirait comme un marqueur de plus, pas comme une portée. Au zoom monde le contact ne se
 * dessine donc pas ; il revient dès que la carte descend là où il veut dire quelque chose.
 */
const MIN_CONTACT_PIXELS = 6;

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
 *
 * **Une pile en porte deux** (décisions 4a et 3a du 16/09) : le tireté est ce qu'elle voit, le
 * plein ce qu'elle touche. Les deux questions se posaient sur la même carte et une seule avait
 * une réponse dessinée — on lisait une portée de détection en croyant lire une allonge.
 */
export class ReachRing {
  readonly object = new Group();
  private readonly detection = new Ring(true);
  private readonly contact = new Ring(false);
  /** **L'artillerie** (B20) : sa portée en plein, sa zone morte en plein et hachurée dedans. */
  private readonly range = new Ring(false);
  private readonly deadZone = new Ring(false);
  private readonly deadFill = new Mesh(
    new BufferGeometry(),
    hatch(
      new MeshStandardMaterial({
        color: INK,
        emissive: INK,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
        side: DoubleSide,
      }),
    ),
  );
  /** Le rayon du contact en unités de plateau : le seuil de lisibilité se juge en pixels, et
   *  c'est le seul chiffre qui fasse le pont. Zéro quand il n'y a pas de contact à dessiner. */
  private contactUnits = 0;

  constructor(private readonly frame: WorldFrame) {
    this.object.add(
      this.detection.line,
      this.contact.line,
      this.range.line,
      this.deadZone.line,
      this.deadFill,
    );
    this.deadFill.renderOrder = 3;
    this.deadFill.frustumCulled = false;
    this.object.visible = false;
  }

  show(reach: Reach | null): void {
    this.object.visible = reach !== null;
    if (reach === null) return;
    this.write(reach);
  }

  /** A fat line thickens in pixels: without the canvas size it is born at the wrong scale,
   *  exactly as a thread would be (`ArcLayer.resize`). */
  resize(width: number, height: number): void {
    this.detection.resize(width, height);
    this.contact.resize(width, height);
    this.range.resize(width, height);
    this.deadZone.resize(width, height);
  }

  /** Le contact tient vingt-cinq kilomètres : à distance c'est un point, et un point ment. */
  animate(unitsPerPixel: number): void {
    this.contact.line.visible =
      this.contactUnits > 0 && this.contactUnits / unitsPerPixel >= MIN_CONTACT_PIXELS;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.detection.dispose();
    this.contact.dispose();
    this.range.dispose();
    this.deadZone.dispose();
    this.deadFill.geometry.dispose();
    (this.deadFill.material as MeshStandardMaterial).dispose();
  }

  private write(reach: Reach): void {
    this.detection.write(circleAround(this.frame, reach.lonLat, reach.detectionKm));
    const fire = reach.fire ?? null;
    this.range.line.visible = fire !== null;
    this.deadZone.line.visible = fire !== null;
    this.deadFill.visible = fire !== null;
    if (fire !== null) {
      this.range.write(circleAround(this.frame, reach.lonLat, fire.rangeKm));
      const dead = circleAround(this.frame, reach.lonLat, fire.deadZoneKm);
      this.deadZone.write(dead);
      this.deadFill.geometry.dispose();
      this.deadFill.geometry = discOf(this.frame, reach.lonLat, dead);
    }

    if (reach.contactKm === null) {
      this.contact.line.visible = false;
      this.contactUnits = 0;
      return;
    }
    const contact = circleAround(this.frame, reach.lonLat, reach.contactKm);
    this.contact.write(contact);
    this.contactUnits = contact.perimeter / (2 * Math.PI);
  }
}

export function circleAround(frame: WorldFrame, [lon, lat]: LonLat, km: number): Circle {
  const perDegreeEast = KM_PER_DEGREE * Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const positions: number[] = [];
  let perimeter = 0;

  for (let step = 0; step <= SEGMENTS; step += 1) {
    const angle = (step / SEGMENTS) * Math.PI * 2;
    const around: LonLat = [
      lon + (km / perDegreeEast) * Math.sin(angle),
      Math.max(-89, Math.min(89, lat + (km / KM_PER_DEGREE) * Math.cos(angle))),
    ];
    const vertex = frame.projectLonLat(around, COUNTRY_THICKNESS + LIFT);
    if (step > 0) {
      perimeter += Math.hypot(
        vertex.x - positions[positions.length - 3]!,
        vertex.y - positions[positions.length - 2]!,
        vertex.z - positions[positions.length - 1]!,
      );
    }
    positions.push(vertex.x, vertex.y, vertex.z);
  }
  // The loop is closed by hand: a fat line has no `LineLoop` form, and an open ring shows
  // its gap at the very radius the player is measuring.
  positions.push(positions[0]!, positions[1]!, positions[2]!);
  return { positions, perimeter };
}

/** Un éventail de triangles du centre au tracé : le disque hachuré de la zone morte. */
function discOf(frame: WorldFrame, at: LonLat, { positions }: Circle): BufferGeometry {
  const center = frame.projectLonLat(at, COUNTRY_THICKNESS + LIFT);
  const fan: number[] = [];
  for (let i = 0; i + 5 < positions.length; i += 3)
    fan.push(
      center.x,
      center.y,
      center.z,
      ...positions.slice(i + 3, i + 6),
      ...positions.slice(i, i + 3),
    );
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(fan, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Le tracé projeté d'un cercle, et sa longueur : le rythme du tireté comme le seuil du contact
 *  se lisent tous deux sur elle, et la mesurer une fois évite de la supposer ronde. */
type Circle = { readonly positions: ReadonlyArray<number>; readonly perimeter: number };

/** Un anneau et son trait. Deux instances plutôt qu'un matériau qu'on bascule : le tireté et le
 *  plein sont affichés ensemble, donc ce sont bien deux objets. */
class Ring {
  readonly line: Line2;
  private readonly geometry = new LineGeometry();
  private readonly material: LineMaterial;

  constructor(private readonly dashed: boolean) {
    this.material = new LineMaterial({
      color: INK,
      linewidth: THICKNESS,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      dashed,
    });
    this.line = new Line2(this.geometry, this.material);
    this.line.renderOrder = 3;
    this.line.frustumCulled = false;
  }

  write({ positions, perimeter }: Circle): void {
    this.geometry.setPositions([...positions]);
    this.geometry.computeBoundingSphere();
    if (!this.dashed) return;
    const stroke = perimeter / (DASHES * 2);
    this.material.dashSize = stroke;
    this.material.gapSize = stroke;
    // Le tireté se compte sur une distance cumulée qui vient des positions : elle est fausse
    // tant qu'on ne la recalcule pas, et un anneau redessiné garde alors le rythme de l'ancien.
    this.line.computeLineDistances();
  }

  resize(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  dispose(): void {
    this.line.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
