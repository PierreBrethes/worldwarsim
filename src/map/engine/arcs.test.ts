import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import type { ArcView, TroopView } from '@/domain/player-view';
import type { World } from '@/domain/world';
import { directRoute } from '@/domain/routing';
import { ArcLayer, lastKnownMedium } from './arcs';
import { figurineFor } from './figurines/figurine';
import { WorldFrame } from './frame';
import type { InkLayer } from './ink';
import { Pawn } from './pawn';

vi.mock('./figurines/figurine', async (original) => ({
  ...(await original<typeof import('./figurines/figurine')>()),
  figurineFor: vi.fn(() => ({ object: new Group(), ready: Promise.resolve(), spin() {} })),
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
  originCountry: 'A',
  destinationCountry: 'B',
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
