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
 * **The billboard turns and tips, but it never leaves the ground.** The yaw alone was enough
 * while the camera stayed low; straight overhead, a plane standing upright is seen edge-on and
 * the pawn vanishes — a movement one could no longer find on its own map.
 *
 * So the pitch follows the camera's elevation, **pivoting on the pawn's foot** rather than on
 * its middle: the drawing tips backwards onto the board as the eye rises, lies flat when the
 * eye is vertical, and its base never moves off the point it designates. That is what the old
 * comment feared from a full billboard — a shape lifting off the board — and the pivot is what
 * it lacked, not the tilt. A three.js `Sprite` still slides as soon as the orbit dives; this
 * does not.
 *
 * `YXZ` is the order that makes it true: the yaw is applied first, the pitch afterwards **in
 * the turned frame**. In the default `XYZ` the pitch would be read on the world axis and the
 * drawing would lean sideways as soon as the camera left the meridian.
 */
export function faceCamera(object: Object3D, cameraPosition: Vector3, from = object.position): void {
  const east = cameraPosition.x - from.x;
  const south = cameraPosition.z - from.z;
  const up = cameraPosition.y - from.y;
  object.rotation.set(-Math.atan2(up, Math.hypot(east, south)), Math.atan2(east, south), 0, 'YXZ');
}
