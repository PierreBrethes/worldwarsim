import { describe, expect, it } from 'vitest';
import { AIRFIELD } from '@/emblems/kits/manifest';
import type { Sequence } from './sequences';
import { type Departure, type LightHost, Runways } from './runway';
import { UNDOCK_STAGGER_MS, undockLead } from './site-ways';

const [RIGHT, LEFT] = AIRFIELD.lanes as [number, number];
const SITE = 'building-airfield@2,48';

/** A host that plays whatever it is given, and says whether lights are on already. */
const host = (on: boolean, played: Array<Sequence<'airfield'>> = []): LightHost => ({
  playing: () => on,
  play: (sequence) => {
    played.push(sequence);
    return true;
  },
});

const plane = (arcId: string, since: number, x = RIGHT, z = 60): Departure => ({
  arcId,
  site: SITE,
  post: null,
  since,
  plane: { x, z, align: 4000, free: 10000 },
});

describe("the airfield's lights across orders (#478)", () => {
  it('stay on to the end of a plane ordered 5 s after, and never shorten', () => {
    const played: Array<Sequence<'airfield'>> = [];
    const runways = new Runways();
    runways.lightUp(SITE, 0, 10000, [], host(false, played));
    expect(played).toHaveLength(1);
    runways.lightUp(SITE, 5000, 15000, [], host(true, played));
    expect(played).toHaveLength(1);
    expect(played[0]!.ms).toBe(15000);
    runways.lightUp(SITE, 6000, 8000, [], host(true, played));
    expect(played[0]!.ms).toBe(15000);
  });

  it('open the doors of a formation cued while they burn, at its own time', () => {
    const played: Array<Sequence<'airfield'>> = [];
    const runways = new Runways();
    runways.lightUp(SITE, 0, 10000, [], host(false, played));
    runways.lightUp(SITE, 6000, 16000, [{ lane: LEFT, open: () => 1 }], host(true, played));
    const shift = (t: number) => played[0]!.at(t).porte_gauche_1_b?.shift?.[0] ?? 0;
    expect(shift(5000)).toBe(0);
    expect(shift(7000)).toBeGreaterThan(0);
  });

  it('are forgotten once their end has passed', () => {
    const runways = new Runways();
    runways.lightUp(SITE, 0, 10000, [], host(false));
    runways.purge(9000);
    expect(runways.litSites).toEqual([SITE]);
    runways.purge(10000);
    expect(runways.litSites).toEqual([]);
  });
});

describe('the runway across orders (#478)', () => {
  it('holds a plane that comes after one still on it, until it is free', () => {
    const runways = new Runways();
    runways.landed(SITE, 0, 9000);
    const mine = { ...plane('b', 2000).plane!, since: 2000 };
    // On the runway at 2 s + lead + 4 s: the plane that landed leaves it at 9 s.
    expect(runways.takeoffLead(SITE, mine, [])?.lead).toBe(3000);
    expect(runways.landingLead(SITE, 2000, [], { align: 4000, free: 8000 })).toBe(3000);
    runways.purge(9000);
    expect(runways.takeoffLead(SITE, mine, [])?.lead).toBe(0);
  });

  it('holds a plane for one that took off, and counts one of its own queue once', () => {
    const runways = new Runways();
    const first = plane('a', 0);
    runways.depart(first, 0, () => true);
    const mine = { ...plane('b', 100, LEFT).plane!, since: 100 };
    expect(runways.takeoffLead(SITE, mine, runways.others('b', SITE, []))?.lead).toBe(6000);
    const later = { ...mine, since: 3000 };
    expect(runways.takeoffLead(SITE, later, runways.others('b', SITE, []))?.lead).toBe(3000);
  });

  it('records no departure and holds no runway for a plane that does not play', () => {
    const runways = new Runways();
    expect(runways.depart(plane('a', 0), 0, () => false)).toBe(false);
    expect(runways.others('b', SITE, [])).toEqual([]);
    expect(runways.busyFor(SITE, 0, false)).toBe(0);
    expect(runways.depart(plane('a', 0), 0, () => true)).toBe(true);
    expect(runways.busyFor(SITE, 0, false)).toBe(10000);
  });
});

describe('hulls cued together (#487)', () => {
  const hull = (arcId: string, post: 'roads' | 'mole'): Departure => ({
    arcId,
    site: 'building-port@5,43',
    post,
    since: 0,
  });

  it('keep one stagger when the hull ahead is both pending and played', () => {
    const runways = new Runways();
    const ahead = hull('a', 'roads');
    runways.depart(ahead, 0, () => true);
    const others = runways.others('m', ahead.site, [ahead]);
    expect(others).toHaveLength(1);
    expect(undockLead({ post: 'mole', since: 0 }, others)).toBe(UNDOCK_STAGGER_MS);
  });

  it('wait for no hull whose play was refused', () => {
    const runways = new Runways();
    const ahead = hull('a', 'roads');
    runways.depart(ahead, 0, () => false);
    expect(undockLead({ post: 'mole', since: 0 }, runways.others('m', ahead.site, []))).toBe(0);
  });
});
