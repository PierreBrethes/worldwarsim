import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_PLAYING, PLAY_PX, type Sequence, SequenceLayer, type SequenceHost } from './sequences';

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

const layerOf = (sees = true, cook = () => Promise.resolve(rig())) => {
  const state = { sees };
  const layer = new SequenceLayer(() => state.sees, cook);
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

  it("judges the size on screen by the sequence's own least size, the buildings' by default", () => {
    const asked: number[] = [];
    const layer = new SequenceLayer(
      (_, px) => (asked.push(px), true),
      () => Promise.resolve(rig()),
    );
    layer.play(new FakeHost(), 'a', turning, 0);
    layer.play(new FakeHost(), 'b', { ...turning, minPx: 30 }, 0);
    expect(asked).toEqual([PLAY_PX, 30]);
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

  it("keeps the others playing when a finished sequence's cooking fails", async () => {
    let fail: () => void = () => {};
    let first = true;
    const { layer } = layerOf(true, () => {
      if (!first) return Promise.resolve(rig());
      first = false;
      return new Promise((_, reject) => (fail = () => reject(new Error('cooking'))));
    });
    const host = new FakeHost();
    layer.play(host, 'a', turning, 0);
    layer.play(host, 'b', turning, 0);
    await flush();
    layer.motion = 'reduced';
    layer.step(10);
    expect(layer.active).toBe(false);
    layer.motion = 'full';
    layer.play(host, 'c', turning, 20);
    await flush();
    fail();
    await flush();
    expect(layer.active).toBe(true);
    expect(host.copies.has('c')).toBe(true);
  });

  it('plays when the box is not known yet, and judges it once it is', async () => {
    const { layer, state } = layerOf();
    const host = new FakeHost();
    host.box = null;
    layer.play(host, 'a', turning, 0);
    expect(layer.active).toBe(true);
    await flush();
    host.box = new Box3(new Vector3(), new Vector3(1, 1, 1));
    state.sees = false;
    layer.step(10);
    expect(layer.active).toBe(false);
  });

  it('leaves what is not a rig part to its own: a hub that spins, a marker with smoke under it', async () => {
    const withHub = rig();
    const hub = new Group();
    hub.name = 'prop';
    const marker = new Group();
    marker.name = 'fx_smoke';
    marker.add(new Group().add(new Group()));
    withHub.add(hub, marker);
    const { layer } = layerOf(true, () => Promise.resolve(withHub));
    const host = new FakeHost();
    layer.play(host, 'a', turning, 0);
    await flush();
    host.copies.get('a')!.getObjectByName('prop')!.rotation.z = 2;
    layer.step(500);
    expect(host.copies.get('a')!.getObjectByName('prop')!.rotation.z).toBe(2);
    expect(doorOf(host, 'a').rotation.y).toBeCloseTo(0.5);
  });

  describe('the whole copy', () => {
    const shared = new MeshStandardMaterial({ opacity: 0.8 });
    const withBody = (): Group => {
      const root = rig();
      root.add(new Mesh(new BoxGeometry(), shared));
      return root;
    };
    const leaving: Sequence<'barracks'> = {
      family: 'barracks',
      ms: 1000,
      at: (t) => (t < 1000 ? { root: { shift: [0, 0, t / 100], turn: [0, 1, 0], fade: 0.5 } } : {}),
    };
    const meshOf = (host: FakeHost) => {
      let found: Mesh | null = null;
      host.copies.get('a')!.traverse((node) => (node as Mesh).isMesh && (found = node as Mesh));
      return found!;
    };

    it('moves and turns the rig, not the holder the host places', async () => {
      const { layer } = layerOf(true, () => Promise.resolve(withBody()));
      const host = new FakeHost();
      layer.play(host, 'a', leaving, 0);
      await flush();
      layer.step(500);
      const holder = host.copies.get('a')!;
      expect(holder.position.z).toBe(0);
      const rigged = holder.children[0]!;
      expect(rigged.position.z).toBeCloseTo(5);
      expect(rigged.rotation.y).toBeCloseTo(1);
    });

    it('fades on materials of its own, and frees them at the end', async () => {
      const { layer } = layerOf(true, () => Promise.resolve(withBody()));
      const host = new FakeHost();
      layer.play(host, 'a', leaving, 0);
      await flush();
      layer.step(500);
      const own = meshOf(host).material as MeshStandardMaterial;
      expect(own).not.toBe(shared);
      expect(own.transparent).toBe(true);
      expect(own.opacity).toBeCloseTo(0.4);
      expect(shared.opacity).toBe(0.8);
      expect(shared.transparent).toBe(false);
      let disposed = false;
      own.addEventListener('dispose', () => (disposed = true));
      layer.step(1000);
      expect(disposed).toBe(true);
    });

    it('leaves the materials alone when nothing fades', async () => {
      const { layer } = layerOf(true, () => Promise.resolve(withBody()));
      const host = new FakeHost();
      layer.play(host, 'a', turning, 0);
      await flush();
      layer.step(500);
      expect(meshOf(host).material).toBe(shared);
    });
  });
});
