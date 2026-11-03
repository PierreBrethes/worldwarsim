import { describe, expect, it } from 'vitest';
import {
  type Docked,
  dockedOf,
  joinedOf,
  LOADING_WAIT_MS,
  mayDock,
  quayTaken,
  stillWaiting,
  undock,
} from './docks';
import type { Sequence, SequenceHost } from './sequences';

type Point = readonly [number, number, number];

// The warehouse of `loading.test.ts`: its quay faces +z, the truck stands at the gable.
const rank: Point = [-20, 0, 34];
const plan: Docked['plan'] = {
  rank,
  rankFront: [0, 0, 1],
  length: 6.5,
  box: { min: [-30, 0, -20], max: [30, 10, 24.2] },
  quay: { stop: [0, 0, 23.5], front: [0, 0, 1] },
  perron: {
    crates: [
      { name: 'caisse_4', at: [-4.975, 2.4, 21.5] },
      { name: 'caisse_5', at: [-3.725, 2.4, 21.5] },
    ],
    inside: [0, 1.2, 17],
    door: [0, 1.2, 20.4],
    top: 1.2,
  },
  crates: [0, 0],
  toBoard: ([x, y, z]) => [x - rank[0], y - rank[1], z - rank[2]],
};

const truckHost = { name: 'standing' } as unknown as SequenceHost;
const siteHost = { name: 'maquettes' } as unknown as SequenceHost;
const hosts = { truck: truckHost, site: siteHost };

/** A layer that plays what it is told, and ends what is retimed to nothing. */
function layerOf(playing: Array<[SequenceHost, string]>) {
  const retimed: Array<[SequenceHost, string, number]> = [];
  return {
    retimed,
    playsOn: (host: SequenceHost, id: string) =>
      playing.some(([h, playingId]) => h === host && playingId === id),
    retime: (host: SequenceHost, id: string, sequence: Sequence) => {
      retimed.push([host, id, sequence.ms]);
      return true;
    },
  };
}

describe('the quays of a loading (#271)', () => {
  const { docked: entry } = dockedOf(plan, 'w', 0);

  it('ends the site when the truck ends before it, and forgets the truck', () => {
    const docked = new Map([['g', entry]]);
    const layer = layerOf([[siteHost, 'w']]);
    undock(docked, layer, hosts, 1000);
    expect(layer.retimed).toEqual([[siteHost, 'w', 0]]);
    expect(docked.size).toBe(0);
  });

  it('ends the truck when its site ends before its own end', () => {
    const docked = new Map([['g', entry]]);
    const layer = layerOf([[truckHost, 'g']]);
    undock(docked, layer, hosts, 1000);
    expect(layer.retimed).toEqual([[truckHost, 'g', 0]]);
  });

  it('lets the truck drive home alone once its site is done', () => {
    const docked = new Map([['g', entry]]);
    const layer = layerOf([[truckHost, 'g']]);
    undock(docked, layer, hosts, entry.siteMs + 10);
    expect(layer.retimed).toEqual([]);
    expect(docked.size).toBe(1);
  });

  it('starts only with room for both, both seen', () => {
    expect(mayDock(2, true, true)).toBe(true);
    expect(mayDock(1, true, true)).toBe(false);
    expect(mayDock(2, false, true)).toBe(false);
    expect(mayDock(2, true, false)).toBe(false);
  });

  it('holds a quay until its truck backs into its place, and that quay only', () => {
    const docked = new Map([['g', entry]]);
    expect(quayTaken(docked, 'w', entry.homeAt - 10)).toBe(true);
    expect(quayTaken(docked, 'other', 10)).toBe(false);
    expect(quayTaken(docked, 'w', entry.homeAt)).toBe(false);
  });

  it('joins a second load while the tailgate is down, not once it starts up', () => {
    const one = dockedOf({ ...plan, crates: [0] }, 'w', 0).docked;
    const joined = joinedOf(one, 1, one.gateUp - 200);
    expect(joined?.docked.plan.crates).toHaveLength(2);
    expect(joined!.docked.gateUp).toBeGreaterThan(one.gateUp);
    expect(joinedOf(one, 1, one.gateUp)).toBeNull();
  });

  it('plays three trucks of one quay one after the other', () => {
    const docked = new Map<string, Docked>();
    const ends = new Map<string, number>();
    const started: Array<[string, number]> = [];
    let loadings = ['a', 'b', 'c'].map((groupId) => ({ groupId, since: 0 }));
    for (let now = 0; now < 60_000; now += 100) {
      loadings = stillWaiting(loadings, now, ({ groupId }) => {
        if (quayTaken(docked, 'w', now)) return 'queued';
        const laid = dockedOf(plan, 'w', now);
        docked.set(groupId, laid.docked);
        ends.set(groupId, now + laid.truck.ms);
        started.push([groupId, now]);
        return 'done';
      });
      const playing = [...ends].filter(([, end]) => now < end);
      undock(
        docked,
        layerOf([
          ...playing.map(([id]): [SequenceHost, string] => [truckHost, id]),
          ...[...docked.values()]
            .filter(({ since, siteMs }) => now - since < siteMs)
            .map((): [SequenceHost, string] => [siteHost, 'w']),
        ]),
        hosts,
        now,
      );
    }
    expect(started.map(([id]) => id)).toEqual(['a', 'b', 'c']);
    // The next leaves its place as the one before backs into its own.
    expect(started[1]![1]).toBeLessThanOrEqual(entry.homeAt + 100);
    expect(started[2]![1]).toBeGreaterThan(LOADING_WAIT_MS);
  });
});
