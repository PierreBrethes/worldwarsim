import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { MapEngine } from './index';

/**
 * **Cadrer la pièce, non son étiquette** (#568) : un bâtiment qu'un anneau a écarté de son mât se
 * tient loin de son étiquette, et le voyage qui l'amène au-dessus d'une feuille doit viser
 * l'endroit où il est dessiné.
 */
const label = new Vector3(0, 0, 0);
const drawn = new Vector3(30, 0, 40);

function engine(motion: 'full' | 'reduced' | 'off' = 'full') {
  const camera = new PerspectiveCamera(42, 1, 0.5, 3000);
  camera.position.set(0, 60, 40);
  const stub = Object.assign(Object.create(MapEngine.prototype) as object, {
    camera,
    screenHeight: 800,
    controls: { target: new Vector3(), minDistance: 1, maxDistance: 1000 },
    labels: { position: () => label.clone() },
    arcs: { headPositions: new Map() },
    maquettes: { drawnAt: () => drawn.clone() },
    frame: {},
    journey: null,
    ambience: { motion },
    hoverDirty: false,
    postponeRest: vi.fn(),
    invalidate: vi.fn(),
  }) as unknown as {
    journeyTo: MapEngine['journeyTo'];
    journey: { arrival: Vector3; arrivalDistance: number; orientation: Vector3 } | null;
    controls: { target: Vector3 };
    camera: PerspectiveCamera;
    screenOfAnchor: MapEngine['screenOfAnchor'];
  };
  return stub;
}

describe('journeyTo on a piece', () => {
  it('aims at where the piece is drawn, not at its label', () => {
    const map = engine();
    map.journeyTo(['b'], [], 0, undefined, true);
    expect(map.journey?.arrival.x).toBeCloseTo(30);
    expect(map.journey?.arrival.z).toBeCloseTo(40);
  });

  it('keeps aiming at the label otherwise', () => {
    const map = engine();
    map.journeyTo(['b'], [], 0);
    expect(map.journey?.arrival.x).toBeCloseTo(0);
    expect(map.journey?.arrival.z).toBeCloseTo(0);
  });
});

/** **Le réglage des animations** : réduites ou coupées, la caméra arrive d'un coup (#582) ; le
 *  cadrage à l'ouverture d'une feuille (#568) en profite aussi. */
describe('journeyTo under the motion setting', () => {
  it.each(['reduced', 'off'] as const)('lands at once when motion is %s', (motion) => {
    const map = engine(motion);
    map.journeyTo(['b'], [], 0, undefined, true);
    expect(map.journey).toBeNull();
    expect(map.controls.target.x).toBeCloseTo(30);
    expect(map.controls.target.z).toBeCloseTo(40);
    const glide = engine('full');
    glide.journeyTo(['b'], [], 0, undefined, true);
    const arrival = glide.journey!;
    const offset = map.camera.position.clone().sub(map.controls.target);
    expect(offset.length()).toBeCloseTo(arrival.arrivalDistance);
    expect(offset.normalize().distanceTo(arrival.orientation)).toBeCloseTo(0);
  });

  it('still glides when motion is full', () => {
    const map = engine('full');
    map.journeyTo(['b'], [], 0, undefined, true);
    expect(map.journey).not.toBeNull();
    expect(map.controls.target.x).toBeCloseTo(0);
  });
});

describe('screenOfAnchor', () => {
  const lookingAtOrigin = (map: ReturnType<typeof engine>) => {
    map.camera.lookAt(0, 0, 0);
    map.camera.updateMatrixWorld();
    map.camera.updateProjectionMatrix();
    Object.assign(map, {
      eye: map.camera,
      renderer: {
        domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) },
      },
    });
  };

  it('reads the spot journeyTo aims at: the label, or the piece where it is drawn', () => {
    const map = engine();
    lookingAtOrigin(map);
    const label = map.screenOfAnchor('b', false);
    const piece = map.screenOfAnchor('b', true);
    expect(label?.x).toBeCloseTo(400);
    expect(label?.y).toBeCloseTo(400);
    expect(piece?.x).not.toBeCloseTo(400);
  });

  it('says nothing of an anchor that is gone', () => {
    const map = engine();
    lookingAtOrigin(map);
    Object.assign(map, { labels: { position: () => undefined } });
    expect(map.screenOfAnchor('gone', true)).toBeNull();
  });
});

/** **Le jeton de l'objet tenu** (#591) suit l'ancrage dans le cadre de la carte avec une vraie
 *  caméra : loin derrière le plan lointain il se lit encore, dos tourné il se lit au point opposé. */
describe('boardPointOfAnchor', () => {
  const at = (map: ReturnType<typeof engine>, point: Vector3) => {
    map.camera.lookAt(0, 0, 0);
    map.camera.updateMatrixWorld();
    map.camera.updateProjectionMatrix();
    Object.assign(map, {
      eye: map.camera,
      screenWidth: 800,
      screenHeight: 800,
      labels: { position: (id: string) => (id === 'gone' ? undefined : point.clone()) },
      maquettes: { drawnAt: () => null },
    });
    return map as unknown as { boardPointOfAnchor: MapEngine['boardPointOfAnchor'] };
  };
  const ahead = (map: ReturnType<typeof engine>) =>
    map.camera.getWorldDirection(new Vector3()).normalize();

  it('still reads an object past the far plane', () => {
    const map = engine();
    map.camera.lookAt(0, 0, 0);
    map.camera.updateMatrixWorld();
    const far = map.camera.position.clone().addScaledVector(ahead(map), 5000);
    const spot = at(map, far).boardPointOfAnchor('b', false);
    expect(spot?.x).toBeCloseTo(400);
    expect(spot?.y).toBeCloseTo(400);
  });

  it('mirrors an object behind the camera onto the point opposite its raw projection', () => {
    const map = engine();
    map.camera.lookAt(0, 0, 0);
    map.camera.updateMatrixWorld();
    const side = new Vector3(1, 0, 0);
    const behind = map.camera.position
      .clone()
      .addScaledVector(ahead(map), -50)
      .addScaledVector(side, 20);
    const raw = behind.clone().project(map.camera);
    const rawX = ((raw.x + 1) / 2) * 800;
    const rawY = ((1 - raw.y) / 2) * 800;
    expect(Math.abs(rawX - 400) + Math.abs(rawY - 400)).toBeGreaterThan(1);
    const spot = at(map, behind).boardPointOfAnchor('b', false);
    expect(spot?.x).toBeCloseTo(800 - rawX);
    expect(spot?.y).toBeCloseTo(800 - rawY);
  });

  it('says nothing of an anchor that is gone', () => {
    const map = engine();
    expect(at(map, new Vector3()).boardPointOfAnchor('gone', false)).toBeNull();
  });
});
