import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  InstancedMesh,
  MathUtils,
  Matrix4,
  type Mesh,
  type MeshStandardMaterial,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from 'three';

/**
 * **Un halo chaud autour de chaque pièce, la nuit** (#198) : comme un lampadaire dans la brume, la
 * même lueur pour tous, toujours allumée la nuit, sans réglage — sans elle les pièces deviennent
 * presque noires sous une lune faible. La maquette (`carte-refonte`) la boucle sur seize pièces
 * dans le shader de la feuille ; ici, un disque additif à plat par pièce, tous d'un seul
 * `InstancedMesh` : un appel de dessin, et le coût ne dépend pas de la feuille.
 *
 * Elle ne bouge jamais ni ne scintille : l'éclairage de la nuit suit le battement du soleil, comme
 * lui, et ne demande aucune image à lui seul (`frame-demand`). Les pièces elles-mêmes se
 * réchauffent de la même lueur par leur émission (`warmPieces`).
 */
const WARM = new Color('#ffb25e');
/** What the glow lays over the ground, and over the pieces' own surfaces (the maquette's 0.32). @a-mesurer */
const GROUND_GAIN = 0.5;
const PIECE_GAIN = 0.32;
/** Half the disc's side, in footprint radii: a gaussian reads nothing past two and a bit. */
export const REACH = 2.3;
/** A piece of any size still holds a lamp's worth of light. */
const MIN_RADIUS = 0.3;
/** Visible pieces on a board at once, far above what the regions' fade leaves in sight. */
const CAPACITY = 1024;
/** Just over the ground the pieces stand on. Drawn over the moon's veil (rank 2, `night.ts`), which
 *  would otherwise put the lamp out with the sheet. */
const LIFT = 0.006;
const RANK = 2.5;

function glowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  for (let step = 0; step <= 10; step++) {
    const t = step / 10;
    gradient.addColorStop(t, `rgba(255,255,255,${Math.exp(-((t * REACH) ** 2)).toFixed(3)})`);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const flat = new Quaternion();
const weight = new Color();

export class Halos {
  readonly object: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  private count = 0;

  constructor() {
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshBasicMaterial({
      map: glowTexture(),
      color: WARM,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    material.userData.ownsMap = true;
    this.object = new InstancedMesh(geometry, material, CAPACITY);
    this.object.renderOrder = RANK;
    this.object.frustumCulled = false;
    this.object.visible = false;
    // Decor: neither picked nor aimed at.
    this.object.raycast = () => {};
    this.object.count = 0;
  }

  /** Starts a gathering; the layers then say where their pieces stand with `add`. */
  begin(): void {
    this.count = 0;
  }

  /** `radius`: the footprint's, in board units; `near`: the piece's share of figurine, 0 to 1. */
  add(at: Vector3, radius: number, near: number): void {
    if (this.count >= CAPACITY || near <= 0) return;
    const size = 2 * REACH * Math.max(radius, MIN_RADIUS * near);
    matrix.compose(position.set(at.x, at.y + LIFT, at.z), flat, scale.set(size, 1, size));
    this.object.setMatrixAt(this.count, matrix);
    this.object.setColorAt(this.count, weight.setScalar(near));
    this.count += 1;
  }

  /** Lights what was gathered with the night's share, 0 to 1. */
  end(night: number): void {
    const { object } = this;
    object.count = this.count;
    object.visible = night > 0.004 && this.count > 0;
    object.material.opacity = night * GROUND_GAIN;
    // Only what was gathered goes up, not the whole capacity.
    object.instanceMatrix.clearUpdateRanges();
    object.instanceMatrix.addUpdateRange(0, this.count * 16);
    object.instanceMatrix.needsUpdate = true;
    if (object.instanceColor) {
      object.instanceColor.clearUpdateRanges();
      object.instanceColor.addUpdateRange(0, this.count * 3);
      object.instanceColor.needsUpdate = true;
    }
  }

  /** By day there is nothing to light, and nothing to send. */
  hide(): void {
    this.object.visible = false;
  }

  dispose(): void {
    this.object.dispose();
    this.object.geometry.dispose();
    this.object.material.map?.dispose();
    this.object.material.dispose();
    this.object.removeFromParent();
  }
}

/**
 * The glow on the pieces themselves: their own colour, warmed — the maquette adds `diffuse × warm`
 * to what the lamp lit, and an emission through the map is the same sum. A material that already
 * carries its own emission (the flag's print) keeps it.
 */
export function warmPieces(root: Object3D, night: number): void {
  const strength = PIECE_GAIN * MathUtils.clamp(night, 0, 1);
  root.traverse((object) => {
    const material = (object as Mesh).material as MeshStandardMaterial | undefined;
    if (!material?.isMeshStandardMaterial) return;
    if (material.emissiveMap !== null && material.emissiveMap !== material.map) return;
    if (material.emissiveMap === null && material.map !== null) {
      material.emissiveMap = material.map;
      material.needsUpdate = true;
    }
    material.emissive.copy(WARM).multiplyScalar(strength);
    if (material.map === null) material.emissive.multiply(material.color);
  });
}
