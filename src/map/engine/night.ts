import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  HemisphereLight,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  type Scene,
} from 'three';
import type { LonLat } from '@/domain/geo';
import type { WorldFrame } from './frame';
import { LAMP_INTENSITY, type Lamp } from './lamp';
import type { SeaLayer } from './sea';

/**
 * **Les villes qui s'allument la nuit** : le monde n'a ni ville ni population, seulement des
 * pays et des régions. Une sélection cuite des grandes villes de 1940 tient lieu de lumières —
 * du décor, jamais lu par une règle.
 */
const CITIES: ReadonlyArray<LonLat> = [
  [-0.13, 51.51], [2.35, 48.86], [13.4, 52.52], [37.62, 55.75], [12.5, 41.9], [16.37, 48.21],
  [-3.7, 40.42], [21.01, 52.23], [19.04, 47.5], [14.42, 50.09], [4.9, 52.37], [4.35, 50.85],
  [12.57, 55.68], [18.07, 59.33], [10.75, 59.91], [24.94, 60.17], [30.32, 59.94], [30.52, 50.45],
  [23.73, 37.98], [28.98, 41.01], [26.1, 44.43], [20.46, 44.82], [23.32, 42.7], [-9.14, 38.72],
  [-2.24, 53.48], [-4.25, 55.86], [-6.26, 53.35], [5.37, 43.3], [4.84, 45.76], [9.19, 45.46],
  [11.58, 48.14], [9.99, 53.55], [6.96, 50.94], [7.01, 51.46], [13.74, 51.05], [2.17, 41.39],
  [14.27, 40.85], [44.0, 56.33], [49.12, 55.79], [36.23, 49.99], [39.72, 47.23], [60.6, 56.84],
  [44.51, 40.18], [49.87, 40.41], [31.24, 30.04], [29.92, 31.2], [35.21, 31.77], [44.36, 33.31],
  [51.39, 35.69], [46.68, 24.71], [-7.59, 33.57], [3.06, 36.75], [10.17, 36.81], [36.82, -1.29],
  [3.38, 6.52], [18.42, -33.92], [28.05, -26.2], [72.88, 19.08], [88.36, 22.57], [77.21, 28.61],
  [80.27, 13.08], [67.0, 24.86], [74.35, 31.55], [100.5, 13.75], [106.85, -6.21], [103.85, 1.29],
  [120.98, 14.6], [121.47, 31.23], [116.4, 39.9], [113.26, 23.13], [114.17, 22.32], [104.07, 30.67],
  [114.3, 30.59], [123.43, 41.8], [126.98, 37.57], [139.69, 35.69], [135.5, 34.69], [130.4, 33.59],
  [151.21, -33.87], [144.96, -37.81], [174.76, -36.85], [-74.0, 40.71], [-87.63, 41.88],
  [-118.24, 34.05], [-122.42, 37.77], [-77.04, 38.9], [-75.16, 39.95], [-71.06, 42.36],
  [-83.05, 42.33], [-90.07, 29.95], [-79.38, 43.65], [-73.57, 45.5], [-99.13, 19.43],
  [-82.37, 23.13], [-58.38, -34.6], [-43.17, -22.91], [-46.63, -23.55], [-70.67, -33.45],
  [-77.04, -12.05], [-74.07, 4.71], [-66.9, 10.49],
];

const CITY_GOLD = '#ffcf6e';
const DAY_SKY = new Color('#fff3dc');
const DAY_GROUND = new Color('#5a4e3a');
const NIGHT_SKY = new Color('#2f4fa8');
const NIGHT_GROUND = new Color('#10162c');
const DAY_SKY_INTENSITY = 0.8;
const NIGHT_SKY_INTENSITY = 0.45;
// La nuit, la lampe reste seule : elle baisse moins que le ciel, donc elle pèse davantage et les
// ombres se creusent, sans éteindre la feuille sous la couche de jeu.
const NIGHT_LAMP = 0.9;

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

export class NightSky {
  // Moins de ciel, plus de lampe, la même lumière au total sur la feuille : c'est la part de
  // la lampe qui fait la profondeur d'une ombre.
  private readonly sky = new HemisphereLight(DAY_SKY, DAY_GROUND, DAY_SKY_INTENSITY);
  private readonly cities: Points<BufferGeometry, PointsMaterial>;
  private night = Number.NaN;

  constructor(
    scene: Scene,
    frame: WorldFrame,
    private readonly lamp: Lamp,
    private readonly sea: SeaLayer | null,
  ) {
    const positions = CITIES.flatMap((city) => frame.projectLonLat(city, 0.3).toArray());
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.cities = new Points(
      geometry,
      new PointsMaterial({
        color: CITY_GOLD,
        map: dotTexture(),
        size: 9,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.cities.material.userData.ownsMap = true;
    scene.add(this.sky, this.cities);
    this.apply(0);
  }

  /** `night` from `nightAt`, 0 in full day; a change under a hundredth is not worth a write. */
  apply(night: number): void {
    if (Math.abs(night - this.night) < 0.01) return;
    this.night = night;
    this.sky.color.lerpColors(DAY_SKY, NIGHT_SKY, night);
    this.sky.groundColor.lerpColors(DAY_GROUND, NIGHT_GROUND, night);
    this.sky.intensity = DAY_SKY_INTENSITY + (NIGHT_SKY_INTENSITY - DAY_SKY_INTENSITY) * night;
    this.lamp.light.intensity = LAMP_INTENSITY + (NIGHT_LAMP - LAMP_INTENSITY) * night;
    this.sea?.dim(night);
    // Les villes ne s'allument qu'au crépuscule passé, pas dès le premier assombrissement.
    const lit = Math.min(1, Math.max(0, (night - 0.3) / 0.5));
    this.cities.material.opacity = lit;
    this.cities.visible = lit > 0;
  }
}
