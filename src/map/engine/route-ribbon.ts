import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Vector3,
  type Intersection,
  type PerspectiveCamera,
  type Raycaster,
} from 'three';

/**
 * **A route is a printed ribbon, not a stroke** (`table-etat-major`, 13/10/2026): a flat band
 * laid on the sheet with its true width, its dashes printed along the distance. A band of true
 * width alone would vanish from the world view, so it has a floor in pixels — the ribbon is the
 * sheet's up close and the reader's from afar.
 */
export const ribbonWidth = (width: number, floorPx: number, unitsPerPixel: number): number =>
  Math.max(width, floorPx * unitsPerPixel);

/** The dash pitch in widths of the ribbon as drawn: the plate's dash is some four times as long
 *  as the band is wide. Tied to the drawn width, a dash at the floor stays a dash and not a dot. */
const DASH_PITCH_WIDTHS = 4;
export const dashPitch = (drawnWidth: number): number => DASH_PITCH_WIDTHS * drawnWidth;

/** The dash's share of the pitch, the rest being the gap. */
const DASH_SHARE = 0.6;

/**
 * How high above the strand's lowest point the ribbon has fully turned to the eye, in board
 * units. A flat band in the air is seen edge-on as soon as the orbit lowers and closes into a
 * hairline; a band that faces the camera at take-off would stand up on the sheet. Between the
 * two it turns as it climbs.
 */
const FACING_RAMP = 0.5;

/** Per vertex, `0` lies flat on the sheet and `1` faces the eye around the ribbon's axis. */
export function facingOf(vertices: ReadonlyArray<Vector3>): number[] {
  const ground = Math.min(...vertices.map((vertex) => vertex.y));
  return vertices.map((vertex) => Math.min(1, (vertex.y - ground) / FACING_RAMP));
}

const UP = new Vector3(0, 1, 0);
const TOWARD_EYE = new Vector3();

/** The ribbon's half-width direction at a point — the vertex shader's rule, written here once
 *  more to be tested, since a shader is not. */
export function ribbonAcross(
  tangent: Vector3,
  point: Vector3,
  camera: Vector3,
  facing: number,
  out: Vector3,
): Vector3 {
  TOWARD_EYE.subVectors(camera, point).normalize();
  const normal = UP.clone().lerp(TOWARD_EYE, facing).normalize();
  return out.crossVectors(tangent, normal).normalize();
}

/**
 * Each vertex twice, one per edge: the shader pushes them apart by the width it decides, so the
 * geometry never changes with the zoom. `along` is the distance on the whole thread, `start`
 * being where this strand picks it up — the cut and the dashes read it.
 */
export function ribbonGeometry(vertices: ReadonlyArray<Vector3>, start = 0): BufferGeometry {
  const count = vertices.length;
  const position = new Float32Array(count * 6);
  const tangent = new Float32Array(count * 6);
  const side = new Float32Array(count * 2);
  const along = new Float32Array(count * 2);
  const facing = new Float32Array(count * 2);
  const facings = facingOf(vertices);
  const direction = new Vector3();
  const index: number[] = [];
  let distance = start;
  for (let i = 0; i < count; i++) {
    const point = vertices[i]!;
    if (i > 0) distance += point.distanceTo(vertices[i - 1]!);
    direction
      .subVectors(vertices[Math.min(count - 1, i + 1)]!, vertices[Math.max(0, i - 1)]!)
      .normalize();
    for (let edge = 0; edge < 2; edge++) {
      const k = i * 2 + edge;
      position.set([point.x, point.y, point.z], k * 3);
      tangent.set([direction.x, direction.y, direction.z], k * 3);
      side[k] = edge === 0 ? 1 : -1;
      along[k] = distance;
      facing[k] = facings[i]!;
    }
    if (i < count - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('tangent', new BufferAttribute(tangent, 3));
  geometry.setAttribute('side', new BufferAttribute(side, 1));
  geometry.setAttribute('along', new BufferAttribute(along, 1));
  geometry.setAttribute('facing', new BufferAttribute(facing, 1));
  geometry.setIndex(index);
  return geometry;
}

const VERTEX = `
attribute vec3 tangent;
attribute float side;
attribute float along;
attribute float facing;
uniform float width;
uniform float floorPx;
uniform float bleedPx;
uniform float viewHeight;
varying float vAlong;
varying float vAcross;
varying float vHalfPx;
void main() {
  vec3 point = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 clip = projectionMatrix * viewMatrix * vec4(point, 1.0);
  float perPixel = 2.0 * clip.w / (projectionMatrix[1][1] * viewHeight);
  float halfWidth = 0.5 * (max(width, floorPx * perPixel) + bleedPx * perPixel);
  vec3 normal = normalize(mix(vec3(0.0, 1.0, 0.0), normalize(cameraPosition - point), facing));
  vec3 across = cross(tangent, normal);
  float span = length(across);
  across = span > 1e-6 ? across / span : vec3(0.0);
  vAlong = along;
  vAcross = side;
  vHalfPx = halfWidth / perPixel;
  gl_Position = projectionMatrix * viewMatrix * vec4(point + across * side * halfWidth, 1.0);
}`;

const FRAGMENT = `
uniform vec3 coveredColor;
uniform vec3 remainingColor;
uniform float coveredOpacity;
uniform float remainingOpacity;
uniform float cut;
uniform float end;
uniform float pitch;
uniform float phase;
uniform float dashed;
uniform float bleedPx;
varying float vAlong;
varying float vAcross;
varying float vHalfPx;
void main() {
  if (vAlong > end) discard;
  // A bled ribbon is the casing: it rims the band and leaves its middle to the sheet, so the
  // gaps between dashes show the map and not a dark tape.
  if (bleedPx > 0.0 && (1.0 - abs(vAcross)) * vHalfPx > bleedPx * 0.5 + 0.5) discard;
  bool covered = vAlong <= cut;
  if (!covered && dashed > 0.5 && fract(vAlong / pitch - phase) > ${DASH_SHARE}) discard;
  // A pixel of soft edge, whatever the drawn width: the band's edge is printed, not stepped.
  float edge = clamp((1.0 - abs(vAcross)) * vHalfPx + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(
    covered ? coveredColor : remainingColor,
    (covered ? coveredOpacity : remainingOpacity) * edge
  );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Farther than any thread, and finite: a GPU compiled for speed may assume no infinity, and
 *  `Number.MAX_VALUE` reaches it as one. */
const NO_END = 1e9;

export type RibbonInk = { readonly color: string; readonly opacity: number };

/**
 * One material, two inks: what lies before `cut` is covered and solid, what lies after is the
 * remainder, dashed if asked. Past `end` nothing is drawn — that is the pen.
 */
export class RibbonMaterial extends ShaderMaterial {
  constructor(options: {
    width: number;
    floorPx: number;
    bleedPx?: number;
    covered: RibbonInk;
    remaining: RibbonInk;
    dashed?: boolean;
  }) {
    super({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // The band's winding follows the eye around a facing ribbon: no face is its back.
      side: DoubleSide,
      uniforms: {
        width: { value: options.width },
        floorPx: { value: options.floorPx },
        bleedPx: { value: options.bleedPx ?? 0 },
        viewHeight: { value: 1 },
        coveredColor: { value: new Color(options.covered.color) },
        remainingColor: { value: new Color(options.remaining.color) },
        coveredOpacity: { value: options.covered.opacity },
        remainingOpacity: { value: options.remaining.opacity },
        cut: { value: -1 },
        end: { value: NO_END },
        pitch: { value: 1 },
        phase: { value: 0 },
        dashed: { value: options.dashed === true ? 1 : 0 },
      },
    });
  }

  get width(): number {
    return this.uniforms.width!.value as number;
  }
  get floorPx(): number {
    return this.uniforms.floorPx!.value as number;
  }
  get viewHeight(): number {
    return this.uniforms.viewHeight!.value as number;
  }
  set viewHeight(value: number) {
    this.uniforms.viewHeight!.value = value;
  }
  get cut(): number {
    return this.uniforms.cut!.value as number;
  }
  set cut(value: number) {
    this.uniforms.cut!.value = value;
  }
  set end(value: number) {
    this.uniforms.end!.value = value;
  }
  get pitch(): number {
    return this.uniforms.pitch!.value as number;
  }
  set pitch(value: number) {
    this.uniforms.pitch!.value = value;
  }
  get phase(): number {
    return this.uniforms.phase!.value as number;
  }
  set phase(value: number) {
    this.uniforms.phase!.value = value;
  }
  get coveredOpacity(): number {
    return this.uniforms.coveredOpacity!.value as number;
  }
  set coveredOpacity(value: number) {
    this.uniforms.coveredOpacity!.value = value;
  }
  get remainingOpacity(): number {
    return this.uniforms.remainingOpacity!.value as number;
  }
  set remainingOpacity(value: number) {
    this.uniforms.remainingOpacity!.value = value;
  }
}

const RAY_POINT = new Vector3();
const STRAND_POINT = new Vector3();

/**
 * A ribbon on the sheet. Its geometry holds the centre line only — the width is the shader's —
 * so a triangle raycast would never hit it: the pointer is measured against the centre line,
 * with the half-width drawn at that distance plus the threshold in pixels (`params.Line2`,
 * the one a fat line read).
 */
export class Ribbon extends Mesh<BufferGeometry, RibbonMaterial> {
  constructor(
    readonly vertices: ReadonlyArray<Vector3>,
    material: RibbonMaterial,
    start = 0,
  ) {
    super(ribbonGeometry(vertices, start), material);
  }

  override raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    const camera = raycaster.camera as PerspectiveCamera | undefined;
    if (camera === undefined || !('fov' in camera)) return;
    const threshold = (raycaster.params as { Line2?: { threshold: number } }).Line2?.threshold ?? 0;
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    let best: Intersection | null = null;
    for (let i = 0; i + 1 < this.vertices.length; i++) {
      const distanceSq = raycaster.ray.distanceSqToSegment(
        this.vertices[i]!,
        this.vertices[i + 1]!,
        RAY_POINT,
        STRAND_POINT,
      );
      const perPixel =
        (2 * tan * STRAND_POINT.distanceTo(camera.position)) / this.material.viewHeight;
      const reach =
        ribbonWidth(this.material.width, this.material.floorPx, perPixel) / 2 +
        threshold * perPixel;
      if (distanceSq > reach * reach) continue;
      const distance = raycaster.ray.origin.distanceTo(RAY_POINT);
      if (best === null || distance < best.distance)
        best = { distance, point: STRAND_POINT.clone(), object: this };
    }
    if (best !== null) intersects.push(best);
  }
}
