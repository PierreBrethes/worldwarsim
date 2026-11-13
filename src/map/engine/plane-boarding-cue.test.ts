import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { MapMotion } from '@/domain/map-motion';

/** #502 : les hommes montent en avion sous les yeux, par le chemin du signal `montee`. */
describe('a plane boarding cue (#502)', () => {
  const rider = (troopId: string) => ({ troopId, figures: [1 as const] });
  const cue = (carrier: 'airTransport' | 'landTransport' = 'airTransport') => ({
    kind: 'montee' as const,
    truck: 'p/0',
    carrier,
    carrierId: 'plane',
    riders: [rider('a'), rider('b')],
  });
  const FRENCH = { hinge: [0.69, 3.1, -5.94], foot: [2.18, -6.34], pitch: 0 } as const;

  async function engineOf({
    motion = 'full' as MapMotion,
    room = 8,
    rig = { rig: FRENCH, metre: 0.01 } as unknown,
    file = { hinge: FRENCH.hinge, foot: FRENCH.foot } as unknown,
  } = {}) {
    const { MapEngine } = await import('./index');
    const played: string[] = [];
    const arrive = vi.fn();
    const unboard = vi.fn();
    const inkArrival = vi.fn();
    const add = vi.fn();
    const onBoarded = vi.fn();
    const stands = (x: number) => ({
      at: new Vector3(x, 0, 0),
      front: new Vector3(0, 0, 1),
      men: [new Vector3(x, 0, 0.2)],
    });
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      invalidate: () => {},
      boardings: [] as unknown[],
      planks: [] as unknown[],
      inkDue: [] as Array<{ at: number; run: () => void }>,
      onBoarded,
      planeFiles: new Map([['plane.glb', file]]),
      veiled: () => false,
      seenWhole: () => true,
      arcs: { fileLeftBy: () => null },
      sequences: {
        motion,
        room,
        play: (_host: unknown, id: string) => (played.push(id), true),
        retime: vi.fn(),
      },
      standing: {
        expect: vi.fn(),
        group: { add },
        placeOf: (id: string) => (id === 'p/0' ? stands(0.3) : stands(0.1)),
        lengthOf: () => 0.1,
        stepOf: () => 0.03,
        pieceOf: () => ({
          url: 'plane.glb',
          box: { getSize: (to: Vector3) => to.set(0.01, 0.0175, 0.01) },
        }),
        rigOf: () => rig,
        lastSeen: () => ({ at: new Vector3(), heading: 0 }),
        board: (_pile: string, riders: Array<{ troopId: string }>) =>
          riders.map(({ troopId }) => `p/+${troopId}`),
        unboard,
        arrive,
        inkArrival,
      },
    });
    const run = engine as unknown as {
      cue(cue: unknown): void;
      boardings: Array<{ cue: unknown; since: number }>;
      boardOf(boarding: unknown, now: number): boolean;
      planks: unknown[];
      inkDue: Array<{ at: number; run: () => void }>;
    };
    return { run, played, arrive, unboard, inkArrival, add, onBoarded };
  }

  it('queues the boarding of a plane as of a truck, and holds its pile', async () => {
    const { run, onBoarded } = await engineOf();
    run.cue(cue());
    expect(run.boardings).toHaveLength(1);
    expect(onBoarded).not.toHaveBeenCalled();
  });

  it('feeds the tag at once when motion is cut: the pose is final', async () => {
    const { run, onBoarded } = await engineOf({ motion: 'off' });
    run.cue(cue());
    expect(run.boardings).toHaveLength(0);
    expect(onBoarded).toHaveBeenCalledWith('plane', ['a', 'b']);
  });

  it('feeds nothing for a truck: its tag is never kept', async () => {
    const { run, onBoarded } = await engineOf({ motion: 'off' });
    run.cue(cue('landTransport'));
    expect(onBoarded).not.toHaveBeenCalled();
  });

  it('plays the plane and each squad, draws a plank, and feeds the tag once the door is shut', async () => {
    const { run, played, arrive, add, onBoarded } = await engineOf();
    run.cue(cue());
    expect(run.boardOf(run.boardings[0], 1000)).toBe(true);
    expect(played).toEqual(['p/+a', 'p/+b', 'p/0']);
    expect(add).toHaveBeenCalledTimes(1);
    expect(run.planks).toHaveLength(1);
    const settled = arrive.mock.calls[0]![1][0] as number;
    expect(settled).toBeGreaterThan(2000);
    // « 0/2 » while they climb, « 2/2 » at the end.
    expect(onBoarded).not.toHaveBeenCalled();
    const due = run.inkDue.find(({ at }) => at === 1000 + settled)!;
    due.run();
    expect(onBoarded).toHaveBeenCalledWith('plane', ['a', 'b']);
  });

  it("waits while the plane's model has not landed: no door to read", async () => {
    const { run, played } = await engineOf({ rig: null });
    run.cue(cue());
    expect(run.boardOf(run.boardings[0], 1000)).toBe(false);
    expect(played).toEqual([]);
  });

  it('waits for the file of the plane to be read', async () => {
    const { run, played } = await engineOf({ file: null });
    run.cue(cue());
    expect(run.boardOf(run.boardings[0], 1000)).toBe(false);
    expect(played).toEqual([]);
  });

  it('stands the plane at once, tag fed, when the pool has no room for its men', async () => {
    const { run, played, unboard, arrive, onBoarded } = await engineOf({ room: 2 });
    run.cue(cue());
    expect(run.boardOf(run.boardings[0], 1000)).toBe(true);
    expect(played).toEqual([]);
    expect(unboard).toHaveBeenCalledTimes(2);
    expect(arrive).toHaveBeenCalledWith('p', []);
    expect(onBoarded).toHaveBeenCalledWith('plane', ['a', 'b']);
  });

  it('lays a ring of ink and feeds the tag at reduced motion, playing nothing', async () => {
    const { run, played, inkArrival, onBoarded, add } = await engineOf({ motion: 'reduced' });
    run.cue(cue());
    expect(run.boardOf(run.boardings[0], 1000)).toBe(true);
    expect(played).toEqual([]);
    expect(add).not.toHaveBeenCalled();
    expect(inkArrival).toHaveBeenCalledWith('p');
    expect(onBoarded).toHaveBeenCalledWith('plane', ['a', 'b']);
  });
});
