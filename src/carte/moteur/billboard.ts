import { SRGBColorSpace, TextureLoader, type Object3D, type Texture, type Vector3 } from 'three';

/**
 * Les textures sont partagées par tout ce qui se dresse sur le plateau : deux mouvements de
 * blindés français pointent le même bitmap GPU. Le cache n'est jamais vidé — le jeu de sprites
 * est borné et petit, le garder chaud coûte moins que de recharger à chaque `afficher`.
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
