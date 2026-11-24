import {
  AdditiveBlending,
  Box3,
  BufferGeometry,
  DoubleSide,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import { lookoutBeamStrength } from '@/domain/lookout-beam';
import type { AmbientLayer } from './ambience';
import type { WorldFrame } from './frame';
import { MOON_TINT } from './palette';
import { lonLatAround } from './reach';
import { LIVE_PX } from './site-loops';

/** **Au plus tant de faisceaux à la fois**, les plus proches de l'œil : un secteur additif par
 *  point, hors du `MAX_LIVING` des sites. `@a-mesurer` */
export const MAX_BEAMS = { desk: 6, touch: 3 } as const;
/** Le fondu d'un faisceau qui s'allume ou s'éteint (panne de charbon comprise), comme `FADE_MS`. */
const BEAM_FADE_MS = 180;
/** Ce qu'une image peut avancer le fondu : après un long repos, il s'étale sur les images de la
 *  fenêtre de l'`invalidate()` au lieu de sauter. */
export const BEAM_STEP_MS = 50;
/** **Longueur et ouverture du secteur, vitesse du balayage** : fixes, sans lien au niveau du point
 *  ni à son rayon. `@a-mesurer` */
const BEAM_KM = 12;
const BEAM_SPREAD_DEG = 30;
const BEAM_TURN = 0.3;
/** **La force du faisceau plein**, sous le `GROUND_GAIN` des halos : pâle, il laisse lire un
 *  chiffre d'épingle. `@a-mesurer` */
export const BEAM_GAIN = 0.3;
/** Le point lumineux à la source, en part de la longueur. */
const DOT = 0.06;
/** Au-dessus des halos (2,5), sous les anneaux et les fils (3). */
const RANK = 2.6;
const LIFT = 0.008;
const RINGS = 6;
const STEPS = 10;
const DOT_STEPS = 12;

/** Un point dont le faisceau s'allume : l'avant-poste, tel que `ZonePoint` le dit. */
export type BeamPoint = {
  readonly id: string;
  readonly lonLat: LonLat;
  readonly lookoutKm: number | null;
};

/** **Où le faisceau regarde au repos**, et l'azimut où il tourne : fonction de l'identifiant et de
 *  l'horloge de l'ambiance seules, sans état, donc le même après une vue qui se resert. */
export function beamAzimuth(id: string, seconds: number): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return (hash / 9973) * 2 * Math.PI + seconds * BEAM_TURN;
}

/** Le secteur de longueur 1 vers +z, et son point : la teinte porte la force (l'additif). */
function sector(): BufferGeometry {
  const positions: number[] = [];
  const strengths: number[] = [];
  const index: number[] = [];
  const half = (BEAM_SPREAD_DEG * Math.PI) / 360;
  positions.push(0, 0, 0);
  strengths.push(1);
  for (let ring = 1; ring <= RINGS; ring++) {
    const r = ring / RINGS;
    for (let step = 0; step <= STEPS; step++) {
      const side = (2 * step) / STEPS - 1;
      const a = side * half;
      positions.push(r * Math.sin(a), 0, r * Math.cos(a));
      // Plein au pied et au milieu, à rien au bout et sur les bords.
      strengths.push((1 - r) ** 1.2 * (1 - Math.abs(side) ** 2));
    }
  }
  for (let step = 0; step < STEPS; step++) index.push(0, 1 + step + 1, 1 + step);
  for (let ring = 1; ring < RINGS; ring++) {
    const near = 1 + (ring - 1) * (STEPS + 1);
    const far = near + STEPS + 1;
    for (let step = 0; step < STEPS; step++)
      index.push(
        near + step,
        near + step + 1,
        far + step,
        near + step + 1,
        far + step + 1,
        far + step,
      );
  }
  const dot = positions.length / 3;
  positions.push(0, 0, 0);
  strengths.push(1);
  for (let step = 0; step <= DOT_STEPS; step++) {
    const a = (2 * Math.PI * step) / DOT_STEPS;
    positions.push(DOT * Math.sin(a), 0, DOT * Math.cos(a));
    strengths.push(0);
  }
  for (let step = 0; step < DOT_STEPS; step++) index.push(dot, dot + 1 + step + 1, dot + 1 + step);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'color',
    new Float32BufferAttribute(
      strengths.flatMap((s) => [s, s, s]),
      3,
    ),
  );
  geometry.setIndex(index);
  return geometry;
}

type Beam = {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly azimuthOf: (seconds: number) => number;
  /** Where it stands in its fade, 0 out to 1 lit, and the night's share it was last lit by. */
  level: number;
  strength: number;
};

type Placed = BeamPoint & { readonly at: Vector3; readonly box: Box3 };

const tint = new Color(...MOON_TINT).multiplyScalar(1 / Math.max(...MOON_TINT));

/**
 * **Les avant-postes qui guettent balaient le sol, la nuit** (#644) : un secteur de lumière pâle
 * posé au sol, additif, avec un point à sa source, qui tourne lentement. Une ambiance du fx
 * `sites` : idle quand aucun faisceau n'est allumé dans le champ ; en mouvement réduit ou coupé,
 * il est posé à son azimut de repos et ne demande aucune image. Il lit la nuit du lieu lui-même
 * (`ambience.frame()` passe avant `night.apply`) et ne dépend pas du calque des zones.
 */
export class LookoutBeams implements AmbientLayer {
  readonly fx = 'sites';
  readonly hz = 8;
  readonly object = new Group();
  private readonly geometry = sector();
  private readonly beams = new Map<string, Beam>();
  private points: ReadonlyArray<Placed> = [];
  private last: number;

  constructor(
    private readonly board: Pick<WorldFrame, 'projectLonLat'>,
    /** The board's instant: `forcedInstant ?? boardInstant(...)`. */
    private readonly instant: () => number,
    /** Ce que voit l'œil : la boîte coupe le champ, et fait au moins `px`. */
    private readonly sees: (box: Box3, px: number) => boolean,
    private readonly eye: () => Vector3,
    private readonly cap: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.last = now();
  }

  /** Les points de mes avant-postes en service, à chaque vue : les faisceaux en cours se gardent. */
  show(points: ReadonlyArray<BeamPoint>): void {
    this.points = points.map((point) => {
      const at = this.board.projectLonLat(point.lonLat);
      const north = this.board.projectLonLat(lonLatAround(point.lonLat, BEAM_KM, 0));
      const reach = at.distanceTo(north);
      return {
        ...point,
        at,
        box: new Box3().setFromCenterAndSize(at, new Vector3(2 * reach, 0.01, 2 * reach)),
      };
    });
  }

  idle(): boolean {
    return this.lit().length === 0;
  }

  frame(seconds: number, motion: MapMotion): void {
    const now = this.now();
    const fade = motion === 'full' ? Math.min(now - this.last, BEAM_STEP_MS) / BEAM_FADE_MS : 1;
    this.last = now;
    const clock = motion === 'full' ? seconds : 0;
    const wanted = new Map(
      this.chosen().map(({ point, strength }) => [point.id, { point, strength }]),
    );
    for (const [id, { point, strength }] of wanted) {
      if (!this.beams.has(id)) this.beams.set(id, this.take(point));
      this.beams.get(id)!.strength = strength;
    }
    for (const [id, beam] of this.beams) {
      beam.level = Math.min(1, Math.max(0, beam.level + (wanted.has(id) ? fade : -fade)));
      if (beam.level === 0 && !wanted.has(id)) {
        beam.mesh.removeFromParent();
        beam.mesh.material.dispose();
        this.beams.delete(id);
        continue;
      }
      beam.mesh.rotation.y = beam.azimuthOf(clock);
      beam.mesh.material.opacity = beam.level * beam.strength * BEAM_GAIN;
    }
  }

  /** How many beams stand now: what the tests read. */
  get size(): number {
    return this.beams.size;
  }

  private take(point: Placed): Beam {
    const material = new MeshBasicMaterial({
      color: tint,
      vertexColors: true,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    const mesh = new Mesh(this.geometry, material);
    const reach = point.box.getSize(new Vector3()).x / 2;
    mesh.position.set(point.at.x, point.at.y + LIFT, point.at.z);
    mesh.scale.setScalar(reach);
    mesh.renderOrder = RANK;
    mesh.frustumCulled = false;
    // Decor: neither picked nor aimed at.
    mesh.raycast = () => {};
    this.object.add(mesh);
    return {
      mesh,
      azimuthOf: (seconds) => beamAzimuth(point.id, seconds),
      level: 0,
      strength: 0,
    };
  }

  /** The points lit now, in the field and big enough to read. */
  private lit(): Array<{ point: Placed; strength: number }> {
    const instant = this.instant();
    return this.points.flatMap((point) => {
      const strength = lookoutBeamStrength(point.lookoutKm, point.lonLat, instant);
      return strength > 0 && this.sees(point.box, LIVE_PX) ? [{ point, strength }] : [];
    });
  }

  /** The nearest to the eye, up to the cap. */
  private chosen(): Array<{ point: Placed; strength: number }> {
    const eye = this.eye();
    return this.lit()
      .sort((a, b) => a.point.at.distanceToSquared(eye) - b.point.at.distanceToSquared(eye))
      .slice(0, this.cap);
  }

  dispose(): void {
    for (const beam of this.beams.values()) beam.mesh.material.dispose();
    this.beams.clear();
    this.geometry.dispose();
    this.object.removeFromParent();
  }
}
