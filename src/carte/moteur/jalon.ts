import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
  type Texture,
} from 'three';
import type { Milieu } from '@/domaine/trajets';
import { orienterVersCamera, textureDe } from './billboard';

/**
 * Part de la distance caméra : un jalon garde sa cote à l'écran. À taille fixe dans le monde,
 * il est un grain de poussière en orbite et couvre la mer du Nord au rapproché. La silhouette
 * est plus étroite que le sprite qu'elle remplace, mais pleine : à cote égale elle pèse plus
 * lourd à l'œil, et huit mouvements partis du même port feraient une tache.
 */
const PART_JALON = 0.028;
const PART_JALON_SILHOUETTE = 0.018;

/**
 * Le sprite d'unité est prêt à revenir : `spriteDeMouvement` sait déjà le trouver, et le
 * billboard qui le portait est resté ici. Il attend que les huit nations soient dessinées —
 * aujourd'hui seule la France l'est, et sept mouvements sur huit retomberaient sur la
 * silhouette : deux vocabulaires visuels pour la même chose. Un seul point à basculer.
 */
const JALON_PORTE_LE_SPRITE = false;

/**
 * Trois silhouettes, reconnaissables au premier coup d'œil sans étiquette : prisme au sol,
 * coque à voile sur l'eau, delta dans le ciel. Elles sont tracées dans le repère de la
 * planche — y vers le bas, hauteur de l'ordre de 12 — puis retournées et normalisées.
 */
const SILHOUETTES: Readonly<Record<Milieu, ReadonlyArray<ReadonlyArray<readonly [number, number]>>>> = {
  terre: [[[-9, 2], [0, 6], [9, 2], [0, -2]]],
  mer: [
    [[-10, 0], [10, 0], [6, 5], [-6, 5]],
    [[-1, 0], [-1, -12], [8, -8]],
  ],
  air: [[[-9, 0], [0, -5], [9, 0], [0, 3]]],
};

/**
 * Largeur de la planche. Les trois silhouettes s'y ramènent, donc elles pèsent le même poids
 * à l'écran : un delta ne doit pas paraître plus pressé qu'un prisme parce qu'il est plus fin.
 */
const LARGEUR_PLANCHE = 20;

/**
 * Le jalon d'un mouvement : une seule pièce sur tout le trajet, qui change de silhouette au
 * passage du quai et s'immobilise pendant le transfert. Le billboard ne suit que le lacet de
 * la caméra — une forme qui s'inclinerait avec elle décollerait du plateau, et un `Sprite`
 * three.js glisse dès que l'orbite plonge.
 */
export class Jalon {
  readonly objet = new Group();
  private readonly formes = new Map<Milieu, Group>();
  private readonly sprite: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  private readonly texture: Texture | null = null;
  private readonly couleur: string;
  private milieu: Milieu = 'terre';
  private aspect = 1;
  private aspectMesure = false;
  private versLOuest = false;

  constructor(urlSprite: string | null, couleur: string) {
    this.couleur = couleur;
    if (JALON_PORTE_LE_SPRITE && urlSprite !== null) {
      this.texture = textureDe(urlSprite);
      const geometrie = new PlaneGeometry(1, 1);
      geometrie.translate(0, 0.5, 0);
      this.sprite = new Mesh(
        geometrie,
        new MeshBasicMaterial({ map: this.texture, transparent: true, alphaTest: 0.35, side: DoubleSide }),
      );
      this.objet.add(this.sprite);
      return;
    }
    for (const milieu of ['terre', 'mer', 'air'] as const) {
      const forme = this.construireSilhouette(milieu);
      forme.visible = milieu === 'terre';
      this.formes.set(milieu, forme);
      this.objet.add(forme);
    }
  }

  set visible(valeur: boolean) {
    this.objet.visible = valeur;
  }

  /**
   * Le domaine du jalon suit celui du segment sous lui, y compris pour un mouvement adverse :
   * la silhouette dit terre, mer ou air, et jamais le type ni la composition (fiche 04).
   */
  adopter(milieu: Milieu): void {
    if (milieu === this.milieu) return;
    const partante = this.formes.get(this.milieu);
    if (partante) partante.visible = false;
    this.milieu = milieu;
    const venante = this.formes.get(milieu);
    if (venante) venante.visible = true;
  }

  placer(position: Vector3, pointDevant: Vector3): void {
    this.objet.position.copy(position);
    this.versLOuest = pointDevant.x < position.x;
  }

  orienter(positionCamera: Vector3): void {
    const distance = this.objet.position.distanceTo(positionCamera);
    orienterVersCamera(this.objet, positionCamera);
    if (this.sprite === null) {
      const cote = distance * PART_JALON_SILHOUETTE;
      this.objet.scale.set(cote * (this.versLOuest ? -1 : 1), cote, cote);
      return;
    }
    const hauteur = distance * PART_JALON;
    this.mesurerAspect();
    this.sprite.scale.set(this.aspect * hauteur * (this.versLOuest ? -1 : 1), hauteur, 1);
  }

  detruire(): void {
    this.objet.removeFromParent();
    this.sprite?.geometry.dispose();
    this.sprite?.material.dispose();
    for (const forme of this.formes.values()) {
      for (const enfant of forme.children) {
        const maille = enfant as Mesh<ShapeGeometry, MeshBasicMaterial>;
        maille.geometry.dispose();
        maille.material.dispose();
      }
    }
  }

  private construireSilhouette(milieu: Milieu): Group {
    const groupe = new Group();
    for (const contour of SILHOUETTES[milieu]) {
      const forme = new Shape();
      contour.forEach(([x, y], index) => {
        const [px, py] = [x / LARGEUR_PLANCHE, -y / LARGEUR_PLANCHE];
        if (index === 0) forme.moveTo(px, py);
        else forme.lineTo(px, py);
      });
      forme.closePath();
      const maille = new Mesh(
        new ShapeGeometry(forme),
        new MeshBasicMaterial({ color: this.couleur, side: DoubleSide, transparent: true, depthTest: false }),
      );
      // Le jalon passe par-dessus son propre fil : il est la tête, pas un nœud de plus.
      maille.renderOrder = 13;
      groupe.add(maille);
    }
    return groupe;
  }

  /**
   * Le rapport largeur/hauteur n'est connu qu'une fois l'image décodée ; plutôt qu'un rappel
   * de chargement par jalon, on regarde à chaque orientation tant qu'il manque.
   */
  private mesurerAspect(): void {
    if (this.aspectMesure) return;
    const image = this.texture?.image as { width?: number; height?: number } | undefined;
    if (!image?.width || !image.height) return;
    this.aspect = image.width / image.height;
    this.aspectMesure = true;
  }
}
