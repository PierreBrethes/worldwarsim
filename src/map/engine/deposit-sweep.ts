import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial } from 'three';
import { SWEEP_MS, SWEEP_RANGE_KM, sweepFrontKm } from '@/domain/deposit-sweep';
import { destinationPoint, type LonLat } from '@/domain/geo';
import type { DepositKey } from '@/domain/ids';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { NIGHT_HERE_GLSL, type NightUniforms } from './night-here';
import { WASH } from './deposit-basins';

/** The circle's rings and spokes: enough that the front reads round at a thousand kilometres. */
const RINGS = 40;
const SPOKES = 128;
/** Past the range, room for the front's wobble. */
const REACH = SWEEP_RANGE_KM * 1.08;
/** Over the basins (0.003): the wave washes over them. */
const LIFT = 0.0035;
/** The paper the wash fades into by night, the maquette's `nightWash`. */
const PAPER = '#efe6cf';

// Distances in kilometres along the ground, so the front meets a basin when the rule says it does
// (`depositSweep`'s `hitMs`); widths in screen pixels, as the maquette draws them.
const VERTEX = `
attribute float aKm;
attribute vec2 aDir;
varying float vKm;
varying vec2 vDir;
varying vec2 vWorld;
void main() {
  vKm = aKm;
  vDir = aDir;
  vWorld = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = `
${NIGHT_HERE_GLSL}
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uFront;
uniform float uFade;
uniform float uTime;
varying float vKm;
varying vec2 vDir;
varying vec2 vWorld;
void main() {
  float kmPerPx = max(fwidth(vKm), 1e-4);
  float theta = atan(vDir.x, vDir.y);
  float wobble = 5.0 * sin(theta * 6.0 + 1.3) + 3.0 * sin(theta * 17.0 + uTime / 260.0) + 2.0 * sin(theta * 31.0);
  // Close to its start the wobble would star the drop: it swells with the radius.
  float front = uFront + wobble * kmPerPx * min(1.0, uFront / (120.0 * kmPerPx));
  float band = 56.0 * kmPerPx;
  float lip = 8.0 * kmPerPx;
  if (vKm > front + lip) discard;
  float night = nightAtWorld(vWorld);
  // By night the wash goes light, the species' ink melted into the paper.
  vec3 ink = mix(uInk, uInk * 0.3 + uPaper * 0.7, night);
  float alpha;
  if (vKm < front - band) alpha = 0.5 * mix(0.03, 0.06, night);
  else {
    float s = (vKm - (front - band)) / (band + lip);
    alpha = s < 0.7
      ? mix(0.0, mix(0.14, 0.18, night), s / 0.7)
      : mix(mix(0.14, 0.18, night), mix(0.36, 0.4, night), (s - 0.7) / 0.3);
  }
  float edge = 1.0 - smoothstep(0.9, 1.6, abs(vKm - front) / kmPerPx);
  alpha = max(alpha, 0.8 * edge);
  gl_FragColor = vec4(ink, alpha * uFade);
  #include <colorspace_fragment>
}`;

/**
 * **L'onde de la sonde** (#249, maquette `radar-gisements/choisie.html`, l'onde de `lavis.html`) :
 * un front de lavis à l'encre de l'espèce part du centre de la vue et court `SWEEP_RANGE_KM` en
 * `SWEEP_MS`, la couleur séchant derrière lui ; de nuit, il passe au clair. Un disque de rayons et
 * d'anneaux posé le long du sol, à la distance vraie : le front touche un bassin à l'instant où la
 * règle le dit atteint.
 */
export class SweepWave {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private startedAt: number | null = null;

  constructor(
    private readonly frame: WorldFrame,
    night: NightUniforms,
  ) {
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uInk: { value: new Color() },
        uPaper: { value: new Color(PAPER) },
        uFront: { value: 0 },
        uFade: { value: 0 },
        uTime: { value: 0 },
        ...night,
      },
    });
    material.transparent = true;
    material.depthWrite = false;
    // Spokes run clockwise seen from above: both faces, rather than a winding to keep in mind.
    material.side = DoubleSide;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -5;
    this.mesh = new Mesh(new BufferGeometry(), material);
    this.mesh.renderOrder = 0.35;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
  }

  /** While the front runs, the loop draws each frame. */
  get active(): boolean {
    return this.startedAt !== null;
  }

  // ponytail: the disc is laid in lon/lat, so a wave across the antimeridian tears; no deposit
  // of the atlas lies near it.
  start(from: LonLat, species: DepositKey, now: number): void {
    const positions: number[] = [];
    const kms: number[] = [];
    const dirs: number[] = [];
    const index: number[] = [];
    for (let s = 0; s <= SPOKES; s++) {
      const bearing = (s / SPOKES) * 360;
      const radians = (bearing * Math.PI) / 180;
      for (let r = 0; r <= RINGS; r++) {
        const km = (REACH * r) / RINGS;
        const point = this.frame.projectLonLat(
          r === 0 ? from : destinationPoint(from, km, bearing),
          COUNTRY_THICKNESS + LIFT,
        );
        positions.push(point.x, point.y, point.z);
        kms.push(km);
        dirs.push(Math.sin(radians), Math.cos(radians));
        if (s < SPOKES && r < RINGS) {
          const a = s * (RINGS + 1) + r;
          const b = a + RINGS + 1;
          index.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('aKm', new BufferAttribute(new Float32Array(kms), 1));
    geometry.setAttribute('aDir', new BufferAttribute(new Float32Array(dirs), 2));
    geometry.setIndex(index);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.mesh.material.uniforms.uInk!.value.set(WASH[species]);
    this.startedAt = now;
    this.animate(now);
  }

  stop(): void {
    this.startedAt = null;
    this.mesh.visible = false;
  }

  animate(now: number): void {
    if (this.startedAt === null) return;
    const age = now - this.startedAt;
    if (age > SWEEP_MS) return this.stop();
    const uniforms = this.mesh.material.uniforms;
    uniforms.uFront!.value = sweepFrontKm(age);
    uniforms.uFade!.value =
      Math.min(1, age / 200) * (1 - uniforms.uFront!.value / SWEEP_RANGE_KM) ** 0.6;
    uniforms.uTime!.value = age;
    this.mesh.visible = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
