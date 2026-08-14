import { SRGBColorSpace, TextureLoader, type Object3D, type Texture, type Vector3 } from 'three';

/**
 * Textures are shared by everything standing on the board: two French armor movements point
 * at the same GPU bitmap. The cache is never flushed — the sprite set is bounded and small,
 * keeping it warm costs less than reloading on every `display`.
 */
const textureCache = new Map<string, Texture>();
const loader = new TextureLoader();

export function textureOf(url: string): Texture {
  let texture = textureCache.get(url);
  if (!texture) {
    texture = loader.load(url);
    texture.colorSpace = SRGBColorSpace;
    textureCache.set(url, texture);
  }
  return texture;
}

/**
 * The billboard only follows the camera's yaw — a plane tilting with it would lift off the
 * board, and a three.js `Sprite` slides as soon as the orbit dives.
 */
export function faceCamera(object: Object3D, cameraPosition: Vector3): void {
  object.rotation.y = Math.atan2(
    cameraPosition.x - object.position.x,
    cameraPosition.z - object.position.z,
  );
}
