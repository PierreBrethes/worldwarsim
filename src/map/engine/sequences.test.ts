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
import { stride } from './figurines/infantry';
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

  it('plays a piece on with a new sequence on the same clock, which a longer one lengthens', async () => {
    const { layer } = layerOf();
    const host = new FakeHost();
    layer.play(host, 'a', turning, 0);
    await flush();
    const slower: Sequence<'barracks'> = {
      family: 'barracks',
      ms: 3000,
      at: (t) => (t < 3000 ? { porte_gauche: { turn: [0, t / 2000, 0] } } : {}),
    };
    expect(layer.retime(host, 'a', slower)).toBe(true);
    layer.step(1000);
    expect(doorOf(host, 'a').rotation.y).toBeCloseTo(0.5);
    layer.step(2500);
    expect(layer.active).toBe(true);
    expect(layer.retime(host, 'b', slower)).toBe(false);
  });

  it('says how many more pieces it may play: what a sortie keeps for its doors', () => {
    const { layer } = layerOf();
    const host = new FakeHost();
    expect(layer.room).toBe(MAX_PLAYING);
    layer.play(host, 'a', turning, 0);
    expect(layer.room).toBe(MAX_PLAYING - 1);
  });

  it('says which piece it plays, until it ends', async () => {
    const { layer } = layerOf();
    const host = new FakeHost();
    layer.play(host, 'a', turning, 0);
    expect(layer.playsOn(host, 'a')).toBe(true);
    expect(layer.playsOn(host, 'b')).toBe(false);
    expect(layer.playsOn(new FakeHost(), 'a')).toBe(false);
    layer.step(1000);
    expect(layer.playsOn(host, 'a')).toBe(false);
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

  it("hangs a motor's breath on a marker while the pose asks for it", async () => {
    const withMarker = rig();
    const marker = new Group();
    marker.name = 'fx_sortie_remise';
    withMarker.add(marker);
    const breathing: Sequence<'barracks'> = {
      family: 'barracks',
      ms: 1000,
      at: (t) => (t < 1000 ? { fx_sortie_remise: { exhaust: [t / 1000, 1] } } : {}),
    };
    const { layer } = layerOf(true, () => Promise.resolve(withMarker));
    const host = new FakeHost();
    layer.play(host, 'a', breathing, 0);
    await flush();
    layer.step(500);
    const puffs = host.copies.get('a')!.getObjectByName('fx_sortie_remise')!.children[0]!;
    expect(puffs.children.some((puff) => puff.visible)).toBe(true);
    layer.step(600);
    expect(host.copies.get('a')!.getObjectByName('fx_sortie_remise')!.children).toHaveLength(1);
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

  describe('a piece that moves whole', () => {
    /** The host draws its pieces in a pile turned a quarter, twice their size, off the origin. */
    class PileHost extends FakeHost {
      readonly pile = new Group();
      drawn: Group | null = new Group();
      constructor() {
        super();
        this.pile.position.set(10, 0, 0);
        this.pile.rotation.y = Math.PI / 2;
        this.pile.scale.setScalar(2);
      }
      copyOf() {
        return this.drawn?.clone(true) ?? null;
      }
      override standIn(id: string, copy: Object3D | null) {
        super.standIn(id, copy);
        if (copy) this.pile.add(copy);
      }
    }
    const walking: Sequence<never> = {
      ms: 1000,
      at: (t) => (t < 1000 ? { root: { travel: [0, 0, 4], heading: Math.PI, fade: 1 } } : {}),
    };
    const worldOf = (host: PileHost) =>
      host.copies.get('a')!.children[0]!.getWorldPosition(new Vector3());

    it('stands a clone of what the host draws in at once, posed at its time, without cooking', () => {
      const cooked: string[] = [];
      const layer = new SequenceLayer(
        () => true,
        (url) => (cooked.push(url), Promise.resolve(rig())),
      );
      const host = new PileHost();
      layer.play(host, 'a', walking, 0, 500);
      expect(cooked).toEqual([]);
      expect(
        worldOf(host)
          .toArray()
          .map((v) => +v.toFixed(6)),
      ).toEqual([10, 0, 4]);
    });

    it('travels along the world axes and faces a world heading, whatever the pile turn and size', () => {
      const { layer } = layerOf();
      const host = new PileHost();
      layer.play(host, 'a', walking, 0);
      layer.step(500);
      expect(
        worldOf(host)
          .toArray()
          .map((v) => +v.toFixed(6)),
      ).toEqual([10, 0, 4]);
      const front = new Vector3(0, 0, 1).transformDirection(
        host.copies.get('a')!.children[0]!.matrixWorld,
      );
      expect(front.x).toBeCloseTo(0);
      expect(front.z).toBeCloseTo(-1);
    });

    it('walks the men of a squad each on his own, the squad staying put', () => {
      const { layer } = layerOf();
      const host = new PileHost();
      const man = new Group();
      man.name = 'man_1';
      man.position.set(1, 0, 0);
      host.drawn!.add(man);
      const file: Sequence<never> = {
        ms: 1000,
        at: (t) => (t < 1000 ? { man_1: { travel: [0, 0, 4] } } : {}),
      };
      layer.play(host, 'a', file, 0, 500);
      const copy = host.copies.get('a')!;
      const rest = new Vector3(1, 0, 0).applyMatrix4(host.pile.matrixWorld);
      const walked = copy.getObjectByName('man_1')!.getWorldPosition(new Vector3());
      expect(walked.distanceTo(rest.add(new Vector3(0, 0, 4)))).toBeLessThan(1e-6);
      expect(copy.children[0]!.getWorldPosition(new Vector3()).toArray()).toEqual([10, 0, 0]);
    });

    it('stands a man who has arrived as the squad stands him, not in his last stride', () => {
      const { layer } = layerOf();
      const host = new PileHost();
      const man = new Group();
      man.name = 'man_0';
      man.userData.stride = 0.6;
      const leg = new Group();
      leg.name = 'leg_left';
      man.add(leg);
      stride(man, 0);
      const standing = leg.rotation.x;
      host.drawn!.add(man);
      const file: Sequence<never> = {
        ms: 1000,
        at: (t) => (t < 500 ? { man_0: { travel: [0, 0, 1], stride: 0.15 } } : {}),
      };
      layer.play(host, 'a', file, 0, 100);
      const walking = host.copies.get('a')!.getObjectByName('leg_left')!.rotation.x;
      expect(walking).not.toBeCloseTo(standing);
      layer.step(700);
      expect(host.copies.get('a')!.getObjectByName('leg_left')!.rotation.x).toBeCloseTo(standing);
    });

    it('judges a walk where it starts as well as where it ends: a door in sight, a rank off it', () => {
      // The rank is off the screen; the door the walk starts from is on it.
      const sees = (box: Box3) => box.max.z > 2;
      const layer = new SequenceLayer(sees, () => Promise.resolve(rig()));
      const host = new PileHost();
      host.box = new Box3(new Vector3(9, 0, -1), new Vector3(11, 1, 1));
      host.pieceOf = (id: string) => {
        const copy = host.copies.get(id);
        if (copy === undefined) return { url: 'x.glb', box: host.box };
        copy.updateMatrixWorld(true);
        return { url: 'x.glb', box: host.box!.clone().union(new Box3().setFromObject(copy)) };
      };
      host.drawn!.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
      expect(layer.play(host, 'a', walking, 0, 500)).toBe(true);
      expect(layer.active).toBe(true);
      const nowhere: Sequence<never> = {
        ms: 1000,
        at: (t) => (t < 1000 ? { root: { travel: [0, 0, -9] } } : {}),
      };
      expect(layer.play(host, 'b', nowhere, 0, 500)).toBe(false);
      expect(host.copies.has('b')).toBe(false);
    });

    it('does not play while the host has nothing drawn to clone', () => {
      const { layer } = layerOf();
      const host = new PileHost();
      host.drawn = null;
      layer.play(host, 'a', walking, 0);
      expect(layer.active).toBe(false);
    });
  });
});
