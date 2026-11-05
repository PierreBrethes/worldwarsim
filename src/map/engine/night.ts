import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  HemisphereLight,
  Mesh,
  MultiplyBlending,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  ShaderMaterial,
  Vector2,
  type Scene,
} from 'three';
import {
  DAY_ALTITUDE_DEG,
  NIGHT_ALTITUDE_DEG,
  nightOfAltitude,
  subsolarPoint,
  sunAltitude,
} from '@/domain/daylight';
import type { LonLat } from '@/domain/geo';
import { COUNTRY_THICKNESS, SEA_LEVEL, type WorldFrame } from './frame';
import { nightUniforms, type NightUniforms } from './night-here';
import { MOON_TINT } from './palette';
import type { SeaLayer } from './sea';

const CITY_GOLD = '#ffcf6e';
export type DaySky = { readonly sky: Color; readonly ground: Color; readonly intensity: number };
/** Le ciel du prototype (`carte-refonte`) : faible devant la lampe, pour des ombres marquées. */
const BOARD_DAY_SKY: DaySky = {
  sky: new Color('#fff1d6'),
  ground: new Color('#2a1c10'),
  intensity: 0.55,
};
/** The landing table's night sky, as it was before the map's refonte. */
const LANDING_NIGHT_SKY: DaySky = {
  sky: new Color('#2f4fa8'),
  ground: new Color('#10162c'),
  intensity: 0.45,
};
/** The map's: the maquette's moonlit sky, dim in front of a lamp that is the moon. @a-mesurer */
const MOON_SKY: DaySky = {
  sky: new Color('#4a5d8c'),
  ground: new Color('#0b0e18'),
  intensity: 0.3,
};
const SHADE_INK = '#0c1430';
/** How much ink the full night lays over the sheet: the game layer above it must still read. */
const SHADE_DEPTH = 0.5;
/** Just over the country tops and their region fills; under reaches, threads and pieces. */
const SHADE_LIFT = COUNTRY_THICKNESS + 0.01;
const SHADE_RANK = 2;
/** The sun moves a quarter degree a minute: below a hundredth of one, nothing is worth a write. */
const SUN_STEP_DEG = 0.01;

function dotTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d')!;
  const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 32, 32);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * **L'ombre de la Terre** : a veil over the whole sheet, land and sea alike, dark where the sun is
 * down. The altitude is worked out per fragment from the board's own `lonLat` — `nightOfAltitude`
 * written in GLSL — so the twilight is a soft band and not a stepped edge. The board's veil
 * multiplies the sheet by the moon's blue (#198, the maquette's `nightHere`); the landing's lays
 * ink over it, as before the map's refonte.
 */
function shadeMaterial(sun: { value: Vector2 }, multiply: boolean): ShaderMaterial {
  const degrees = (value: number) => value.toFixed(1);
  const [r, g, b] = MOON_TINT;
  return new ShaderMaterial({
    uniforms: { sun, ink: { value: new Color(SHADE_INK) }, depth: { value: SHADE_DEPTH } },
    vertexShader: `
      attribute vec2 lonLat;
      varying vec2 vLonLat;
      void main() {
        vLonLat = lonLat;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec2 sun;
      uniform vec3 ink;
      uniform float depth;
      varying vec2 vLonLat;
      void main() {
        vec2 here = radians(vLonLat);
        vec2 s = radians(sun);
        float sine = sin(here.y) * sin(s.y) + cos(here.y) * cos(s.y) * cos(here.x - s.x);
        float altitude = degrees(asin(clamp(sine, -1.0, 1.0)));
        float night = 1.0 - smoothstep(${degrees(NIGHT_ALTITUDE_DEG)}, ${degrees(DAY_ALTITUDE_DEG)}, altitude);
        ${
          multiply
            ? `gl_FragColor = vec4(mix(vec3(1.0), vec3(${r}, ${g}, ${b}), night), 1.0);`
            : 'gl_FragColor = vec4(ink, night * depth);'
        }
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    ...(multiply ? { blending: MultiplyBlending, premultipliedAlpha: true } : {}),
  });
}

/**
 * **La nuit du plateau** (#198) : la lampe devient une lune (`Lamp`) et le ciel descend, pour la
 * carte comme pour les pièces ; les villes s'allument chacune à son crépuscule. L'accueil, lui, garde
 * sa nuit d'avant la refonte — un voile d'encre et l'ancien ciel — jusqu'à ce que Pierre le refasse.
 * Le voile des deux est une bande de nuit au pixel : elle dit qui dort et où, de loin comme de près.
 */
export class NightSky {
  private readonly sky: HemisphereLight;
  private readonly cities: Points<BufferGeometry, PointsMaterial>;
  private readonly shade: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly sun = { value: new Vector2(Number.NaN, 0) };
  /** What the inks drawn on the sheet read to know the night under them. */
  readonly uniforms: NightUniforms;
  private readonly night: DaySky;

  /**
   * **Les villes qui s'allument la nuit** : celles de l'atlas d'aujourd'hui au plateau, les mêmes
   * que les noms (#440) ; l'accueil, qui ne charge pas l'atlas, passe sa propre liste. Du décor,
   * jamais lu par une règle.
   */
  constructor(
    scene: Scene,
    frame: WorldFrame,
    private readonly sea: SeaLayer | null,
    surface: BufferGeometry,
    private readonly cityLights: readonly LonLat[],
    private readonly day: DaySky = BOARD_DAY_SKY,
    landing = false,
  ) {
    this.sky = new HemisphereLight(day.sky, day.ground, day.intensity);
    this.night = landing ? LANDING_NIGHT_SKY : MOON_SKY;
    this.uniforms = nightUniforms(frame, this.sun);

    const positions = cityLights.flatMap((city) => frame.projectLonLat(city, 0.3).toArray());
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    // Each city carries its own light in its alpha: it comes on with its own dusk.
    geometry.setAttribute(
      'color',
      new Float32BufferAttribute(
        cityLights.flatMap(() => [1, 1, 1, 0]),
        4,
      ),
    );
    this.cities = new Points(
      geometry,
      new PointsMaterial({
        color: CITY_GOLD,
        map: dotTexture(),
        size: 9,
        sizeAttenuation: false,
        transparent: true,
        vertexColors: true,
        depthWrite: false,
      }),
    );
    this.cities.renderOrder = SHADE_RANK + 1;
    this.cities.material.userData.ownsMap = true;
    this.shade = new Mesh(surface, shadeMaterial(this.sun, !landing));
    this.shade.position.y = SHADE_LIFT - SEA_LEVEL;
    this.shade.renderOrder = SHADE_RANK;
    scene.add(this.sky, this.shade, this.cities);
  }

  /** **En plein jour partout à l'écran, pas de voile** (#199) : il y multiplierait la feuille par un
   *  blanc pur, une passe sur tout l'écran pour une image identique. */
  veil(on: boolean): void {
    this.shade.visible = on;
  }

  /**
   * Sets the sky for `night`, how far the sky where one looks has gone dark (0 to 1), and lights the cities that are in
   * their own dusk at `epochMs`.
   */
  apply(epochMs: number, night: number): void {
    const { day, night: dark } = this;
    this.sky.color.lerpColors(day.sky, dark.sky, night);
    this.sky.groundColor.lerpColors(day.ground, dark.ground, night);
    this.sky.intensity = day.intensity + (dark.intensity - day.intensity) * night;
    this.sea?.dim(night);

    const sun = subsolarPoint(epochMs);
    if (Math.abs(sun[0] - this.sun.value.x) < SUN_STEP_DEG) return;
    this.sun.value.set(sun[0], sun[1]);
    const colors = this.cities.geometry.getAttribute('color');
    this.cityLights.forEach((city, index) => {
      // Les villes ne s'allument qu'au crépuscule passé, pas dès le premier assombrissement.
      const dark = nightOfAltitude(sunAltitude(sun, city));
      colors.setW(index, Math.min(1, Math.max(0, (dark - 0.3) / 0.5)));
    });
    colors.needsUpdate = true;
  }
}
