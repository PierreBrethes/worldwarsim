import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Hoists } from './hoists';

const strokes = () => [
  { a: new Vector3(0, 10, 0), b: new Vector3(0, 6, 0), thick: false },
  { a: new Vector3(0, 6, 0), b: new Vector3(0, 5, 0), thick: true },
];
const shown = (hoists: Hoists) => hoists.group.children.filter((mesh) => mesh.visible);

describe('Hoists (#505)', () => {
  it('draws nothing until a lift lays its strokes', () => {
    const hoists = new Hoists();
    hoists.update(0, 1, 0);
    expect(shown(hoists)).toHaveLength(0);
    expect(hoists.active).toBe(false);
  });

  it('draws the strokes of the lift at its own hour, a hook wider than a cable, and takes them when it is over', () => {
    const hoists = new Hoists();
    hoists.lay('hull', strokes, 1000, 9000, 1);
    hoists.update(2000, 0.001, 0);
    const [cable, hook] = shown(hoists);
    expect(shown(hoists)).toHaveLength(2);
    expect(cable!.scale.z).toBeCloseTo(4, 6);
    expect(hook!.scale.x).toBeGreaterThan(cable!.scale.x);
    expect(hoists.active).toBe(true);
    hoists.update(9001, 0.001, 0);
    expect(shown(hoists)).toHaveLength(0);
    expect(hoists.active).toBe(false);
  });

  it('keeps a cable a few pixels wide at a distance, where its metres are a hair', () => {
    const hoists = new Hoists();
    hoists.lay('hull', strokes, 0, 9000, 0.001);
    hoists.update(10, 0.5, 0);
    expect(shown(hoists)[0]!.scale.x).toBeGreaterThan(0.5);
  });

  it('is gone when asked to, whatever the hour', () => {
    const hoists = new Hoists();
    hoists.lay('hull', strokes, 0, 9000, 1);
    hoists.clear('hull');
    hoists.update(10, 1, 0);
    expect(shown(hoists)).toHaveLength(0);
  });
});
