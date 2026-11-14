import { Matrix4, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { MapMotion } from '@/domain/map-motion';

let loads: () => Promise<unknown> = () => Promise.reject(new Error('no file'));
vi.mock('./figurines/figurine', async (original) => ({
  ...(await original<typeof import('./figurines/figurine')>()),
  posedScene: () => loads(),
}));

const cue = (ground: 'quay' | 'beach' = 'beach') => ({
  kind: 'debarquement' as const,
  hull: 'p/1',
  carrierId: 'h',
  ground,
  men: ['p/0'],
  vehicles: [],
});

/** **A cargo's men step down before a beach** (#509): what the cue does at each setting, and what
 *  `landOnBeach` does when the sequence cannot play: the pile always stands, never held. */
describe('the debarkation cue of a cargo (#509)', () => {
  const play = async (motion: MapMotion, ground: 'quay' | 'beach', veiled = false) => {
    const { MapEngine } = await import('./index');
    const inkArrival = vi.fn();
    const expectPile = vi.fn();
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      invalidate: () => {},
      standing: {
        inkArrival,
        expect: expectPile,
        placeOf: () => ({ at: new Vector3() }),
      },
      sequences: { motion },
      veiled: () => veiled,
      beachLandings: [] as unknown[],
    }) as unknown as { cue: (cue: unknown) => void; beachLandings: unknown[] };
    engine.cue(cue(ground));
    return { inkArrival, expectPile, queued: engine.beachLandings.length };
  };

  it('queues the canots on a beach at full motion, holding the pile', async () => {
    const { queued, expectPile, inkArrival } = await play('full', 'beach');
    expect(queued).toBe(1);
    expect(expectPile).toHaveBeenCalledWith('p');
    expect(inkArrival).not.toHaveBeenCalled();
  });

  it('lays a ring of ink under the pile at reduced motion and at a quay, but nothing under a combat or cut', async () => {
    for (const [motion, ground] of [
      ['reduced', 'beach'],
      ['full', 'quay'],
    ] as const) {
      const { inkArrival, queued } = await play(motion, ground);
      expect(inkArrival, `${motion} ${ground}`).toHaveBeenCalledWith('p');
      expect(queued).toBe(0);
    }
    for (const [motion, veiled] of [
      ['reduced', true],
      ['off', false],
    ] as const)
      expect(
        (await play(motion, 'beach', veiled)).inkArrival,
        `${motion} ${veiled}`,
      ).not.toHaveBeenCalled();
  });
});

describe('landOnBeach when its canots cannot play (#509)', () => {
  const land = async ({
    roomFor = 8,
    file = { boats: [{ node: 'boat_left' as const, rest: [1, 1, -3] as const }], astern: -9 },
    coast = {} as object | null,
    motion = 'full' as MapMotion,
  } = {}) => {
    const { MapEngine } = await import('./index');
    const arrive = vi.fn();
    const inkArrival = vi.fn();
    const loadCoast = vi.fn();
    const squad = { at: new Vector3(), front: new Vector3(1, 0, 0), men: [new Vector3(1, 0, 1)] };
    const box = { getSize: (v: Vector3) => v.set(1, 2, 1) };
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      standing: {
        piecesOf: () => ({ groups: [{ role: 'infantry' }, { role: 'cargo' }] }),
        pieceOf: () => ({ box, url: 'cargo.glb' }),
        placeOf: () => squad,
        anchor: () => {},
        frameOf: () => new Matrix4(),
        arrive,
        inkArrival,
      },
      sequences: { motion, roomFor: () => roomFor, playsOn: () => false, play: () => true },
      veiled: () => false,
      seenBig: () => true,
      landAt: () => true,
      coast,
      loadCoast,
      frame: { lonLatAt: () => [0, 0], centerX: 0, centerY: 0 },
      boatsOfFile: () => file,
    }) as unknown as { landOnBeach: (l: unknown, now: number) => boolean };
    const done = engine.landOnBeach({ cue: cue() }, 0);
    return { done, arrive, inkArrival, loadCoast };
  };

  it('plays the boats when all is there: the pile stands with the plan, once', async () => {
    const { done, arrive } = await land();
    expect(done).toBe(true);
    expect(arrive).toHaveBeenCalledTimes(1);
    expect(arrive.mock.calls[0]![1]).toHaveLength(1);
  });

  it.each([
    ['the pool is full', { roomFor: 0 }],
    ['the file hangs no boat', { file: { boats: [], astern: 0 } }],
  ])('frees the pile at once when %s', async (_, change) => {
    const { done, arrive } = await land(change);
    expect(done).toBe(true);
    expect(arrive).toHaveBeenCalledWith('p', []);
  });

  it('frees the pile for a file that will not load', async () => {
    loads = () => Promise.reject(new Error('no file'));
    const { MapEngine } = await import('./index');
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      boats: new Map(),
      boatsAsked: new Set(),
    }) as unknown as { boatsOfFile: (url: string) => unknown };
    expect(engine.boatsOfFile('bad.glb')).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve));
    expect(engine.boatsOfFile('bad.glb')).toEqual({ boats: [], astern: 0 });
  });

  it('waits for the coast, asking for it, before it reads the water edge', async () => {
    const { done, arrive, loadCoast } = await land({ coast: null });
    expect(done).toBe(false);
    expect(loadCoast).toHaveBeenCalledTimes(1);
    expect(arrive).not.toHaveBeenCalled();
  });

  it('leaves a ring of ink where the sequence did not play, under the rule of the other settings', async () => {
    expect((await land({ roomFor: 0 })).inkArrival).toHaveBeenCalledWith('p');
  });
});
