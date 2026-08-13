import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Object3D,
  type Quaternion,
  type Texture,
  type Vector3,
} from 'three';

/**
 * Les textures sont partagées par tout ce qui se dresse sur le plateau : deux mouvements de
 * blindés français pointent le même bitmap GPU, deux avant-postes d'extraction le même glyphe.
 * Le cache n'est jamais vidé — le jeu de symboles est borné et petit, le garder chaud coûte
 * moins que de recharger à chaque `afficher`.
 */
const cacheTextures = new Map<string, Texture>();
const chargeur = new TextureLoader();

export function textureDe(url: string): Texture {
  let texture = cacheTextures.get(url);
  if (!texture) {
    texture = chargeur.load(url);
    texture.colorSpace = SRGBColorSpace;
    cacheTextures.set(url, texture);
  }
  return texture;
}

const cacheSymboles = new Map<string, CanvasTexture>();

/** Aucun symbole de jeu n'existe en asset : ils sont dessinés une fois, puis partagés par clé. */
export function textureSymbole(
  cle: string,
  cote: number,
  dessiner: (contexte: CanvasRenderingContext2D, cote: number) => void,
): CanvasTexture {
  let texture = cacheSymboles.get(cle);
  if (!texture) {
    const { canvas, contexte } = ouvrirCanvas(cote, cote);
    dessiner(contexte, cote);
    texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    cacheSymboles.set(cle, texture);
  }
  return texture;
}

const RESOLUTION = 2;

export function ouvrirCanvas(
  largeur: number,
  hauteur: number,
): { canvas: HTMLCanvasElement; contexte: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = largeur * RESOLUTION;
  canvas.height = hauteur * RESOLUTION;
  const contexte = canvas.getContext('2d') as CanvasRenderingContext2D;
  contexte.scale(RESOLUTION, RESOLUTION);
  return { canvas, contexte };
}

/**
 * Le billboard ne suit que le lacet de la caméra — un plan qui s'inclinerait avec elle
 * décollerait du plateau, un `Sprite` three.js glisse dès que l'orbite plonge.
 */
export function orienterVersCamera(objet: Object3D, positionCamera: Vector3): void {
  objet.rotation.y = Math.atan2(
    positionCamera.x - objet.position.x,
    positionCamera.z - objet.position.z,
  );
}

/**
 * Une image plantée sur le plateau : elle se tourne vers la caméra, elle ne s'y couche pas.
 * Sa hauteur se donne à chaque orientation, parce qu'un symbole de carte n'est pas un objet du
 * monde mais une punaise : les couches la calculent en part de distance caméra pour qu'elle
 * garde sa cote à l'écran, de l'orbite au rapproché.
 */
export class PlaqueBillboard {
  readonly objet: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private aspect = 1;
  private aspectApplique = false;

  constructor(
    private readonly texture: Texture,
    private readonly hauteur: number,
  ) {
    const geometrie = new PlaneGeometry(1, 1);
    geometrie.translate(0, 0.5, 0);
    this.objet = new Mesh(
      geometrie,
      new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: DoubleSide }),
    );
    this.objet.scale.set(hauteur, hauteur, 1);
    this.objet.renderOrder = 3;
  }

  set visible(valeur: boolean) {
    this.objet.visible = valeur;
  }

  placer(position: Vector3): void {
    this.objet.position.copy(position);
  }

  orienter(positionCamera: Vector3, hauteur = this.hauteur): void {
    orienterVersCamera(this.objet, positionCamera);
    this.mesurerAspect();
    this.objet.scale.set(this.aspect * hauteur, hauteur, 1);
  }

  detruire(): void {
    this.objet.removeFromParent();
    this.objet.geometry.dispose();
    this.objet.material.dispose();
  }

  /**
   * Le rapport largeur/hauteur d'une texture chargée n'est connu qu'une fois l'image décodée ;
   * plutôt qu'un rappel de chargement par plaque, on regarde tant qu'il manque.
   */
  private mesurerAspect(): void {
    if (this.aspectApplique) return;
    const image = this.texture.image as { width?: number; height?: number } | undefined;
    if (!image?.width || !image.height) return;
    this.aspect = image.width / image.height;
    this.aspectApplique = true;
  }
}

const LARGEUR_ETIQUETTE = 320;
const HAUTEUR_ETIQUETTE = 22;
const PAPIER = '#e4d8bd';
const ENCRE = '#2a2118';

/**
 * Une étiquette de plateau : bande de papier, filet d'encre, aucun ombrage. Le canvas garde
 * une taille fixe et le texte est dessiné centré dedans — c'est ce qui évite de recréer une
 * géométrie à chaque seconde de compte à rebours.
 */
export class EtiquetteTexte {
  readonly objet: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly contexte: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private texte = '';

  constructor(private readonly hauteurMonde: number) {
    const { canvas, contexte } = ouvrirCanvas(LARGEUR_ETIQUETTE, HAUTEUR_ETIQUETTE);
    this.contexte = contexte;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const geometrie = new PlaneGeometry(1, 1);
    geometrie.translate(0, 0.5, 0);
    this.objet = new Mesh(
      geometrie,
      new MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.objet.scale.set((LARGEUR_ETIQUETTE / HAUTEUR_ETIQUETTE) * hauteurMonde, hauteurMonde, 1);
    this.objet.renderOrder = 5;
  }

  set visible(valeur: boolean) {
    this.objet.visible = valeur;
  }

  definirTexte(texte: string): void {
    if (texte === this.texte) return;
    this.texte = texte;
    this.redessiner();
  }

  placer(position: Vector3): void {
    this.objet.position.copy(position);
  }

  /**
   * Une étiquette se met parallèle au plan de l'image, pas face au point de vue : contrairement
   * à un symbole planté au sol, elle n'a pas à faire croire qu'elle tient debout sur le plateau,
   * et viser la caméra la donnerait à lire de biais dès qu'elle s'éloigne du centre de l'image.
   */
  orienter(orientationCamera: Quaternion, hauteur = this.hauteurMonde): void {
    this.objet.quaternion.copy(orientationCamera);
    this.objet.scale.set((LARGEUR_ETIQUETTE / HAUTEUR_ETIQUETTE) * hauteur, hauteur, 1);
  }

  detruire(): void {
    this.objet.removeFromParent();
    this.objet.geometry.dispose();
    this.objet.material.dispose();
    this.texture.dispose();
  }

  private redessiner(): void {
    const contexte = this.contexte;
    contexte.clearRect(0, 0, LARGEUR_ETIQUETTE, HAUTEUR_ETIQUETTE);
    contexte.font = '13px "Archivo Narrow", "Arial Narrow", sans-serif';
    contexte.textAlign = 'center';
    contexte.textBaseline = 'middle';

    const largeurTexte = Math.min(LARGEUR_ETIQUETTE - 8, contexte.measureText(this.texte).width);
    const gauche = (LARGEUR_ETIQUETTE - largeurTexte) / 2 - 5;
    contexte.fillStyle = PAPIER;
    contexte.fillRect(gauche, 2, largeurTexte + 10, HAUTEUR_ETIQUETTE - 4);
    contexte.strokeStyle = ENCRE;
    contexte.lineWidth = 1;
    contexte.strokeRect(gauche + 0.5, 2.5, largeurTexte + 9, HAUTEUR_ETIQUETTE - 5);

    contexte.fillStyle = ENCRE;
    contexte.fillText(this.texte, LARGEUR_ETIQUETTE / 2, HAUTEUR_ETIQUETTE / 2 + 1, LARGEUR_ETIQUETTE - 8);
    this.texture.needsUpdate = true;
  }
}
