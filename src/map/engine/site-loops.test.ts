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
import { buildingMaquette } from '@/emblems/buildings/manifest';
import { RIG_PARTS } from '@/emblems/rigs';
import { castShadows } from './lamp';
import { SequenceLayer, type Sequence } from './sequences';
import { LIVE_PX, loopOf, type LoopHost, SiteLoopLayer } from './site-loops';
import { bakedRig } from './baking';
import { movesOnItsOwn } from './figurines/figurine';
import { sceneOfFile } from './gltf-scene.fixture';
import { isRigPart } from '@/emblems/rigs';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const MINE = buildingMaquette('mine', null)!;
const CENTRE = buildingMaquette('researchCenter', null)!;

/** A rig of a mine: its four parts at their pivots, each with a mesh. */
function mineRig(): Group {
  const root = new Group();
  for (const name of RIG_PARTS.mine) {
    const part = new Group();
    part.name = name;
    part.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    root.add(part);
  }
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  return root;
}

type Site = { id: string; url: string; pose?: 'observing'; box: Box3; metre: number };
/** A site `x` units along, drawn at its metre. */
const site = (id: string, x: number, url = MINE): Site => ({
  id,
  url,
  box: new Box3(new Vector3(x, 0, 0), new Vector3(x + 1, 1, 1)),
  metre: 0.02,
});

class FakeHost implements LoopHost {
  readonly group = new Group();
  readonly copies = new Map<string, Object3D>();
  sites: Site[] = [];
  working() {
    return this.sites;
  }
  pieceOf(id: string) {
    const found = this.sites.find((each) => each.id === id);
    return found === undefined ? null : { url: found.url, box: found.box };
  }
  standIn(id: string, copy: Object3D | null) {
    const old = this.copies.get(id);
    if (old !== undefined && old !== copy) old.removeFromParent();
    if (copy === null) this.copies.delete(id);
    else {
      this.group.add(copy);
      this.copies.set(id, copy);
    }
  }
}

const setup = (cap = 6) => {
  const host = new FakeHost();
  const sight = { px: Infinity };
  const sequences = new SequenceLayer(
    () => true,
    () => Promise.resolve(new Group()),
  );
  const cooked: unknown[][] = [];
  const loops = new SiteLoopLayer(
    host,
    sequences,
    (_box, px) => px <= sight.px,
    () => new Vector3(0, 0, 0),
    cap,
    (...args) => {
      cooked.push(args);
      return Promise.resolve(mineRig());
    },
  );
  return { host, loops, sight, sequences, cooked };
};
const wheel = (copy: Object3D) =>
  copy.getObjectByName('molette_1')!.quaternion.angleTo(new Group().quaternion);

describe('the sites at rest (#273)', () => {
  it('lends a site at work its copy and turns its wheels at their beat, shadowless', async () => {
    const { host, loops } = setup();
    host.sites = [site('a', 5)];
    expect(loops.idle()).toBe(false);
    loops.frame(0, 'full');
    await flush();
    const copy = host.copies.get('a')!;
    expect(copy.parent).toBe(host.group);
    loops.frame(2, 'full');
    expect(wheel(copy)).toBeGreaterThan(0);
    castShadows(copy);
    const shadows = (name: string) => (copy.getObjectByName(name)!.children[0] as Mesh).castShadow;
    expect(RIG_PARTS.mine.map(shadows)).toEqual([false, false, false, false]);
    // What does not move keeps its shadow.
    expect((copy.children.find((node) => (node as Mesh).isMesh) as Mesh).castShadow).toBe(true);
  });

  it('asks for nothing with no site at work, nor for one whose part reads under 6 px', async () => {
    const { host, loops, sight } = setup();
    expect(loops.idle()).toBe(true);
    host.sites = [site('a', 5)];
    sight.px = LIVE_PX - 1;
    expect(loops.idle()).toBe(true);
    loops.frame(0, 'full');
    await flush();
    expect(host.copies.size).toBe(0);
  });

  it('lives at the six nearest, and rests the others', async () => {
    const { host, loops } = setup(6);
    host.sites = [9, 3, 7, 1, 8, 2, 6, 4].map((x) => site(`s${x}`, x));
    loops.frame(0, 'full');
    await flush();
    expect([...host.copies.keys()].sort()).toEqual(['s1', 's2', 's3', 's4', 's6', 's7']);
  });

  it('rests at reduced and cut motion: the copies go back', async () => {
    for (const motion of ['reduced', 'off'] as const) {
      const { host, loops } = setup();
      host.sites = [site('a', 5)];
      loops.frame(0, 'full');
      await flush();
      loops.frame(1, motion);
      expect(host.copies.size).toBe(0);
    }
  });

  it('withdraws the copy of a site gone from its host: taken, razed', async () => {
    const { host, loops } = setup();
    host.sites = [site('a', 5)];
    loops.frame(0, 'full');
    await flush();
    const copy = host.copies.get('a')!;
    host.sites = [];
    loops.frame(1, 'full');
    expect(host.copies.size).toBe(0);
    expect(copy.parent).toBeNull();
  });

  it('cooks again when its lasting state changes: a Centre that stops searching', async () => {
    const { host, loops, cooked } = setup();
    host.sites = [{ ...site('c', 5, CENTRE), pose: 'observing' }];
    loops.frame(0, 'full');
    await flush();
    host.sites = [site('c', 5, CENTRE)];
    loops.frame(1, 'full');
    await flush();
    expect(cooked.map(([, , pose]) => pose)).toEqual(['observing', undefined]);
    expect(host.copies.size).toBe(1);
  });

  it('gives its copy to a sequence that plays on the site, and takes it back at its clock', async () => {
    const { host, loops, sequences } = setup();
    host.sites = [site('a', 5)];
    loops.frame(0, 'full');
    await flush();
    const door: Sequence<'mine'> = { family: 'mine', ms: 1000, at: () => ({}) };
    sequences.play(host, 'a', door, 0);
    await flush();
    const theirs = host.copies.get('a')!;
    loops.frame(0.5, 'full');
    expect(host.copies.get('a')).toBe(theirs);
    expect(theirs.parent).toBe(host.group);
    sequences.step(1000);
    loops.frame(4, 'full');
    await flush();
    const ours = host.copies.get('a')!;
    expect(ours).not.toBe(theirs);
    loops.frame(4, 'full');
    expect(wheel(ours)).toBeGreaterThan(0);
  });
  it('withdraws its copy from a sequence still cooking that ends out of sight', async () => {
    const { host, sight } = setup();
    const sequences = new SequenceLayer(
      (_box, px) => px <= sight.px,
      () => new Promise<Group>(() => {}),
    );
    const layer = new SiteLoopLayer(
      host,
      sequences,
      () => true,
      () => new Vector3(),
      6,
      () => Promise.resolve(mineRig()),
    );
    host.sites = [site('a', 5)];
    layer.frame(0, 'full');
    await flush();
    const door: Sequence<'mine'> = { family: 'mine', ms: 1000, at: () => ({}) };
    sequences.play(host, 'a', door, 0);
    layer.frame(0.5, 'full');
    host.sites = [];
    sight.px = 0;
    sequences.step(100);
    layer.frame(1, 'full');
    expect(host.copies.size).toBe(0);
  });

  it('drops a copy cooked after its site left', async () => {
    const { host, loops } = setup();
    host.sites = [site('a', 5)];
    loops.frame(0, 'full');
    host.sites = [];
    loops.frame(0.1, 'full');
    await flush();
    expect(host.copies.size).toBe(0);
  });
});

describe('each loop on its file today (#273)', () => {
  const files = [
    buildingMaquette('oilWell', null)!,
    MINE,
    buildingMaquette('mine', 'coal')!,
    CENTRE,
    buildingMaquette('port', null)!,
  ];
  it.each(files)('%s: reads its pivots by name, rests at 0 and moves at mid-cycle', (url) => {
    const loop = loopOf(url)!;
    const rig = bakedRig(
      sceneOfFile(url),
      (node) => isRigPart(loop.family, node.name) || movesOnItsOwn(node),
    );
    const poses = loop.posesOf(rig);
    const size = (pose: ReturnType<typeof poses>) =>
      Object.values(pose).reduce(
        (sum, { turn = [0, 0, 0], shift = [0, 0, 0], stretch = 1 }) =>
          sum + Math.hypot(...turn) + Math.hypot(...shift) + Math.abs(stretch - 1),
        0,
      );
    expect(size(poses(0))).toBeCloseTo(0, 9);
    // A quarter of the pump's stroke, the tub out, the dome aimed, the hook in the yard.
    const mid = { oilWell: 0.75, mine: 10, researchCenter: 5, port: 13 }[loop.family as string]!;
    expect(size(poses(mid))).toBeGreaterThan(0.1);
  });
});
