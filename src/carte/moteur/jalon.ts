import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
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
 * Le jalon d'un mouvement : une seule pièce sur tout le trajet, qui change de costume au
 * passage du quai et s'immobilise pendant le transfert. Le billboard ne suit que le lacet de
 * la caméra — une forme qui s'inclinerait avec elle décollerait du plateau, et un `Sprite`
 * three.js glisse dès que l'orbite plonge.
 *
 * Le sprite du rôle majoritaire ne prend que le costume terrestre : une colonne se reconnaît
 * à ce qui la compose, un convoi en mer à sa coque et un vol à son delta — l'infanterie
 * embarquée voyage sur un navire, pas à pied. `urlSprite` est déjà nul pour tout arc adverse
 * (`spriteDeMouvement`), donc aucun `if` d'affichage ici ne peut faire fuir un rôle.
 */
export class Jalon {
  readonly objet = new Group();
  private readonly costumes = new Map<Milieu, Group>();
  private sprite: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  private readonly couleur: string;
  private milieu: Milieu = 'terre';
  private aspect = 1;
  private aspectMesure = false;
  private versLOuest = false;

  constructor(urlSprite: string | null, couleur: string) {
    this.couleur = couleur;
    for (const milieu of ['terre', 'mer', 'air'] as const) {
      const costume =
        milieu === 'terre' && urlSprite !== null
          ? this.construireSprite(urlSprite)
          : this.construireSilhouette(milieu);
      costume.visible = milieu === this.milieu;
      this.costumes.set(milieu, costume);
      this.objet.add(costume);
    }
  }

  set visible(valeur: boolean) {
    this.objet.visible = valeur;
  }

  /**
   * Le costume du jalon suit le milieu du segment sous lui. Pour un mouvement adverse c'est
   * une silhouette et rien d'autre — terre, mer ou air, jamais le type ni la composition
   * (fiche 04) : le détail d'un mouvement identifié se lit sur sa fiche de frise, pas ici.
   */
  adopter(milieu: Milieu): void {
    if (milieu === this.milieu) return;
    const partant = this.costumes.get(this.milieu);
    if (partant) partant.visible = false;
    this.milieu = milieu;
    const venant = this.costumes.get(milieu);
    if (venant) venant.visible = true;
  }

  placer(position: Vector3, pointDevant: Vector3): void {
    this.objet.position.copy(position);
    this.versLOuest = pointDevant.x < position.x;
  }

  /**
   * La cote est portée par le costume et non par `objet` : le sprite et la silhouette n'ont ni
   * la même part d'écran ni le même repère — l'un pend sous son point, l'autre se dresse
   * dessus — et une échelle commune ferait sauter la taille du jalon au passage du quai.
   */
  orienter(positionCamera: Vector3): void {
    const distance = this.objet.position.distanceTo(positionCamera);
    orienterVersCamera(this.objet, positionCamera);
    const sens = this.versLOuest ? -1 : 1;
    if (this.sprite !== null && this.milieu === 'terre') {
      const hauteur = distance * PART_JALON;
      this.mesurerAspect();
      this.sprite.scale.set(this.aspect * hauteur * sens, hauteur, 1);
      return;
    }
    const costume = this.costumes.get(this.milieu);
    if (costume === undefined) return;
    const cote = distance * PART_JALON_SILHOUETTE;
    costume.scale.set(cote * sens, cote, cote);
  }

  detruire(): void {
    this.objet.removeFromParent();
    for (const costume of this.costumes.values()) {
      for (const enfant of costume.children) {
        const maille = enfant as Mesh<ShapeGeometry | PlaneGeometry, MeshBasicMaterial>;
        maille.geometry.dispose();
        maille.material.dispose();
      }
    }
  }

  /**
   * La texture reste au cache partagé : deux colonnes de blindés français pointent le même
   * bitmap, et la libérer ici crèverait celui d'à côté.
   */
  private construireSprite(url: string): Group {
    const geometrie = new PlaneGeometry(1, 1);
    geometrie.translate(0, 0.5, 0);
    this.sprite = new Mesh(
      geometrie,
      new MeshBasicMaterial({
        map: textureDe(url),
        transparent: true,
        alphaTest: 0.35,
        side: DoubleSide,
      }),
    );
    this.sprite.renderOrder = 13;
    const groupe = new Group();
    groupe.add(this.sprite);
    return groupe;
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
    const image = this.sprite?.material.map?.image as
      | { width?: number; height?: number }
      | undefined;
    if (!image?.width || !image.height) return;
    this.aspect = image.width / image.height;
    this.aspectMesure = true;
  }
}
