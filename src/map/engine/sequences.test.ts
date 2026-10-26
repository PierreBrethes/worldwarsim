import { Box3, Group, type Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_PLAYING, type Sequence, SequenceLayer, type SequenceHost } from './sequences';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A rig with one named part, at its pivot. */
function rig(): Group {
  const root = new Group();
  const door = new Group();
  door.name = 'porte_gauche';
  root.add(door);
  return root;
}

const turning: Sequence<'barracks'> = {
  family: 'barracks',
  ms: 1000,
  at: (t) => (t < 1000 ? { porte_gauche: { turn: [0, t / 1000, 0] } } : {}),
};

class FakeHost implements SequenceHost {
  readonly copies = new Map<string, Object3D>();
  readonly calls: Array<[string, boolean]> = [];
  gone = new Set<string>();
  box: Box3 | null = new Box3(new Vector3(), new Vector3(1, 1, 1));
  pieceOf(id: string) {
    return this.gone.has(id) ? null : { url: 'x.glb', box: this.box };
  }
  standIn(id: string, copy: Object3D | null) {
    this.calls.push([id, copy !== null]);
    if (copy === null) this.copies.delete(id);
    else this.copies.set(id, copy);
  }
}

const layerOf = (sees = true) => {
  const state = { sees };
  const layer = new SequenceLayer(
    () => state.sees,
    () => Promise.resolve(rig()),
  );
  return { layer, state };
};
const doorOf = (host: FakeHost, id: string) =>
  host.copies.get(id)!.getObjectByName('porte_gauche')!;

describe('SequenceLayer', () => {
  it('does not play at reduced or cut motion, out of sight, or while the piece is not drawn', async () => {
    for (const motion of ['reduced', 'off'] as const) {
      const { layer } = layerOf();
      const host = new FakeHost();
      layer.motion = motion;
      layer.play(host, 'a', turning, 0);
      expect(layer.active).toBe(false);
    }
    const unseen = layerOf(false);
    unseen.layer.play(new FakeHost(), 'a', turning, 0);
    expect(unseen.layer.active).toBe(false);
    const { layer } = layerOf();
    const host = new FakeHost();
    host.gone.add('a');
    layer.play(host, 'a', turning, 0);
    host.box = null;
    layer.play(host, 'b', turning, 0);
    expect(layer.active).toBe(false);
    await flush();
    expect(host.calls).toEqual([]);
  });

  it('stands the copy in only once cooked, then poses it by the clock of play', async () => {
    const { layer } = layerOf();
    const host = new FakeHost();
    layer.play(host, 'a', turning, 100);
    expect(layer.active).toBe(true);
    expect(host.copies.size).toBe(0);
    await flush();
    expect(host.copies.size).toBe(1);
    layer.step(600);
    expect(doorOf(host, 'a').rotation.y).toBeCloseTo(0.5);
    layer.step(1000);
    expect(doorOf(host, 'a').rotation.y).toBeCloseTo(0.9);
  });

  it('ends on the rest pose at the end of the sequence, giving the piece back once', async () => {
    const { layer } = layerOf();
    const host = new FakeHost();
    layer.play(host, 'a', turning, 0);
    await flush();
    layer.step(1000);
    layer.step(1200);
    expect(layer.active).toBe(false);
    expect(host.calls).toEqual([
      ['a', true],
      ['a', false],
    ]);
  });

  it.each([
    ['the piece goes', (_: SequenceLayer, host: FakeHost) => host.gone.add('a')],
    [
      'it leaves the field',
      (_: SequenceLayer, __: FakeHost, s: { sees: boolean }) => (s.sees = false),
    ],
    ['motion is reduced', (layer: SequenceLayer) => (layer.motion = 'reduced')],
  ])('ends at once when %s', async (_, change) => {
    const { layer, state } = layerOf();
    const host = new FakeHost();
    layer.play(host, 'a', turning, 0);
    await flush();
    change(layer, host, state);
    layer.step(100);
    expect(layer.active).toBe(false);
    expect(host.calls.filter(([, standing]) => !standing)).toHaveLength(1);
  });

  it('puts nothing in place when it ends before the cooking does', async () => {
    const { layer } = layerOf();
    const host = new FakeHost();
    layer.play(host, 'a', turning, 0);
    layer.motion = 'off';
    layer.step(10);
    await flush();
    expect(host.calls).toEqual([]);
  });

  it('plays a piece once at a time, and at most MAX_PLAYING pieces', async () => {
    const { layer } = layerOf();
    const host = new FakeHost();
    layer.play(host, 'a', turning, 0);
    layer.play(host, 'a', turning, 10);
    for (let k = 0; k < MAX_PLAYING + 2; k++) layer.play(host, `p${k}`, turning, 0);
    await flush();
    expect(host.copies.size).toBe(MAX_PLAYING);
  });
});
