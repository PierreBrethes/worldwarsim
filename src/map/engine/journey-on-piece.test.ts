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

function engine() {
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
    invalidate: vi.fn(),
  }) as unknown as {
    journeyTo: MapEngine['journeyTo'];
    journey: { arrival: Vector3 } | null;
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
