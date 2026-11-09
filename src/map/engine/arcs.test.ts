import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Vector3,
  type Object3D,
} from 'three';
import type { PilePieces } from '@/domain/pile-pieces';
import type { ArcView, TroopView } from '@/domain/player-view';
import type { World } from '@/domain/world';
import { directRoute } from '@/domain/routing';
import { unrollRoute } from '@/domain/route-timing';
import { ArcLayer, CATCH_UP_MS, caughtUp, lastKnownMedium } from './arcs';
import { figurineFor, troopScale } from './figurines/figurine';
import { WorldFrame } from './frame';
import type { InkLayer } from './ink';
import { Pawn } from './pawn';

vi.mock('./figurines/figurine', async (original) => ({
  ...(await original<typeof import('./figurines/figurine')>()),
  // A gun is drawn longer than a tank: a mixed file spaces its ranks by their lengths.
  figurineFor: vi.fn((_nation: unknown, role: unknown) => {
    const object = new Group();
    return {
      object,
      span: role === 'artillery' ? 0.012 : 0.006,
      ready: Promise.resolve(),
      spin() {},
      standIn(copy: Object3D | null) {
        object.clear();
        if (copy !== null) object.add(copy);
      },
    };
  }),
}));

const arc = (state: ArcView['state'], mediums: ReadonlyArray<string>) =>
  ({ state, route: { legs: mediums.map((medium) => ({ medium })) } }) as unknown as ArcView;

describe('lastKnownMedium', () => {
  it('stands a washed block at the end of a last known stretch, in its last medium', () => {
    expect(lastKnownMedium(arc('lastKnown', ['land', 'sea']))).toBe('sea');
  });

  it('stands none for a column still watched, nor for mine', () => {
    for (const state of ['mine', 'enemyDetected', 'seaControl'] as const)
      expect(lastKnownMedium(arc(state, ['land']))).toBeNull();
  });
});

const world: World = {
  sphere: { minX: 0, maxX: 100, minY: 0, maxY: 50 },
  outline: Array.from({ length: 181 }, (_, k) => [k - 90, 0, 100, ((180 - k) / 180) * 50] as const),
  countries: [],
} as unknown as World;

/** Every view re-serves fresh objects: the same movement comes back equal, never identical. */
const mine = (id: string, to: readonly [number, number] = [10, 5]): ArcView => ({
  state: 'mine',
  id,
  from: [0, 0],
  to,
  route: directRoute([0, 0], to, 'land', 10),
  originLabel: 'A',
  destinationLabel: 'B',
  type: 'march',
  stack: { infantry: 2 },
  troopIds: [`${id}-troop`],
  schedule: { departedAt: 0, arrivesAt: 3_600_000, heldAt: null, holdUntil: null },
});

const layer = (trace: () => number = () => 0) =>
  new ArcLayer(new WorldFrame(world), { trace } as unknown as InkLayer);

/** The same stretch, watched then lost: only the state and its dates change. */
const sighted = (state: 'enemyDetected' | 'lastKnown'): ArcView =>
  ({
    state,
    id: 'e',
    from: [0, 0],
    to: [10, 5],
    route: directRoute([0, 0], [10, 5], 'land', 10),
    detector: 'outpost',
    detectorRegion: null,
    headingDegrees: 90,
    since: 0,
    seenTo: 1_800_000,
    arrivesAt: 3_600_000,
    lastSeenAt: 0,
  }) as unknown as ArcView;

const armor = (id: string, strength: number): TroopView =>
  ({ id, role: 'armor', tier: 1, strength, nominalStrength: 12 }) as unknown as TroopView;

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }) },
    Path2D: class {
      moveTo() {}
      lineTo() {}
      closePath() {}
    },
  });
});

const pawnOf = (arcs: ArcLayer, index: number) => arcs.pawns[index];

describe('ArcLayer.display', () => {
  it('keeps every object when the view comes back unchanged', () => {
    const arcs = layer();
    arcs.display([mine('a'), mine('b')]);
    const before = arcs.pawns.slice();
    const built = vi.mocked(figurineFor).mock.calls.length;
    const disposed = vi.spyOn(Pawn.prototype, 'dispose');
    arcs.display([mine('a'), mine('b')]);
    expect(arcs.pawns).toEqual(before);
    expect(arcs.pawns[0]).toBe(before[0]);
    expect(vi.mocked(figurineFor).mock.calls.length).toBe(built);
    expect(disposed).not.toHaveBeenCalled();
    disposed.mockRestore();
  });

  it('builds only the movement that appeared', () => {
    const arcs = layer();
    arcs.display([mine('a')]);
    const kept = pawnOf(arcs, 0);
    const built = vi.mocked(figurineFor).mock.calls.length;
    arcs.display([mine('a'), mine('b')]);
    expect(pawnOf(arcs, 0)).toBe(kept);
    expect(arcs.pawns).toHaveLength(2);
    expect(vi.mocked(figurineFor).mock.calls.length).toBe(built + 1);
  });

  it('rebuilds a movement whose route changed', () => {
    const arcs = layer();
    arcs.display([mine('a'), mine('b')]);
    const [a, b] = arcs.pawns;
    arcs.display([mine('a'), mine('b', [20, 5])]);
    expect(arcs.pawns[0]).toBe(a);
    expect(arcs.pawns[1]).not.toBe(b);
    expect(b!.parent).toBeNull();
  });

  it('frees a movement that left', () => {
    const arcs = layer();
    arcs.display([mine('a'), mine('b')]);
    const [, b] = arcs.pawns;
    arcs.display([mine('a')]);
    expect(arcs.pawns).toHaveLength(1);
    expect(b!.parent).toBeNull();
    expect(arcs.headPositions.has('b')).toBe(false);
  });

  it('builds twenty view updates of three movements once', () => {
    const arcs = layer();
    const before = vi.mocked(figurineFor).mock.calls.length;
    for (let k = 0; k < 20; k++) arcs.display([mine('a'), mine('b'), mine('c')]);
    // An infantry column dresses one medium: three pawns, three figurines, whatever the updates.
    expect(vi.mocked(figurineFor).mock.calls.length - before).toBe(3);
  });

  it('rebuilds a sighting lost from view into its last known position', () => {
    const arcs = layer();
    arcs.display([sighted('enemyDetected')]);
    const [watched] = arcs.pawns;
    arcs.display([sighted('lastKnown')]);
    expect(arcs.pawns[0]).not.toBe(watched);
    expect(watched!.parent).toBeNull();
  });

  it('rebuilds my column when its wear changes, read on my troops', () => {
    const arcs = layer();
    const column = { ...mine('a'), stack: { armor: 1 }, troopIds: ['t'] } as ArcView;
    arcs.troops = [armor('t', 12)];
    arcs.display([column]);
    const [whole] = arcs.pawns;
    arcs.troops = [armor('t', 3)];
    arcs.display([{ ...column }]);
    expect(arcs.pawns[0]).not.toBe(whole);
  });

  it('inks a thread once, when it appears, and not when its drawing changes', () => {
    const trace = vi.fn(() => 1000);
    const arcs = layer(trace);
    arcs.display([mine('a')]);
    arcs.display([mine('a'), mine('b')]);
    expect(trace).toHaveBeenCalledTimes(1);
    arcs.display([mine('a'), mine('b', [20, 5])]);
    expect(trace).toHaveBeenCalledTimes(1);
  });

  /** **The hour moves the pawn, not the view** (#183): no new answer, the column still walks. */
  it('walks my column from the clock between two views', () => {
    vi.useFakeTimers({ now: 0 });
    const arcs = layer();
    arcs.display([mine('a')]);
    arcs.animate();
    const start = arcs.headPositions.get('a')!.clone();
    vi.setSystemTime(1_800_000);
    arcs.animate();
    const half = arcs.headPositions.get('a')!.clone();
    vi.setSystemTime(3_600_000);
    arcs.animate();
    const end = arcs.headPositions.get('a')!;
    vi.useRealTimers();
    expect(half.distanceTo(start)).toBeGreaterThan(0);
    expect(end.distanceTo(half)).toBeCloseTo(half.distanceTo(start), 1);
  });

  /** **Une dernière position connue pâlit sans nouvelle réponse** (#183) : son encre se relit au
   *  battement de la boucle, pas au prochain `display`. */
  it('redraws a last known position as its ink fades, from the clock alone', () => {
    vi.useFakeTimers({ now: 0 });
    const arcs = layer();
    arcs.display([sighted('lastKnown')]);
    const [fresh] = arcs.pawns;
    vi.advanceTimersByTime(500);
    arcs.animate();
    expect(arcs.pawns[0]).toBe(fresh);
    vi.advanceTimersByTime(6 * 3_600_000);
    arcs.animate();
    vi.useRealTimers();
    expect(arcs.pawns[0]).not.toBe(fresh);
    expect(fresh!.parent).toBeNull();
  });
});

describe('ArcLayer.isFlowing', () => {
  const fieldOf = (eye: PerspectiveCamera) => {
    eye.updateMatrixWorld();
    return new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse),
    );
  };

  it('flows while a thread crosses the field, and no longer once every thread is out of it', () => {
    const arcs = layer();
    arcs.display([mine('a')]);
    // No frame yet: the field is unknown, and a thread shown must not wait for one.
    expect(arcs.isFlowing).toBe(true);
    const head = arcs.headPositions.get('a')!.clone();
    const eye = new PerspectiveCamera(30, 1, 0.001, 100);
    eye.position.copy(head).add(new Vector3(0, 0.5, 0.2));
    eye.lookAt(head);
    arcs.animate(eye, 0.001, undefined, fieldOf(eye));
    expect(arcs.isFlowing).toBe(true);
    // The eye turned away, toward what lies beyond the thread's end: nothing of it is drawn.
    eye.position.copy(head).add(new Vector3(0, 20, -60));
    eye.lookAt(head.clone().add(new Vector3(0, 0, -120)));
    arcs.animate(eye, 0.001, undefined, fieldOf(eye));
    expect(arcs.isFlowing).toBe(false);
  });

  const lookingAt = (arcs: ArcLayer, at: Vector3) => {
    const eye = new PerspectiveCamera(30, 1, 0.001, 100);
    eye.position.copy(at).add(new Vector3(0, 0.5, 0.2));
    eye.lookAt(at);
    arcs.animate(eye, 0.001, undefined, fieldOf(eye));
  };

  it('does not flow for a road that turns round the field, though one box of it would hold it', () => {
    const east = Array.from({ length: 41 }, (_, k) => [k * 2, 0] as const);
    const north = Array.from({ length: 40 }, (_, k) => [80, (k + 1) * 1.5] as const);
    const turning: ArcView = {
      ...mine('a', [80, 60]),
      route: {
        mode: 'land',
        points: [...east, ...north],
        distanceUnits: 140,
        costUnits: 140,
        legs: [{ medium: 'land', distanceUnits: 140 }],
        landCost: 1.6,
      },
    };
    const arcs = layer();
    arcs.display([turning]);
    lookingAt(arcs, new WorldFrame(world).projectLonLat([20, 50], 0));
    expect(arcs.isFlowing).toBe(false);
    lookingAt(arcs, new WorldFrame(world).projectLonLat([80, 30], 0));
    expect(arcs.isFlowing).toBe(true);
  });

  it('keeps its pace for a movement out of the field whose head slides on the screen, label or token at the edge', () => {
    const arcs = layer();
    arcs.display([mine('a')]);
    lookingAt(arcs, new WorldFrame(world).projectLonLat([120, -40], 0));
    expect(arcs.isFlowing).toBe(false);
    const label = (x: number, y: number) => ({ id: 'a', visible: true, x, y, edgeX: 0, edgeY: 0 });
    const token = (edgeX: number, edgeY: number) => ({
      id: 'a',
      visible: false,
      x: -5000,
      y: 9000,
      edgeX,
      edgeY,
    });
    // First told: how fast it slides is not known yet.
    arcs.tell([label(100, 100)], 0);
    expect(arcs.isFlowing).toBe(true);
    // A fifth of a pixel in a second: the heartbeat moves it as well as thirty frames would.
    arcs.tell([label(100.2, 100)], 1000);
    expect(arcs.isFlowing).toBe(false);
    // Read once a second, whatever the frames in between.
    arcs.tell([label(140, 100)], 1500);
    expect(arcs.isFlowing).toBe(false);
    arcs.tell([label(103, 100)], 2000);
    expect(arcs.isFlowing).toBe(true);
    // Gone off the frame, its token parks at the edge, and is read there.
    arcs.tell([token(0, 300)], 3000);
    arcs.tell([token(0, 300.1)], 4000);
    expect(arcs.isFlowing).toBe(false);
    arcs.tell([token(0, 302)], 5000);
    expect(arcs.isFlowing).toBe(true);
    // Another label is no head of this layer's, however fast it goes.
    arcs.tell([{ id: 'building-hq', visible: true, x: 0, y: 0, edgeX: 0, edgeY: 0 }], 6000);
    expect(arcs.isFlowing).toBe(false);
  });

  it('says a pawn marches while its figurine stands, and none once it is its pin', () => {
    const arcs = layer();
    arcs.setPlayerNation('france');
    arcs.display([mine('a')]);
    const head = arcs.headPositions.get('a')!.clone();
    const eye = new PerspectiveCamera(30, 1, 0.001, 100);
    eye.position.copy(head).add(new Vector3(0, 0.5, 0.2));
    eye.lookAt(head);
    arcs.animate(eye, 0.001, undefined, fieldOf(eye));
    expect(arcs.marching).toBe(true);
    arcs.animate({ position: new Vector3(0, 1e4, 0) } as PerspectiveCamera);
    expect(arcs.marching).toBe(false);
  });

  it('flows for a long road whose middle alone crosses the field', () => {
    const arcs = layer();
    arcs.display([mine('a', [60, 30])]);
    const middle = new WorldFrame(world).projectLonLat([30, 15], 0);
    const eye = new PerspectiveCamera(30, 1, 0.001, 100);
    eye.position.copy(middle).add(new Vector3(0, 0.5, 0.2));
    eye.lookAt(middle);
    arcs.animate(eye, 0.001, undefined, fieldOf(eye));
    expect(arcs.isFlowing).toBe(true);
  });
});

describe('ArcLayer.veil (#272)', () => {
  it('hides the thread of a column leaving a combat played on the map, and shows it again', () => {
    const arcs = layer();
    arcs.display([mine('home'), { ...mine('far'), from: [20, 20] }]);
    const shown = () => arcs.group.children.filter((child) => child.visible).length;
    const before = shown();
    arcs.veil((from) => from[0] === 0 && from[1] === 0);
    expect(shown()).toBe(before - 1);
    arcs.veil(null);
    expect(shown()).toBe(before);
  });
});

/** **Sur la route, la pile marche en file** (#276) : ses pièces au repos, l'une derrière l'autre. */
describe('ArcLayer: the column on the road (#276)', () => {
  type Role = 'armor' | 'artillery';
  const pile = (roles: ReadonlyArray<Role>, wear: 'whole' | 'smoking' = 'whole'): PilePieces => ({
    groups: roles.map((role, k) => ({
      role,
      troops: 1,
      troopIds: [`t${k}`],
      figures: [1 as const],
      wear,
    })),
    troopIds: roles.map((_, k) => `t${k}`),
    squad: roles.length > 1,
  });
  const tanks = (count: number, wear: 'whole' | 'smoking' = 'whole') =>
    pile(Array<Role>(count).fill('armor'), wear);

  /** Landed from the sea: a crossing, then the road. */
  const landing: ArcView = {
    ...mine('a'),
    route: {
      mode: 'naval',
      points: [
        [0, 0],
        [5, 2],
        [10, 5],
      ],
      distanceUnits: 10,
      costUnits: 10,
      legs: [
        { medium: 'sea', distanceUnits: 5 },
        { medium: 'land', distanceUnits: 5 },
      ],
      landCost: 1.6,
    },
  };
  /** The instant halfway through its transfer at the quay. */
  const atQuay = (): number => {
    const segments = unrollRoute(landing.route);
    let start = 0;
    for (const segment of segments) {
      if (segment.kind === 'dock') return (start + segment.share / 2) * 3_600_000;
      start += segment.share;
    }
    throw new Error('no quay');
  };

  /** Each piece's distance behind the head along the road, and to its side, seen up close —
   *  or, `away`, with the eye turned from it. */
  const walk = (column: PilePieces, { at = 1_800_000, arc = mine('a'), away = false } = {}) => {
    vi.useFakeTimers({ now: at });
    const arcs = layer();
    arcs.setPlayerNation('france');
    arcs.columns = new Map([['a', column]]);
    // Seen from afar first, where the file is its pin: nothing laid out yet.
    arcs.animate({ position: new Vector3(0, 1e4, 0) } as PerspectiveCamera);
    const calls = vi.mocked(figurineFor).mock.results.length;
    arcs.display([arc]);
    const pieces = vi
      .mocked(figurineFor)
      .mock.results.slice(calls)
      .map(({ value }) => (value as { object: Object3D }).object);
    const head = arcs.headPositions.get('a')!.clone();
    const ahead = arcs.aheadPositions.get('a')!.clone().sub(head).setY(0).normalize();
    const side = new Vector3(ahead.z, 0, -ahead.x);
    const eye = new PerspectiveCamera(30, 1, 0.001, 100);
    eye.position.copy(head).add(new Vector3(0, 0.5, 0.2));
    eye.lookAt(away ? head.clone().add(new Vector3(0, 0.5, 2)) : head);
    eye.updateMatrixWorld();
    const field = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse),
    );
    arcs.animate(eye, undefined, undefined, field);
    vi.useRealTimers();
    return pieces.map((piece) => {
      const offset = piece.getWorldPosition(new Vector3()).sub(head).setY(0);
      return {
        back: -offset.dot(ahead),
        side: offset.dot(side),
        gap: offset.length(),
        visible: piece.visible,
      };
    });
  };

  it('walks up to four pieces in single file, in the order of the pile at rest', () => {
    const file = walk(tanks(4));
    expect(file).toHaveLength(4);
    expect(file.every(({ visible }) => visible)).toBe(true);
    expect(file[0]!.back).toBeCloseTo(0, 6);
    for (let k = 1; k < 4; k++) {
      expect(file[k]!.back).toBeGreaterThan(file[k - 1]!.back);
      expect(file[k]!.side).toBeCloseTo(0, 6);
    }
  });

  it('doubles the file beyond four pieces, two abreast', () => {
    const file = walk(tanks(6));
    for (const rank of [0, 2, 4]) {
      const [left, right] = [file[rank]!, file[rank + 1]!];
      expect(left.back).toBeCloseTo(right.back, 6);
      expect(Math.sign(left.side)).toBe(-Math.sign(right.side));
      expect(Math.abs(left.side)).toBeGreaterThan(0);
    }
    expect(file[2]!.back).toBeGreaterThan(file[0]!.back);
    expect(file[4]!.back).toBeGreaterThan(file[2]!.back);
  });

  /** The storyboard's `fileLen` (`marche.js:162`): half of each rank's length, plus a gap. */
  it('leaves the same gap between two ranks, whatever their lengths', () => {
    const file = walk(pile(['armor', 'armor', 'artillery']));
    const lengths = [0.006, 0.006, 0.012];
    const gap = (k: number) =>
      (file[k + 1]!.back - file[k]!.back) / (lengths[k]! + lengths[k + 1]!);
    const clear = (k: number) =>
      file[k + 1]!.back - file[k]!.back - (lengths[k]! + lengths[k + 1]!) / 2;
    expect(gap(0)).not.toBeCloseTo(gap(1), 3);
    expect(clear(0)).toBeCloseTo(clear(1), 6);
  });

  it('holds a piece that would fall before the start of its leg at its end', () => {
    const file = walk(tanks(4), { at: 1 });
    expect(file[3]!.back).toBeCloseTo(file[2]!.back, 6);
    expect(file[1]!.back).toBeCloseTo(file[3]!.back, 6);
  });

  it('gathers a column landed at the quay on the shore, not on the water behind it', () => {
    const file = walk(tanks(4), { at: atQuay(), arc: landing });
    for (const { gap, visible } of file) {
      expect(visible).toBe(true);
      expect(gap).toBeCloseTo(0, 6);
    }
  });

  it('leaves the file where it stood while the eye looks away from its head', () => {
    const file = walk(tanks(4), { away: true });
    for (const { gap } of file) expect(gap).toBeCloseTo(0, 9);
  });

  it('keeps the column served again unchanged, and redraws it when a piece wears', () => {
    const arcs = layer();
    arcs.columns = new Map([['a', tanks(3)]]);
    arcs.display([mine('a')]);
    const [drawn] = arcs.pawns;
    arcs.columns = new Map([['a', tanks(3)]]);
    arcs.display([mine('a')]);
    expect(arcs.pawns[0]).toBe(drawn);
    arcs.columns = new Map([['a', tanks(3, 'smoking')]]);
    arcs.display([mine('a')]);
    expect(arcs.pawns[0]).not.toBe(drawn);
  });

  it('dresses no file for a column it only sighted: the fog serves it no roles', () => {
    const arcs = layer();
    arcs.setPlayerNation('france');
    arcs.columns = new Map([['e', tanks(3)]]);
    const calls = vi.mocked(figurineFor).mock.calls.length;
    arcs.display([sighted('enemyDetected')]);
    expect(vi.mocked(figurineFor).mock.calls.length).toBe(calls);
    expect(arcs.pawns).toHaveLength(1);
  });
});

describe('ArcLayer: a column joining a pile (#277)', () => {
  /** The head's distance to the end of its road, a second before it arrives. */
  const shortOfEnd = (short: number) => {
    vi.useFakeTimers({ now: 3_599_000 });
    const arcs = layer();
    arcs.setPlayerNation('france');
    arcs.stopShort = () => short;
    arcs.display([mine('a')]);
    arcs.animate({ position: new Vector3(0, 1e4, 0) } as PerspectiveCamera);
    const end = new WorldFrame(world).projectLonLat([10, 5], 0);
    const head = arcs.headPositions.get('a')!;
    vi.useRealTimers();
    return Math.hypot(head.x - end.x, head.z - end.z);
  };

  it('halts its pawn so far short of the point', () => {
    const plain = shortOfEnd(0);
    expect(shortOfEnd(0.5) - plain).toBeCloseTo(0.5, 2);
  });

  it('says a column of mine still heads for the point, and none for another', () => {
    const arcs = layer();
    arcs.display([mine('a'), sighted('enemyDetected')]);
    expect(arcs.headsFor([10, 5])).toBe(true);
    expect(arcs.headsFor([10, 6])).toBe(false);
    arcs.display([sighted('enemyDetected')]);
    expect(arcs.headsFor([10, 5])).toBe(false);
  });
});

describe('caughtUp (#278)', () => {
  // Let go at 0.02 of its way, held at the socle's foot 0.05 in, its first leg ends at 0.4.
  const release = { from: 0.02, at: 0, foot: 0.05, end: 0.4 };

  it('starts from the foot it was held at, with no jump', () => {
    expect(caughtUp(0.02, 0, release)).toBeCloseTo(0.05);
  });

  it('runs on to its own hour by the end of its first leg, and keeps it after', () => {
    expect(caughtUp(0.4, 0, release)).toBeCloseTo(0.4);
    expect(caughtUp(0.7, 0, release)).toBe(0.7);
    let last = 0;
    for (let share = 0.02; share <= 0.4; share += 0.01) {
      expect(caughtUp(share, 0, release)).toBeGreaterThanOrEqual(last);
      last = caughtUp(share, 0, release);
    }
  });

  it('let go past the end of its first leg, it still starts from its foot and runs to its hour', () => {
    const late = { from: 0.6, at: 1000, foot: 0.05, end: 0.4 };
    expect(caughtUp(0.6, 1000, late)).toBeCloseTo(0.05);
    const half = caughtUp(0.6, 1000 + CATCH_UP_MS / 2, late);
    expect(half).toBeGreaterThan(0.05);
    expect(half).toBeLessThan(0.6);
    expect(caughtUp(0.61, 1000 + CATCH_UP_MS, late)).toBe(0.61);
  });
});

describe('ArcLayer.hold (#278)', () => {
  const at = (arcs: ArcLayer) => arcs.headPositions.get('a')!.clone();

  it('holds the pawn where its road leaves the socle, then runs it on from there', () => {
    const arcs = layer();
    vi.spyOn(Date, 'now').mockReturnValue(360_000);
    arcs.display([mine('a')]);
    arcs.animate();
    const own = at(arcs);
    const start = arcs.hold('a', (point) => point.distanceTo(own) < 1e-9 || point.x < 2, Infinity)!;
    arcs.animate();
    const held = at(arcs);
    expect(held.distanceTo(start)).toBeLessThan(1e-6);
    expect(held.distanceTo(own)).toBeGreaterThan(0);
    // Let go, it starts from the foot, not from its own hour: no jump.
    arcs.letGo('a', performance.now());
    arcs.animate();
    expect(at(arcs).distanceTo(held)).toBeLessThan(1e-6);
    vi.mocked(Date.now).mockReturnValue(3_000_000);
    arcs.animate();
    expect(at(arcs).x).toBeGreaterThan(held.x);
    vi.mocked(Date.now).mockRestore();
  });

  it('holds no pawn already past its foot: it never steps back', () => {
    const arcs = layer();
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000);
    arcs.display([mine('a')]);
    arcs.animate();
    const own = at(arcs);
    // Its socle a mere step round where it set off.
    expect(arcs.hold('a', (point) => point.x < 0.01, Infinity)).toBeNull();
    arcs.animate();
    expect(at(arcs).distanceTo(own)).toBeLessThan(1e-9);
    vi.mocked(Date.now).mockRestore();
  });

  /** #279 : la prise arrive à la vue quand la colonne est déjà partie de quelques instants ; sur
   *  une caisse, ou d'une pile posée hors du socle, son pied est son départ. */
  it('holds at its start a pawn set off a moment ago, though it left no socle', () => {
    const arcs = layer();
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    arcs.display([mine('a')]);
    arcs.animate();
    const start = arcs.hold('a', () => false, Infinity);
    vi.mocked(Date.now).mockRestore();
    expect(start).not.toBeNull();
    arcs.animate();
    expect(at(arcs).distanceTo(start!)).toBeLessThan(1e-6);
  });

  it('finds the foot at the edge of the socle however long its road', () => {
    const arcs = layer();
    vi.spyOn(Date, 'now').mockReturnValue(0);
    arcs.display([mine('a', [170, 80])]);
    arcs.animate();
    const start = at(arcs);
    const radius = 1e-3;
    const foot = arcs.hold('a', (point) => point.distanceTo(start) < radius, Infinity)!;
    vi.mocked(Date.now).mockRestore();
    expect(foot.distanceTo(start)).toBeGreaterThanOrEqual(radius);
    expect(foot.distanceTo(start)).toBeLessThan(radius * 1.01);
  });

  it('reads the box of a copy stood in on the pawn, not at the origin', () => {
    const arcs = layer();
    vi.spyOn(Date, 'now').mockReturnValue(360_000);
    arcs.display([{ ...mine('a'), stack: { landTransport: 1 } } as ArcView]);
    arcs.animate();
    vi.mocked(Date.now).mockRestore();
    // As a frame drawn would leave it: the pawn placed, its truck's meshes with it.
    arcs.group.updateMatrixWorld(true);
    // A model's copy: its meshes hang under a root of their own, offset as a scene's are.
    const copy = new Group().add(new Mesh(new BoxGeometry(1e-3, 1e-3, 1e-3)));
    copy.position.set(0, 1e-3, 0);
    arcs.standIn('a', copy);
    const box = arcs.pieceOf('a')!.box!;
    const head = at(arcs);
    expect(head.length()).toBeGreaterThan(0.1);
    expect(box.getCenter(new Vector3()).distanceTo(head)).toBeLessThan(0.05);
  });

  it('holds nothing of an enemy', () => {
    const arcs = layer();
    arcs.display([sighted('enemyDetected')]);
    expect(arcs.hold('e', () => true, Infinity)).toBeNull();
  });
});

/** **Un navire qui quitte un port dessiné plus petit** (#433, option C) : il part du quai tel
 *  qu'il est dessiné, à l'échelle du port, et reprend sa taille en une demi-seconde. */
describe('a hull leaving a port drawn smaller', () => {
  const frame = new WorldFrame(world);
  const start = frame.projectLonLat([0, 0]);
  const quay = start.clone().add(new Vector3(0.3, 0, -0.2));
  const SPAN = 0.006;
  /** One voyage, drawn frame by frame at the server's hour `clock` and the page's `perf`: how
   *  large the hull is drawn, as a share of its own size at the same distance. */
  const voyage = (motion: 'full' | 'reduced', back = false) => {
    const arcs = new ArcLayer(
      frame,
      { trace: () => 0 } as unknown as InkLayer,
      undefined,
      (point) =>
        Math.hypot(point.x - start.x, point.z - start.z) < 1e-6 ? { at: quay, scale: 0.4 } : null,
    );
    arcs.setPlayerNation('france');
    arcs.motion = motion;
    const route = back
      ? directRoute([10, 5], [0, 0], 'sea', 10)
      : directRoute([0, 0], [10, 5], 'sea', 10);
    let shown = false;
    return (clock: number, perf: number) => {
      vi.useFakeTimers({ now: clock, toFake: ['Date'] });
      const page = vi.spyOn(performance, 'now').mockReturnValue(perf);
      try {
        if (!shown) arcs.display([{ ...mine('a'), route, stack: { cargo: 1 } } as ArcView]);
        shown = true;
        arcs.animate();
        const head = arcs.headPositions.get('a')!.clone();
        const camera = new PerspectiveCamera();
        camera.position.copy(head).add(new Vector3(0, 0.05, 0.05));
        arcs.animate(camera);
        const hull = vi.mocked(figurineFor).mock.results.at(-1)!.value.object as Group;
        const d = camera.position.distanceTo(head);
        return { share: hull.scale.x / troopScale(d, SPAN), head, d };
      } finally {
        page.mockRestore();
        vi.useRealTimers();
      }
    };
  };
  const docked = (d: number) => (0.4 * troopScale(d, SPAN * 0.4)) / troopScale(d, SPAN);

  it('leaves from the quay as drawn, at the port scale', () => {
    const { share, head, d } = voyage('full')(0, 1_000);
    expect(docked(d)).toBeLessThan(0.99);
    expect(share).toBeCloseTo(docked(d), 9);
    expect(Math.hypot(head.x - quay.x, head.z - quay.z)).toBeLessThan(1e-6);
  });

  it('grows back to its own size in half a second from the frame it is first drawn', () => {
    // The view lands 200 ms after the server's departure: the fade starts from there.
    const at = voyage('full');
    const first = at(200, 1_000);
    expect(first.share).toBeCloseTo(docked(first.d), 9);
    const mid = at(450, 1_250);
    expect(mid.share).toBeGreaterThan(docked(mid.d));
    expect(mid.share).toBeLessThan(1);
    expect(at(700, 1_500).share).toBeCloseTo(1, 9);
  });

  it('is drawn at its own size when first drawn long after it left', () => {
    expect(voyage('full')(10_000, 1_000).share).toBeCloseTo(1, 9);
  });

  it('takes its size at once out of full motion', () => {
    expect(voyage('reduced')(1, 1_000).share).toBeCloseTo(1, 9);
  });

  it('shrinks back to it in its last half-second, docking at the quay as drawn', () => {
    const at = voyage('full', true);
    expect(at(3_600_000 - 600, 1_000).share).toBeCloseTo(1, 9);
    const end = at(3_600_000, 1_600);
    expect(end.share).toBeCloseTo(docked(end.d), 9);
    expect(Math.hypot(end.head.x - quay.x, end.head.z - quay.z)).toBeLessThan(1e-6);
  });
});
