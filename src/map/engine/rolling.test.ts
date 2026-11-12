import { describe, expect, it } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import { bakedFigurine } from './figurines/figurine';
import { sceneOfFile } from './gltf-scene.fixture';
import { bakedRig } from './baking';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { movesOnItsOwn } from './figurines/figurine';
import { Group } from 'three';
import { meshesOf } from './gltf-scene.fixture';
import { rolledAngle, rollersOf, rolls, Wheels } from './rolling';

const FILES = {
  truck: 'src/emblems/figurines/germany/landTransport.glb',
  bigTruck: 'src/emblems/figurines/france/landTransport.glb',
  gun: 'src/emblems/figurines/germany/artillery.glb',
  tank: 'src/emblems/figurines/france/armor-1.glb',
  bigTank: 'src/emblems/figurines/china/armor-1.glb',
};

describe('what a wheel turns by', () => {
  it('turns one whole turn over its circumference, and not at all where it stands', () => {
    expect(rolledAngle(2 * Math.PI * 0.5, 0.5)).toBeCloseTo(2 * Math.PI, 9);
    expect(rolledAngle(0, 0.5)).toBe(0);
  });

  it('turns by the road walked, whatever the time it took', () => {
    expect(rolledAngle(3, 1)).toBe(rolledAngle(1, 1) * 3);
  });
});

describe('the wheels the bake keeps apart', () => {
  const baked = (url: string, role: UnitRole) => bakedFigurine(sceneOfFile(url), role, true);

  it('keeps the wheels of a truck, each at its own hub, at the radius of its tyre', () => {
    const wheels = rollersOf(baked(FILES.truck, 'landTransport'), 'landTransport');
    expect(wheels.map(({ part }) => part.name).sort()).toEqual([
      'roue_left_1',
      'roue_left_2',
      'roue_right_1',
      'roue_right_2',
    ]);
    for (const { part, radius } of wheels) {
      // The hub stands one radius above the ground: the wheel turns on its axle, not on the body.
      expect(radius).toBeCloseTo(part.position.y, 2);
    }
  });

  it('keeps as many wheels as the truck has, up to three a side', () => {
    expect(rollersOf(baked(FILES.bigTruck, 'landTransport'), 'landTransport')).toHaveLength(6);
  });

  it('keeps the one wheel of each side of a gun', () => {
    const wheels = rollersOf(baked(FILES.gun, 'artillery'), 'artillery');
    expect(wheels.map(({ part }) => part.name).sort()).toEqual(['wheels_left', 'wheels_right']);
    for (const { part, radius } of wheels) expect(radius).toBeCloseTo(part.position.y, 2);
  });

  it('keeps nothing of a tank: its road wheels stay merged, a call each is not worth a turn', () => {
    for (const url of [FILES.tank, FILES.bigTank]) {
      expect(rollersOf(baked(url, 'armor'), 'armor')).toHaveLength(0);
      sceneOfFile(url).traverse((node) => expect(rolls(node, 'armor'), node.name).toBe(false));
    }
  });
});

describe('the wheels a figurine turns', () => {
  const truck = () => bakedFigurine(sceneOfFile(FILES.truck), 'landTransport', true);

  it('turns by the road over the radius at the model scale, whole turn per circumference', () => {
    const model = truck();
    const wheels = new Wheels('landTransport');
    const radius = rollersOf(model, 'landTransport')[0]!.radius;
    wheels.roll(model, 2 * Math.PI * radius * 2, 2);
    for (const { part } of rollersOf(model, 'landTransport'))
      expect(part.rotation.x).toBeCloseTo(2 * Math.PI, 6);
  });

  it('finds the wheels of the copy that took the model in place, not those of the first', () => {
    const [first, copy] = [truck(), truck()];
    const wheels = new Wheels('landTransport');
    wheels.roll(first, 1, 1);
    wheels.forget();
    wheels.roll(copy, 1, 1);
    for (const { part } of rollersOf(copy, 'landTransport'))
      expect(part.rotation.x).toBeGreaterThan(0);
    // Not forgotten, the copy's wheels would have stayed still and the old ones turned twice.
    for (const { part } of rollersOf(first, 'landTransport'))
      expect(part.rotation.x).toBeCloseTo(1 / part.position.y, 1);
  });
});

/** **What a figurine costs in draw calls**: a mesh per material and per part kept apart. */
describe('the meshes of a baked figurine', () => {
  const distinct = (url: string) => {
    const scene = sceneOfFile(url);
    // The fixture's materials are alike: told apart by name, as the file's are by their look.
    for (const mesh of meshesOf(scene)) {
      const material = mesh.material as unknown as { name: string; roughness: number };
      material.roughness =
        [...material.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) / 997;
    }
    return scene;
  };
  const all = Object.values(FIGURINE_FILES).flatMap((roles) =>
    Object.entries(roles ?? {}).flatMap(([role, entry]) =>
      (typeof entry === 'string' ? [entry] : entry).flatMap((url) =>
        url === null ? [] : [[`${role} ${url}`, role as UnitRole, url] as const],
      ),
    ),
  );
  const count = (object: Group) => meshesOf(object).length;

  it.each(all)(
    '%s at rest is drawn in the calls it was before the wheels turned',
    (_, role, url) => {
      expect(count(bakedFigurine(distinct(url), role))).toBe(
        count(bakedRig(distinct(url), movesOnItsOwn)),
      );
    },
  );

  it.each(all.filter(([, role]) => role !== 'landTransport' && role !== 'artillery'))(
    '%s walking is drawn in the same calls',
    (_, role, url) => {
      expect(count(bakedFigurine(distinct(url), role, true))).toBe(
        count(bakedFigurine(distinct(url), role)),
      );
    },
  );

  it('walks a truck in 6 to 10 more calls, a gun in 3 more', () => {
    for (const [, role, url] of all.filter(([, r]) => r === 'landTransport' || r === 'artillery')) {
      const more =
        count(bakedFigurine(distinct(url), role, true)) - count(bakedFigurine(distinct(url), role));
      if (role === 'artillery') expect(more).toBe(3);
      else expect([6, 10]).toContain(more);
    }
  });
});
