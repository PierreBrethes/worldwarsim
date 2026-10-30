import { BoxGeometry, Group, Mesh, type Material } from 'three';

/** The crate's side, in metres: the stack and the packet both read it. @a-mesurer */
export const CRATE_METRES = 1.2;
export const CRATE_WOOD = '#8a6a3e';
export const CRATE_SLATS = '#5e4526';

/** Origin on the ground, centred: a crate stands on what it is set on. */
export const CRATE_BOX = new BoxGeometry(CRATE_METRES, CRATE_METRES, CRATE_METRES);
CRATE_BOX.translate(0, CRATE_METRES / 2, 0);
export const CRATE_SLAT = new BoxGeometry(
  CRATE_METRES * 1.04,
  CRATE_METRES * 0.12,
  CRATE_METRES * 1.04,
);
const SLAT_HEIGHTS = [0.2, 0.8];

/**
 * **The one crate** (ADR 0036 §10): a box and two slats, in metres, shared by the stack and the
 * packet, each with its own materials — lit for one, faded for the other.
 */
export function crateOf(wood: Material, slats: Material, castShadow: boolean): Group {
  const object = new Group();
  const box = new Mesh(CRATE_BOX, wood);
  box.castShadow = castShadow;
  object.add(box);
  for (const share of SLAT_HEIGHTS) {
    const slat = new Mesh(CRATE_SLAT, slats);
    slat.position.y = CRATE_METRES * share;
    slat.castShadow = castShadow;
    object.add(slat);
  }
  return object;
}
