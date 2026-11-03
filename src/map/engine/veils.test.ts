import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { veiledPiles } from './veils';

const pile = (x: number, z: number) => {
  const object = new Object3D();
  object.position.set(x, 0, z);
  return object;
};

describe('veiledPiles, what a combat on the map hides (#272, #325)', () => {
  it('hides the piles under a scene, but leaves my battery firing from under it standing', () => {
    const battery = pile(1, 0);
    const beside = pile(-1, 0);
    const away = pile(10, 0);
    const veils = [{ center: new Vector3(0, 0, 0), reach: 3 }];
    const batteries = [{ at: new Vector3(1.2, 0.5, 0), within: 0.5 }];
    expect(veiledPiles([battery, beside, away], veils, batteries)).toEqual([beside]);
    expect(veiledPiles([battery, beside, away], veils, [])).toEqual([battery, beside]);
  });
});
