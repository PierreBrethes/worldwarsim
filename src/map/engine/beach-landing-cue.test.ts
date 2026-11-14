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
      debarkations: [] as unknown[],
    }) as unknown as { cue: (cue: unknown) => void; debarkations: unknown[] };
    engine.cue(cue(ground));
    return { inkArrival, expectPile, queued: engine.debarkations.length };
  };

  it.each(['beach', 'quay'] as const)(
    'queues the sequence of a %s at full motion, holding the pile',
    async (ground) => {
      const { queued, expectPile, inkArrival } = await play('full', ground);
      expect(queued).toBe(1);
      expect(expectPile).toHaveBeenCalledWith('p');
      expect(inkArrival).not.toHaveBeenCalled();
    },
  );

  it('lays a ring of ink under the pile at reduced motion, but nothing under a combat or cut', async () => {
    for (const ground of ['beach', 'quay'] as const) {
      const { inkArrival, queued } = await play('reduced', ground);
      expect(inkArrival, ground).toHaveBeenCalledWith('p');
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

/** **A cargo's men and vehicles come off at a quay** (#512): what `landAtQuay` plays, and when it
 *  frees the pile instead, with its ring of ink. */
describe('landAtQuay (#512)', () => {
  const boom = {
    n: 1,
    length: 12,
    pivot: [0.6, 6.5, 27.8] as const,
    rest: { yaw: 0, lift: 0.43 },
    hatch: { at: [0, 5.2, 35.65] as const, rim: 5.2 },
  };
  const quay = (vehicles: string[]) => ({
    kind: 'debarquement' as const,
    hull: 'p/1',
    carrierId: 'h',
    ground: 'quay' as const,
    men: ['p/0'],
    vehicles,
  });
  const land = async ({
    vehicles = ['p/2'],
    roomFor = 8,
    post = 'mole' as string | null,
    booms = [boom] as ReadonlyArray<typeof boom> | null,
    refuses = false,
  } = {}) => {
    const { MapEngine } = await import('./index');
    const arrive = vi.fn();
    const inkArrival = vi.fn();
    const retime = vi.fn();
    const play = vi.fn(
      (_host: unknown, _id: string, ..._rest: unknown[]) => !refuses || play.mock.calls.length < 2,
    );
    const layPlank = vi.fn();
    const layHoist = vi.fn();
    const clearPlank = vi.fn();
    const clearHoist = vi.fn();
    const playsOn = vi.fn(() => true);
    const box = { getSize: (v: Vector3) => v.set(2, 2, 6) };
    const squad = {
      at: new Vector3(30, 2.7, 99),
      front: new Vector3(1, 0, 0),
      men: [new Vector3(30, 2.7, 99)],
    };
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      standing: {
        piecesOf: () => ({ groups: [{ role: 'infantry' }, { role: 'cargo' }, { role: 'armor' }] }),
        pieceOf: () => ({ box, url: 'cargo.glb' }),
        placeOf: (id: string) => (id === 'p/1' ? { at: new Vector3() } : squad),
        restOf: () => ({ site: 's' }),
        postOf: () => post,
        markOf: (_: string, name: string) =>
          name === 'fx_passerelle' ? new Vector3(66, 3.6, 118) : new Vector3(47, 3.6, 118),
        frameOf: () => new Matrix4(),
        anchor: () => {},
        arrive,
        inkArrival,
      },
      maquettes: {
        siteOf: () => ({ toModel: (v: Vector3) => v.clone(), toBoard: (v: Vector3) => v.clone() }),
      },
      sequences: { motion: 'full', roomFor: () => roomFor, playsOn, play, retime },
      gangplanks: { lay: layPlank, clear: clearPlank },
      hoists: { lay: layHoist, clear: clearHoist },
      unloading: [] as unknown[],
      veiled: () => false,
      seenBig: () => true,
      boomsOf: () => booms,
    }) as unknown as {
      landAtQuay: (l: unknown, now: number) => boolean;
      clearUnloaded: (now: number) => void;
    };
    const done = engine.landAtQuay({ cue: quay(vehicles) }, 0);
    return {
      done,
      arrive,
      inkArrival,
      retime,
      play,
      layPlank,
      layHoist,
      engine,
      playsOn,
      clearPlank,
      clearHoist,
    };
  };

  it('plays the men down the gangway, the vehicles off by the derrick and its masts, and holds the pile for the longest', async () => {
    const { done, arrive, play, layPlank, layHoist, inkArrival } = await land();
    expect(done).toBe(true);
    expect(play.mock.calls.map(([, id]) => id)).toEqual(['p/0', 'p/2', 'p/1']);
    expect(arrive).toHaveBeenCalledTimes(1);
    expect(arrive.mock.calls[0]![1]).toHaveLength(1);
    expect(arrive.mock.calls[0]![1][0]).toBeGreaterThan(0);
    expect(layPlank).toHaveBeenCalledTimes(1);
    expect(layHoist).toHaveBeenCalledTimes(1);
    expect(inkArrival).not.toHaveBeenCalled();
  });

  it('plays the men alone, without a mast, when no vehicle comes off', async () => {
    const { play, layHoist, layPlank } = await land({ vehicles: [] });
    expect(play.mock.calls.map(([, id]) => id)).toEqual(['p/0']);
    expect(layPlank).toHaveBeenCalledTimes(1);
    expect(layHoist).not.toHaveBeenCalled();
  });

  it.each([
    ['the pool is full', { roomFor: 0 }],
    ['the hull is not at the mole', { post: 'side' }],
  ])('frees the pile at once, with its ring of ink, when %s', async (_, change) => {
    const { done, arrive, inkArrival, play } = await land(change);
    expect(done).toBe(true);
    expect(play).not.toHaveBeenCalled();
    expect(arrive).toHaveBeenCalledWith('p', []);
    expect(inkArrival).toHaveBeenCalledWith('p');
  });

  it('cuts what already plays when a piece will not, and frees the pile', async () => {
    const { done, arrive, retime, inkArrival } = await land({ refuses: true });
    expect(done).toBe(true);
    expect(retime).toHaveBeenCalled();
    expect(arrive).toHaveBeenCalledWith('p', []);
    expect(inkArrival).toHaveBeenCalledWith('p');
  });

  it.each([
    ['the hull has no post yet', { post: null }],
    ['the masts are not read yet', { booms: null }],
  ])('waits, holding the pile, while %s', async (_, change) => {
    const { done, arrive, play } = await land(change);
    expect(done).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(arrive).not.toHaveBeenCalled();
  });

  it('takes the plank and the cables away once nothing plays, the plank only when the men were cut short', async () => {
    const early = await land();
    early.playsOn.mockReturnValue(true);
    early.engine.clearUnloaded(1);
    expect(early.clearPlank).not.toHaveBeenCalled();
    expect(early.clearHoist).not.toHaveBeenCalled();
    early.playsOn.mockReturnValue(false);
    early.engine.clearUnloaded(1);
    expect(early.clearPlank).toHaveBeenCalledWith('p/1');
    expect(early.clearHoist).toHaveBeenCalledWith('p/1');
    const late = await land();
    late.playsOn.mockReturnValue(false);
    late.engine.clearUnloaded(1e9);
    // The sequence ran its course: the plank is taken in by itself.
    expect(late.clearPlank).not.toHaveBeenCalled();
    expect(late.clearHoist).toHaveBeenCalledWith('p/1');
  });
});

/** **A cargo's men go back aboard before a beach** (#510): what `startBeachBoarding` plays, what it
 *  feeds the tag and when, and how it lets the pile stand when the boats cannot play. */
describe('startBeachBoarding (#510)', () => {
  const embark = {
    kind: 'embarquement' as const,
    hull: 'p/1',
    carrierId: 'h',
    ground: 'beach' as const,
    riders: [
      { troopId: 't1', role: 'infantry' as const, figures: [1 as const] },
      { troopId: 't2', role: 'armor' as const, figures: [1 as const] },
    ],
  };
  const start = async ({
    roomFor = 8,
    file = { boats: [{ node: 'boat_left' as const, rest: [1, 1, -3] as const }], astern: -9 } as {
      boats: unknown[];
      astern: number;
    } | null,
    coast = {} as object | null,
    motion = 'full' as MapMotion,
    role = 'cargo',
    veiled = false,
  } = {}) => {
    const { MapEngine } = await import('./index');
    const arrive = vi.fn();
    const inkArrival = vi.fn();
    const unboard = vi.fn();
    const board = vi.fn((..._args: unknown[]) => ['p/+t1']);
    const loadCoast = vi.fn();
    const play = vi.fn(() => true);
    const squad = { at: new Vector3(), front: new Vector3(1, 0, 0), men: [new Vector3(1, 0, 1)] };
    const box = { getSize: (v: Vector3) => v.set(1, 2, 1) };
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      standing: {
        piecesOf: () => ({ groups: [{ role: 'infantry' }, { role }] }),
        pieceOf: () => ({ box, url: 'cargo.glb' }),
        placeOf: () => squad,
        anchor: () => {},
        frameOf: () => new Matrix4(),
        lastSeen: () => ({ at: new Vector3(), heading: 0 }),
        board,
        unboard,
        arrive,
        inkArrival,
      },
      arcs: { fileLeftBy: () => null },
      hullDrawn: new WeakMap(),
      sequences: { motion, roomFor: () => roomFor, playsOn: () => false, play, retime: () => {} },
      veiled: () => veiled,
      seenBig: () => true,
      landAt: () => true,
      coast,
      loadCoast,
      frame: { lonLatAt: () => [0, 0], centerX: 0, centerY: 0 },
      boatsOfFile: () => file ?? undefined,
    }) as unknown as {
      startBeachBoarding: (
        cue: typeof embark,
        now: number,
      ) =>
        | 'wait'
        | null
        | { ms: number; feeds: { at: number; riders: string[] }[]; over(): boolean; end(): void };
    };
    const started = engine.startBeachBoarding(embark, 0);
    return { started, arrive, inkArrival, unboard, board, loadCoast, play };
  };

  it('plays the boats and the men together, and feeds the tag as the squad is through', async () => {
    const { started, arrive, play, board } = await start();
    if (started === null || started === 'wait') throw new Error('expected a boarding');
    // Only the men are drawn: the vehicle (armor) is posed at once, as at a quay before #505.
    expect(board.mock.calls[0]![1]).toHaveLength(1);
    expect(play).toHaveBeenCalledTimes(2);
    expect(arrive).toHaveBeenCalledWith('p', [started.ms]);
    expect(started.feeds[0]).toEqual({ at: 0, riders: ['t2'] });
    expect(started.feeds[1]!.riders).toEqual(['t1']);
    expect(started.feeds[1]!.at).toBeGreaterThan(0);
    expect(started.feeds[1]!.at).toBeLessThan(started.ms);
  });

  it('waits for the file and the coast, asking for the coast once', async () => {
    expect((await start({ file: null })).started).toBe('wait');
    const { started, loadCoast } = await start({ coast: null });
    expect(started).toBe('wait');
    expect(loadCoast).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the pool is full', { roomFor: 0 }],
    ['the file hangs no boat', { file: { boats: [], astern: 0 } }],
    ['the pile is under a combat', { veiled: true }],
  ])('draws no one, and stands as it is, when %s', async (_, change) => {
    const { started, unboard, play } = await start(change);
    expect(started).toBeNull();
    expect(unboard).toHaveBeenCalledWith('p/+t1');
    expect(play).not.toHaveBeenCalled();
  });

  it('leaves a ring of ink where the boats did not play, but not for a carrier or when veiled', async () => {
    expect((await start({ roomFor: 0 })).inkArrival).toHaveBeenCalledWith('p');
    expect((await start({ veiled: true })).inkArrival).not.toHaveBeenCalled();
    const carrier = await start({ role: 'carrier' });
    expect(carrier.started).toBeNull();
    expect(carrier.inkArrival).not.toHaveBeenCalled();
    expect(carrier.board).not.toHaveBeenCalled();
  });
});
