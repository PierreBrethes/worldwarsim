import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Frustum, Group, Matrix4, PerspectiveCamera, Vector3, type Object3D } from 'three';
import type { PilePieces } from '@/domain/pile-pieces';
import type { ArcView, TroopView } from '@/domain/player-view';
import type { World } from '@/domain/world';
import { directRoute } from '@/domain/routing';
import { unrollRoute } from '@/domain/route-timing';
import { ArcLayer, lastKnownMedium } from './arcs';
import { figurineFor } from './figurines/figurine';
import { WorldFrame } from './frame';
import type { InkLayer } from './ink';
import { Pawn } from './pawn';

vi.mock('./figurines/figurine', async (original) => ({
  ...(await original<typeof import('./figurines/figurine')>()),
  // A gun is drawn longer than a tank: a mixed file spaces its ranks by their lengths.
  figurineFor: vi.fn((_nation: unknown, role: unknown) => ({
    object: new Group(),
    span: role === 'artillery' ? 0.012 : 0.006,
    ready: Promise.resolve(),
    spin() {},
  })),
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
