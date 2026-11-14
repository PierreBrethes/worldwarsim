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
    men = ['p/0'],
    empty = [] as string[],
  } = {}) => {
    const { MapEngine } = await import('./index');
    const arrive = vi.fn();
    const inkArrival = vi.fn();
    const loadCoast = vi.fn();
    const play = vi.fn((..._args: unknown[]) => true);
    const squad = { at: new Vector3(), front: new Vector3(1, 0, 0), men: [new Vector3(1, 0, 1)] };
    const box = { getSize: (v: Vector3) => v.set(1, 2, 1) };
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      standing: {
        piecesOf: () => ({ groups: [{ role: 'infantry' }, { role: 'cargo' }] }),
        pieceOf: () => ({ box, url: 'cargo.glb' }),
        placeOf: (id: string) => (empty.includes(id) ? { ...squad, men: [] } : squad),
        anchor: () => {},
        frameOf: () => new Matrix4(),
        arrive,
        inkArrival,
      },
      sequences: { motion, roomFor: () => roomFor, playsOn: () => false, play },
      veiled: () => false,
      seenBig: () => true,
      landAt: () => true,
      coast,
      loadCoast,
      frame: { lonLatAt: () => [0, 0], centerX: 0, centerY: 0 },
      boatsOfFile: () => file,
    }) as unknown as { landOnBeach: (l: unknown, now: number) => boolean };
    const done = engine.landOnBeach({ cue: { ...cue(), men } }, 0);
    return { done, arrive, inkArrival, loadCoast, play };
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
    expect(engine.boatsOfFile('bad.glb')).toEqual({ boats: [], astern: 0, beam: 0 });
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

  it('plays each squad that has men on its own sequence when another has none', async () => {
    const { done, play } = await land({ men: ['p/0', 'p/2'], empty: ['p/0'] });
    expect(done).toBe(true);
    expect(play.mock.calls.map((call) => (call as unknown[])[1])).toEqual(['p/1', 'p/2']);
  });
});

/** **The barge carries the first vehicle ashore** (#511): what `landOnBeach` plays beside the boats,
 *  and what it leaves to the pile when the barge cannot play. */
describe('landOnBeach with a vehicle (#511)', () => {
  const boom = {
    n: 1,
    length: 12,
    pivot: [0.6, 6.5, -31] as const,
    rest: { yaw: 0, lift: 0.43 },
    hatch: { at: [0, 5.2, -37.9] as const, rim: 5.2 },
  };
  const land = async ({
    roomFor = 8,
    booms = [boom] as ReadonlyArray<typeof boom> | null,
    motion = 'full' as MapMotion,
    veiled = false,
    vehicles = ['p/2'],
    roles = ['infantry', 'cargo', 'armor', 'armor'],
    refuses = false,
  } = {}) => {
    const { MapEngine } = await import('./index');
    const arrive = vi.fn();
    const inkArrival = vi.fn();
    const retime = vi.fn();
    const play = vi.fn(
      (_host: unknown, _id: string, ..._rest: unknown[]) => !refuses || play.mock.calls.length < 3,
    );
    const layBarge = vi.fn();
    const clearBarge = vi.fn();
    const layHoist = vi.fn();
    const clearHoist = vi.fn();
    const playsOn = vi.fn(() => refuses);
    const boomsOf = vi.fn(() => booms);
    const squad = { at: new Vector3(), front: new Vector3(1, 0, 0), men: [new Vector3(1, 0, 1)] };
    const tank = { at: new Vector3(40, 0, 10), front: new Vector3(0, 0, 1), men: [] };
    const box = { getSize: (v: Vector3) => v.set(2, 2, 6) };
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      standing: {
        piecesOf: () => ({ groups: roles.map((role) => ({ role })) }),
        pieceOf: () => ({ box, url: 'cargo.glb' }),
        placeOf: (id: string) =>
          id === 'p/0' ? squad : id === 'p/1' ? { at: new Vector3() } : tank,
        anchor: () => {},
        frameOf: () => new Matrix4(),
        arrive,
        inkArrival,
      },
      sequences: { motion, roomFor: () => roomFor, playsOn, play, retime },
      barges: { lay: layBarge, clear: clearBarge },
      hoists: { lay: layHoist, clear: clearHoist },
      gangplanks: { clear: () => {} },
      unloading: [] as unknown[],
      veiled: () => veiled,
      seenBig: () => true,
      landAt: () => true,
      coast: {},
      loadCoast: () => {},
      frame: { lonLatAt: () => [0, 0], centerX: 0, centerY: 0 },
      boatsOfFile: () => ({
        boats: [{ node: 'boat_left' as const, rest: [7, 1, -3] as const }],
        astern: -90,
        beam: 8,
      }),
      boomsOf,
    }) as unknown as {
      landOnBeach: (l: unknown, now: number) => boolean;
      clearUnloaded: (now: number) => void;
    };
    const done = engine.landOnBeach({ cue: { ...cue(), vehicles } }, 0);
    return {
      done,
      arrive,
      inkArrival,
      retime,
      play,
      layBarge,
      clearBarge,
      layHoist,
      clearHoist,
      playsOn,
      boomsOf,
      engine,
    };
  };
  const ids = (play: { mock: { calls: unknown[][] } }) => play.mock.calls.map((call) => call[1]);

  it('plays the vehicle with the men and the hull, lays the craft and its cables, and holds the pile for the longest', async () => {
    const { done, play, layBarge, layHoist, arrive } = await land();
    expect(done).toBe(true);
    // One sequence for the hull, the boats and the masts together (#510), then the squad, the vehicle.
    expect(ids(play)).toEqual(['p/1', 'p/0', 'p/2']);
    expect(layBarge).toHaveBeenCalledTimes(1);
    expect(layHoist).toHaveBeenCalledTimes(1);
    const [, plan] = layBarge.mock.calls[0]!;
    expect(arrive.mock.calls[0]![1][0]).toBeGreaterThanOrEqual((plan as { ms: number }).ms);
  });

  it('carries one vehicle only: the others stand at once', async () => {
    const { play } = await land({ vehicles: ['p/2', 'p/3'] });
    expect(ids(play)).toEqual(['p/1', 'p/0', 'p/2']);
  });

  it('plays the barge alone, without a mast read, for a cargo with no vehicle a mast can lift', async () => {
    const { play, layBarge, boomsOf } = await land({ roles: ['infantry', 'cargo', 'escort'] });
    expect(ids(play)).toEqual(['p/1', 'p/0']);
    expect(layBarge).not.toHaveBeenCalled();
    expect(boomsOf).not.toHaveBeenCalled();
  });

  it('waits while the masts are not read', async () => {
    const { done, play, arrive } = await land({ booms: null });
    expect(done).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(arrive).not.toHaveBeenCalled();
  });

  it('leaves the vehicle where the pile stands it when the file has no mast', async () => {
    const { play, layBarge } = await land({ booms: [] });
    expect(ids(play)).toEqual(['p/1', 'p/0']);
    expect(layBarge).not.toHaveBeenCalled();
  });

  it.each([
    ['the pool is full', { roomFor: 0 }],
    ['the motion is reduced', { motion: 'reduced' as MapMotion }],
    ['the motion is cut', { motion: 'off' as MapMotion }],
    ['the pile is under a combat', { veiled: true }],
  ])('plays no barge and stands the pile at once when %s', async (_, change) => {
    const { done, play, layBarge, layHoist, arrive } = await land(change);
    expect(done).toBe(true);
    expect(play).not.toHaveBeenCalled();
    expect(layBarge).not.toHaveBeenCalled();
    expect(layHoist).not.toHaveBeenCalled();
    expect(arrive).toHaveBeenCalledWith('p', []);
  });

  it('cuts what plays when the vehicle will not, lays nothing, and frees the pile', async () => {
    const { done, retime, layBarge, layHoist, arrive } = await land({ refuses: true });
    expect(done).toBe(true);
    expect(retime).toHaveBeenCalled();
    expect(layBarge).not.toHaveBeenCalled();
    expect(layHoist).not.toHaveBeenCalled();
    expect(arrive).toHaveBeenCalledWith('p', []);
  });

  it('takes the craft and the cables away once nothing plays, not before', async () => {
    const { engine, playsOn, clearBarge, clearHoist } = await land();
    playsOn.mockReturnValue(true);
    engine.clearUnloaded(1);
    expect(clearBarge).not.toHaveBeenCalled();
    playsOn.mockReturnValue(false);
    engine.clearUnloaded(1);
    expect(clearBarge).toHaveBeenCalledWith('p/1');
    expect(clearHoist).toHaveBeenCalledWith('p/1');
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
      barges: { clear: () => {} },
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
    ids = ['p/+t1'],
    bare = false,
    empty = [] as string[],
    riders = embark.riders,
  } = {}) => {
    const { MapEngine } = await import('./index');
    const arrive = vi.fn();
    const inkArrival = vi.fn();
    const unboard = vi.fn();
    const board = vi.fn((..._args: unknown[]) => ids);
    const loadCoast = vi.fn();
    const play = vi.fn(() => true);
    const squad = { at: new Vector3(), front: new Vector3(1, 0, 0), men: [new Vector3(1, 0, 1)] };
    const box = { getSize: (v: Vector3) => v.set(1, 2, 1) };
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      standing: {
        piecesOf: () => ({ groups: [{ role: 'infantry' }, { role }] }),
        pieceOf: () => (bare ? {} : { box, url: 'cargo.glb' }),
        placeOf: (id: string) => (empty.includes(id) ? { ...squad, men: [] } : squad),
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
    const started = engine.startBeachBoarding({ ...embark, riders }, 0);
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

  it('poses a carrier at once, without waiting for its box and file to be drawn', async () => {
    expect((await start({ role: 'carrier', bare: true })).started).toBeNull();
    expect((await start({ bare: true })).started).toBe('wait');
  });

  it('plays two squads with one canot, feeds each when through, and unboards every man it drew', async () => {
    const riders = [
      { troopId: 't1', role: 'infantry' as const, figures: [1 as const] },
      { troopId: 't3', role: 'infantry' as const, figures: [1 as const] },
    ];
    const { started, play, unboard } = await start({ ids: ['p/+t1', 'p/+t3'], riders });
    if (started === null || started === 'wait') throw new Error('expected a boarding');
    // The cargo and the two squads play together; the second has no boat of its own.
    expect(play).toHaveBeenCalledTimes(3);
    // The squad past the boat goes aboard when the boat first grounds, before the other is in.
    expect(started.feeds.map(({ riders: who }) => who)).toEqual([['t3'], ['t1']]);
    expect(started.feeds[0]!.at).toBeLessThan(started.feeds[1]!.at);
    expect(started.feeds[1]!.at).toBeLessThanOrEqual(started.ms);
    expect(started.over()).toBe(true);
    started.end();
    expect(unboard).toHaveBeenCalledWith('p/+t1');
    expect(unboard).toHaveBeenCalledWith('p/+t3');
  });

  it('keeps each squad to its own sequence and feed when one drawn squad has no man', async () => {
    const riders = ['t1', 't2', 't3'].map((troopId) => ({
      troopId,
      role: 'infantry' as const,
      figures: [1 as const],
    }));
    const { started, play } = await start({
      ids: ['p/+t1', 'p/+t2', 'p/+t3'],
      empty: ['p/+t1'],
      riders,
    });
    if (started === null || started === 'wait') throw new Error('expected a boarding');
    const ids = play.mock.calls.map((call) => (call as unknown[])[1]);
    expect(ids).toEqual(['p/1', 'p/+t2', 'p/+t3']);
    expect(started.feeds.find(({ riders: who }) => who[0] === 't1')!.at).toBe(0);
    const through = started.feeds.filter(({ at }) => at > 0).map(({ riders: who }) => who[0]);
    expect(through).toEqual(['t3', 't2']);
  });
});
