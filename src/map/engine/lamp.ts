import {
  Color,
  DirectionalLight,
  MathUtils,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Scene,
} from 'three';
import type { SunLight } from '@/domain/daylight';
import { REGIONS_GONE_DISTANCE } from './regions';

/**
 * **Une seule lampe, chaude, au-dessus de la table : le soleil** (#195). Elle porte les ombres des
 * pièces sur la feuille, vient du point subsolaire à la hauteur du soleil là où l'on regarde
 * (`sunLightAt`), et sa force est celle du prototype (`carte-refonte`) sous ACES : forte devant
 * un ciel faible, pour des ombres marquées.
 */
/** L'exposition ACES du prototype, sous laquelle cette lampe a été réglée. */
export const LAMP_EXPOSURE = 1.08;
const DAY_COLOR = new Color('#fff3e0');
/** Un soleil bas jaunit la lampe, de `LOW_SUN_DEG` à l'horizon. */
const LOW_COLOR = new Color('#ffc27e');
const LOW_SUN_DEG = 25;
const DAY_INTENSITY = 2.5;
/** La lampe du prototype se tenait vers 52° : plus bas, elle force pour garder la feuille aussi claire. */
const POC_ELEVATION_DEG = 52;
const MAX_BOOST = 1.9;
/** Le crépuscule l'éteint de 30 % au plus, sous `DUSK_DEG`. */
const TWILIGHT_DIM = 0.3;
const DUSK_DEG = 20;
/** La nuit, elle reste seule et baisse moins que le ciel : les ombres se creusent (`night.ts`). */
const NIGHT_INTENSITY = 0.9;
/** Assez loin pour que tout le cadre d'ombre tienne devant elle, à n'importe quel zoom permis. */
const LAMP_DISTANCE = 300;
const SHADOW_MAP = 2048;

/**
 * **La carte d'ombres ne couvre que ce que la caméra regarde** : un demi-côté en unités de
 * plateau, ou `null` au-delà du fondu des régions — plus aucune pièce n'y tient debout, et une
 * ombre qu'on ne verrait pas ne se paie pas. Par crans de 2^¼ : recadrée en continu, elle
 * frémirait à chaque tour de molette.
 */
export function shadowReach(distance: number): number | null {
  if (distance > REGIONS_GONE_DISTANCE) return null;
  return 2 ** (Math.ceil(Math.log2(Math.max(1, distance * 1.3)) * 4) / 4);
}

/** Une pièce éclairée et opaque porte son ombre ; une planche, un disque, un fil, non. */
export function castShadows(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || mesh.castShadow) return;
    const material = mesh.material as MeshStandardMaterial;
    if (material.isMeshStandardMaterial && !material.transparent) mesh.castShadow = true;
  });
}

const RAD = Math.PI / 180;
const ZENITH = new Vector3(0, 1, 0);

/** La force de la lampe : celle du prototype, relevée quand le soleil baisse, baissée la nuit. */
export function lampIntensity(sun: SunLight, night: number): number {
  const boost = Math.min(
    MAX_BOOST,
    Math.sin(POC_ELEVATION_DEG * RAD) / Math.sin(sun.elevation * RAD),
  );
  const dusk = MathUtils.clamp((DUSK_DEG - sun.altitude) / DUSK_DEG, 0, 1);
  const day = DAY_INTENSITY * boost * (1 - TWILIGHT_DIM * dusk);
  return MathUtils.lerp(day, NIGHT_INTENSITY, night);
}

export class Lamp {
  readonly light = new DirectionalLight(DAY_COLOR, DAY_INTENSITY);
  private readonly toward = new Vector3(0, 1, 0);
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly aim = new Vector3();

  constructor(scene: Scene) {
    this.light.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.02;
    scene.add(this.light, this.light.target);
  }

  /** Board north is -z, east +x. */
  shine(sun: SunLight, night: number): void {
    const elevation = sun.elevation * RAD;
    this.toward
      .set(
        Math.sin(sun.azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        -Math.cos(sun.azimuth) * Math.cos(elevation),
      )
      .normalize();
    this.right.crossVectors(ZENITH, this.toward).normalize();
    this.up.crossVectors(this.toward, this.right);
    this.light.color
      .copy(DAY_COLOR)
      .lerp(LOW_COLOR, MathUtils.clamp((LOW_SUN_DEG - sun.altitude) / LOW_SUN_DEG, 0, 1));
    this.light.intensity = lampIntensity(sun, night);
    this.light.position
      .copy(this.light.target.position)
      .addScaledVector(this.toward, LAMP_DISTANCE);
  }

  /** Recale le cadre d'ombre sur ce que la caméra regarde ; dit si les ombres sont portées. */
  follow(target: Vector3, distance: number): boolean {
    const reach = shadowReach(distance);
    this.light.castShadow = reach !== null;
    if (reach === null) return false;

    // Calé au texel près dans le plan de la lampe : sinon chaque pas de la caméra fait
    // scintiller le bord des ombres.
    const texel = (2 * reach) / SHADOW_MAP;
    this.aim.copy(target);
    for (const axis of [this.right, this.up]) {
      const along = target.dot(axis);
      this.aim.addScaledVector(axis, Math.round(along / texel) * texel - along);
    }
    this.light.target.position.copy(this.aim);
    this.light.position.copy(this.aim).addScaledVector(this.toward, LAMP_DISTANCE);

    const camera = this.light.shadow.camera;
    if (camera.right !== reach) {
      camera.left = camera.bottom = -reach;
      camera.right = camera.top = reach;
      camera.near = LAMP_DISTANCE - 2 * reach;
      camera.far = LAMP_DISTANCE + 2 * reach;
      camera.updateProjectionMatrix();
    }
    return true;
  }
}
