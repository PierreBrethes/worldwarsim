import {
  DirectionalLight,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Scene,
} from 'three';
import { REGIONS_GONE_DISTANCE } from './regions';

/**
 * **Une seule lampe, chaude, au-dessus de la table** (13/10/2026) : c'est elle qui porte les
 * ombres des pièces sur la feuille ; la nuit, le ciel baisse et elle reste seule (`night.ts`). Sa direction est celle de
 * l'ancien soleil, pour que la carte garde sa lumière.
 */
const LAMP_COLOR = '#ffe2b8';
export const LAMP_INTENSITY = 1.25;
const TOWARD_LAMP = new Vector3(-180, 320, 160).normalize();
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

export class Lamp {
  readonly light = new DirectionalLight(LAMP_COLOR, LAMP_INTENSITY);
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly aim = new Vector3();

  constructor(scene: Scene) {
    this.light.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.02;
    this.right.crossVectors(new Vector3(0, 1, 0), TOWARD_LAMP).normalize();
    this.up.crossVectors(TOWARD_LAMP, this.right);
    this.light.position.copy(TOWARD_LAMP).multiplyScalar(LAMP_DISTANCE);
    scene.add(this.light, this.light.target);
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
    this.light.position.copy(this.aim).addScaledVector(TOWARD_LAMP, LAMP_DISTANCE);

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
