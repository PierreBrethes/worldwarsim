import { describe, expect, it } from 'vitest';
import { RESOURCES } from './ids';
import type { PlayerView } from './player-view';
import { cardsOf, readSheet, type PickupRead } from './tour-sheet-view';
import { loopOf } from './tour-sheet';
import type { Projection } from './world';
import projectionAsset from '../../public/projection.json';

const world = projectionAsset as unknown as Projection;
const NOW = 100 * 3_600_000;

const mine = (id: string, extra: object = {}) => ({
  id,
  key: 'mine',
  name: `Mine ${id}`,
  regionId: 'R',
  point: [3, 50],
  level: 2,
  heap: { amount: 100, cap: 288, resource: 'coal' },
  ...extra,
});

const view = (over: Partial<PlayerView> = {}, buildings: object[] = []) =>
  ({
    mode: 'mondiale',
    loadedAt: NOW - 3_600_000,
    me: {
      troops: [
        {
          id: 'T',
          role: 'landTransport',
          stationedAt: { kind: 'building', buildingId: 'hq' },
          load: { ammunition: 80, oil: 0, coal: 0 },
          supplies: undefined,
        },
      ],
      outposts: [
        {
          id: 'O',
          hostCountry: 'FRA',
          lonLat: [5, 49],
          regionId: 'R',
          isMine: true,
          level: 2,
          standsAt: null,
          depot: { ammunition: 20, oil: 0, coal: 0 },
          depotCapacity: 150,
        },
      ],
      buildings: [{ id: 'hq', key: 'hq', name: 'QG', point: [2.35, 48.86] }, ...buildings],
      regions: [{ id: 'R', name: 'Lorraine' }],
      extraction: [
        { buildingId: 'a', heapPerHour: 40, linked: true },
        { buildingId: 'b', heapPerHour: 40, linked: false },
        { buildingId: 'c', heapPerHour: 40, linked: true },
      ],
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 900, ratePerHour: 0, cap: 1000 }]),
      ),
    },
    ...over,
  }) as unknown as PlayerView;

const pickups = (...ids: string[]): PickupRead[] =>
  ids.map((buildingId) => ({ buildingId, routed: true, hasQuay: false, stopPoint: null }));

describe('reading a transport sheet from the view', () => {
  it('has no sheet in Blitz, nor for a transport that is not there', () => {
    expect(readSheet(view({ mode: 'blitz' }), 'T', [], world, NOW)).toBeNull();
    expect(readSheet(view(), 'nobody', [], world, NOW)).toBeNull();
  });

  it('reads the heap as it grows since the view, and the room left in each bin', () => {
    const read = readSheet(view({}, [mine('a')]), 'T', pickups('a'), world, NOW)!;
    const site = read.candidates.find((stop) => stop.id === 'a')!;
    expect(site).toMatchObject({ kind: 'site', heap: 140, cap: 288, heapPerHour: 40 });
    expect(read.sheet.stockRoom.coal).toBe(100);
    expect(read.sheet.consigne.ammunition).toBe(80);
    expect(read.sheet.base).toEqual([2.35, 48.86]);
  });

  it('marks an exploitation cut off or out of service as not working', () => {
    const read = readSheet(
      view({}, [mine('b'), mine('c', { disabled: true })]),
      'T',
      pickups('b', 'c'),
      world,
      NOW,
    )!;
    expect(
      read.candidates
        .filter((stop) => stop.kind === 'site')
        .map((s) => s.kind === 'site' && s.working),
    ).toEqual([false, false]);
  });

  it('counts the hours a full heap has stopped its site, and holds it at its ceiling', () => {
    const full = mine('a', {
      heap: { amount: 288, cap: 288, resource: 'coal', fullSince: NOW - 5_400_000 },
    });
    const read = readSheet(view({}, [full]), 'T', pickups('a'), world, NOW)!;
    expect(read.candidates.find((stop) => stop.id === 'a')).toMatchObject({
      heap: 288,
      stoppedForHours: 1.5,
    });
  });

  it('names a site by its building and its region', () => {
    const read = readSheet(view({}, [mine('a')]), 'T', pickups('a'), world, NOW)!;
    expect(read.nameOf({ kind: 'site', id: 'a' })).toBe('Mine a · Lorraine');
  });

  it('does not offer the outpost the transport loads at as a stop of its own tour', () => {
    const base = view({}, [mine('a')]);
    (base.me.troops[0] as { stationedAt: unknown }).stationedAt = {
      kind: 'outpost',
      outpostId: 'O',
    };
    const read = readSheet(base, 'T', pickups('a'), world, NOW)!;
    expect(read.candidates.map((stop) => stop.id)).toEqual(['a']);
  });

  it('offers no site before the server has read them, but still the depots', () => {
    const read = readSheet(view({}, [mine('a')]), 'T', undefined, world, NOW)!;
    expect(read.candidates.map((stop) => stop.kind)).toEqual(['depot']);
  });

  it('takes the quay the server gave as the point a cargo goes to', () => {
    const read = readSheet(
      view({}, [mine('a')]),
      'T',
      [{ buildingId: 'a', routed: true, hasQuay: true, stopPoint: { lon: 3.1, lat: 51 } }],
      world,
      NOW,
    )!;
    expect(read.candidates.find((stop) => stop.id === 'a')).toMatchObject({
      stopPoint: [3.1, 51],
      facts: { hasQuay: true },
    });
  });
});

describe('the cards of a sheet', () => {
  const read = () => readSheet(view({}, [mine('a')]), 'T', pickups('a'), world, NOW)!;

  it('says what each stop gives or takes, and where the depot and the heap end up', () => {
    const reading = read();
    const stops = [reading.candidates[0]!, reading.candidates[1]!];
    const loop = loopOf(reading.sheet, stops);
    const [give, take] = cardsOf(stops, loop, reading.nameOf, null);
    expect(give).toMatchObject({
      kind: 'depot',
      moved: 80,
      effect: '▼ donne 80',
      note: 'dépôt 20 → 100 sur 150',
    });
    expect(take).toMatchObject({ kind: 'site', moved: 140, effect: '▲ prend 140 charbon' });
  });

  it('flags a stop the loop skips, with what it would do earlier in the loop', () => {
    const reading = read();
    const [depot, site] = [reading.candidates[0]!, reading.candidates[1]!];
    // Giving first empties the consigne: a second depot gets nothing.
    const second = { ...depot, id: 'O2' };
    const loop = loopOf(reading.sheet, [depot, second, site]);
    const cards = cardsOf([depot, second, site], loop, reading.nameOf, null);
    expect(cards[1]).toMatchObject({ moved: 0, warn: true });
    expect(cards[1]!.note).toContain('plus tôt');
    expect(cards[0]!.warn).toBe(false);
  });

  it('says where the fresh stop was placed and what it gained', () => {
    const reading = read();
    const stops = [reading.candidates[0]!];
    const [card] = cardsOf(stops, loopOf(reading.sheet, stops), reading.nameOf, {
      key: 'depot:O',
      at: 0,
      from: 3,
      to: 9,
    });
    expect(card!.note).toContain('posé en 1');
    expect(card!.note).toContain('3 → 9 / h');
  });
});
