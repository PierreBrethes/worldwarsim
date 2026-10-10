import {
  Color,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { createGusts, GUST_FIRST_S } from '@/domain/gusts';
import type { MapMotion } from '@/domain/map-motion';
import type { AmbientLayer } from './ambience';
import { PALETTE } from './palette';
import { enableGusts, gustUniforms } from './terrain';

/** Below the threads (rank 10-12): a stroke of wind must never be read as a movement. */
const STREAK_RANK = 9;
const STREAK_PEAK_OPACITY = 0.22;
const STREAK_SPACING_PX = 22;
const STREAK_HALF_WIDTH_PX = 0.9;

const VERTEX = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';

/**
 * Speed lines laid across the screen, in pixels, so they read at every distance. Each line has
 * its own offset, length, delay and life, and tapers to nothing at the tail: no two alike, none
 * dashed, none in an arc colour.
 */
const FRAGMENT = `
uniform vec2 resolution;
uniform float pixelRatio;
uniform float force;
uniform float progress;
uniform float band;
uniform vec2 direction;
uniform vec3 ink;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / pixelRatio;
  vec2 normal = vec2(-direction.y, direction.x);
  float along = dot(p, direction);
  float across = dot(p, normal);
  float reach = 0.5 * length(resolution) / pixelRatio;
  float inBand = 1.0 - smoothstep(0.16 * reach, 0.4 * reach, abs(across - (band - 0.5) * reach * 1.2));
  float cell = floor(across / ${STREAK_SPACING_PX.toFixed(1)});
  float centre = (0.2 + 0.6 * hash(cell)) * ${STREAK_SPACING_PX.toFixed(1)};
  float offset = abs(across - cell * ${STREAK_SPACING_PX.toFixed(1)} - centre);
  float extent = 90.0 + 220.0 * hash(cell + 31.7);
  float s = clamp((progress - 0.35 * hash(cell + 77.3)) / 0.6, 0.0, 1.0);
  float t = (mix(-reach - extent, reach + extent, s) - along) / extent;
  float width = ${STREAK_HALF_WIDTH_PX.toFixed(2)} * (1.0 - 0.7 * clamp(t, 0.0, 1.0));
  float line = (1.0 - smoothstep(width - 0.5, width + 0.5, offset)) * step(0.0, t) * step(t, 1.0) * (1.0 - t);
  float present = step(0.55, hash(cell + 11.1));
  gl_FragColor = vec4(ink, line * present * inBand * sin(3.14159 * s) * force * ${STREAK_PEAK_OPACITY.toFixed(2)});
  #include <colorspace_fragment>
}`;

/** `?gust=now` brings the first gust to the opening, to see it without waiting. */
// ponytail: prototype switch for trying the wind; removed before the merge.
const gustOffset = (search: string): number =>
  new URLSearchParams(search).get('gust') === 'now' ? GUST_FIRST_S[0] : 0;

export class WindLayer implements AmbientLayer {
  readonly fx = 'wind' as const;
  private readonly gusts = createGusts();
  private readonly offset = gustOffset(location.search);
  private readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly resolution = new Vector2();
  private readonly onScreen = new Vector3();

  constructor(
    scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly renderer: WebGLRenderer,
  ) {
    enableGusts();
    this.mesh = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          resolution: { value: this.resolution },
          pixelRatio: { value: 1 },
          force: { value: 0 },
          progress: { value: 0 },
          band: { value: 0.5 },
          direction: { value: new Vector2(1, 0) },
          ink: { value: new Color(PALETTE.border) },
        },
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = STREAK_RANK;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  frame(time: number, motion: MapMotion): void {
    const gust = motion === 'full' ? this.gusts.at(time + this.offset) : null;
    gustUniforms.force.value = gust?.force ?? 0;
    this.mesh.visible = gust !== null;
    if (gust === null) return;

    const ground = this.onScreen.set(Math.cos(gust.angle), 0, Math.sin(gust.angle));
    gustUniforms.time.value = time;
    gustUniforms.direction.value.set(ground.x, ground.z);

    // The streaks follow the wind as the player sees it: the ground direction through the view.
    ground.transformDirection(this.camera.matrixWorldInverse);
    const flat = Math.hypot(ground.x, ground.y);
    const { uniforms } = this.mesh.material;
    (uniforms.direction!.value as Vector2).set(
      flat > 0.05 ? ground.x / flat : 1,
      flat > 0.05 ? ground.y / flat : 0,
    );
    uniforms.force!.value = gust.force;
    uniforms.progress!.value = gust.progress;
    uniforms.band!.value = gust.band;
    uniforms.pixelRatio!.value = this.renderer.getPixelRatio();
    this.renderer.getDrawingBufferSize(this.resolution);
  }
}
