import {
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Texture,
} from 'three';

const HAUTEUR_SPRITE = 10;

/**
 * Les textures sont partagées entre toutes les têtes : deux mouvements de blindés français
 * pointent le même bitmap GPU. Le cache n'est jamais vidé — le manifeste des sprites est
 * borné et petit, le garder chaud coûte moins que de recharger à chaque `afficher`.
 */
const cacheTextures = new Map<string, Texture>();
const chargeur = new TextureLoader();

function textureDe(url: string): Texture {
  let texture = cacheTextures.get(url);
  if (!texture) {
    texture = chargeur.load(url);
    texture.colorSpace = SRGBColorSpace;
    cacheTextures.set(url, texture);
  }
  return texture;
}

/**
 * La tête d'un mouvement : le sprite de l'unité en billboard quand on le connaît, le cône
 * sinon (arc adverse, pile inconnue, nation sans planche dessinée). Le billboard ne suit que
 * le lacet de la caméra — un plan qui s'inclinerait avec elle décollerait du plateau, un
 * `Sprite` three.js glisse dès que l'orbite plonge.
 */
export class TeteMouvement {
  readonly objet = new Group();
  private readonly mesh: Mesh;
  private readonly genre: 'sprite' | 'cone';
  private readonly texture: Texture | null = null;
  private echelleAppliquee = false;
  private versLOuest = false;

  constructor(urlSprite: string | null, couleurCone: string) {
    if (urlSprite !== null) {
      this.genre = 'sprite';
      this.texture = textureDe(urlSprite);
      const geometrie = new PlaneGeometry(1, 1);
      geometrie.translate(0, 0.5, 0);
      this.mesh = new Mesh(
        geometrie,
        new MeshBasicMaterial({
          map: this.texture,
          transparent: true,
          alphaTest: 0.35,
          side: DoubleSide,
        }),
      );
      this.mesh.scale.set(HAUTEUR_SPRITE, HAUTEUR_SPRITE, 1);
    } else {
      this.genre = 'cone';
      this.mesh = new Mesh(
        new ConeGeometry(2.6, 8, 6),
        new MeshStandardMaterial({ color: couleurCone, roughness: 0.9 }),
      );
    }
    this.objet.add(this.mesh);
  }

  set visible(valeur: boolean) {
    this.objet.visible = valeur;
  }

  placer(position: Vector3, pointDevant: Vector3): void {
    this.objet.position.copy(position);
    if (this.genre === 'cone') {
      this.mesh.lookAt(pointDevant);
      this.mesh.rotateX(Math.PI / 2);
    } else {
      this.versLOuest = pointDevant.x < position.x;
    }
  }

  orienter(positionCamera: Vector3): void {
    if (this.genre !== 'sprite') return;
    this.objet.rotation.y = Math.atan2(
      positionCamera.x - this.objet.position.x,
      positionCamera.z - this.objet.position.z,
    );
    this.appliquerEchelle();
    this.mesh.scale.x = Math.abs(this.mesh.scale.x) * (this.versLOuest ? -1 : 1);
  }

  detruire(): void {
    this.objet.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial | MeshStandardMaterial).dispose();
  }

  /**
   * Le rapport largeur/hauteur n'est connu qu'une fois l'image décodée ; plutôt qu'un
   * rappel de chargement par tête, on regarde à chaque orientation tant qu'il manque.
   */
  private appliquerEchelle(): void {
    if (this.echelleAppliquee) return;
    const image = this.texture?.image as { width?: number; height?: number } | undefined;
    if (!image?.width || !image.height) return;
    this.mesh.scale.set((image.width / image.height) * HAUTEUR_SPRITE, HAUTEUR_SPRITE, 1);
    this.echelleAppliquee = true;
  }
}
