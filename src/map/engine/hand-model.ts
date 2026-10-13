import { CapsuleGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FIGURINE_SCALE } from './figurines/figurine';

const PALM = new RoundedBoxGeometry(1.5, 0.5, 1.6, 4, 0.24);
const FINGER = new CapsuleGeometry(0.16, 0.9, 4, 12);
FINGER.translate(0, -0.45, 0);
const THUMB = new CapsuleGeometry(0.18, 0.75, 4, 12);
THUMB.translate(0, -0.375, 0);
const WRIST = new CylinderGeometry(0.5, 0.6, 2.2, 18);
WRIST.rotateX(Math.PI / 2);
WRIST.translate(0, 0, -1.1);
const SLEEVE = new CylinderGeometry(0.68, 0.7, 1, 18);
SLEEVE.rotateX(Math.PI / 2);
SLEEVE.translate(0, 0, -2.5);
const SKIN = new MeshStandardMaterial({ color: '#d6ae88', roughness: 0.7 });
const CUFF = new MeshStandardMaterial({ color: '#efe7d3', roughness: 0.85 });

/** The prototype's hand (`lpHand`), its fingers straightened: it is seen for half a second. */
export function setDownHand(): Group {
  const object = new Group();
  object.add(new Mesh(PALM, SKIN));
  for (const x of [-0.54, -0.18, 0.18, 0.52]) {
    const finger = new Mesh(FINGER, SKIN);
    finger.position.set(x, -0.05, 0.62);
    finger.rotation.x = -0.2;
    object.add(finger);
  }
  const thumb = new Mesh(THUMB, SKIN);
  thumb.position.set(0.7, -0.05, -0.3);
  thumb.rotation.set(0.35, 0, -0.75);
  const arm = new Group();
  arm.position.set(0, 0.25, -0.85);
  arm.rotation.x = 0.55;
  arm.add(new Mesh(WRIST, SKIN), new Mesh(SLEEVE, CUFF));
  object.add(thumb, arm);
  object.scale.setScalar(FIGURINE_SCALE * 0.6);
  return object;
}
