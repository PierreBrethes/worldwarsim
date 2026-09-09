import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Points,
  PointsMaterial,
  type Vector3,
} from 'three';
import { destinationPoint, type LonLat } from '@/domain/geo';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { PALETTE } from './palette';

export type SearchArea = {
  readonly center: LonLat;
  readonly radiusKm: number;
  readonly state: 'active' | 'ended';
};

const FOG_POINTS = 320;
const RIM_POINTS = 240;
const GOLDEN_ANGLE = 137.507_764_05;
const LIFT = COUNTRY_THICKNESS + 0.055;

/**
 * A public search area is deliberately a stain, not a pin. Independent points cannot draw a
 * false chord across the antimeridian. Each point keeps the map's canonical projection, so a
 * circle crossing the seam reappears on the other rim over the ground it actually designates.
 */
export class SearchAreaLayer {
  readonly object = new Group();
  private readonly texture = fogTexture();
  private readonly fogGeometry = new BufferGeometry();
  private readonly rimGeometry = new BufferGeometry();
  private readonly fogMaterial = new PointsMaterial({
    color: PALETTE.designated,
    map: this.texture,
    alphaTest: 0.025,
    transparent: true,
    opacity: 0.24,
    size: 11,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false,
  });
  private readonly rimMaterial = new PointsMaterial({
    color: PALETTE.designated,
    map: this.texture,
    alphaTest: 0.08,
    transparent: true,
    opacity: 0.9,
    size: 4.5,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false,
  });
  private readonly fog = new Points(this.fogGeometry, this.fogMaterial);
  private readonly rim = new Points(this.rimGeometry, this.rimMaterial);
  private shown: SearchArea | null = null;

  constructor(private readonly frame: WorldFrame) {
    this.fog.renderOrder = 4;
    this.rim.renderOrder = 5;
    this.fog.frustumCulled = false;
    this.rim.frustumCulled = false;
    this.object.add(this.fog, this.rim);
    this.object.visible = false;
  }

  show(area: SearchArea | null): void {
    this.shown = area;
    this.object.visible = area !== null;
    if (area !== null) this.write(area);
  }

  /** Points sufficient to frame the whole public circle, including both rims at a crossing. */
  framingPoints(area: SearchArea): { readonly center: Vector3; readonly rim: Vector3[] } {
    return {
      center: this.project(area.center),
      rim: Array.from({ length: 24 }, (_, index) =>
        this.project(destinationPoint(area.center, area.radiusKm, (index / 24) * 360)),
      ),
    };
  }

  rebuild(): void {
    if (this.shown !== null) this.write(this.shown);
  }

  dispose(): void {
    this.object.removeFromParent();
    this.fogGeometry.dispose();
    this.rimGeometry.dispose();
    this.fogMaterial.dispose();
    this.rimMaterial.dispose();
    this.texture.dispose();
  }

  private write(area: SearchArea): void {
    const fog: number[] = [];
    for (let index = 0; index < FOG_POINTS; index += 1) {
      const distance = area.radiusKm * Math.sqrt((index + 0.65) / FOG_POINTS);
      const point = destinationPoint(area.center, distance, index * GOLDEN_ANGLE);
      fog.push(...this.project(point).toArray());
    }

    const rim: number[] = [];
    for (let index = 0; index < RIM_POINTS; index += 1) {
      // A concluded report keeps a broken perimeter; state is not carried by colour alone.
      if (area.state === 'ended' && index % 6 >= 3) continue;
      const point = destinationPoint(area.center, area.radiusKm, (index / RIM_POINTS) * 360);
      rim.push(...this.project(point).toArray());
    }

    this.fogGeometry.setAttribute('position', new Float32BufferAttribute(fog, 3));
    this.rimGeometry.setAttribute('position', new Float32BufferAttribute(rim, 3));
    this.fogGeometry.computeBoundingSphere();
    this.rimGeometry.computeBoundingSphere();

    const ended = area.state === 'ended';
    this.fogMaterial.color.set(ended ? PALETTE.searchEnded : PALETTE.designated);
    this.rimMaterial.color.set(ended ? PALETTE.searchEnded : PALETTE.designated);
    this.fogMaterial.opacity = ended ? 0.12 : 0.24;
    this.rimMaterial.opacity = ended ? 0.55 : 0.9;
  }

  private project(point: LonLat): Vector3 {
    return this.frame.projectLonLat(point, LIFT);
  }
}

function fogTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (context !== null) {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,.8)');
    gradient.addColorStop(0.42, 'rgba(255,255,255,.38)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
  }
  return new CanvasTexture(canvas);
}
