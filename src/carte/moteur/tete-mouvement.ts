import {
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type Texture,
} from 'three';
import { orienterVersCamera, textureDe } from './billboard';

const HAUTEUR_SPRITE = 10;
const HAUTEUR_CONE = 8;
/**
 * Part de la distance caméra : une tête de mouvement garde sa cote à l'écran. À taille fixe
 * dans le monde, elle est un grain de poussière en orbite et couvre la mer du Nord au rapproché.
 */
const PART_TETE = 0.028;

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
  private aspect = 1;
  private aspectMesure = false;
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
    const hauteur = this.objet.position.distanceTo(positionCamera) * PART_TETE;
    if (this.genre !== 'sprite') {
      this.mesh.scale.setScalar(hauteur / HAUTEUR_CONE);
      return;
    }
    orienterVersCamera(this.objet, positionCamera);
    this.mesurerAspect();
    this.mesh.scale.set(this.aspect * hauteur * (this.versLOuest ? -1 : 1), hauteur, 1);
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
  private mesurerAspect(): void {
    if (this.aspectMesure) return;
    const image = this.texture?.image as { width?: number; height?: number } | undefined;
    if (!image?.width || !image.height) return;
    this.aspect = image.width / image.height;
    this.aspectMesure = true;
  }
}
